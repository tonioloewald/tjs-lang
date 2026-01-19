/**
 * tjs emit - Output transpiled JavaScript
 */

import { readFileSync } from 'fs'
import { basename } from 'path'
import { tjs } from '../../lang'

export interface EmitOptions {
  /** Include source locations in __tjs metadata */
  debug?: boolean
}

export async function emit(
  file: string,
  options: EmitOptions = {}
): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  const result = tjs(source, {
    filename: basename(file),
    debug: options.debug,
  })

  // Output the transpiled JavaScript
  console.log(result.code)
}
