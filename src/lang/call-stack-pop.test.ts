/**
 * A returned call leaves no frame on the call stack (2026-11-14, #4118 / #3994 A5.3).
 *
 * The emitter put `popStack()` after the function's `return`, where it never ran, so the
 * `callStacks` ring listed frames that had already returned and an error's callStack mixed live
 * calls with finished ones. The frame is now pushed first and popped in a `finally` around the
 * checks and the body: every exit pops (a return, a refused argument, a throw), and a failing
 * check still has its own frame on the stack. Read from the module's own inline runtime, which
 * is what emitted code uses.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, names: string) => {
  const saved = (globalThis as any).__tjs
  delete (globalThis as any).__tjs
  try {
    return new Function(tjs(src).code + `\nreturn [${names}, __tjs_rt]`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

const SRC = `
function inner(n: 0):! 0 { return n }
function outer(n: 0):! 0.0 { return inner(n + 0.5) }
const arrow = (x: 0):! 0 => inner(x)
class K { m(x: 0) { return inner(x) } }
function thrower(n: 0) { throw new Error('boom') }
`

describe('the call stack after calls return', () => {
  it('is empty after ordinary calls, an arrow and a method', () => {
    const [inner, , arrow, K, , rt] = load(
      SRC,
      'inner, outer, arrow, K, thrower'
    )
    inner(1)
    arrow(2)
    K().m(3)
    expect(rt.getStack()).toEqual([])
  })
  it('is empty after a refused argument and after a throw', () => {
    const [inner, outer, , , thrower, rt] = load(
      SRC,
      'inner, outer, arrow, K, thrower'
    )
    inner('x') // refused at the check
    outer(1) // refused one level down
    try {
      thrower(1)
    } catch {
      // the throw is the point: the frame must still be popped
    }
    expect(rt.getStack()).toEqual([])
  })
  it('a preamble declaration is still visible to the body', () => {
    const [opts] = load(
      `function opts(o = { a: 1, b: 2 }) { return o }`,
      'opts'
    )
    expect(opts({ a: 5 })).toEqual({ a: 5, b: 2 })
  })
})
