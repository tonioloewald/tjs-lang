/**
 * tjs types - Output type metadata as JSON
 */

import { readFileSync } from 'fs'
import { tjs, dialectForFilename } from '../../lang'

export async function types(file: string): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  const result = tjs(source, { dialect: dialectForFilename(file) })

  // Output the type information as JSON
  const typeInfo = {
    file,
    ...result.types,
  }

  console.log(JSON.stringify(typeInfo, bigintSafe, 2))
}

/**
 * `JSON.stringify` THROWS on a BigInt rather than skipping it, so a single `x: 0n` example
 * anywhere in the file took down the whole command with "JSON.stringify cannot serialize
 * BigInt" — no file, no line, no clue which annotation caused it.
 *
 * Serialised as the source spelling (`"5n"`) rather than a number: a bigint outside the
 * safe-integer range would silently lose precision as a JSON number, and this output is
 * meant to be a faithful description of the declared types.
 */
function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? `${value}n` : value
}
