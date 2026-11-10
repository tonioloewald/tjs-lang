/**
 * A dictionary default with a computed key keeps JavaScript's meaning (#3990).
 *
 * Inference read `{ [k]: 1, b: 2 }` by the key expression's NAME, so the dictionary template
 * gained a member 'k' and the default came out `{ a: 1, b: 2, k: 1 }` for `k = 'a'`. An object
 * whose member names are not all known when it is compiled cannot be a dictionary template (the
 * merge needs the names), so it is an ordinary JavaScript default, which is what it says.
 *
 * Not a defect, recorded so it stays decided: an impure call INSIDE an array member
 * (`{ at: [tick()] }`) is evaluated on every call, exactly as JavaScript does, while an impure
 * DIRECT member is refused. The output is right either way.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, name = 'f') =>
  new Function(`${tjs(src, { runTests: false }).code}\nreturn ${name}`)()

describe('dictionary default with a computed key', () => {
  it('no spurious member named after the key expression', () => {
    const f = load(
      `const k = 'a'\nfunction f(opts = { [k]: 1, b: 2 }) { return opts }`
    )
    expect(f()).toEqual({ a: 1, b: 2 })
  })

  it('an argument replaces the default, as in JavaScript', () => {
    const f = load(
      `const k = 'a'\nfunction f(opts = { [k]: 1, b: 2 }) { return opts }`
    )
    expect(f({ b: 5 })).toEqual({ b: 5 })
  })

  it('a literal computed key is a known member, and still merges', () => {
    const f = load(`function f(opts = { ['a']: 1, b: 2 }) { return opts }`)
    expect(f({ b: 5 })).toEqual({ a: 1, b: 5 })
  })

  it('an impure call inside an array member runs on every call (not a defect)', () => {
    const f = load(
      `let n = 0\nfunction tick() { n = n + 1\n return n }\nfunction f(opts = { at: [tick()] }) { return opts }`
    )
    expect([f(), f()]).toEqual([{ at: [1] }, { at: [2] }])
  })
})
