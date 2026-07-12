# Agent Instructions

This project tracks work in plain markdown files — no external issue tracker.

## Where Work Lives

- **`TODO.md`** — open work, organized by area (Playground, Language Features, Editor, Documentation, Infrastructure). Move items to the **Completed** section when done.
- **`PLAN.md`** — roadmap and longer-term direction.
- **`CLAUDE.md`** — repo conventions, commands, architecture for AI assistants.

When you start a task, find or add the relevant entry in `TODO.md`. When you finish, check the box and (for substantial work) move it to the Completed section with a short note.

## Landing the Plane (Session Completion)

When ending a work session that touched code, complete **all** steps below in order. Work is NOT complete until `git push` succeeds.

1. **Update `TODO.md`** — check off completed items, add follow-ups for anything left undone, note blockers.
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
5. **Clean up** — clear stale stashes, prune merged remote branches if appropriate.
6. **Verify** — working tree clean AND branch up to date with origin.
7. **Hand off** — leave a brief summary so the next session can pick up cold.

## Hard Rules

- Work is NOT complete until `git push` succeeds.
- Never stop before pushing — leaving work stranded locally is leaving it lost.
- Never say "ready to push when you are" — push it yourself.
- If push fails, resolve the cause (rebase conflicts, hook failures, auth) and retry until it succeeds.
- Never `--no-verify` to bypass hooks. Fix the underlying issue.
