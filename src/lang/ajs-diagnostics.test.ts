/**
 * AJS diagnostics from the books swarm (#4107): the behaviour was right, the message wrong,
 * missing, or late. Each row pins what the author now reads, and where (transpile time).
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './index'

const refused = (src: string): string => {
  try {
    transpile(src)
  } catch (e: any) {
    return String(e.message)
  }
  throw new Error('expected a transpile error')
}
const warned = (src: string): string =>
  (transpile(src).warnings ?? []).map((w: any) => w.message ?? w).join('\n')

describe('AJS diagnostics (#4107)', () => {
  it('(1) await, in a plain or an async function', () => {
    for (const fn of ['function', 'async function'])
      expect(
        refused(
          `${fn} f() { const x = await httpFetch({ url: 'u' }); return { x } }`
        )
      ).toMatch(/AJS has no `await`[\s\S]*httpFetch\(\{ url \}\)/)
  })
  it('(2) break and continue name a remedy', () => {
    expect(
      refused('function f() { while (true) { break } return {} }')
    ).toMatch(/AJS has no `break`[\s\S]*while \(!done/)
    expect(
      refused(
        'function f() { let i = 0; while (i < 3) { i++; continue } return {} }'
      )
    ).toMatch(/AJS has no `continue`[\s\S]*if \(!skip\)/)
  })
  it('(3)(4) for...in and do...while remedies', () => {
    expect(
      refused('function f(o: {}) { for (const k in o) { } return {} }')
    ).toMatch(/for \(const k of Object\.keys\(data\)\)/)
    expect(
      refused(
        'function f() { let i = 0; do { i++ } while (i < 3); return { i } }'
      )
    ).toMatch(/let again = true/)
  })
  it('(5) a callback passed by name', () => {
    expect(
      refused("function f(xs: ['']) { return { n: xs.map(parseInt) } }")
    ).toMatch(/written in place[\s\S]*xs\.map\(\(x\) => parseInt\(x\)\)/)
  })
  it('(6) an unavailable method is refused in any position', () => {
    for (const src of [
      "function f(s: '') { let m = s.matchAll(/a/g); return { m } }",
      "function f(s: '') { return { m: s.matchAll(/a/g) } }",
    ])
      expect(refused(src)).toMatch(/Method 'matchAll' is not available/)
  })
  it('(7) array methods on a Set', () => {
    expect(
      refused('function f() { const s = Set([1]); s.push(2); return {} }')
    ).toMatch(/'s' is a Set, which has 'add'/)
    expect(
      refused(
        'function f() { const s = Set([1]); return { h: s.includes(1) } }'
      )
    ).toMatch(/which has 'has'/)
  })
  it('(8) an atom given its inputs in a variable', () => {
    expect(
      refused(
        "function f(opts: { key: '', value: '' }) { storeSet(opts); return {} }"
      )
    ).toMatch(/storeSet\(\{ key: opts\.key, value: opts\.value \}\)/)
  })
  it('(11) the entry called as a helper is warned about', () => {
    expect(
      warned(
        'function main(x: 0) { return { y: helper(x) } }\nfunction helper(n: 0) { return n * 2 }'
      )
    ).toMatch(/'helper' is the entry[\s\S]*move it to the end/)
  })
  it('(12) a discarded Object.assign is warned about', () => {
    expect(
      warned('function f(o: {}) { Object.assign(o, { a: 1 }); return { o } }')
    ).toMatch(/o = Object\.assign\(o, …\)/)
  })
  it('(13) assigning a const is refused at transpile time', () => {
    expect(
      refused('function f() { const a = 1; a = 2; return { a } }')
    ).toMatch(/'a' is a const/)
  })
  it('(14) Schema.isValid with the schema first', () => {
    expect(
      refused(
        'function f() { const sc = Schema.object({ n: Schema.number }); return { v: Schema.isValid(sc, { n: 5 }) } }'
      )
    ).toMatch(/value first and the schema second/)
  })
})

describe('what still compiles (the other direction)', () => {
  for (const src of [
    'function f() { const a = 1; if (true) { let a = 2; a = 3 } return { a } }',
    'function f(xs: [0]) { const n = xs.map((x) => x * 2); return { n } }',
    "function f(s: '') { return { u: s.toUpperCase(), m: Math.max(1, 2) } }",
    'function f() { const sc = Schema.object({ n: Schema.number }); return { v: Schema.isValid({ n: 5 }, sc) } }',
    'function f() { const s = Set([1]); s.add(2); return { h: s.has(2) } }',
    'function f(xs: [0]) { xs.push(1); return { h: xs.includes(1) } }',
    'function helper(n: 0) { return n * 2 }\nfunction main(x: 0) { const y = helper(x); return { y } }',
  ])
    it(src.slice(0, 60), () => {
      expect(() => transpile(src)).not.toThrow()
      expect(warned(src)).not.toMatch(/is the entry/)
    })
})
