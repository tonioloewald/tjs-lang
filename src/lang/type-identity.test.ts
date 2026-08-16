/**
 * ONE question, asked of every mechanism that answers it: **does value `v` satisfy type
 * `T`?**
 *
 * TJS answers this in more than one place. The real runtime's `Type().check` uses
 * example-inference over tosijs-schema. The **inline stub** emitted into every standalone
 * `.js` file re-implements the same idea in ~400 bytes of `__match`. A bare `n: int`
 * parameter skips both and emits a direct predicate. `checkType` exists twice under one
 * name — a boolean over `TypeDescriptor` in `inference.ts`, and an error-returning string
 * matcher in `runtime.ts`.
 *
 * Several implementations of one question is not itself a bug. Them DISAGREEING is, and
 * this file measures the disagreement rather than assuming it away.
 *
 * ## Why it matters more than it looks
 *
 * `CLAUDE.md` records that emitted code declares its own `Type`/`Generic`/… and calls them
 * **bare**, so *the inline stub always wins* — even when a full runtime is installed. The
 * stub is therefore not a fallback. It is the shipped semantics of every emitted file, and
 * the real runtime's stricter answer is unreachable from emitted code.
 *
 * That inverts the intuition, and it cost an hour of this investigation: probing
 * `viaType(1.5)` with and without `globalThis.__tjs` gave the same answer both times, which
 * reads as agreement and is actually the stub answering twice.
 *
 * ## What the disagreements are
 *
 * All are one-directional — **the stub is more permissive** — from two causes:
 *
 *   1. **Numeric narrowing is lost inside a shape.** `__match` bottoms out at
 *      `typeof v === 'number'`, so an example of `1` accepts `1.5`. This contradicts the
 *      documented rule that `42` is an integer example (`CLAUDE-TJS-SYNTAX.md`), so the
 *      stub is wrong against the spec, not merely different from the real runtime.
 *
 *      FIXED for a top-level numeric example, by emitting the narrowing as a predicate
 *      instead of leaving two inference engines to agree about it. Still lost when the
 *      number is nested (`{ x: 1 }`, `[1]`), which needs a structural walk.
 *   2. **Shapes are open.** `__match` checks that the example's keys are present; the real
 *      runtime also rejects excess ones.
 *
 * A third kind surfaced later and is NOT a stub-vs-runtime disagreement at all: `+0` says
 * non-negative integer, but `+0 === 0`, so the narrowing is destroyed at the source→value
 * boundary and BOTH runtimes accepted `-1`. Fixed by the same mechanism. Those cases are
 * marked `sourceNarrowing`, because comparing against a `Type()` built from the value asks
 * the two arms different questions — there the value-constructed arm is the lossy one.
 *
 * Being more permissive means emitted code UNDER-validates. It never rejects something the
 * real runtime accepts, so `PRINCIPLES.md`'s subset invariant holds — this is a weaker
 * promise, not a broken program. That is why it is a ratchet and not a blocker.
 *
 * ## Why a ratchet
 *
 * Asserting parity today would leave the gate permanently red, and a permanently red gate
 * is one nobody reads (the same reasoning as `dogfood-tests.test.ts`). So the count may
 * only fall, and falling far enough demands the baseline be lowered so the fix cannot rot
 * back into available slack.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { Type as RealType } from './runtime'

/**
 * A declaration, and values to ask it about.
 *
 * Cases are written as SOURCE rather than as constructed descriptors on purpose: the thing
 * under test is what a user's `.tjs` file means, and a hand-built descriptor would skip the
 * emitter — which is where two of the four disagreements are introduced.
 */
