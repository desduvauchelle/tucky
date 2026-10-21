#!/usr/bin/env bash
# Headless ASR benchmark: bash scripts/bench-asr.sh <clips-dir> [--models a,b] [--out dir] [--model-path id=path]
# <clips-dir> holds name.wav (16 kHz mono PCM16, <=60 s) + name.txt (reference) pairs.
# Models come from ~/Library/Application Support/Tucky/models (override: TUCKY_MODELS_DIR).
# Missing models/runtimes are reported as skipped, never downloaded. See docs/development/asr-comparison.md.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -x src-tauri/target/asr-lab/release/tucky-asr-lab ]] || cargo build --release --locked --manifest-path src-tauri/asr-lab/Cargo.toml --target-dir src-tauri/target/asr-lab
exec python3 -u -I scripts/bench-asr.py "$@"
