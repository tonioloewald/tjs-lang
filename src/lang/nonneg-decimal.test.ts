/**
 * `+1.5` is refused: a leading `+` marks a non-negative INTEGER (#4113). `function f(x: +1.5)` read
 * as a non-negative integer, so the function refused its own example (`f(1.5)`) and accepted
 * `f(5)`. There is no non-negative float, so the example is refused with the remedy, in a
 * parameter and in a Type example, rather than silently losing the sign or the fraction.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

describe('+N with a fraction', () => {
  it('is refused in a parameter example', () => {
    expect(() => tjs(`function f(x: +1.5) { return x }`)).toThrow(
      /leading \+ marks a non-negative INTEGER.*Write 1\.5 for any number/
    )
  })
  it('is refused in a Type example', () => {
    expect(() => tjs(`Type T = +2.5`)).toThrow(/non-negative INTEGER/)
  })
  it('+N with no fraction still means a non-negative integer (the other direction)', () => {
    const f = new Function(
      tjs(`function f(x: +3) { return x }`).code + '\nreturn f'
    )()
    expect(f(5)).toBe(5)
    expect(f(-1) instanceof Error).toBe(true)
  })
})
