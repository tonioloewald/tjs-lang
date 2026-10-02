/**
 * The committed fold table is what the host engine says TODAY. `regex-folds.ts` is generated from
 * the host's own case-insensitive matching; if the host's Unicode data moves (a Bun or ICU
 * upgrade), this fails rather than letting the VM's `i` flag drift from JavaScript's in silence.
 * Regenerate with `bun scripts/build-regex-folds.ts`.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { foldClasses, render } from '../../scripts/build-regex-folds'
import { decodeFolds } from './regex'
import { FOLDS_I, FOLDS_IU } from './regex-folds'

describe('regex fold table', () => {
  it('is fresh', () => {
    const committed = readFileSync(
      join(import.meta.dir, 'regex-folds.ts'),
      'utf8'
    )
    expect(committed).toBe(render())
  })

  it('decodes to exactly the derived classes', () => {
    expect(decodeFolds(FOLDS_I)).toEqual(foldClasses(false))
    expect(decodeFolds(FOLDS_IU)).toEqual(foldClasses(true))
  })

  it('apparatus: the classes include the cases hand-written rules missed', () => {
    const has = (table: string, ...chars: string[]) =>
      decodeFolds(table).some((c) =>
        chars.every((ch) => c.includes(ch.codePointAt(0)!))
      )
    expect(has(FOLDS_I, 'ǅ', 'Ǆ', 'ǆ')).toBe(true)
    expect(has(FOLDS_IU, 'ſ', 's', 'S')).toBe(true)
    expect(has(FOLDS_I, 'ſ', 's')).toBe(false) // non-ASCII → ASCII is excluded without `u`
    expect(has(FOLDS_IU, 'ı', 'i')).toBe(false)
  })
})
