#!/usr/bin/env python3
"""Headless ASR benchmark over a directory of clip pairs.

Every `name.wav` (16 kHz mono PCM16, <= 60 s) with a sibling `name.txt` reference is
transcribed by each model through the dev-only worker (src-tauri/target/asr-lab/release/
tucky-asr-lab; build it with scripts/build-asr-lab.sh). One fresh worker process per
model x clip (1 load, 1 first run, 3 warm runs). Prints per-clip and aggregate tables
and writes JSON + stderr logs to --out. See scripts/bench-asr.sh.
"""
import argparse, json, re, statistics, subprocess, sys, time, unicodedata, wave, struct, pathlib, os

REPO = pathlib.Path(__file__).resolve().parent.parent
LAB = REPO / "src-tauri/target/asr-lab/release/tucky-asr-lab"
MODELS = pathlib.Path(os.environ.get("TUCKY_MODELS_DIR", pathlib.Path.home() / "Library/Application Support/Tucky/models"))
ALL = ["parakeet-v3", "whisper-base", "whisper-turbo", "qwen3-asr", "nemotron-3.5-streaming"]
DIR_MODELS = {"parakeet-v3", "qwen3-asr", "nemotron-3.5-streaming"}  # lab takes the dir; others the first file

def words(s):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", s).lower().replace("'", "").replace("’", ""))

def edits(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[-1]

def load_wav(p):
    with wave.open(str(p), "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, f"{p}: need 16 kHz mono PCM16"
        raw = w.readframes(w.getnframes())
    return [x[0] / 32768 for x in struct.iter_unpack("<h", raw)]

def model_path(mid, overrides):
    if mid in overrides:
        return pathlib.Path(overrides[mid])
    d = MODELS / mid
    if mid in DIR_MODELS:
        return d
    bins = sorted(d.glob("*.bin"))
    return bins[0] if bins else d / "MISSING"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clips", help="directory (searched recursively) of name.wav + name.txt pairs")
    ap.add_argument("--models", default=",".join(ALL))
    ap.add_argument("--out", default=str(REPO / "output/asr-bench"))
    ap.add_argument("--model-path", action="append", default=[], metavar="ID=PATH")
    a = ap.parse_args()
    overrides = dict(x.split("=", 1) for x in a.model_path)
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    clips = []
    for wav in sorted(pathlib.Path(a.clips).rglob("*.wav")):
        ref = wav.with_suffix(".txt")
        if ref.is_file():
            clips.append((wav, ref.read_text()))
    if not clips: sys.exit(f"No name.wav + name.txt pairs under {a.clips}")
    if not LAB.is_file(): sys.exit(f"Missing {LAB}; run scripts/build-asr-lab.sh")
    data = []
    for wav, ref in clips:
        s = load_wav(wav)
        if not 1600 <= len(s) <= 960000:
            print(f"skip {wav.name}: {len(s)/16000:.1f}s outside 0.1-60 s"); continue
        data.append((wav.stem, s, ref))
    total_audio = sum(len(s) for _, s, _ in data) / 16000
    print(f"{len(data)} clips, {total_audio:.1f} s audio, {sum(len(words(r)) for *_, r in data)} reference words")
    results, skipped = {}, {}
    for mid in a.models.split(","):
        path = model_path(mid, overrides)
        if not path.exists():
            skipped[mid] = f"model not downloaded: {path}"; print(f"SKIP {mid}: {skipped[mid]}"); continue
        rows = []
        for name, s, ref in data:
            t = time.monotonic()
            p = subprocess.run([str(LAB)], input=json.dumps({"model": mid, "path": str(path), "samples": s}),
                               capture_output=True, text=True, timeout=600)
            (out / f"{name}-{mid}.stderr.log").write_text(p.stderr)
            if p.returncode:
                m = re.search(r"SKIPPED: (.*)", p.stderr)
                if m and not rows:
                    skipped[mid] = m.group(1); print(f"SKIP {mid}: {skipped[mid]}"); break
                skipped[mid] = f"failed on {name}: {p.stderr[-300:]}"; print(f"FAIL {mid}: {skipped[mid]}"); rows = []; break
            r = json.loads(p.stdout)
            rw = words(ref)
            warm = statistics.median(r["warm_ms"]) / 1000
            rows.append(dict(clip=name, audio_s=r["audio_seconds"], ref_words=len(rw), errors=edits(rw, words(r["text"])),
                             warm_s=warm, load_s=r["load_ms"] / 1000, first_s=r["first_ms"] / 1000,
                             peak_mib=r["peak_rss_mib"], cpu_percent=r["cpu_percent"], backend=r["backend"], text=r["text"]))
            print(f"  {mid:24s} {name:22s} {rows[-1]['errors']:3d}/{len(rw):3d} err  warm {warm:6.2f}s  RTF {warm/r['audio_seconds']:.3f}  cpu {r['cpu_percent']:.0f}%")
        if rows: results[mid] = rows
    summary = {}
    for mid, rows in results.items():
        w = sum(r["ref_words"] for r in rows); e = sum(r["errors"] for r in rows)
        au = sum(r["audio_s"] for r in rows); wm = sum(r["warm_s"] for r in rows)
        summary[mid] = dict(words=w, errors=e, wer_pct=100 * e / w, warm_total_s=wm, rtf=wm / au, load_s_median=statistics.median(r["load_s"] for r in rows),
                            peak_mib_max=max(r["peak_mib"] for r in rows),
                            cpu_percent=sum(r["cpu_percent"] * r["warm_s"] for r in rows) / wm, backend=rows[0]["backend"])
    (out / "results.json").write_text(json.dumps(dict(date=time.strftime("%Y-%m-%d"), clips=[n for n, *_ in data], audio_seconds=total_audio, summary=summary, skipped=skipped, per_clip=results), indent=1))
    print(f"\nAGGREGATE ({len(data)} clips, {total_audio:.1f} s audio)")
    print(f"{'model':24s} {'words':>5s} {'err':>4s} {'WER%':>6s} {'warm s':>7s} {'RTF':>6s} {'load s':>7s} {'peak MiB':>9s} {'CPU%':>5s}")
    for mid, s in summary.items():
        print(f"{mid:24s} {s['words']:5d} {s['errors']:4d} {s['wer_pct']:6.2f} {s['warm_total_s']:7.2f} {s['rtf']:6.3f} {s['load_s_median']:7.2f} {s['peak_mib_max']:9.0f} {s['cpu_percent']:5.0f}")
    for m, why in skipped.items(): print(f"skipped {m}: {why}")

main()
