# Roadmap

Ordered by value to the owner. Each item notes the intended design so a fresh session can start without re-deriving it.

## 1. Streaming recognition (closes the latency gap)
- Add a `StreamingTranscriber` interface alongside the batch `Transcriber`: `open(languageMode) → session`, `session.send(pcmFrame)`, `session.finish() → final text`, interim results as events.
- Providers: ElevenLabs Scribe v2 Realtime (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`, PCM 16 kHz), Deepgram (`wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&interim_results=true`). Verify current protocol docs first.
- Session flow: open the socket at key-down (connection already warm), stream frames as they arrive, on release send finish/close and await the final transcript; fall back to batch on socket failure.
- Overlay can show interim text while speaking (Wispr-like). Hands-free mode inserts on provider end-of-utterance events instead of our pause cuts.

## 2. Command mode (Flyt as the personal OS layer)
- Second hotkey (or hold with a modifier): speech is interpreted as an instruction, not text.
- A small intent step (Haiku) maps the utterance to an action: run a macOS Shortcut (`shortcuts run "Name"`), open an app/URL, AppleScript snippet, insert a snippet, switch Flyt settings ("switch to Norwegian").
- Actions defined by the user in a markdown/YAML file so the list is editable without code.

## 3. Runtime knowledge folder
- Flyt reads `~/Library/Application Support/Flyt/knowledge/*.md` (or a user-chosen folder): personal style guide, glossary, names, snippets.
- Injected into the cleanup prompt (bounded size, cached). Vocabulary from these files also feeds recogniser keyterms.
- Distinct from `docs/` in the repo, which is for developers.

## 4. Signed builds
- Developer ID Application certificate → `CSC_NAME`; notarisation via electron-builder `notarize`. Makes TCC grants persist across rebuilds and allows sharing a dmg.
- Auto-update with electron-updater once builds are signed.

## 5. Context-aware spacing
- Read the character before the cursor via the Accessibility API (AXUIElement focused element, selected text range). Needs a native helper (Swift command-line tool or a small N-API module with prebuilds). Replaces the "Leading space" heuristic.

## 6. Fn key as dictation key
- uiohook does not expose Fn. A tiny Swift helper with a `CGEventTap` on `flagsChanged` (`maskSecondaryFn`) could report Fn down/up over stdio.

## 7. Smaller items
- Overlay: show interim transcript; dark/light adaptive pill.
- Settings: "Speed preset" and "Accuracy preset" buttons.
- History: latency chart over time.
- Offline mode test with whisper.cpp server (`custom` provider) and an Ollama cleanup model.
- Windows/Linux smoke tests.
