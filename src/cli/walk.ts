/**
 * ONE recursive source-file walk, for the commands that collect before they act.
 *
 * `check` and `test` each had their own copy of the same twelve lines, differing only in
 * which filenames they keep. They also each had to remember the two exclusions that make a
 * walk usable — skip dotted directories, skip `node_modules` — and a walk that forgets
 * either one descends into `.git` or spends a minute in a dependency tree.
 *
 * `emit` and `convert` are deliberately NOT routed through this. They do not collect and
 * then act: they mirror the input tree into an output tree, writing as they descend, and
 * carry per-directory tallies back up. Folding them in would mean a callback-driven walk
 * that is harder to read than either copy — a consolidation that costs more than the
 * duplication it removes. (`check`'s docstring used to claim it walked "the way
 * emit/convert/test already walk"; three of the four never walked the same way.)
 */
import {
  readdirSync,
  statSync,
  lstatSync,
  unlinkSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Every file under `dir` whose BASENAME satisfies `keep`, depth-first.
 *
 * The predicate takes the basename rather than the full path so a caller cannot
 * accidentally match a directory component — `/home/me/.tjs-experiments/x.js` should not be
 * kept by a `.tjs` test, and would be by a naive `path.endsWith`.
 */
/**
 * What counts as a child of `dir`, with symlinks resolved to a SAFE answer.
 *
 * One function because there is one question. `findFiles` was moved to
 * `readdirSync(withFileTypes)` and `emit`/`convert` were left on `statSync`, so the three
 * walks disagreed about what a symlink is — and each disagreement had its own bug.
 *
 * The rule, and why each half of it:
 *
 *   - **A link to a FILE is a file.** Naively trusting the Dirent (where a symlink is
 *     neither `isFile()` nor `isDirectory()`) silently SKIPPED it, so `tjs check <dir>`
 *     printed a tick and exited 0 without ever reading a source file the user had put
 *     there — a type checker reporting green because it did not look, which is precisely
 *     the failure CLAUDE.md's CI section warns about. 0.13.0 followed the link and checked
 *     it, so that was a regression, not a hardening.
 *   - **A link to a DIRECTORY is not descended.** This is the half that must NOT follow:
 *     descending escapes the tree the user named (`emit -r` wrote output derived from a
 *     file outside it, while the tally said "1 emitted"), and a cycle recursed 33 levels
 *     before `ELOOP`.
 *   - **A DANGLING link is skipped, not fatal.** `statSync` throws `ENOENT`, which aborted
 *     the whole walk: `emit -r` died and emitted zero files, losing valid siblings. A
 *     broken link in a tree is a normal thing to find.
 *
 * So: read the cheap answer from the Dirent, and pay for a `stat` only on an actual link.
 */
export function readEntries(
  dir: string
): Array<{ name: string; isFile: boolean; isDirectory: boolean }> {
  const out: Array<{ name: string; isFile: boolean; isDirectory: boolean }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) {
      out.push({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      })
      continue
    }
    try {
      const target = statSync(join(dir, entry.name))
      // `isDirectory` deliberately stays FALSE for a linked directory: callers use it to
      // decide whether to descend, and the answer is no.
      out.push({
        name: entry.name,
        isFile: target.isFile(),
        isDirectory: false,
      })
    } catch {
      // Dangling. Not a file, not a directory, not a reason to stop.
    }
  }
  return out
}

export function findFiles(
  dir: string,
  keep: (basename: string) => boolean,
  files: string[] = []
): string[] {
  for (const entry of readEntries(dir)) {
    const full = join(dir, entry.name)
    if (entry.isDirectory && shouldDescend(entry.name)) {
      findFiles(full, keep, files)
    } else if (entry.isFile && keep(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/**
 * The two exclusions every source walk in this repo must apply.
 *
 * Shared because `convert` had NEITHER — `tjs convert . -o out` mirrored `node_modules`
 * and every dot-directory into the output (913 real `.ts` files in this repo alone), while
 * `walk.ts`'s own docstring called both essential and `emit` applied both. The
 * consolidation named `emit`/`convert` as deliberately out of scope; that was the right
 * call for their tree-mirroring shape and the wrong one for the exclusions, which are a
 * policy rather than a walk.
 */
export function shouldDescend(name: string): boolean {
  return !name.startsWith('.') && name !== 'node_modules'
}

/**
 * Write an emitted FILE: re-attach the `#!` line, and never write through a symlink.
 *
 * Two rules that both belong at this one boundary.
 *
 * **The hashbang.** `preprocess` blanks it so acorn can parse the source; `result.code` is
 * a fragment that gets embedded (`new Function`, `tjsx`, the playground), so the line must
 * NOT live there — 0.13.1 put it there and broke all three with `Invalid character: '#'`.
 * A file, on the other hand, needs it or it is not executable. So: fragments carry it
 * beside the code, and the file writer puts it back.
 *
 * **The symlink.** The READ side refuses to descend a symlinked directory because that
 * escapes the tree the user named — and the write side did exactly that escape, silently.
 * Reproduced: with `out/a.js` a link to `precious/keep.txt`, `tjs emit src -o out -r`
 * OVERWROTE `precious/keep.txt` with transpiled JS and reported `1 emitted, 0 failed`,
 * exit 0. Data loss reported as success, in the same command whose read half forbids the
 * same escape. The link is removed and a real file written in its place; the target is left
 * alone.
 */
export function writeEmitted(
  outputPath: string,
  code: string,
  hashbang?: string
): void {
  const dir = dirname(outputPath)
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
  // `lstat`, not `stat` — the question is whether the PATH is a link, not what it points at.
  try {
    if (lstatSync(outputPath).isSymbolicLink()) unlinkSync(outputPath)
  } catch {
    // Nothing there. Nothing to unlink.
  }
  writeFileSync(outputPath, hashbang ? `${hashbang}\n${code}` : code)
}
