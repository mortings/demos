# Flyt docs

Notes for whoever (human or Claude) develops Flyt next. `../CLAUDE.md` at the repo root is the short guide that Claude Code loads automatically; these files carry the detail and are read on demand.

| File | What it holds |
|---|---|
| `decisions.md` | Architecture decisions with dates and the alternatives that lost |
| `learnings.md` | Gotchas and facts discovered the hard way |
| `providers.md` | Speech-to-text and cleanup models: ids, prices, deprecations, recommendations |
| `latency.md` | Where time goes from key release to inserted text, what was fixed, how to tune |
| `roadmap.md` | Next steps and their intended design |
| `resources.md` | Links |
| `session-log.md` | What was built when |

## Working with Claude Code on this project

- Start the session at the repo root (the desktop app: open the `flyt` folder as the project). `CLAUDE.md` loads automatically; `docs/` is read when relevant.
- Project skills live in `.claude/skills/`: `release-mac` (build + install), `update-notes` (append to these docs at the end of a session), `add-asr-provider`.
- End every substantial session with `/update-notes` so learnings do not evaporate with the conversation.
- Personal, machine-specific notes that should not be committed go in `CLAUDE.local.md` (git-ignored by Claude Code) or in `~/.claude/CLAUDE.md` for preferences that apply to all projects.
- Long sessions get expensive per turn; prefer a fresh session per task and `/compact` when the context grows.

Suggested `~/.claude/CLAUDE.md` snippet:

```
I am Morten, CPO at Bluestone PIM. Primary machine: Apple Silicon MacBook Pro, macOS.
I speak English and Norwegian. Keep answers short; lead with the outcome; tables for numbers.
For personal tools I prefer working, installable apps over prototypes.
```
