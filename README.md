# Tucky

**Free, private voice to text for your whole Mac.** Press a hotkey, speak, and clean text appears wherever your cursor is: ChatGPT, Claude, Cursor, Slack, Gmail, VS Code. Speech recognition and the AI that tidies your words both run on your Mac. No account, no subscription, no cloud.

**[tucky.ai-juicing.com →](https://tucky.ai-juicing.com)**

**[Download Tucky for Mac](https://github.com/desduvauchelle/tucky/releases/latest/download/Tucky-arm64.dmg)**

macOS 14+, Apple Silicon (M1 or later). Open the DMG and drag Tucky into Applications.

> Previously Echo Scribe. Existing data stays in place when upgrading; see
> [rebrand compatibility](docs/REBRAND.md) for the intentionally preserved paths.

---

## What it does

- **Dictate anywhere.** One global hotkey works in any app. Filler words and false starts are removed before the text lands at your cursor. Built for people who prompt AI all day: spoken prompts come out longer and more specific than typed ones.
- **Tell it how to format.** Start with the trigger word ("Tucky, format this as an email", "Tucky, turn this into bullet points") and the local LLM rewrites your dictation in your own tone.
- **Record meetings locally.** Zoom, Google Meet and Teams calls are detected; you choose per app whether to always record, ask first, or never. You get a live transcript, then a summary, decisions and follow-ups.
- **Record your screen.** Narrated walkthroughs and bug reports, edited locally, with an optional transcript.
- **Search everything.** Dictations, notes, tasks and meeting transcripts live in one local, full-text-searchable library you can chat with, export, or expose to your own AI tools over [MCP](docs/MCP.md).

---

## How it works

```
Hotkey → Mic → VAD → Parakeet (ASR) → Gemma 4 (LLM) → SQLite
```

1. **Press your hotkey** from any app — a floating overlay appears so you know it's listening
2. **Speak naturally** — Voice Activity Detection detects when you stop talking
3. **Parakeet transcribes** — a fast, accurate on-device speech recognition model runs locally via CoreML
4. **Gemma 4 classifies** — a local LLM (4B parameters, Metal-accelerated) understands your capture and routes it to the right category: note, task, or idea
5. **Saved automatically** — no review modal, no confirmation step; it just lands in your library

The app lives in your menu bar. The main window gives you a feed of everything captured, full-text search, a task list, an analytics dashboard, and a chat interface to query your notes with the same local LLM.

---

## 100% private by design

- Dictation audio is processed in memory; meeting and screen recordings are saved only on your Mac, in `~/Library/Application Support/EchoScribe/`
- All AI inference runs locally (Parakeet + Gemma 4 via llama.cpp with Metal GPU offload)
- No telemetry, no analytics, no cloud sync
- SQLite database lives in the same folder — your data, your machine
- Models are downloaded once and cached locally; no internet needed after that

---

## Use cases

**Capture thoughts without breaking flow**
You're in the zone coding or writing. An idea surfaces. Press the hotkey, say it out loud, press again — back to work in under 5 seconds.

**Build a voice-driven task list**
Say "remind me to follow up with Sarah about the contract on Friday" and it lands in your task list, automatically classified.

**Meeting notes on autopilot**
Keep Tucky running during calls. Capture decisions, action items, and ideas as they happen without ever switching windows.

**Personal knowledge base**
Every capture is searchable. Use the chat interface to ask questions across everything you've ever captured — "what did I decide about the API design?" — answered by the same local LLM that classified the notes.

**Journaling and thinking out loud**
Some thoughts come easier spoken than typed. Tucky is a frictionless way to externalize ideas and have them organized and searchable later.

**Developers and writers**
Dictate code comments, documentation drafts, TODO items, or feature ideas without leaving the keyboard-driven flow.

---

## Install on macOS

Download the [signed and Apple-notarized DMG](https://github.com/desduvauchelle/tucky/releases/latest/download/Tucky-arm64.dmg), open it, and drag **Tucky** to **Applications**. Launch Tucky from Applications and follow onboarding. Speech and AI models download on first use.

To update manually, quit Tucky and drag the newest app into Applications, choosing Replace.

Tucky checks GitHub Releases on startup (with a one-hour throttle) and every 24 hours while running. You can also choose **Tucky → Check for Updates** or use the update button in **Settings → General**. When a newer version has downloaded, click **Restart now** in the update banner. Your local data and downloaded models remain in place.

Starting with version 1.0.27, public macOS builds are Developer ID signed and Apple-notarized. The DMG and the app carry stapled notarization tickets.

---

## macOS requirements

- macOS 14 or later
- Apple Silicon (M1 or later); current releases do not include an Intel build
- ~2 GB disk space for AI models (downloaded on first use)

## Install on Windows

Windows support is currently a development build, published from GitHub Actions.

Download the latest green Windows build:

[Tucky Windows build](https://github.com/desduvauchelle/tucky/actions/workflows/windows.yml)

Open the latest successful run, download the `tucky-windows` artifact,
unzip it, and run the `*-setup.exe` installer.

Windows may show a SmartScreen warning because this development build is not
code signed yet. Some capture features are still macOS-only; see
[docs/WINDOWS.md](docs/WINDOWS.md) for current Windows support status.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Tauri 2 (Rust + React) |
| UI | React 19 + TypeScript + Tailwind v4 |
| Speech-to-Text | Parakeet (local, on-device, CoreML) |
| LLM | Gemma 4 (local, on-device, Metal GPU via llama.cpp) |
| Audio | cpal + rubato (48kHz → 16kHz resampling) |
| Voice Activity Detection | vad-rs |
| Storage | SQLite with FTS5 full-text search |
| Settings | tauri-plugin-store |
| Build | Bun + Cargo |

---

## Building from source

macOS only.

For Developer ID signing and an Apple-notarized Finder installer, see
[macOS distribution setup](docs/macos-distribution.md). Once the certificate
and Keychain credentials are configured, `bun run release:mac` builds and
verifies the DMG locally. This does not publish a release.

```bash
git clone https://github.com/desduvauchelle/tucky.git
cd tucky
./scripts/build-from-source.sh
```

The script checks prerequisites (Xcode Command Line Tools, Rust, CMake, and
bun or npm), asking for confirmation before installing anything missing. It
builds the Swift sidecars and the app bundle, then installs **Tucky.app**
to `/Applications` and launches it.

## Local MCP access

The desktop executable can also run a read-only MCP server, exposing curated
tools for meetings, captures, projects, tasks, Recipes, people, and companies.
See [docs/MCP.md](docs/MCP.md) for client configuration and the privacy model.
