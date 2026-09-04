/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  configure,
  createRuntime,
  getStack as realGetStack,
  pushStack as realPushStack,
  popStack as realPopStack,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 38 */
function inlineStack() {
  const code = tjs(`function greet(name: '') { return 'hi ' + name }`, {
    filename: 's.tjs',
    runTests: false,
  }).code
  const saved = globalThis.__tjs
  delete globalThis.__tjs
  try {
    return new Function(
      `${code}\nreturn { greet, pushStack, popStack, getStack }`
    )()
  } finally {
    if (saved) globalThis.__tjs = saved
  }
}
inlineStack.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:38',
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

    expect(afterOne).toBeGreaterThan(0)
  })
  it('keeps the MOST RECENT entries, in call order', () => {
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
  function bothAfter(ops) {
    const s = inlineStack()
    ops(s)

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
    const { inline, real } = bothAfter((a) => {
      a.pushStack('')
      a.pushStack('a')
    })
    expect(inline).toEqual(real)
    expect(inline).toEqual(['a'])
  })
})

describe('array diagnostics agree across both runtimes', () => {
  const message = (src, call, useGlobal) => {
    const saved = globalThis.__tjs
    if (useGlobal) globalThis.__tjs = createRuntime()
    else delete globalThis.__tjs
    try {
      const fn = new Function(
        `${tjs(src, { filename: 'a.tjs', runTests: false }).code}\nreturn f`
      )()
      return String(fn(eval(call)))
    } finally {
      globalThis.__tjs = saved
    }
  }
  const CASES = [
    ['mixed', `[1, 'bad', 3]`],
    ['all wrong', `['a', 'b']`],
    ['empty', `[]`],
    ['nested', `[[1], 2]`],
    ['nulls', `[null, 1]`],
    ['not an array at all', `{ a: 1 }`],
  ]
  const SRC = `function f(xs: [0]) { return xs }`
  for (const [label, call] of CASES) {
    it(`${label}`, () => {
      const shared = message(SRC, call, true)
      const inline = message(SRC, call, false)
      expect(inline).toBe(shared)
    })
  }
  it('names the element types rather than just "array"', () => {
    expect(message(SRC, `[1, 'bad', 3]`, true)).toContain(
      'array of number | string'
    )
  })
  it('a long array does not build a long message', () => {
    const many = `[${Array.from({ length: 500 }, (_, i) =>
      i % 2 ? `'s'` : 'true'
    ).join(',')}]`
    expect(message(SRC, many, true).length).toBeLessThan(140)
  })
})
