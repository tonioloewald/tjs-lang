/**
 * `Eval`/`SafeFunction` return the value the source says, or they refuse. Never a plausible
 * substitute.
 *
 * GUARDRAIL, and a regression pin for two defects that shipped in 0.13.11 (#52). Both
 * returned a value of the RIGHT SHAPE with no error and no warning, so every structural check
 * downstream passed and nothing could tell the result was wrong. They were found only by
 * comparing against a known-good implementation.
 *
 *   return { ...d, c: 3 }   ->  { c: 3 }     every spread field silently dropped
 *   return [...a]           ->  [null]       the hole reads as a value; .length is 1
 *   return data.a           ->  "data.a"     the source text, returned as data
 *
 * Neither was a runtime bug. The AST emitter built an AST that did not represent the source:
 * `SpreadElement` matched no branch in the object/array literal handlers, and non-computed
 * member access in VALUE position emitted a dot-path string where the computed branch twelve
 * lines above already emitted a proper node.
 *
 * The shape of the failures is the reason this file exists rather than a few added cases: an
 * emitter that drops a construct silently is indistinguishable from one that compiles it, and
 * the only difference visible from outside is the value. So assert VALUES, and assert that
 * unsupported constructs REFUSE.
 */
import { describe, it, expect } from 'bun:test'
import { Eval, SafeFunction } from './eval'

const run = async (code: string, context?: Record<string, unknown>) =>
  (await Eval({
    code,
    ...(context ? { context } : {}),
  } as any)) as any

describe('spread compiles to the value it means (#52 A)', () => {
  // It used to match no branch in the literal handlers and be silently DROPPED, so the
  // object was built from whatever else was recognised. `DOCS-AJS.md` documents spread under
  // "What's Allowed", so the doc was not wrong — the emitter was.
  const CASES: Array<[string, string, unknown]> = [
    ['object spread alone', 'const d = { a: 1 }\nreturn { ...d }', { a: 1 }],
    [
      'object spread with a literal key',
      'const d = { a: 1 }\nreturn { ...d, c: 3 }',
      { a: 1, c: 3 },
    ],
    ['array spread', 'const a = [1, 2]\nreturn [...a]', [1, 2]],
    [
      'spread into a const, keys survive',
      'const d = { a: 1, b: 2 }\nconst s = { ...d }\nreturn Object.keys(s)',
      ['a', 'b'],
    ],
    // ORDER IS THE SEMANTICS. Desugaring to `Object.assign` only works if source order is
    // preserved, and these two differ solely in that.
    [
      'later spread overrides an earlier key',
      'const d = { a: 9 }\nreturn { a: 1, ...d }',
      { a: 9 },
    ],
    [
      'later key overrides an earlier spread',
      'const d = { a: 9 }\nreturn { ...d, a: 1 }',
      { a: 1 },
    ],
    [
      'two spreads merge left to right',
      'const a = { x: 1 }\nconst b = { x: 2, y: 3 }\nreturn { ...a, ...b }',
      { x: 2, y: 3 },
    ],
    [
      'array spread among literals',
      'const a = [2, 3]\nreturn [1, ...a, 4]',
      [1, 2, 3, 4],
    ],
  ]

  for (const [label, code, expected] of CASES) {
    it(label, async () => {
      const r = await run(code)
      expect({ [label]: r.result }).toEqual({ [label]: expected })
    })
  }

  it('the spread SOURCE is not mutated', async () => {
    // `Object.assign` mutates its first argument, so the desugaring must supply a fresh
    // receiver rather than reusing the spread operand.
    const r = await run(
      'const d = { a: 1 }\nconst s = { ...d, c: 3 }\nreturn Object.keys(d)'
    )
    expect(r.result).toEqual(['a'])
  })

  it('SafeFunction gets it too — same emitter', async () => {
    // SafeFunction is async — it returns a Promise of the callable.
    const fn = (await SafeFunction({
      params: ['data'],
      body: 'return { ...data, x: 1 }',
    } as any)) as any
    // The callable resolves to `{ result, fuelUsed }`, not the bare value.
    expect((await fn({ a: 1 })).result).toEqual({ a: 1, x: 1 })
  })
})

describe('a value read is the value, not its source text (#52 B)', () => {
  const DOC = { a: 1, title: 'Report', inner: { z: 1 } }

  const CASES: Array<[string, string, unknown]> = [
    ['plain dotted read', 'return data.a', 1],
    ['dotted read of a string', 'return data.title', 'Report'],
    ['dotted read of an object', 'return data.inner', { z: 1 }],
    ['nested dotted read', 'return data.inner.z', 1],
    // These three were already correct, and are the control: they prove the VALUE was always
    // right and only the return path substituted it.
    ['typeof (was correct)', 'return typeof data.a', 'number'],
    ['arithmetic (was correct)', 'return data.a * 2', 2],
    ['bracket access (was correct)', 'return data["a"]', 1],
  ]

  for (const [label, code, expected] of CASES) {
    it(label, async () => {
      const r = await run(code, { data: DOC })
      expect({ [label]: r.result }).toEqual({ [label]: expected })
    })
  }

  it('a string literal that merely contains a dot is still a literal', async () => {
    // The ambiguity that made the bug possible: `resolveValue` cannot distinguish a failed
    // path lookup from a string literal with a dot in it. Emitting a proper node removes the
    // ambiguity for compiled code; this pins that literals did not become collateral damage.
    const r = await run(`return "not.a.path"`)
    expect(r.result).toBe('not.a.path')
  })
})
