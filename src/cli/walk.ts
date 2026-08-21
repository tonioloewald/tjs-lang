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
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every file under `dir` whose BASENAME satisfies `keep`, depth-first.
 *
 * The predicate takes the basename rather than the full path so a caller cannot
 * accidentally match a directory component — `/home/me/.tjs-experiments/x.js` should not be
 * kept by a `.tjs` test, and would be by a naive `path.endsWith`.
 */
export function findFiles(
  dir: string,
  keep: (basename: string) => boolean,
  files: string[] = []
): string[] {
  // `withFileTypes`, not `statSync`. Three reasons, and the first is a crash:
  //
  //   - `statSync` FOLLOWS the link, so a DANGLING symlink threw a raw
  //     `ENOENT: no such file or directory, stat '…'` and `tjs check <dir>` checked zero
  //     files. A broken link in a tree is a normal thing to find, not a reason to abort.
  //   - A symlinked DIRECTORY was descended into, so the walk escaped the tree it was
  //     given — silently checking files outside it and double-counting their warnings into
  //     `--max-warnings`. A cycle went 33 deep and died with `ELOOP`.
  //   - `readdir` already knows the type. Asking again per entry doubles the syscalls.
  //
  // `isDirectory()`/`isFile()` on a Dirent describe the ENTRY, so a link is neither, and
  // both hazards stop by construction rather than by a guard someone has to remember.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory() && shouldDescend(entry.name)) {
      findFiles(full, keep, files)
    } else if (entry.isFile() && keep(entry.name)) {
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
