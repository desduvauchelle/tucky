//! Persistent local Nemotron 3.5 ASR Streaming worker (sherpa-onnx, int8, 1120 ms
//! chunks). Runs out of process because sherpa-onnx bundles its own ONNX Runtime
//! that cannot share a process with the `ort` runtime used by Parakeet.
//! Input: little-endian u32 sample count, followed by that many f32 samples (16 kHz mono).
//! Output: one JSON line per request; native diagnostics stay on stderr.
//! Same wire protocol as `whisper-worker`.
use serde_json::json;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig};
use std::{
    io::{self, Read, Write},
    path::Path,
};

/// Strip the `<en-US>`-style language tags the model appends in `auto` mode.
fn clean(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find('<') {
        out.push_str(&rest[..start]);
        match rest[start..].find('>') {
            // Only drop short tag-like spans such as `<en-US>` / `<unk>`.
            Some(end) if end <= 12 && !rest[start + 1..start + end].contains(' ') => {
                rest = &rest[start + end + 1..];
            }
            _ => {
                out.push('<');
                rest = &rest[start + 1..];
            }
        }
    }
    out.push_str(rest);
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn emit(value: serde_json::Value) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &value)?;
    writeln!(stdout)?;
    stdout.flush()
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let dir = std::env::args_os()
        .nth(1)
        .ok_or("Missing Nemotron model directory")?;
    let dir = Path::new(&dir);
    let file = |name: &str| -> Result<String, String> {
        let p = dir.join(name);
        if p.is_file() {
            Ok(p.to_string_lossy().into_owned())
        } else {
            Err(format!("Missing model file {}", p.display()))
        }
    };
    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(file("encoder.int8.onnx")?);
    config.model_config.transducer.decoder = Some(file("decoder.int8.onnx")?);
    config.model_config.transducer.joiner = Some(file("joiner.int8.onnx")?);
    config.model_config.tokens = Some(file("tokens.txt")?);
    config.model_config.num_threads = 4;
    config.decoding_method = Some("greedy_search".into());
    let recognizer = OnlineRecognizer::create(&config)
        .ok_or("sherpa-onnx could not create the Nemotron recognizer (see stderr)")?;
    emit(json!({"ready": true}))?;
    let mut input = io::stdin().lock();
    loop {
        let mut count = [0; 4];
        match input.read_exact(&mut count) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(e) => return Err(e.into()),
        }
        let count = u32::from_le_bytes(count) as usize;
        if count == 0 || count > 960_000 {
            return Err("Invalid audio length".into());
        }
        let mut bytes = vec![0; count * 4];
        input.read_exact(&mut bytes)?;
        let samples: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
            .collect();
        if samples.iter().any(|v| !v.is_finite() || v.abs() > 1.0) {
            return Err("Invalid audio sample".into());
        }
        if samples.iter().all(|v| v.abs() < 0.0001) {
            emit(json!({"text": "", "segments": []}))?;
            continue;
        }
        let stream = recognizer.create_stream();
        // Per-stream language: "auto" lets the model detect it (+0.4-0.5 WER vs a fixed locale).
        stream.set_option("language", "auto");
        stream.accept_waveform(16000, &samples);
        // Trailing silence so the last 1.12 s chunk is fully flushed.
        stream.accept_waveform(16000, &vec![0.0f32; 20_000]);
        stream.input_finished();
        while recognizer.is_ready(&stream) {
            recognizer.decode(&stream);
        }
        match recognizer.get_result(&stream) {
            Some(result) => emit(json!({"text": clean(&result.text), "segments": []}))?,
            None => emit(json!({"error": "Nemotron returned no result"}))?,
        }
    }
}

fn main() {
    if let Err(error) = run() {
        let _ = emit(json!({"error": error.to_string()}));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::clean;

    #[test]
    fn strips_language_tags_only() {
        assert_eq!(clean("Hello world. <en-US>"), "Hello world.");
        assert_eq!(clean("a < b and c > d"), "a < b and c > d");
        assert_eq!(clean("  Bonjour <fr-FR> "), "Bonjour");
    }
}
