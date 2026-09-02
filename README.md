# Flyt

Forgiving voice dictation for your whole desktop, in English and Norwegian. Hold a key, talk the way you talk, let go: your words land at the cursor in whatever app you are using, with the ums removed, your self-corrections applied and the punctuation right. A Wispr Flow replacement you own.

Built with Electron + TypeScript so it runs on macOS (the main target), Windows and Linux.

## What it does

- **Hold to dictate, tap for hands-free.** Default key is the right Option (⌥) key. Any key or combination can be bound, including a lone modifier.
- **Forgiving by design.**
  - Pre-roll and post-roll capture, so words spoken a moment before the key press or after the release are not clipped. The mic can stay warm for instant starts.
  - Pauses never cut you off while you hold the key. Long pauses are passed to the cleanup model as hints for sentence and paragraph breaks.
  - The cleanup pass (Claude) removes fillers (um, uh, eh, øh, liksom, you know…), applies self-corrections ("send it Monday, no wait, Tuesday" → "send it Tuesday"; "scratch that" / "stryk det" deletes the last clause), fixes stutters and false starts, adds punctuation and capitalisation, formats numbers, dates and e-mail addresses, and normalises Norwegian to Bokmål or Nynorsk when the recogniser drifts into Danish or Swedish spellings.
  - A guard rejects model output that looks like an answer or a summary instead of a cleanup, and falls back to deterministic offline rules, so you always get your own words.
- **Bilingual.** Auto-detects English and Norwegian, including mixed sentences with English product names inside Norwegian. Optional translate-on-insert.
- **Smooth.** Floating pill with a live waveform, sounds, ~1 s from key release to inserted text. Long dictations are chunked at pauses and transcribed in parallel while you are still talking, so the wait at the end stays short. Hands-free mode inserts text chunk by chunk as you pause.
- **Pastes without AppleScript.** Text is inserted with a synthetic ⌘V through the same input hook that listens for the hotkey, so only Accessibility is needed. AppleScript, PowerShell and xdotool are kept as fallbacks.
- **All the main settings.** Hotkeys, microphone and sensitivity, pause tuning, languages, cleanup toggles, custom vocabulary with "sounds like" aliases, snippets, per-app styles (casual in Slack, formal in Mail, verbatim in terminals and editors), provider and model choice, history, privacy.
- **Pluggable speech-to-text.** OpenAI (`gpt-transcribe`), ElevenLabs Scribe v2, Groq (`whisper-large-v3`), Deepgram (`nova-3`), or any OpenAI-compatible server (whisper.cpp, Speaches, LocalAI) for fully offline recognition.
- **Cleanup with Claude** through the official Anthropic SDK (Claude Opus 5 at low effort by default; Sonnet 5 and Haiku 4.5 selectable), with prompt caching and server-side refusal fallbacks enabled. An OpenAI-compatible endpoint can be used instead (GPT-5.4 mini by default, or Ollama and friends), or cleanup can be switched off.

## Requirements

- Node.js 22 or newer.
- macOS 13+ (primary), Windows 10+, or Linux (X11; `xdotool` for pasting).
- API keys: one speech-to-text provider (required) and an Anthropic key (strongly recommended, this is what makes it forgiving).

## Run from source

```bash
cd flyt
npm install
npm run build      # compiles main process, renderer and generates the icon
npm start          # launches Flyt in the menu bar
```

The first launch opens Settings → Setup. Work through it:

1. **Permissions (macOS):** Microphone, Accessibility (hotkey + paste) and, if macOS asks, Input Monitoring. No restart needed: Flyt starts its keyboard hook as soon as Accessibility is granted. When running from source the process is listed as **Electron** in these panes; the packaged app is listed as Flyt.
2. **Providers:** paste your speech-to-text key and your Anthropic key, press the test buttons.
3. Put the cursor in any text field, hold right ⌥, speak, release.

During development, `npm run dev` rebuilds and launches; `npm test` runs the unit and integration tests; `npm run typecheck` checks both TypeScript projects.

## Package

```bash
npm run dist:mac     # .dmg and .zip for arm64 + x64 in release/
npm run dist:win     # NSIS installer
npm run dist:linux   # AppImage + deb
```

