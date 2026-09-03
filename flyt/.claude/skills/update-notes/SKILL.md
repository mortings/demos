---
name: update-notes
description: Capture what was learned or decided in this session into flyt/docs (learnings, decisions, providers, roadmap, session-log) and keep CLAUDE.md short. Use at the end of any substantial session, or when the user says "update the notes", "write this down", "remember this".
---

# Update the project notes

Goal: nothing important lives only in the conversation.

1. Read `docs/learnings.md`, `docs/decisions.md`, `docs/roadmap.md` and `docs/session-log.md` (skim; they are short).
2. From this session, extract:
   - **Learnings**: facts that cost time (API quirks, macOS behaviour, toolchain gotchas). One bullet each, under the matching heading in `docs/learnings.md`. Date entries that can go stale.
   - **Decisions**: any choice with alternatives that lost. New entry at the top of `docs/decisions.md`, dated, with what/why/what lost/when to revisit.
   - **Provider changes**: model ids, prices, deprecations → `docs/providers.md` (update the "State as of" date).
   - **Roadmap**: items finished get removed or marked; new ideas added with a short intended design.
   - **Session log**: one dated entry in `docs/session-log.md` listing commits and open threads.
3. Only touch `CLAUDE.md` if a house rule or command changed. Keep it under a screen; move detail to `docs/`.
4. Do not paste conversation transcripts. Write the conclusion, not the journey.
5. Commit with subject `docs: notes from <date> session`.
