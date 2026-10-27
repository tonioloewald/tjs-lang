/**
 * TJS sees through REAL tosijs proxies, not only the stand-in (#3410).
 *
 * `tosi-proxy-params.test.ts` uses a hand-made Proxy carrying `Symbol.for('xin-value')`,
 * because tosijs needs a DOM to load. That pins our side and nothing of theirs: tosijs does
 * not export the key (tosijs#51), so a rename upstream would leave the stand-in green while
 * every real model failed. happy-dom provides the DOM, registered for THIS file only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { tjs } from './index'

let tosi: any
beforeAll(async () => {
  GlobalRegistrator.register()
  ;({ tosi } = await import('tosijs'))
})
afterAll(async () => {
  await GlobalRegistrator.unregister()
})

const load = (src: string, name: string) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined // the standalone inline runtime, as a page gets
  try {
    return new Function(
      `${tjs(src, { runTests: false }).code}\nreturn ${name}`
    )()
  } finally {
    g.__tjs = prev
  }
}

describe('real tosijs proxies', () => {
  it('carry their value under the key TJS reads', () => {
    const { m } = tosi({ m: { x: 3, o: { k: 'a' } } })
    expect(m.x[Symbol.for('xin-value')]).toBe(3)
    expect(m.o.k[Symbol.for('xin-value')]).toBe('a')
  })

  it('pass typed parameter checks, and the body gets the proxy', () => {
    const { calc } = tosi({ calc: { x: 4, op: '+' } })
    const double = load('function double(n: 0) { return n * 2 }', 'double')
    expect(double(calc.x)).toBe(8)
    const press = load(
      "function press(c: { x: 0, op: '' }) { c.x = c.x * 10\n return c }",
      'press'
    )
    expect(press(calc)).toBe(calc)
    expect(calc.x.valueOf()).toBe(40)
  })

  it('== and truthiness compare the value, not the proxy', () => {
    const { calc } = tosi({ calc: { op: '', x: 0 } })
    const f = load(
      "function f(c: { op: '', x: 0 }) { return [c.op == '', c.op ? 'set' : 'empty'] }",
      'f'
    )
    expect(f(calc)).toEqual([true, 'empty'])
  })

  it('a wrong value is still refused', () => {
    const { calc } = tosi({ calc: { x: 'not a number' } })
    const double = load('function double(n: 0) { return n * 2 }', 'double')
    expect(double(calc.x) instanceof Error).toBe(true)
  })
})
