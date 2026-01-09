/**
 * tjs types - Output type metadata as JSON
 */

import { readFileSync } from 'fs'
import { tjs } from '../../lang'

export async function types(file: string): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  const result = tjs(source)

  // Output the type information as JSON
  const typeInfo = {
    file,
    ...result.types
  }

  console.log(JSON.stringify(typeInfo, null, 2))
}