const CASES: Array<{
  name: string
  example: string
  values: unknown[]
  /**
   * The example narrows by how it is WRITTEN, so a `Type()` built from the VALUE cannot
   * see it — `+0 === 0`. On these cases the value-constructed arm is the lossy one, and
   * emitted code being stricter is the fix working, not a violation.
   */
  sourceNarrowing?: true
  /**
   * An explicit `predicate(v) { … }` on the declaration.
   *
   * Every case here used to be `example:`-only, so the `predicate` ROUTE was never
   * compared against the real runtime at all — `KNOWN_DISAGREEMENTS` being empty read as
   * full parity while half the routing was unobserved. That is the same shape as an empty
   * skip list: nothing red, nothing checked.
   *
   * The real `Type()` takes the predicate as its second argument, so a case carrying this
   * exercises predicate-vs-predicate rather than infer-from-example on both sides.
   */
  predicate?: string
}> = [
  { name: 'Int', example: '1', values: [2, 1.5, -1, '2', true] },
  // A count is NON-NEGATIVE, so its example is `+0` — `1` only says "integer". This
  // corpus originally called the `1` case `Count`, and the misnomer hid the fact that
  // `+0` narrowing was not covered at all: it turned out to be lost in BOTH runtimes,
  // because `+0 === 0` erases the distinction before either one sees it.
  {
    name: 'Count',
    example: '+0',
    values: [2, 0, -1, 1.5, '2'],
    sourceNarrowing: true,
  },
  { name: 'Frac', example: '1.5', values: [2, 1.5, '1.5'] },
  { name: 'Name', example: "''", values: ['a', 1, null] },
  {
    name: 'Pt',
    example: '{ x: 1, y: 1 }',
    values: [{ x: 1, y: 1 }, { x: 1.5, y: 1 }, { x: 1 }, { x: 1, y: 1, z: 9 }],
  },
  { name: 'Nums', example: '[1]', values: [[1, 2], [1.5], [], ['a']] },
  { name: 'Flag', example: 'true', values: [true, false, 1, 'true'] },
  // Predicate-carrying cases — the route the corpus could not previously see.
  {
    name: 'Even',
    example: '2',
    predicate:
      "(v) => typeof v === 'number' && Number.isInteger(v) && v % 2 === 0",
    values: [4, 3, 2.5, -2, '2', true, null],
  },
  {
    name: 'Short',
    example: "'ab'",
    predicate: "(v) => typeof v === 'string' && v.length <= 3",
    values: ['a', 'abcd', '', 3, null],
  },
]

/**
 * Known disagreements, as `Type value` keys.
 *
 * Listed individually rather than counted so a FIXED one and a NEW one cannot cancel out —
 * a bare total would call that pair "no change" and hide both.
 */
const KNOWN_DISAGREEMENTS = new Set<string>([
  // EMPTY — the corpus agrees. Four cases lived here:
  //   `Int 1.5`               fixed by emitting the narrowing as a predicate
  //   `Pt {x:1.5,y:1}`        \
  //   `Nums [1.5]`             > fixed in `__match`: both are derivable from the example
  //   `Pt {x:1,y:1,z:9}`      /  VALUE, so the stub never needed source information
  //
  // Keep the mechanism. An empty list is the goal state, not a reason to delete the
  // harness — it is what makes the NEXT divergence fail on the commit that introduces it.
])

/** The `Type` an emitted standalone file actually runs — the inline stub. */
function inlineType(
  name: string,
  example: string,
  predicate?: string
): { check(v: unknown): unknown } {
  // The predicate is written in METHOD form, which is what the parser implements — the
  // `predicate: (v) => …` property form is rejected outright with a message saying so.
  const body = predicate
    ? `Type ${name} {\n  example: ${example}\n  predicate(v) { return (${predicate})(v) }\n}`
    : `Type ${name} { example: ${example} }`
  const { code } = tjs(`${body}\nfunction f(v: ${name}) { return 'ok' }`, {
    filename: 'type-identity.tjs',
  })
  return new Function(`${code}\nreturn ${name}`)() as {
    check(v: unknown): unknown
  }
}

