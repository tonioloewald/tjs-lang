/**
 * A misspelt reference in a Type example is reported, at transpile time and on the module's own
 * flight recorder (#4115).
 *
 * `Type V { example: { w: Widgit } }` passed `tjs check` and `V.check({ w: 'anything' })` was
 * true. The one signal was a runtime warning recorded on `globalThis.__tjs`, while the module's
 * own `__tjs.records()` (a separate instance) had nothing.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const g = globalThis as any
const warned = (src: string) =>
  (tjs(src).warnings ?? []).filter((w) => /A Type example names/.test(w))

describe('a Type example naming something undeclared', () => {
  it('is a transpile-time warning naming it', () => {
    const w = warned('Type V { example: { w: Widgit } }')
    expect(w).toHaveLength(1)
    expect(w[0]).toMatch(/'Widgit'/)
  })

  it('a member chain is reported by its full path', () => {
    expect(warned('Type V { example: { w: shapes.Cell } }')[0]).toMatch(
      /'shapes\.Cell'/
    )
  })

  it("the runtime warning reaches the module's own records()", () => {
    const prev = g.__tjs
    g.__tjs = createRuntime()
    try {
      const [V, mod] = new Function(
        tjs('Type V { example: { w: Widgit } }').code + '\nreturn [V, __tjs]'
      )()
      expect(V.check({ w: 'anything' })).toBe(true) // unchecked, as warned
      const mine = mod
        .records({ source: 'type' })
        .filter((r: any) => /Widgit/.test(r.message))
      expect(mine).toHaveLength(1)
      // and still mirrored to the global recorder
      expect(
        g.__tjs
          .records({ source: 'type' })
          .some((r: any) => /Widgit/.test(r.message))
      ).toBe(true)
    } finally {
      g.__tjs = prev
    }
  })
})

describe('what is not reported (the other direction)', () => {
  it('a name declared later in the file, or imported, or a global', () => {
    expect(
      warned(`Type V { example: { w: Wid, d: Date, m: Lib } }
const Wid = 0
import { Lib } from './lib.js'`)
    ).toEqual([])
  })
  it('a Type declared in the file', () => {
    expect(
      warned('Type A { example: { n: 0 } }\nType B { example: { a: A } }')
    ).toEqual([])
  })
})
