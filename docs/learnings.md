# Learnings

Facts that cost time to discover. Add to the relevant section; date entries that may go stale.

## Electron (44.x)
- The clipboard API is async and web-like: `clipboard.read()` → `ClipboardItem[]`, `clipboard.write(items)`, `readText()`/`writeText()` return promises. `readHTML`/`readRTF`/`readImage` are gone. `ClipboardItem` is exported from `electron`.
- `app.setLoginItemSettings` no longer accepts `openAsHidden`, and it fails with "Operation not permitted" when the app is not a real bundle (dev mode). Guard with `app.isPackaged`.
- `app.dock` is typed `Dock | undefined`.
- `BrowserWindow` `type: 'panel'` on macOS lets the overlay float over full-screen apps; combine with `focusable: false`, `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, `setIgnoreMouseEvents(true)`.
- Preload scripts that import project modules need `sandbox: false` (the sandboxed preload can only `require('electron')`).
- A hidden `BrowserWindow` can run `getUserMedia` + `AudioWorklet` fine; set `backgroundThrottling: false`. Load the worklet from a Blob URL; `file://` module loading is flaky.
- `new AudioContext({ sampleRate: 16000 })` works in Chromium (it resamples); keep a linear resampler in the worklet as a fallback.
- The single-instance lock keys on userData, and dev and installed builds share `~/Library/Application Support/Flyt`, so only one can run.

## macOS permissions
- Running from source, the process is `node_modules/electron/dist/Electron.app`; it appears as **Electron** in Privacy & Security and is not in the "+" picker. `open -R node_modules/electron/dist/Electron.app` then drag it in.
- `systemPreferences.isTrustedAccessibilityClient(true)` shows the system prompt. Once granted, `uIOhook.start()` succeeds without restarting the app; retry every few seconds.
- uiohook's `start()` throws "Failed to enable access for assistive devices" when Accessibility is missing. Input Monitoring may also be requested by the OS.
- `lsappinfo front` + `lsappinfo info -only name -only bundleid <ASN>` gives the frontmost app without any Automation permission. `System Events` via AppleScript needs Automation.
- Ad-hoc signed apps get a new cdhash on every build, so TCC grants reset after each rebuild. A Developer ID signature fixes that.
- safeStorage keychain entries are per app ("Electron Safe Storage" vs "Flyt Safe Storage"): after packaging, decrypt fails per key; catch per key and ask for re-entry.

## uiohook-napi (1.5.x)
- Provides real key-down/key-up for global keys (Electron's `globalShortcut` only fires on press). Prebuilds exist for darwin-arm64/x64, win32, linux.
- `keyTap(key, modifiers)` posts synthetic keystrokes; ⌘V paste works with only Accessibility. Our own synthetic events come back through the hook, so suppress matching keycodes for ~250 ms.
- The Fn key does not surface as a keycode; right ⌥ (`AltRight` = 3640) is the practical default. Bare modifiers work as bindings.
- Key repeat sends repeated `keydown`; track a `pressed` set and an `active` flag.

## Build toolchain
- TypeScript 7 (Go-based tsc): use `module: NodeNext` for the CommonJS main process and `moduleResolution: Bundler` for the Vite renderer. Deprecated options error out.
- `package.json` has no `"type": "module"`, so Vite/vitest configs must be `.mts` and use `fileURLToPath(new URL('.', import.meta.url))` instead of `__dirname`.
- `electron-store` ≥ 9 is ESM-only; unusable from a CJS main without dynamic import gymnastics.
- Vite multi-page: `root: src/renderer`, `base: './'`, inputs per `index.html`; output keeps `settings/index.html` etc.
- `undici`'s `setGlobalDispatcher` from the npm package also governs Node's global `fetch` (shared symbol), which the Anthropic SDK uses. Keep-alive of 90 s avoids a TLS handshake per dictation.
- electron-builder: `afterPack` runs before its own signing step; ad-hoc signing there is harmless when a real identity follows. `build/icon.png` (1024 px) is converted to `.icns` automatically.

## Speech-to-text APIs (as of 2026-09)
- OpenAI: `gpt-transcribe` replaces `gpt-4o-transcribe` / `whisper-1` (deprecated 2026-08-26, shutdown 2027-02-26). Same `/v1/audio/transcriptions` multipart, `prompt` supported. `verbose_json` only for whisper models.
- ElevenLabs: `model_id: scribe_v2`, `language_code` ISO-639-1 or -3, `keyterms` repeated form field (≤ 100, ≤ 5 words / 50 chars each), `tag_audio_events=false`, `timestamps_granularity=none`. About 3 % WER on Norwegian (FLEURS).
- Deepgram: Nova-3 added Norwegian in late 2025; `keyterm` (nova-3) vs `keywords` (nova-2); raw WAV body with `Authorization: Token`.
- Groq: `whisper-large-v3` / `-turbo`, about 200 ms responses, weaker on Norwegian.
- Mistral Voxtral Transcribe 2 (`voxtral-mini-latest`) is cheap and accurate but has no Norwegian.

## Claude API (as of 2026-09)
- Model ids: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`. Haiku 4.5 rejects `output_config.effort`; skip it for 4.5-generation models.
- Prompt-cache minimum prefix: 512 tokens on Opus 5, 1024 on Sonnet 5, 4096 on Haiku 4.5. Our system prompt (~1.9k tokens) caches on Opus/Sonnet only.
- `fallbacks: "default"` requires beta header `server-side-fallback-2026-07-01` and the `client.beta.messages` namespace; documented for Opus 5 / Fable.
- OpenAI GPT-5.x and o-series reject `temperature`; send `reasoning_effort: 'low'` instead.

## Text processing
- JavaScript `\b` and `\w` are ASCII-only; Norwegian æøå need `\p{L}` with the `u` flag and lookaround boundaries.
- Inserting a space after a full stop only before an uppercase letter keeps e-mail addresses, URLs and "e.g." intact; abbreviation list handles "kl.", "f.eks.", "etc.".
- Recognisers drift Norwegian into Danish/Swedish spellings and Nynorsk; the cleanup prompt normalises to the requested variant.

## Audio
- Measure pauses from the last *loud* frame, not the end of the VAD hangover, or every pause reads 240 ms short.
- End the post-roll as soon as the speaker has been quiet for the post-roll length; only wait the full duration when the key is released mid-word.
- Synthetic test speech must include syllable-rate dips (~15 % of frames near silence) or a percentile noise floor will learn it as noise.

## Workflow
- `npm start` occupies the Terminal; commands typed there go to the running app, not the shell. Use a second tab.
- `git add flyt` fails from inside `flyt/`; use `git add -A .` or `git -C <repo>`.
