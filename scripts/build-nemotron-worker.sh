#!/usr/bin/env bash
# Builds the dev-only Nemotron worker (sherpa-onnx, statically linked) into
# src-tauri/target/nemotron-worker. Not bundled in releases: the model is gated
# behind debug builds.
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --release --locked --manifest-path src-tauri/nemotron-worker/Cargo.toml --target-dir src-tauri/target/nemotron-worker