describe('type identity: every mechanism answers the same question', () => {
  it('the predicate cases actually exercise the predicate', () => {
    // Both arms agreeing proves nothing if both arms IGNORE the predicate. `3` is an
    // integer, so inference from the example `2` accepts it; only the predicate rejects
    // it. If either side stopped honouring `predicate`, this fails while the agreement
    // assertions below stay green — which is exactly how the route went unobserved in
    // the first place.
    const withPredicate = CASES.filter((c) => c.predicate)
    expect(withPredicate.length).toBeGreaterThan(0)

    const even = inlineType(
      'Even',
      '2',
      "(v) => typeof v === 'number' && Number.isInteger(v) && v % 2 === 0"
    )
    expect(even.check(4)).toBe(true)
    expect(even.check(3)).toBe(false) // an integer — only the predicate rejects it

    const realEven = RealType(
      'Even',
      ((v: unknown) =>
        typeof v === 'number' && Number.isInteger(v) && v % 2 === 0) as never,
      2
    ) as unknown as { check(v: unknown): unknown }
    expect(realEven.check(4)).toBe(true)
    expect(realEven.check(3)).toBe(false)
  })

  it('the corpus is worth running', () => {
    // A corpus that emptied itself would make the agreement assertions vacuous — the
    // apparatus-fails-closed hazard this project has already been bitten by.
    expect(CASES.length).toBeGreaterThan(4)
    expect(CASES.flatMap((c) => c.values).length).toBeGreaterThan(15)
  })

  const found = new Set<string>()

  for (const c of CASES) {
    it(`inline stub and real runtime agree on ${c.name}`, () => {
      const inline = inlineType(c.name, c.example, c.predicate)
      const real = RealType(
        c.name,
        c.predicate
          ? (new Function(`return (${c.predicate})`)() as never)
          : (undefined as never),
        new Function(`return (${c.example})`)()
      ) as unknown as { check(v: unknown): unknown }

      for (const v of c.values) {
        const key = `${c.name} ${JSON.stringify(v)}`
        const agree = (inline.check(v) === true) === (real.check(v) === true)
        if (!agree) found.add(key)
        // On a `sourceNarrowing` case the two arms are not asked the same question — the
        // value-constructed one was handed `0` where the source said `+0` — so a
        // difference is expected and carries no information. The emitted side is checked
        // against the SPEC in the dedicated block below instead.
        if (c.sourceNarrowing) continue
        // A disagreement is only tolerated if it is one we already knew about; an
        // unlisted one fails here, naming the exact case.
        expect(agree || KNOWN_DISAGREEMENTS.has(key) ? 'ok' : key).toBe('ok')
      }
    })
  }

  it('every known disagreement still happens (none rot into the list)', () => {
    // The other direction. Without it a fixed case would sit in the list forever,
    // reserving slack that a future regression could quietly occupy — the same failure
    // mode as an expired audit exemption.
    const fixed = [...KNOWN_DISAGREEMENTS].filter((k) => !found.has(k))
    expect(
      fixed.length
        ? `fixed — delete from KNOWN_DISAGREEMENTS in this file: ${fixed.join(
            ', '
          )}`
        : 'ok'
    ).toBe('ok')
  })

  it('the stub is never STRICTER than the real runtime', () => {
    // Direction is the load-bearing part. Permissive means emitted code under-validates —
    // a weaker promise. Stricter would mean emitted code REJECTS a value the language
    // accepts, which is a subset violation (`PRINCIPLES.md`) and a broken program.
    for (const c of CASES) {
      // Skipped for the same reason as above: where the source narrows and the value
      // cannot, emitted code being stricter than a lossy `Type(value)` is the fix
      // working. The invariant still applies in full to every other case.
      if (c.sourceNarrowing) continue
      const inline = inlineType(c.name, c.example, c.predicate)
      const real = RealType(
        c.name,
        c.predicate
          ? (new Function(`return (${c.predicate})`)() as never)
          : (undefined as never),
        new Function(`return (${c.example})`)()
      ) as unknown as { check(v: unknown): unknown }
      for (const v of c.values) {
        if (real.check(v) === true) {
          expect(
            `${c.name} ${JSON.stringify(v)}: ${inline.check(v) === true}`
          ).toBe(`${c.name} ${JSON.stringify(v)}: true`)
        }
      }
    }
  })
})

describe('type identity: one name, two implementations', () => {
  it('`checkType` from tjs-lang/lang is the runtime one, and the other is unreachable', async () => {
    // `src/lang/index.ts` does `export * from './inference'` AND names `checkType` in an
    // explicit re-export from './runtime'. An explicit export wins, so `inference`'s
    // `checkType` — a different signature (boolean over TypeDescriptor, vs an
    // error-returning string matcher) — cannot be imported from the package at all.
    //
    // Asserted rather than fixed: removing either is a breaking change to a public
    // surface, and this test is what makes the collision impossible to forget when that
    // is decided. If the shadowing ever flips, the two signatures are not compatible and
    // every caller breaks silently at runtime rather than at the type level.
    const [pkg, runtime, inference] = await Promise.all([
      import('./index'),
      import('./runtime'),
      import('./inference'),
    ])
    expect(pkg.checkType).toBe(runtime.checkType)
    expect(pkg.checkType).not.toBe(inference.checkType)
  })
})

