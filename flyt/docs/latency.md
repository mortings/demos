# Latency

Goal: feel as immediate as Wispr Flow (well under a second from key release to inserted text).

## Where the time goes (release → text)

| Stage | Before | Now | Notes |
|---|---|---|---|
| Post-roll | fixed 450 ms | 0 ms when already quiet, ≤ 400 ms if released mid-word | `segmenter.ts` early finish |
| Recogniser | whole utterance after release | only the tail since the last pause (hold mode cuts at ≥ 0.8 s pauses after ≥ 3 s) | chunks transcribed in parallel while talking |
| TLS handshake | ~150–300 ms on most dictations | ~0 | undici keep-alive agent + HEAD warm-up at key-down |
| Cleanup model | Opus 5: 1.5–3 s | same; Haiku 4.5: 0.5–1 s | user-selectable; the dominant remaining cost |
| Paste | ~100 ms (osascript) | ~50 ms (uiohook keyTap) | |
| Short utterances | model round trip | skipped for ≤ 2 words | |

History entries show `x s to insert (a recogniser + b cleanup)`; the log prints the same per dictation.

## Fastest settings

| Where | Setting | Value |
|---|---|---|
| Providers | Cleanup model | Claude Haiku 4.5 |
| Providers | Speech-to-text | Groq `whisper-large-v3-turbo` (mostly English) or Scribe v2 (Norwegian) |
| Providers | Timeouts | cleanup 6 s, speech 10 s |
| Dictation | Post-roll | 250 ms |
| Dictation | Instant start | on |
| Dictation | Hands-free chunk pause | 600–700 ms |

Settings with no measurable effect on speed: cleanup toggles, sensitivity, paragraph pause, leading space, restore clipboard, sounds, overlay.

## Remaining gap and the fix
Wispr Flow streams recognition during speech, so the transcript is final at release. Flyt still sends the last chunk after release. Streaming recognition over WebSocket (ElevenLabs Scribe v2 Realtime at $0.39/h, or Deepgram Nova-3 streaming) removes that stage. See roadmap.
