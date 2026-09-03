# Decisions

Dated log of choices that shape Flyt. Add new entries at the top. Format: what, why, what lost, when to revisit.

## 2026-09-02 · Batch recognition in chunks rather than streaming (for now)
Audio is cut at natural pauses while the key is held and each chunk is transcribed in the background; only the tail is recognised after release. Streaming WebSocket recognition (Scribe v2 Realtime, Deepgram) would make the transcript final at release and is the planned next step (see roadmap). Chosen first because every provider offers the batch endpoint with one code path.

## 2026-09-02 · Speech-to-text defaults: OpenAI `gpt-transcribe`; recommended: ElevenLabs `scribe_v2`
OpenAI deprecated `whisper-1`, `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` on 2026-08-26 (shutdown 2027-02-26). Scribe v2 is the most accurate on Norwegian by a wide margin (about 3 % WER vs about 10 % for Whisper large-v3). Stored deprecated ids are upgraded on settings load (`ASR_MODEL_UPGRADES`).

## 2026-09-02 · Cleanup model: Claude via the Anthropic SDK, default `claude-opus-5` at effort `low`, Haiku 4.5 recommended for speed
The default follows the current model guidance used during development. In practice the user should pick Haiku 4.5 for dictation latency; the UI labels carry timing guidance. Prompt caching on the long system prompt; `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` on Opus 5. An OpenAI-compatible endpoint is offered as an alternative for people who want a local model.

## 2026-09-02 · Paste through the clipboard with a synthetic ⌘V from uiohook
Typing characters is slow and breaks on Unicode; pasting works in every app. The keystroke is posted through the same input hook used for the hotkey, so only the Accessibility permission is needed. AppleScript (`System Events`), PowerShell and xdotool remain as fallbacks. Clipboard contents are snapshotted as `ClipboardItem`s and restored after the paste.

## 2026-09-02 · Warm microphone by default
`keepMicWarm: true` keeps the stream open so a 400 ms pre-roll ring buffer captures words spoken before the key press. Cost: the macOS mic indicator stays on. Documented in the UI as "Instant start"; user can switch it off.

## 2026-09-02 · Energy VAD with a percentile noise floor
Noise floor = 10th percentile of frame levels over a 4 s window, smoothed. Adapts to a fan switching on, does not learn speech as noise because real speech has syllable gaps. Test fixtures must therefore synthesise speech with dips. An ML VAD (Silero) was not needed because the user controls start/stop.

## 2026-09-02 · Electron + TypeScript, not Tauri/Rust or Swift
Tauri was the first choice for footprint, but the build environment could not reach crates.io or install the GTK dev libraries, so Rust could not be compiled or verified. Electron is fully typecheckable and testable there and stays cross-platform. Cost: memory footprint and the "Electron" process name in dev mode. Revisit only if footprint becomes a real complaint.

## 2026-09-02 · Settings as validated JSON with migrations; secrets via safeStorage
`electron-store` v9+ is ESM-only and did not fit the CommonJS main process, so a small atomic JSON store with a zod schema was written. Deprecated model ids are migrated on load. API keys are encrypted with `safeStorage` (Keychain) in a separate file; the keychain entry differs between the dev build and the installed app, so keys are re-entered once after packaging.

## 2026-09-02 · Icons rendered at runtime, no binary assets
A tiny PNG encoder and signed-distance rasteriser draw the tray glyph (template image; red while recording) and the macOS app icon (Apple grid margins, gradient, shadow). `build/icon.png` is generated during `npm run build` and converted to `.icns` by electron-builder.

## 2026-09-02 · Ad-hoc code signing fallback, no native rebuild
Without a Developer ID, electron-builder leaves the app unsigned and Apple Silicon refuses to launch it. `build/after-pack.js` applies an ad-hoc signature with the entitlements. `npmRebuild: false` because `uiohook-napi` ships N-API prebuilds. Side effect: TCC grants (Accessibility, Microphone) reset on every rebuild until a Developer ID is used.
