//! One benchmark per process: release model memory reliably after each run.
use serde::{Deserialize, Serialize};
use std::{
    io::{self, BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};
use transcribe_rs::{
    onnx::{
        parakeet::{ParakeetModel, ParakeetParams},
        Quantization,
    },
    whisper_cpp::{WhisperEngine, WhisperInferenceParams},
};
#[path = "../../src/util/rss.rs"]
#[allow(dead_code)]
mod rss;

#[derive(Deserialize)]
struct Request {
    model: String,
    path: String,
    samples: Vec<f32>,
}
#[derive(Serialize)]
struct ResultRow {
    text: String,
    load_ms: f64,
    first_ms: f64,
    warm_ms: Vec<f64>,
    audio_seconds: f64,
    loaded_rss_mib: f64,
    peak_rss_mib: f64,
    backend: String,
    /// Average CPU use of the whole model process (worker subprocess for
    /// qwen/nemotron) across the warm runs: CPU time / wall time, 100 = one core.
    cpu_percent: f64,
}

/// Process CPU time (user + system) in seconds.
fn self_cpu_seconds() -> f64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) } != 0 {
        return 0.0;
    }
    let tv = |t: libc::timeval| t.tv_sec as f64 + t.tv_usec as f64 / 1e6;
    tv(usage.ru_utime) + tv(usage.ru_stime)
}

/// (cpu seconds, resident bytes) of another live process. RUSAGE_CHILDREN only
/// counts children that were already waited for, so a running worker is sampled
/// with proc_pidinfo instead.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn pid_stats(pid: u32) -> Option<(f64, u64)> {
    let mut info: libc::proc_taskinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of::<libc::proc_taskinfo>() as libc::c_int;
    let got = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTASKINFO,
            0,
            &mut info as *mut _ as *mut libc::c_void,
            size,
        )
    };
    if got != size {
        return None;
    }
    let mut tb = libc::mach_timebase_info { numer: 0, denom: 0 };
    unsafe { libc::mach_timebase_info(&mut tb) };
    let ticks = (info.pti_total_user + info.pti_total_system) as f64;
    let secs = ticks * tb.numer as f64 / tb.denom.max(1) as f64 / 1e9;
    Some((secs, info.pti_resident_size))
}
#[cfg(not(target_os = "macos"))]
fn pid_stats(_pid: u32) -> Option<(f64, u64)> {
    None
}

/// Same framed-PCM subprocess protocol as the app's `SpeechProcess`
/// (src/asr/engine.rs): u32 LE sample count + f32 LE samples in, one JSON line out.
struct WorkerProcess {
    child: Child,
    input: Option<ChildStdin>,
    output: BufReader<ChildStdout>,
    peak_rss: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
}
impl WorkerProcess {
    fn spawn(mut command: Command, label: &str) -> Result<Self, String> {
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("{label}: cannot start worker: {e}"))?;
        let input = child.stdin.take();
        let output = BufReader::new(child.stdout.take().expect("piped stdout"));
        let peak_rss = Arc::new(AtomicU64::new(0));
        let stop = Arc::new(AtomicBool::new(false));
        let (pid, peak, halt) = (child.id(), peak_rss.clone(), stop.clone());
        std::thread::spawn(move || {
            while !halt.load(Ordering::Relaxed) {
                if let Some((_, rss)) = pid_stats(pid) {
                    peak.fetch_max(rss, Ordering::Relaxed);
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        });
        let mut worker = Self { child, input, output, peak_rss, stop };
        let ready = worker.read_json()?;
        if ready.get("ready").and_then(|v| v.as_bool()) != Some(true) {
            return Err(format!("{label}: worker did not initialize: {ready}"));
        }
        Ok(worker)
    }
    fn read_json(&mut self) -> Result<serde_json::Value, String> {
        let mut line = String::new();
        let n = self.output.read_line(&mut line).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("worker exited without a response (see stderr above)".into());
        }
        let value: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if let Some(error) = value.get("error").and_then(|e| e.as_str()) {
            return Err(error.to_owned());
        }
        Ok(value)
    }
    fn transcribe(&mut self, samples: &[f32]) -> Result<String, String> {
        let mut bytes = Vec::with_capacity(4 + samples.len() * 4);
        bytes.extend_from_slice(&(samples.len() as u32).to_le_bytes());
        for s in samples {
            bytes.extend_from_slice(&s.to_le_bytes());
        }
        let input = self.input.as_mut().ok_or("worker input unavailable")?;
        input.write_all(&bytes).and_then(|_| input.flush()).map_err(|e| e.to_string())?;
        let value = self.read_json()?;
        Ok(value.get("text").and_then(|t| t.as_str()).unwrap_or("").trim().to_owned())
    }
    fn stats(&self) -> (f64, f64) {
        let (cpu, rss) = pid_stats(self.child.id()).unwrap_or((0.0, 0));
        self.peak_rss.fetch_max(rss, Ordering::Relaxed);
        (cpu, rss as f64 / 1048576.0)
    }
}
impl Drop for WorkerProcess {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.input.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn src_tauri_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}
fn skipped(reason: String) -> Box<dyn std::error::Error> {
    format!("SKIPPED: {reason}").into()
}
fn qwen_command(path: &Path) -> Result<Command, Box<dyn std::error::Error>> {
    let python = src_tauri_dir().join("target/qwen-runtime/bin/python");
    if !python.is_file() {
        return Err(skipped(format!(
            "Qwen runtime not installed at {} (run bash scripts/setup-qwen-runtime.sh; needs uv + Apple silicon)",
            python.display()
        )));
    }
    let mut command = Command::new(python);
    command
        .args(["-u", "-c", include_str!("../../qwen-worker/worker.py")])
        .arg(path)
        .env("HF_HUB_OFFLINE", "1")
        .env("TRANSFORMERS_OFFLINE", "1");
    Ok(command)
}
fn nemotron_command(path: &Path) -> Result<Command, Box<dyn std::error::Error>> {
    let worker = src_tauri_dir().join("target/nemotron-worker/release/tucky-nemotron");
    if !worker.is_file() {
        return Err(skipped(format!(
            "Nemotron worker not built at {} (run bash scripts/build-nemotron-worker.sh)",
            worker.display()
        )));
    }
    let mut command = Command::new(worker);
    command.arg(path);
    Ok(command)
}

