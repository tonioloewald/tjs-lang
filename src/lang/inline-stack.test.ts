/**
 * The inline call-stack ring and the real one agree, and neither grows without bound.
 *
 * The emitted stub was `const __stack = []` with a plain `push`, and the matching
 * `popStack()` is emitted AFTER the `return`, so it never runs. Every call appended one
 * entry forever — **201,000 calls left 201,000 entries** — in a standalone emitted file,
 * which is the shipping configuration: emitted code calls these bare, so the inline stub
 * always wins (`docs/type-identity.md`). An unbounded leak in any long-running program,
 * growing with call count and never released.
 *
 * What makes it worth a test rather than a one-line fix is where the mistake lived. Two
 * lines above the stub, the emitter's own comments say:
 *
 *     "pushStack is a no-op unless callStacks/debug is enabled at runtime"
 *     "No try/finally needed — the ring buffer tolerates missed popStack"
 *
 * Both are true of `lang/runtime.ts`. Neither was true of the stub the emitted code
 * actually calls: the real one is gated off by default AND bounded to 64; this one was
 * neither. The comment described the runtime that does not run — the exact trap CLAUDE.md
 * names ("The inline runtime is NOT the real runtime"), reached by writing an accurate
 * comment about the wrong implementation.
 *
 * So this file compares the two against the same call sequence rather than asserting the
 * stub looks right on its own. A shared constant they are both *supposed* to derive from
 * is what the previous divergences also had.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { tjs } from './index'
import {
  configure,
  getStack as realGetStack,
  pushStack as realPushStack,
  popStack as realPopStack,
} from './runtime'

/** The stub as it ships: compiled from a standalone emitted file, no global runtime. */
function inlineStack() {
  const code = tjs(`function greet(name: '') { return 'hi ' + name }`, {
    filename: 's.tjs',
    runTests: false,
  }).code
  const saved = (globalThis as any).__tjs
  delete (globalThis as any).__tjs
  try {
    return new Function(
      `${code}\nreturn { greet, pushStack, popStack, getStack }`
    )() as {
      greet: (n: string) => unknown
      pushStack: (n: string) => void
      popStack: () => void
      getStack: () => string[]
    }
  } finally {
    if (saved) (globalThis as any).__tjs = saved
  }
}

afterEach(() => {
  configure({ callStacks: false })
})

describe('the emitted ring is bounded', () => {
  it('does not grow with call count', () => {
    const s = inlineStack()
    s.greet('x')
    const afterOne = s.getStack().length
    for (let i = 0; i < 5000; i++) s.greet('x')
    expect(s.getStack().length).toBeLessThanOrEqual(64)
    // Not vacuous: it must actually be recording something.
    expect(afterOne).toBeGreaterThan(0)
  })

  it('keeps the MOST RECENT entries, in call order', () => {
    // A ring that dropped the newest instead of the oldest would also be "bounded" and
    // would make a call stack useless — it is the recent frames you need.
    const s = inlineStack()
    for (let i = 0; i < 100; i++) s.pushStack(`f${i}`)
    const got = s.getStack()
    expect(got.length).toBe(64)
    expect(got[0]).toBe('f36')
    expect(got[63]).toBe('f99')
  })
})

describe('the two implementations agree', () => {
  /** Drive both with the same sequence and compare. */
  function bothAfter(
    ops: (api: { pushStack: (n: string) => void; popStack: () => void }) => void
  ): { inline: string[]; real: string[] } {
    const s = inlineStack()
    ops(s)
    // The real one is gated off by default; enable it, or it records nothing and the
    // comparison passes for the wrong reason.
    configure({ callStacks: true })
    while (realGetStack().length) realPopStack()
    ops({ pushStack: realPushStack, popStack: realPopStack })
    return { inline: s.getStack(), real: realGetStack() }
  }

  it('on a short sequence', () => {
    const { inline, real } = bothAfter((a) => {
      a.pushStack('a')
      a.pushStack('b')
      a.pushStack('c')
    })
    expect(inline).toEqual(real)
    expect(inline).toEqual(['a', 'b', 'c'])
  })

  it('with pops interleaved', () => {
    const { inline, real } = bothAfter((a) => {
      a.pushStack('a')
      a.pushStack('b')
      a.popStack()
      a.pushStack('c')
    })
    expect(inline).toEqual(real)
    expect(inline).toEqual(['a', 'c'])
  })

  it('past the ring boundary', () => {
    const { inline, real } = bothAfter((a) => {
      for (let i = 0; i < 200; i++) a.pushStack(`f${i}`)
    })
    expect(inline).toEqual(real)
  })

  it('popping an empty stack does not go negative', () => {
    const { inline, real } = bothAfter((a) => {
      a.popStack()
      a.popStack()
      a.pushStack('a')
    })
    expect(inline).toEqual(real)
    expect(inline).toEqual(['a'])
  })

  it('an empty name is ignored by both', () => {
    // The real one guards on `name`; the stub must too, or a missing source annotation
    // becomes a phantom frame in one implementation only.
    const { inline, real } = bothAfter((a) => {
      a.pushStack('')
      a.pushStack('a')
    })
    expect(inline).toEqual(real)
    expect(inline).toEqual(['a'])
  })
})
