# Flyt

Forgiving voice dictation for the whole desktop, in English and Norwegian. A personal Wispr Flow replacement that Morten (CPO at Bluestone PIM) uses daily on macOS and intends to grow into his personal layer over the OS. Electron + TypeScript; macOS first, Windows/Linux kept working.

## Read these before non-trivial work

- `docs/learnings.md`: hard-won gotchas (Electron 44 APIs, macOS permissions, uiohook, signing). Read before touching main-process code.
- `docs/decisions.md`: why things are the way they are. Read before proposing an architecture change.
- `docs/providers.md`: current speech-to-text and cleanup models, prices, deprecation dates.
- `docs/latency.md`: the latency budget and what has already been done about it.
- `docs/roadmap.md`: agreed next steps and their intended design.

## Commands

```bash
npm run build        # tsc main + vite renderer + icon
npm run typecheck    # both TypeScript projects, no emit
npm test             # vitest (unit + controller integration against a mock speech server)
npm start            # run from source (process shows up as "Electron" in macOS permission panes)
npm run install:mac  # build, ad-hoc sign, install to /Applications/Flyt.app, launch
npm run dist:mac     # dmg + zip for arm64 and x64
```

Always run `npm run typecheck && npm test` before committing. Only one Flyt instance runs at a time (single-instance lock on shared userData), so quit the dev copy before launching the installed app.

## Architecture map

| Path | Role |
|---|---|
| `src/shared/types.ts` | Settings schema (zod), IPC contracts, `FlytApi`. Every setting needs: schema + default + UI + (if renamed) migration |
| `src/shared/defaults.ts` | Defaults, model lists, model-id upgrade maps |
| `src/main/index.ts` | Wiring: stores, hotkeys, windows, tray, IPC, permission retry, keep-alive agent |
| `src/main/pipeline/session.ts` | Dictation state machine: hold / hands-free, chunking, ASR fan-out, cleanup, insertion, history |
| `src/main/pipeline/segmenter.ts`, `vad.ts`, `wav.ts` | Pure audio logic. **No Electron imports**; unit-tested with synthetic speech |
| `src/main/pipeline/asr/*` | Speech-to-text adapters (OpenAI-compatible, Deepgram, ElevenLabs) + factory |
| `src/main/pipeline/cleanup/*` | System prompt, Anthropic SDK client, OpenAI-compatible client, rules fallback, output guard |
| `src/main/hotkeys.ts` | uiohook global keys (down/up), key capture, synthetic ⌘V paste |
| `src/main/inserter.ts` | Clipboard paste + restore (Electron 44 async clipboard) |
| `src/main/windows.ts`, `tray.ts`, `icon*.ts` | Overlay pill, settings window, hidden audio engine, tray, runtime-rendered icons |
| `src/renderer/engine` | Owns the microphone: AudioWorklet → 20 ms Int16 frames → main |
| `src/renderer/overlay`, `src/renderer/settings` | React UI |
| `test/` | vitest; `helpers.ts` synthesises speech with syllable dips |

## House rules

- Latency is a feature. Anything on the release→insert path needs a reason and a measurement (History shows recogniser vs cleanup time).
- The offline rules fallback must always work; the model is an enhancement, never a dependency.
- Never log or persist API keys in plain text; they go through `SecretStore` (safeStorage).
- No native modules without prebuilt binaries for darwin-arm64 (electron-builder runs with `npmRebuild: false`).
- Renderer windows: `contextIsolation: true`, `nodeIntegration: false`; everything crosses through `src/preload/index.ts`.
- Claude is called through `@anthropic-ai/sdk` only. Current ids: `claude-opus-5` (default), `claude-sonnet-5`, `claude-haiku-4-5`. Never invent model ids; check `docs/providers.md`.
- Keep `CLAUDE.md` short. Put detail in `docs/` and link it.
- Commit messages: imperative subject, body explains why. Don't mention model names in commits.

## User context

- Speaks English and Norwegian (Bokmål), often mixed, with English product names in Norwegian sentences.
- Cares about: forgiving recognition, self-corrections, pauses, speed comparable to Wispr Flow, a real Mac app feel.
- Runs the installed `/Applications/Flyt.app` (ad-hoc signed) and rebuilds occasionally via `npm run install:mac`.
