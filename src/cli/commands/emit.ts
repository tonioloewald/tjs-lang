/**
 * tjs emit - Output transpiled JavaScript
 */

import { readFileSync } from 'fs'
import { tjs } from '../../lang'

export async function emit(file: string): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  const result = tjs(source)

  // Output the transpiled JavaScript
  console.log(result.code)
}
