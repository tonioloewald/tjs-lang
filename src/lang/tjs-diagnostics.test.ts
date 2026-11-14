/**
 * TJS diagnostics from the books swarm (#4121): right behaviour, wrong or unhelpful words.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const refused = (src: string): string => {
  try {
    tjs(src, { runTests: false })
  } catch (e: any) {
    return String(e.message)
  }
  throw new Error('expected a transpile error')
}

describe('TJS diagnostics (#4121)', () => {
  it('(1) infix Is offers the whole-expression reading first', () => {
    expect(refused('function f(a: 0, b: 0) { return a + 1 Is b }')).toMatch(
      /Is\(a \+ 1, b\) or Is\(1, b\)/
    )
  })
  it('(2) the ASI warning does not suggest a leading ; for a continuation', () => {
    const w = tjs(
      'function f(a: 0) {\n  const x = a\n  (a + 1).toString()\n  return x\n}',
      {
        runTests: false,
      }
    ).warnings.join('\n')
    expect(w).toMatch(/join the two lines/)
    expect(w).not.toMatch(/start this line with/)
  })
  it('(3) a prototype key says why, with or without a shared runtime', () => {
    for (const shared of [false, true]) {
      const g = globalThis as any
      const saved = g.__tjs
      if (shared) g.__tjs = createRuntime()
      else delete g.__tjs
      try {
        const f = new Function(
          tjs('function f(o = { a: 1 }) { return o }').code + '\nreturn f'
        )()
        expect(f(JSON.parse('{"__proto__": 1}')).message).toMatch(
          /'__proto__' is refused as a key: it would change the object's prototype/
        )
      } finally {
        g.__tjs = saved
      }
    }
  })
  it('(4) a wasm function names the callee and is not told to drop a wrapper', () => {
    const m = refused('wasm function g(x: f64): f64 { return h(x) }')
    expect(m).toMatch(/'h' cannot be called from WASM/)
    expect(m).toMatch(/plain `function`/)
    expect(m).not.toMatch(/drop the `wasm \{ \}` wrapper/)
  })
  it('(4) a stray ; in a wasm body compiles', () => {
    expect(() =>
      tjs('wasm function g(x: f64): f64 { ; return x }', { runTests: false })
    ).not.toThrow()
  })
  it('an inline wasm block keeps the drop-the-wrapper remedy (the other direction)', () => {
    expect(
      refused('function f(x: 0.0) { return wasm { return h(x) } }')
    ).toMatch(/drop the `wasm \{ \}` wrapper/)
  })
})
