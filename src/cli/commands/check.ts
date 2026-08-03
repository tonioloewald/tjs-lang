/**
 * tjs check - Parse and type check a TJS file
 */

import { readFileSync } from 'fs'
import { tjs, dialectForFilename } from '../../lang'
import { enforceMaxWarnings, reportWarnings } from '../warnings'

export async function check(
  file: string,
  options: { maxWarnings?: number } = {}
): Promise<void> {
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
    enforceMaxWarnings(warningCount, options.maxWarnings)
  } catch (error: any) {
    console.error(`✗ ${file}`)
    if (error.name === 'SyntaxError' && error.formatWithContext) {
      console.error()
      console.error(error.formatWithContext(2))
      console.error()
    } else {
      console.error(`  ${error.message}`)
    }
    process.exit(1)
  }
}
