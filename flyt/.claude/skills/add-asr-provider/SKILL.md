---
name: add-asr-provider
description: Add or update a speech-to-text provider or model in Flyt (new API adapter, new model id, deprecation). Use when asked to support a new recogniser, change default models, or when a provider announces deprecations.
---

# Add or update a speech-to-text provider

Files involved: `src/shared/types.ts` (`AsrProviderSchema`, `SECRET_NAMES`), `src/shared/defaults.ts` (`ASR_SECRET`, `ASR_DEFAULT_MODELS`, `ASR_MODEL_OPTIONS`, `ASR_MODEL_UPGRADES`), `src/main/pipeline/asr/` (adapter + `index.ts` factory), `src/renderer/settings/panes/ProvidersPane.tsx` (`ASR_INFO` hint, key URL), `docs/providers.md`, `README.md` table.

## New provider
1. Verify the API shape from the provider docs (endpoint, auth header, multipart vs raw body, language parameter format, vocabulary/biasing parameter, response fields for text and detected language). Write it into `docs/providers.md` first.
2. Add the enum value and a `SecretName`; wire `ASR_SECRET`.
3. Implement `Transcriber` in `src/main/pipeline/asr/<name>.ts`: `name`, `origin` (for connection warm-up), `transcribe()`. Map language codes with `normaliseLanguage`; throw `AsrError` with status on non-2xx via `readErrorBody`.
4. Register in `createTranscriber`; pass dictionary terms as the provider's biasing parameter when it has one.
5. Add the model list and default, a hint in `ASR_INFO`, and README/provider docs rows.
6. `npm run typecheck && npm test`; the controller test uses the `custom` provider against a mock server and should stay green.

## Model change / deprecation
1. Update `ASR_DEFAULT_MODELS` and `ASR_MODEL_OPTIONS`.
2. Add old → new ids to `ASR_MODEL_UPGRADES` so saved settings migrate on load (covered by `test/settings-store.test.ts`; extend it).
3. Update hints, `docs/providers.md` (with the deprecation and shutdown dates and a source link) and the README table.
