/**
 * tjs check - Parse and type check a TJS file
 */

import { readFileSync, statSync } from 'node:fs'
import { findFiles } from '../walk'
import { tjs, dialectForFilename } from '../../lang'
import { enforceMaxWarnings, reportWarnings } from '../warnings'
import { tallyTestResults, testLabel } from '../test-report'
import { lint } from '../../lang/linter'
import { preprocess } from '../../lang/parser'

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
      // Name the extensions, and point at `convert` when the directory is TypeScript.
      // "No source files found" on a directory full of `.ts` is technically true and
      // completely unhelpful — it reads like the path is wrong.
      const hasTS = findFiles(file, (n) => /\.tsx?$/.test(n)).length > 0
      console.error(
        `No .tjs/.js/.mjs/.cjs files found in ${file}` +
          (hasTS
            ? `\nIt contains TypeScript. \`tjs check\` does not parse .ts — convert it first: tjs convert ${file}`
            : '')
      )
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
  // A single file ALWAYS narrates, which is what `--help` says.
  //
  // This used to be `options.maxWarnings === undefined`, so passing `--max-warnings N`
  // silently turned the signature line off — a flag about WARNING BUDGETS quietly
  // controlling OUTPUT VERBOSITY, while the help text asserted it could not happen.
  // `--verbose` is the narration control; `--max-warnings` is not.
  const count = await checkOne(file, true)
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
    // An INCONCLUSIVE test could not run here (an async signature example, or a test that names
    // something only the page or the host provides, such as `document`, or a typo: at build time
    // they look alike). It is not a failure, but `check` reporting ✓ said nothing at all (#4120),
    // so each is a warning, counted by `--max-warnings`.
    const inconclusive = tallyTestResults(result.testResults ?? []).inconclusive
    // The linter (unused variables, unreachable code, safe-assign, misspelled dictionary keys)
    // runs on native .tjs files: it existed and nothing in the CLI called it (2026-11-14).
    // Plain .js keeps JavaScript's rules. Under `TjsStrict` safe-assign and excess dictionary
    // keys are ERRORS, which fail the check.
    const lintDiagnostics =
      dialectForFilename(file) === 'tjs'
        ? lint(source, {
            filename: file,
            strict: !!preprocess(source).tjsModes?.tjsStrict,
          }).diagnostics
        : []
    const lintErrors = lintDiagnostics.filter((d) => d.severity === 'error')
    const lintText = (d: (typeof lintDiagnostics)[number]) =>
      `${d.line ? `line ${d.line}: ` : ''}${d.message} (${d.rule})`
    const warningCount = reportWarnings(file, [
      ...(result.warnings ?? []),
      ...inconclusive.map(
        (r) => `${testLabel(r)} could not run: ${r.error ?? 'inconclusive'}`
      ),
      ...lintDiagnostics.filter((d) => d.severity === 'warning').map(lintText),
    ])
    if (lintErrors.length) {
      console.error(`✗ ${file}`)
      for (const d of lintErrors) console.error(`  ${lintText(d)}`)
      return null
    }

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