Signing/notarisation is left to your Apple Developer account (see `electron-builder.yml`; the entitlements already include microphone and Apple Events).

## Choosing providers

| Need | Speech-to-text | Notes |
|---|---|---|
| Best for English + Norwegian | ElevenLabs `scribe_v2` | About 3 % word error rate on Norwegian (FLEURS) vs about 10 % for Whisper large-v3; top-tier English; vocabulary passed as keyterms |
| Strong default if you already have an OpenAI key | OpenAI `gpt-transcribe` | Current OpenAI model; `gpt-4o-transcribe` and `whisper-1` shut down 26 Feb 2027 and are auto-upgraded in settings |
| Lowest latency | Groq `whisper-large-v3-turbo` or Deepgram `nova-3` | A few hundred milliseconds, but weaker on Norwegian |
| Offline / private | Custom → whisper.cpp server, Speaches, LocalAI | Point the base URL at `http://localhost:8080/v1` |
| Mistral Voxtral Transcribe 2 | Custom → `https://api.mistral.ai/v1`, model `voxtral-mini-latest` | Very cheap and accurate, but its 13 languages do not include Norwegian |

Scribe v2 and gpt-transcribe both process audio at roughly 30x real time, so a ten-second dictation takes well under a second plus network time; the cleanup pass adds about the same again.

For cleanup, Claude Opus 5 at **low** effort is the default per the model guidance used to build this. If you want it snappier, pick Sonnet 5 or Haiku 4.5 in Providers; quality on this task is close.

## Latency

Flyt is built to feel instant: the post-roll ends the moment you have stopped talking, audio is chunked at natural pauses and transcribed while you are still speaking (so only the last sentence is recognised after release), HTTPS connections to both APIs are opened during the dictation and kept alive between dictations, and one- or two-word utterances skip the cleanup model. Each history entry shows the split between recogniser and cleanup time.

What is left is mostly the cleanup model. Rough numbers per dictation: Claude Haiku 4.5 about 0.5–1 s, Sonnet 5 about 1–1.5 s, Opus 5 about 1.5–3 s. If Flyt feels slow, switch the cleanup model to Haiku 4.5 in Providers; quality on this task is close. For the recogniser, Scribe v2 and gpt-transcribe both take well under a second for a normal sentence; Groq's Whisper is faster still but weaker on Norwegian.

## How the pipeline works

```
 hotkey ──► Segmenter (pre-roll ring, energy VAD w/ percentile noise floor, pause cuts, post-roll)
                │  16 kHz PCM chunks
                ▼
        speech-to-text (per chunk, in parallel, with vocabulary prompt)
                │  transcript(s) + [pause 1.8s] markers
                ▼
        cleanup: Claude ── guard ──► offline rules fallback
                │  final text
                ▼
        clipboard paste into frontmost app, clipboard restored
```

- `src/main/pipeline/segmenter.ts`, `vad.ts`, `wav.ts`: pure audio logic, unit-tested with synthetic speech.
- `src/main/pipeline/asr/*`: provider adapters.
- `src/main/pipeline/cleanup/*`: system prompt, Anthropic and OpenAI-compatible clients, rule-based fallback, output guard.
- `src/main/pipeline/session.ts`: the dictation state machine (hold / hands-free, chunking, insertion, history).
- `src/main/*`: Electron glue (hotkeys via uiohook, windows, tray, permissions, clipboard insertion, settings and encrypted secrets).
- `src/renderer/engine`: hidden window that owns the microphone (AudioWorklet → 20 ms frames).
- `src/renderer/overlay`: the floating pill. `src/renderer/settings`: the settings app (React).

## Privacy

Audio is sent only to the speech-to-text provider you configured, and only while you dictate. Transcripts are sent to the cleanup model you configured. API keys are encrypted with the OS keychain via Electron's `safeStorage`. History is a local JSON file and can be turned off. Nothing else leaves the machine.

## Known limitations

- The Fn key cannot be bound on macOS with the current hotkey library; use right ⌥, a function key or a combination.
- Wayland sessions on Linux have no global keyboard hook or synthetic paste; use X11.
- Context-aware spacing (knowing whether the character before the cursor is a space) is not possible without an accessibility API integration; the "Leading space" setting covers the common cases.
