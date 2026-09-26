<!--{"hidden": true}-->

# Agent Instructions

This project tracks its OWN work on the **Virta board** (https://virta.tosijs.net/host/#?virta.scope=tjs-lang; `virta brief` from a shell — the SessionStart hook runs it for you). `TODO.md` is now a pointer. GitHub issues are used, but for a different job: items filed by CONSUMERS of the package, and upstream findings we owe someone else. Both are live — `gh issue list` is not empty, and every open one carries a dated disposition.

## Where Work Lives

- **The Virta board** — open work. `virta ls "project:tjs-lang status:ready"`, `virta show #n`, `virta work #n`, `virta review #n "…"`, `virta done #n "…"`, `virta create "…" --project tjs-lang`. Imported from `TODO.md` on 2026-09-26.
- **`PLAN.md`** — roadmap and longer-term direction.
- **`CLAUDE.md`** — repo conventions, commands, architecture for AI assistants.

When you start a task, find or create its card and `virta work` it. When you finish, `virta review` it (or `virta done` with the reason), and file a card for any follow-up, with a body that says why.

## Landing the Plane (Session Completion)

When ending a work session that touched code, complete **all** steps below in order. Work is NOT complete until `git push` succeeds.

1. **Update the board** — close or hand finished cards to review, file cards for follow-ups, note blockers on the card.
2. **Run quality gates** — if code changed:
   ```bash
   bun run format       # ESLint fix + Prettier
   bun run typecheck    # tsc --noEmit
   bun run test:fast    # core tests (or `bun test` for full suite)
   ```
   A `pre-commit` hook (`.githooks/pre-commit`, enabled by the `prepare` script on
   `bun install`) backstops step one by checking **staged files only** — it catches a file
   committed without ever passing through Prettier, and won't block you on pre-existing
   problems elsewhere. It is a backstop, not a substitute: it does not typecheck or test.
   `bun run format:check` runs the same checks repo-wide.
3. **Commit** — focused commits with clear messages. Don't bundle unrelated changes.
4. **Push to remote** — mandatory:
   ```bash
   git pull --rebase
   git push
   git status   # MUST show "up to date with 'origin/...'"
   ```
5. **Clean up** — clear stale stashes, prune merged remote branches if appropriate, and
   **account for every scratch artifact you created**. Probes, one-off scripts, sample
   inputs, `.bak` copies: each one either becomes a real test, or is deleted. It does not
   get committed "for now".

   This step exists because of a specific failure. `.i4-check.ts` — a probe with absolute
   `/Users/…` imports and no assertions — sat committed at the repo root for weeks. It
   escaped every gate by accident: `tsc` skips dot-prefixed files and the `files` allowlist
   kept it out of the tarball, so nothing was ever red. It was also the only executable
   proof that issue #4 was fixed, and #4's behaviour had no test. **A scratch file that is
   worth keeping is a test that has not been written yet** — that is the tell, and the
   remedy is to write it rather than to commit the probe.

   Use the session scratchpad directory for anything genuinely temporary, so "did I leave
   something behind?" is answerable by looking at `git status` rather than by remembering.

6. **Verify** — working tree clean AND branch up to date with origin.

### After a pre-release review

- **File the report FIRST.** Copy the harness output to `docs/reviews/<version>-<slug>.md`
  before acting on any finding. The second 0.13.0 review lived only at a
  `/private/tmp/.../tasks/*.output` scratch path — 892 lines, present by luck — while the
  durable record of fourteen unworked majors was a five-line paraphrase. `docs/reviews/`
  is excluded from the npm tarball (`"!docs/reviews"` in `files`) and from `llms.txt`:
  process artifacts, kept in the repo, not shipped.
- **Say what you are NOT fixing, in one place, with the decision and the target version.**
  An unannotated open-findings list reads identically whether it was triaged and deferred
  or simply never reached — and it will be read as the second.
- **A lens-8 (practices) write-back names the commit range it covers.** One landed here
  describing a state that stopped being true two and a half hours later, with a checked
  box in `TODO.md` claiming otherwise. Without the range, staleness is something someone
  has to notice rather than something that can be checked.

7. **Hand off** — leave a brief summary so the next session can pick up cold.

## Hard Rules

- Work is NOT complete until `git push` succeeds.
- Never stop before pushing — leaving work stranded locally is leaving it lost.
- Never say "ready to push when you are" — push it yourself.
- If push fails, resolve the cause (rebase conflicts, hook failures, auth) and retry until it succeeds.
- Never `--no-verify` to bypass hooks. Fix the underlying issue.
