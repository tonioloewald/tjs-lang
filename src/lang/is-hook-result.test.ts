/**
 * `Is` returns a boolean whatever an equality hook returns (#4119 item 2).
 *
 * A `.Equals` (or `[tjsEquals]`) hook's result was returned as is: `Equals() { return 'yes' }`
 * made `Is(a, b)` return `'yes'`. A hook answers equal only with `true`; anything else is not
 * equal. Checked in the shared runtime and in the inline copy emitted code carries.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { Is, tjsEquals } from './runtime'

const inlineIs = new Function(
  tjs('function cmp(a, b) { return Is(a, b) }').code + '\nreturn cmp'
)()

const hooked = (result: unknown) => ({ Equals: () => result })
const symbolic = (result: unknown) => ({ [tjsEquals]: () => result })

for (const [label, is] of [
  ['runtime', Is],
  ['inline', inlineIs],
] as const) {
  describe(`Is with a hook (${label})`, () => {
    it('a non-boolean result is not equal, and is a boolean', () => {
      for (const r of ['yes', 1, {}, null, undefined]) {
        expect(is(hooked(r), 0)).toBe(false)
        expect(is(0, symbolic(r))).toBe(false)
      }
    })
    it('true is equal, false is not (the other direction)', () => {
      expect(is(hooked(true), 0)).toBe(true)
      expect(is(0, hooked(true))).toBe(true)
      expect(is(symbolic(false), 0)).toBe(false)
    })
  })
}
