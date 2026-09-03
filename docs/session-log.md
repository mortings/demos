# Session log

## 2026-09-02 · Split into its own repository
Flyt moved from `mortings/demos/flyt` to `mortings/flyt` with history preserved (`git subtree split`). Local checkout lives at `~/Claude/flyt`.

## 2026-09-02 · Build from zero to installed app (one Claude Code cloud session)
Commits originally on `demos` branch `claude/wispr-flow-replacement-6mgb5i`, now the history of this repo:
1. **Add Flyt** – full app: hotkeys, audio engine, VAD/segmenter, ASR adapters, Claude cleanup with rules fallback and guard, overlay, settings UI, tray, packaging config, 41 tests.
2. **Paste via input hook, auto-retry hotkeys** – synthetic ⌘V through uiohook (no Automation permission), Accessibility prompt + hook retry, dev-mode fixes.
3. **Default to gpt-transcribe and Scribe v2** – deprecations handled, keyterms, settings migration.
4. **Refresh provider model lists** – GPT-5.4 mini default for OpenAI-compatible cleanup, reasoning_effort handling.
5. **Cut release-to-text latency** – early post-roll, chunk while holding, keep-alive + warm-up, stage timing in History.
6. **Package as a real macOS app** – app icon, ad-hoc signing hook, `npm run install:mac`, version 0.2.0.
7. **Knowledge base** – this `docs/` folder, `CLAUDE.md` files, project skills.

Open threads: streaming recognition; command mode; Developer ID signing. User feedback so far: works, wants Wispr-level speed (switch to Haiku 4.5 recommended).
