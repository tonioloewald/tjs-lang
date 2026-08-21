/**
 * tjs check - Parse and type check a TJS file
 */

import { readFileSync, statSync } from 'node:fs'
import { findFiles } from '../walk'
import { tjs, dialectForFilename } from '../../lang'
import { enforceMaxWarnings, reportWarnings } from '../warnings'

/**
 * Source files under `dir`.
 *
 * `check` was the only command that could not take a directory — and the `--max-warnings`
 * error text it prints tells you to run exactly that (`tjs check src/ --max-warnings 0`),
 * which failed with a raw `EISDIR: illegal operation on a directory, read`. A tool whose
 * own diagnostic recommends an invocation it rejects sends the reader looking for their
 * own mistake.
 *
 * `.tjs` and plain JS only — NOT `.ts`. The first version of this collected `.ts` too, so
 * `tjs check src/cli` reported **15 of this project's own files as broken**: `export
 * interface` is not TJS, and a `#!` shebang came back as `Unexpected character '!'`. That
 * is the exact invocation the `--max-warnings` text recommends, so following the
 * diagnostic produced a wall of false failures.
 */
function findSourceFiles(dir: string): string[] {
  return findFiles(dir, (name) => /\.(tjs|js|mjs|cjs)$/.test(name))
}

export async function check(
  file: string,
  options: { maxWarnings?: number; verbose?: boolean } = {}
): Promise<void> {
  if (statSync(file).isDirectory()) {
    const files = findSourceFiles(file)
    if (files.length === 0) {
      console.error(`No source files found in ${file}`)
      process.exit(1)
    }
    // The warning BUDGET is for the whole run, not per file — otherwise
    // `--max-warnings 0` over a directory means something different from what it says.
    let total = 0
    let failed = false
    for (const f of files) {
      // Signature narration is OFF over a directory unless asked for. `check tjs-src`
      // (two files) printed 59 lines, 56 of them signatures — and this is the command CI
      // and agents run, where the answer is "did anything fail?" and every extra line is
      // something to scroll past. `--verbose` restores it; a single file still narrates,
      // because there the signatures ARE the output you came for.
      const n = await checkOne(f, options.verbose === true)
      if (n === null) failed = true
      else total += n
    }
    if (failed) process.exit(1)
    enforceMaxWarnings(total, options.maxWarnings)
    return
  }
  const count = await checkOne(
    file,
    options.verbose === true || options.maxWarnings === undefined
  )
  if (count === null) process.exit(1)
  enforceMaxWarnings(count, options.maxWarnings)
}

/** Check one file. Returns its warning count, or `null` if it failed to parse. */
async function checkOne(file: string, verbose = true): Promise<number | null> {
  // The `#!` line is handled in `preprocess`, where every command reaches it. It used to be
  // blanked HERE, which is why `check` accepted bin scripts that `emit`/`run`/`types`/`test`
  // rejected outright.
  const source = readFileSync(file, 'utf-8')

  try {
    // `.js`/`.mjs` ⇒ plain-JS semantics preserved; `.tjs` ⇒ native modes.
    const result = tjs(source, { dialect: dialectForFilename(file) })

    // Warnings FIRST, and to stderr. This is the primary type-checking command — the one
    // CI and agents run — and it used to hide the degradation diagnostic entirely,
    // reporting `✓` for a file whose types had silently been dropped to `any`.
    const warningCount = reportWarnings(file, result.warnings)

    // Report function info from types
    if (verbose && result.types && Object.keys(result.types).length > 0) {
      console.log(`✓ ${file}`)
      for (const [fnName, fn] of Object.entries(result.types)) {
        const params = Object.entries(fn.params || {})
          .map(([name, info]: [string, any]) => {
            const opt = info.required ? '' : '?'
            const type = info.type?.kind || 'any'
            return `${name}${opt}: ${type}`
          })
          .join(', ')
        const ret = fn.returns?.kind || 'void'
        console.log(`  ${fnName}(${params}) -> ${ret}`)
      }
    } else {
      console.log(`✓ ${file}`)
    }
    return warningCount
  } catch (error: any) {
    console.error(`✗ ${file}`)
    if (error.name === 'SyntaxError' && error.formatWithContext) {
      console.error()
      console.error(error.formatWithContext(2))
      console.error()
    } else {
      console.error(`  ${error.message}`)
    }
    return null
  }
}
