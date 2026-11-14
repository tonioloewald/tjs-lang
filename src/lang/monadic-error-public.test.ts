/**
 * `MonadicError` is a public name in a .tjs file (Tonio, 2026-11-14).
 *
 * It was reachable only beside a checked function, and only with `new`: `MonadicError('boom')`
 * threw "Cannot call a class constructor without new", backwards from every other TJS class. The
 * name a file sees is now callable either way (a Proxy over the shared class, which stays fused
 * across modules by shape), it exists wherever it is written, and a user-made one propagates
 * through a checked function as the runtime's own do.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const run = (src: string, names: string) => {
  const saved = (globalThis as any).__tjs
  delete (globalThis as any).__tjs // standalone: the inline runtime alone
  try {
    return new Function(tjs(src).code + `\nreturn [${names}]`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

describe('MonadicError in a .tjs file', () => {
  it('is callable without new, and with new', () => {
    const [a, b, okA, okB] = run(
      `const a = MonadicError('boom')\nconst b = new MonadicError('bang')\nconst okA = isMonadicError(a) && a instanceof MonadicError\nconst okB = isMonadicError(b)`,
      'a, b, okA, okB'
    )
    expect(a.message).toBe('boom')
    expect(b.message).toBe('bang')
    expect(okA && okB).toBe(true)
    expect(a instanceof Error).toBe(true)
  })

  it('exists in a file with no checked function', () => {
    const [e] = run(`const e = MonadicError('x')`, 'e')
    expect(e.message).toBe('x')
  })

  it('a user-made one propagates through a checked function unchanged', () => {
    const [own, through] = run(
      `function ageIn(year: 2026, born: 1990): 36 { if (born > year) { return MonadicError('late') }\n return year - born }
function describe(age: 36): '36 years' { return age + ' years' }
const own = ageIn(2026, 2030)
const through = describe(own)`,
      'own, through'
    )
    expect(through).toBe(own)
  })
})
