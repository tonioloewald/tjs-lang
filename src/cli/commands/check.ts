/**
 * tjs check - Parse and type check a TJS file
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { tjs, dialectForFilename } from '../../lang'
import { enforceMaxWarnings, reportWarnings } from '../warnings'

/**
 * Source files under `dir`, the way `emit`/`convert`/`test` already walk.
 *
 * `check` was the only command that could not take a directory — and the
 * `--max-warnings` error text it prints tells you to run exactly that
 * (`tjs check src/ --max-warnings 0`), which failed with a raw
 * `EISDIR: illegal operation on a directory, read`. A tool whose own diagnostic
 * recommends an invocation it rejects sends the reader looking for their mistake.
 */
function findSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (
      stats.isDirectory() &&
      !entry.startsWith('.') &&
      entry !== 'node_modules'
    ) {
      findSourceFiles(full, files)
    } else if (stats.isFile() && /\.(tjs|ts|js|mjs|cjs)$/.test(entry)) {
      if (!entry.endsWith('.d.ts')) files.push(full)
    }
  }
  return files
}

export async function check(
  file: string,
  options: { maxWarnings?: number } = {}
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
      const n = await checkOne(f)
      if (n === null) failed = true
      else total += n
    }
    if (failed) process.exit(1)
    enforceMaxWarnings(total, options.maxWarnings)
    return
  }
  const count = await checkOne(file, options.maxWarnings === undefined)
  if (count === null) process.exit(1)
  enforceMaxWarnings(count, options.maxWarnings)
}

/** Check one file. Returns its warning count, or `null` if it failed to parse. */
async function checkOne(file: string, _verbose = true): Promise<number | null> {
  const source = readFileSync(file, 'utf-8')

  try {
    // `.js`/`.mjs` ⇒ plain-JS semantics preserved; `.tjs` ⇒ native modes.
    const result = tjs(source, { dialect: dialectForFilename(file) })

    // Warnings FIRST, and to stderr. This is the primary type-checking command — the one
    // CI and agents run — and it used to hide the degradation diagnostic entirely,
    // reporting `✓` for a file whose types had silently been dropped to `any`.
    const warningCount = reportWarnings(file, result.warnings)

    // Report function info from types
    if (result.types && Object.keys(result.types).length > 0) {
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
      console.log(`✓ ${file} - Parsed successfully`)
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