/**
 * `+N` is a SOURCE-level narrowing — a `UnaryExpression`, not a value. `+0` in JavaScript
 * *is* `0`, so passing the example through as a value destroys the non-negativity before
 * any runtime sees it, and both the real runtime and the inline stub then infer plain
 * integer from a bare `0`.
 *
 * The result was that the idiomatic way to declare a count accepted negative numbers, in
 * every runtime, while the same constraint as a parameter (`n: +0`) rejected them
 * correctly — because that path reads the source token.
 *
 * Found by asking why the type-identity corpus called something `Count` and gave it
 * `example: 1`.
 */
describe('Type blocks preserve source-level numeric narrowing', () => {
  const check = (src: string, v: unknown) => {
    const { code } = tjs(`${src}\nfunction f(x: N) { return 'ok' }`, {
      filename: 'n.tjs',
    })
    return (new Function(`${code}\nreturn N`)() as any).check(v) === true
  }

  it('`example: +0` rejects a negative, like `n: +0` does', () => {
    expect(check('Type N { example: +0 }', -1)).toBe(false)
    expect(check('Type N { example: +0 }', 2)).toBe(true)
    expect(check('Type N { example: +0 }', 0)).toBe(true)
  })

  it('`example: +0` still rejects a float and a non-number', () => {
    expect(check('Type N { example: +0 }', 1.5)).toBe(false)
    expect(check('Type N { example: +0 }', '2')).toBe(false)
  })

  it('a plain integer example is unaffected — it accepts negatives', () => {
    // The other direction: `1` means integer, NOT non-negative. Narrowing everything
    // would be its own bug, and a silent one.
    expect(check('Type N { example: 1 }', -1)).toBe(true)
    expect(check('Type N { example: 1 }', 1.5)).toBe(false)
  })

  it('a user predicate still governs', () => {
    // `+0` must refine, not replace: an explicit predicate is the more specific statement.
    expect(
      check('Type N { example: +0\n  predicate(x) { return x > 10 } }', 5)
    ).toBe(false)
    expect(
      check('Type N { example: +0\n  predicate(x) { return x > 10 } }', 20)
    ).toBe(true)
  })
})

/**
 * An array failure says what is actually wrong — in BOTH runtimes.
 *
 * `sum(['a','b'])` against `xs: [0]` reported *"Expected array … got object"*, which is
 * wrong twice: it IS an array, and `typeof []` is `'object'`. On `T[]`, a headline
 * feature, that is the least useful possible message.
 *
 * Fixed on both sides — the expected label names the element type, and the actual
 * reporter knows about arrays — and asserted in BOTH runtimes, because the first attempt
 * fixed only the shared one and left standalone emitted code still saying "got object".
 * That is the exact defect class the boxed-primitive consolidation was about, repeated
 * within the hour, which is why it is pinned here rather than trusted.
 */
describe('array type errors are accurate in both runtimes', () => {
  const emit = (src: string, name: string) =>
    tjs(src, { filename: 'ae.tjs', runTests: false }).code + `\nreturn ${name}`

  const SRC = 'function sum(xs: [0]): 0 { return xs.length }'

  const withRuntime = (body: string) => new Function(body)()
  const standalone = (body: string) => {
    const saved = (globalThis as any).__tjs
    delete (globalThis as any).__tjs
    try {
      return new Function(body)()
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  it('names the ELEMENT type, not just "array"', () => {
    const msg = String(withRuntime(emit(SRC, 'sum'))(['a', 'b']))
    expect(msg).toContain('array of integer')
  })

  for (const [label, run] of [
    ['shared runtime', withRuntime],
    ['standalone (inline stub)', standalone],
  ] as const) {
    it(`${label}: a wrong ELEMENT reports "got array", not "got object"`, () => {
      const msg = String(run(emit(SRC, 'sum'))(['a', 'b']))
      expect(msg).toContain('got array')
      expect(msg).not.toContain('got object')
    })

    it(`${label}: a NON-array still reports what it really got`, () => {
      // The control — reporting "array" unconditionally would satisfy the test above.
      expect(String(run(emit(SRC, 'sum'))(42))).toContain('got number')
    })
  }

  it('nests', () => {
    const msg = String(
      withRuntime(emit("function g(m: [['']]): 0 { return 0 }", 'g'))([[1]])
    )
    expect(msg).toContain('array of array of string')
  })
})
