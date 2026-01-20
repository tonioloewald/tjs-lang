/**
 * tjs check - Parse and type check a TJS file
 */

import { readFileSync } from 'fs'
import { tjs } from '../../lang'

export async function check(file: string): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  try {
    const result = tjs(source)

    // Report function info from types
    if (result.types) {
      const fn = result.types
      const params = Object.entries(fn.params || {})
        .map(([name, info]: [string, any]) => {
          const opt = info.required ? '' : '?'
          const type = info.type?.kind || 'any'
          return `${name}${opt}: ${type}`
        })
        .join(', ')
      const ret = fn.returns?.kind || 'void'
      console.log(`✓ ${file}`)
      console.log(`  ${fn.name}(${params}) -> ${ret}`)
    } else {
      console.log(`✓ ${file} - Parsed successfully`)
    }
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
