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
import { readdirSync, statSync } from 'node:fs'
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
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (
      stats.isDirectory() &&
      !entry.startsWith('.') &&
      entry !== 'node_modules'
    ) {
      findFiles(full, keep, files)
    } else if (stats.isFile() && keep(entry)) {
      files.push(full)
    }
  }
  return files
}
