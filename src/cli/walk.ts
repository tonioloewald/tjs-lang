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
  realpathSync,
} from 'node:fs'
import { join, dirname, sep } from 'node:path'

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
  hashbang?: string,
  root?: string
): void {
  // CONTAINMENT, not just a leaf check.
  //
  // The first version only unlinked a symlinked LEAF, which left the interesting half open:
  // with `out/sub` a link to `../precious`, `lstatSync('out/sub/b.js')` resolves `sub`
  // THROUGH the link and sees an ordinary file, so the write went through and destroyed
  // `precious/b.js` — reported as `1 emitted, 0 failed`, exit 0. The funnel landed; the
  // guard behind it did not, and all three symlink tests happened to put the link at the
  // leaf, so the suite was green over it.
  //
  // The rule is containment rather than "refuse any symlinked component", because
  // `-o dist` where `dist -> /build/dist` is a legitimate and common setup travelling this
  // exact code path. The ROOT may be a link; nothing inside it may escape it.
  if (root) {
    const realRoot = realpathSync(existsSync(root) ? root : dirname(root))
    let probe = dirname(outputPath)
    while (!existsSync(probe) && dirname(probe) !== probe)
      probe = dirname(probe)
    const realDir = realpathSync(probe)
    if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
      throw new Error(
        `refusing to write outside the output directory: ${outputPath} resolves to ` +
          `${realDir}, which is not under ${realRoot}`
      )
    }
  }

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

/** What a tree walk does with one accepted file. Returns whether it produced output. */
export interface TreeWalkOptions {
  recursive: boolean
  /** Does this basename get processed at all? (e.g. `.tjs` for emit, `.ts` for convert) */
  accept: (name: string) => boolean
  /** Accepted by extension but deliberately NOT processed — test files, `.d.ts`. */
  skip?: (name: string) => boolean
  /** Input basename → output basename. */
  outputName: (name: string) => string
  /** Do the work. `root` is the user-named `-o` directory, for `writeEmitted`. */
  onFile: (
    inputPath: string,
    outputPath: string,
    root: string
  ) => Promise<boolean>
  /** Narration for a skipped file. */
  onSkip?: (inputPath: string) => void
}

/**
 * ONE directory walk for the commands that mirror an input tree into an output tree.
 *
 * `emitDirectory` and `convertDirectory` were ~40-line structural duplicates differing only
 * in an extension, a skip rule, an output name and the per-file action. Everything that
 * actually goes wrong in a tree walk was written twice:
 *
 *   - **the descent policy** — `convert` applied NEITHER exclusion, so `tjs convert . -o out`
 *     mirrored `node_modules` and every dot-directory into the output (913 real `.ts` files
 *     in this repo alone)
 *   - **the tally rollup** — `emit` returned `void`, so a nested failure vanished at the
 *     recursion boundary; `convert` had been fixed for this in #24 and its twin had not
 *   - **the exit code** — `emit` reported `2 emitted, 0 failed` at exit 0 with output missing
 *   - **containment** — the `-o` root has to stay constant through the recursion or a nested
 *     write escapes the tree the user named
 *
 * Three releases running, the same defect had to be fixed twice and only one copy was. That
 * is what makes the duplication worth removing rather than living with: it is not two places
 * to read, it is two places to *forget*. Fixing instances while leaving the generator is why
 * this class produced a blocker in four consecutive review rounds.
 *
 * The `root` default is deliberate — it is captured ONCE at the top-level call and threaded
 * unchanged, so `writeEmitted`'s containment check compares against the directory the user
 * actually typed rather than the current recursion level.
 */
export async function walkTree(
  inputDir: string,
  outputDir: string,
  opts: TreeWalkOptions,
  root: string = outputDir
): Promise<{ ok: number; failed: number; skipped: number }> {
  let ok = 0
  let failed = 0
  let skipped = 0

  for (const { name, isFile, isDirectory } of readEntries(inputDir)) {
    const inputPath = join(inputDir, name)

    if (isDirectory) {
      if (opts.recursive && shouldDescend(name)) {
        const sub = await walkTree(inputPath, join(outputDir, name), opts, root)
        ok += sub.ok
        failed += sub.failed
        skipped += sub.skipped
      }
      continue
    }

    if (!isFile || !opts.accept(name)) continue

    if (opts.skip?.(name)) {
      skipped++
      opts.onSkip?.(inputPath)
      continue
    }

    if (
      await opts.onFile(inputPath, join(outputDir, opts.outputName(name)), root)
    ) {
      ok++
    } else {
      failed++
    }
  }

  return { ok, failed, skipped }
}
