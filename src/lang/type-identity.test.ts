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
 *   1. **Numeric narrowing is lost.** `__match` bottoms out at `typeof v === 'number'`, so
 *      an example of `1` accepts `1.5`. The real runtime infers integer from `1` and
 *      rejects. This contradicts the documented rule that `42` is an integer example
 *      (`CLAUDE-TJS-SYNTAX.md`), so the stub is wrong against the spec, not merely
 *      different.
 *   2. **Shapes are open.** `__match` checks that the example's keys are present; the real
 *      runtime also rejects excess ones.
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
const CASES: Array<{ name: string; example: string; values: unknown[] }> = [
  { name: 'Count', example: '1', values: [2, 1.5, -1, '2', true] },
  { name: 'Frac', example: '1.5', values: [2, 1.5, '1.5'] },
  { name: 'Name', example: "''", values: ['a', 1, null] },
  {
    name: 'Pt',
    example: '{ x: 1, y: 1 }',
    values: [{ x: 1, y: 1 }, { x: 1.5, y: 1 }, { x: 1 }, { x: 1, y: 1, z: 9 }],
  },
  { name: 'Nums', example: '[1]', values: [[1, 2], [1.5], [], ['a']] },
  { name: 'Flag', example: 'true', values: [true, false, 1, 'true'] },
]

/**
 * Known disagreements, as `Type value` keys.
 *
 * Listed individually rather than counted so a FIXED one and a NEW one cannot cancel out —
 * a bare total would call that pair "no change" and hide both.
 */
const KNOWN_DISAGREEMENTS = new Set([
  'Count 1.5', // numeric narrowing lost
  'Pt {"x":1.5,"y":1}', // …through a shape
  'Nums [1.5]', // …through an array
  'Pt {"x":1,"y":1,"z":9}', // excess key accepted
])

/** The `Type` an emitted standalone file actually runs — the inline stub. */
function inlineType(
  name: string,
  example: string
): { check(v: unknown): unknown } {
  const { code } = tjs(
    `Type ${name} { example: ${example} }\nfunction f(v: ${name}) { return 'ok' }`,
    { filename: 'type-identity.tjs' }
  )
  return new Function(`${code}\nreturn ${name}`)() as {
    check(v: unknown): unknown
  }
}

describe('type identity: every mechanism answers the same question', () => {
  it('the corpus is worth running', () => {
    // A corpus that emptied itself would make the agreement assertions vacuous — the
    // apparatus-fails-closed hazard this project has already been bitten by.
    expect(CASES.length).toBeGreaterThan(4)
    expect(CASES.flatMap((c) => c.values).length).toBeGreaterThan(15)
  })

  const found = new Set<string>()

  for (const c of CASES) {
    it(`inline stub and real runtime agree on ${c.name}`, () => {
      const inline = inlineType(c.name, c.example)
      const real = RealType(
        c.name,
        undefined as never,
        new Function(`return (${c.example})`)()
      ) as unknown as { check(v: unknown): unknown }

      for (const v of c.values) {
        const key = `${c.name} ${JSON.stringify(v)}`
        const agree = (inline.check(v) === true) === (real.check(v) === true)
        if (!agree) found.add(key)
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
      const inline = inlineType(c.name, c.example)
      const real = RealType(
        c.name,
        undefined as never,
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
