/**
 * An enum's members read as properties, as in TypeScript (#3840). `Enum` kept them only under
 * `.members`, so a converted TypeScript `enum Color { Red = 'red' }` read `Color.Red` as
 * `undefined`: conversion silently changed what the program did. Numeric members also map
 * back to their names (`Dir[0] === 'Up'`), as TypeScript's numeric enums do. A member whose
 * name collides with the enum's own fields (check, values, …) or a function built-in is not
 * shadowed: those keep their meaning, and `.members` always works.
 *
 * Both implementations are held to this: the inline stub (what emitted code runs) and the
 * full runtime's `Enum` (src/types/Type.ts).
 */
import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'
import { graduate } from './graduate'
import { Enum } from '../types/Type'

const load = (code: string, name = 'f') => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${tjs(code, { runTests: false }).code.replace(
        /^export /gm,
        ''
      )}\nreturn ${name}`
    )()
  } finally {
    g.__tjs = prev
  }
}

const TS = `export enum Color { Red = 'red', Blue = 'blue' }
export enum Dir { Up, Down = 5, Left }
export function f() { return [Color.Red, Color.Blue, Dir.Up, Dir.Left, Dir[0], Dir[5]] }`
const WANT = ['red', 'blue', 0, 6, 'Up', 'Down']

describe('converted TypeScript enums keep their meaning', () => {
  it('before graduation', () => {
    expect(load(fromTS(TS, { emitTJS: true }).code)()).toEqual(WANT)
  })
  it('after graduation', () => {
    const g = graduate(fromTS(TS, { emitTJS: true }).code)
    expect(g.refused).toBeUndefined()
    expect(load(g.code)()).toEqual(WANT)
  })
})

describe('the inline stub and the full runtime agree', () => {
  const inline = load(
    `Enum Mixed 'm' { Red = 'red', Two = 2, check = 'c' }\nfunction f() { return Mixed }`
  )()
  const full = Enum('m', { Red: 'red', Two: 2, check: 'c' } as any) as any
  for (const [label, e] of [
    ['inline', inline],
    ['full', full],
  ] as const)
    it(label, () => {
      expect(e.Red).toBe('red')
      expect(e.Two).toBe(2)
      expect(e[2]).toBe('Two') // numeric reverse mapping
      expect(e['red']).toBeUndefined() // strings do not reverse-map, as in TypeScript
      expect(typeof e.check).toBe('function') // a colliding member does not shadow a field
      expect(e.members.check).toBe('c') // ...and is still reachable
      expect(e.check('red')).toBe(true)
      expect(Object.keys(e)).not.toContain('Red') // members are not enumerable fields
    })
})
