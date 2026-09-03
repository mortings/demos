# Providers

State as of 2026-09-02. Re-verify prices and deprecations before relying on them; the speech-to-text market moves monthly.

## Speech-to-text

| Provider | Model id (Flyt default) | Norwegian | Speed | Price | Notes |
|---|---|---|---|---|---|
| ElevenLabs | `scribe_v2` | Best (about 3 % WER FLEURS) | ~30x real time | $0.22 / audio hour (API PAYG); free plan 10k credits ≈ 30 min/month | Vocabulary sent as `keyterms`. Recommended for EN + NO |
| OpenAI | `gpt-transcribe` | Good | ~30x real time | ≈ $0.27 / audio hour | Replaces `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1` (deprecated 2026-08-26, shutdown 2027-02-26). Accepts `prompt` |
| Groq | `whisper-large-v3` / `whisper-large-v3-turbo` | Weaker (~10 % WER for Whisper) | ~200 ms per request | $0.04–0.11 / audio hour | Lowest latency, generous free tier |
| Deepgram | `nova-3` | Supported since late 2025, less proven | ~500x real time | ~$0.26 / audio hour | Flux is streaming-only; Nova-3 remains the batch model |
| Custom (OpenAI-compatible) | user-defined | depends | depends | free if local | whisper.cpp server, Speaches, LocalAI; Mistral `voxtral-mini-latest` (no Norwegian) |

Alternatives seen but not integrated: Microsoft MAI-Transcribe-1.5 (Azure only, leads the accuracy/speed frontier), Gladia Solaria.

## Cleanup model

| Provider | Model | Latency per dictation | Cost per dictation (est.) | Notes |
|---|---|---|---|---|
| Anthropic | `claude-opus-5` (default) | 1.5–3 s | ~$0.005 | Best on long messy dictations; `effort: low`; caching on |
| Anthropic | `claude-sonnet-5` | 1–1.5 s | ~$0.002 | Middle ground |
| Anthropic | `claude-haiku-4-5` | 0.5–1 s | <$0.001 | Recommended for speed; no `effort` param |
| OpenAI-compatible | `gpt-5.4-mini` (default), `gpt-5.4-nano`, Ollama models | varies | varies | GPT-5.x: no `temperature`, use `reasoning_effort` |
| None | rules only | 0 | 0 | Fillers, casing, punctuation spacing, dictionary, snippets; no self-corrections |

Anthropic API billing is separate from a Claude Team/Premium seat; keys come from the Claude Console.

## Sources
- OpenAI deprecations: https://platform.openai.com/docs/deprecations
- OpenAI Whisper → GPT-Transcribe migration: https://developers.openai.com/cookbook/examples/migrating_from_whisper_to_gpt_transcribe
- ElevenLabs Norwegian benchmark: https://elevenlabs.io/speech-to-text/norwegian
- ElevenLabs Scribe v2: https://elevenlabs.io/blog/introducing-scribe-v2
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- Artificial Analysis STT leaderboard: https://artificialanalysis.ai/speech-to-text/non-streaming
- Deepgram Nova-3 Norwegian: https://deepgram.com/learn/deepgram-expands-nova-3-with-italian-turkish-norwegian-and-indonesian-support
- Groq speech docs: https://console.groq.com/docs/speech-to-text
- Mistral Voxtral Transcribe 2: https://mistral.ai/news/voxtral-transcribe-2/