fn run(request: Request) -> Result<ResultRow, Box<dyn std::error::Error>> {
    if request.samples.len() < 1600
        || request.samples.len() > 16000 * 60
        || request
            .samples
            .iter()
            .any(|x| !x.is_finite() || x.abs() > 1.0)
    {
        return Err("Provide 0.1–60 seconds of finite 16 kHz mono audio".into());
    }
    let start = Instant::now();
    // Set for subprocess models: CPU/RSS then come from the child, not this process.
    let mut worker: Option<WorkerProcess> = None;
    let (mut infer, backend): (Box<dyn FnMut(&[f32]) -> Result<String, String>>, _) =
        match request.model.as_str() {
            "parakeet-v3" => {
                let mut model = ParakeetModel::load(Path::new(&request.path), &Quantization::Int8)?;
                (
                    Box::new(move |samples| {
                        model
                            .transcribe_with(samples, &ParakeetParams::default())
                            .map(|r| r.text.trim().to_owned())
                            .map_err(|e| e.to_string())
                    }),
                    "ONNX · CPU",
                )
            }
            "whisper-base" | "whisper-turbo" => {
                let mut model = WhisperEngine::load(Path::new(&request.path))?;
                (
                    Box::new(move |samples| {
                        model
                            .transcribe_with(samples, &WhisperInferenceParams::default())
                            .map(|r| r.text.trim().to_owned())
                            .map_err(|e| e.to_string())
                    }),
                    if cfg!(target_os = "macos") {
                        "whisper.cpp · Metal"
                    } else {
                        "whisper.cpp · CPU"
                    },
                )
            }
            "qwen3-asr" | "nemotron-3.5-streaming" => {
                let (command, label, backend) = if request.model == "qwen3-asr" {
                    (qwen_command(Path::new(&request.path))?, "qwen3-asr", "MLX · Python worker")
                } else {
                    (
                        nemotron_command(Path::new(&request.path))?,
                        "nemotron",
                        "sherpa-onnx · CPU worker",
                    )
                };
                worker = Some(WorkerProcess::spawn(command, label)?);
                (Box::new(|_| Err("unused".to_owned())), backend)
            }
            _ => return Err("Unknown model".into()),
        };
    let load_ms = start.elapsed().as_secs_f64() * 1000.0;
    let loaded_rss_mib = match &worker {
        Some(w) => w.stats().1,
        None => rss::current_rss_bytes() as f64 / 1048576.0,
    };
    macro_rules! run_once {
        ($samples:expr) => {
            match worker.as_mut() {
                Some(w) => w.transcribe($samples),
                None => infer($samples),
            }
        };
    }
    let start = Instant::now();
    let text = run_once!(&request.samples)?;
    let first_ms = start.elapsed().as_secs_f64() * 1000.0;
    let mut warm_ms = Vec::new();
    let cpu_before = match &worker {
        Some(w) => w.stats().0,
        None => self_cpu_seconds(),
    };
    let warm_start = Instant::now();
    for _ in 0..3 {
        let start = Instant::now();
        run_once!(&request.samples)?;
        warm_ms.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    let warm_wall = warm_start.elapsed().as_secs_f64();
    let cpu_after = match &worker {
        Some(w) => w.stats().0,
        None => self_cpu_seconds(),
    };
    let cpu_percent = if warm_wall > 0.0 {
        (cpu_after - cpu_before) / warm_wall * 100.0
    } else {
        0.0
    };
    let peak_rss_mib = match &worker {
        Some(w) => w.peak_rss.load(Ordering::Relaxed) as f64 / 1048576.0,
        None => rss::max_rss_bytes() as f64 / 1048576.0,
    };
    Ok(ResultRow {
        text,
        load_ms,
        first_ms,
        warm_ms,
        audio_seconds: request.samples.len() as f64 / 16000.0,
        loaded_rss_mib,
        peak_rss_mib,
        backend: backend.into(),
        cpu_percent,
    })
}
fn main() {
    let result = (|| {
        let mut input = String::new();
        io::stdin()
            .take(24_000_000)
            .read_to_string(&mut input)
            .map_err(|e| e.to_string())?;
        let request = serde_json::from_str(&input).map_err(|e| e.to_string())?;
        run(request).map_err(|e| e.to_string())
    })();
    match result {
        Ok(row) => println!("{}", serde_json::to_string(&row).unwrap()),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
