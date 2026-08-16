/**
 * A literal union is a closed SET of values, and membership is the language's `==`.
 *
 * ## Why this is a special case at all
 *
 * Everywhere else in TJS a colon value is an EXAMPLE, so `'a'` means "a string". Applied
 * compositionally, `'a' | 'b'` would be `string | string` — collapsing to `string`, which
 * is exactly what `''` already means. So under the example rule the form carries NO
 * information, and it is only ever written by someone who meant something else. A
 * construct that is vacuous under our reading and obvious under the reader's should be
 * read the way they meant it.
 *
 * That is the one place the examples model bends, and it bends toward TypeScript, which is
 * also where the on-ramp wants it.
 *
 * ## Pragmatic, not formal
 *
 * Membership is `==`, not `===`, and that decides the two questions that follow from it:
 *
 *   - `new String('yes')` satisfies `'yes' | 'no'`, because `==` unwraps boxed primitives.
 *   - `+0 | +1` is IDENTICAL to `0 | 1`, because source-level numeric narrowing does not
 *     survive into a value — `+0` and `0` are one value (`equality-invariants.test.ts`).
 *
 * Consequently a `Set` alone is the wrong membership test: `Set.has` is SameValueZero and
 * would reject both `new String('yes')` and `undefined`-against-a-`null`-member. Members
 * are canonicalised at inference time and the probe is canonicalised the same way, so the
 * O(1) path and the language's `==` cannot disagree.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const fn = (src: string, name = 'f'): any =>
  new Function(
    `${tjs(src, { filename: 'lu.tjs', runTests: false }).code}\nreturn ${name}`
  )()

const rejected = (v: unknown) => String(v).startsWith('MonadicError')

describe('a literal union narrows to its members', () => {
  it('accepts a member and rejects a non-member', () => {
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(f('yes')).toBe('yes')
    expect(f('no')).toBe('no')
    expect(rejected(f('maybe'))).toBe(true)
  })

  it('used to collapse to `string` — the regression this guards', () => {
    // Before this existed, both members widened and the union meant nothing at all.
    const f = fn(`function f(x: 'a' | 'b') { return x }`)
    expect(rejected(f('c'))).toBe(true)
  })

  it('works with three or more members, and with numbers', () => {
    const f = fn(`function f(x: 1 | 2 | 3) { return x }`)
    expect(f(2)).toBe(2)
    expect(rejected(f(4))).toBe(true)
    expect(rejected(f('2'))).toBe(true)
  })

  it('names the members in the error, not the mechanism', () => {
    // "Expected literal-union" would name the implementation; the members ARE the fix.
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(String(f('maybe'))).toContain('"yes" | "no"')
  })
})

describe('membership is `==`, with the consequences that implies', () => {
  it('a boxed primitive is a member', () => {
    // The decision: pragmatic, not formal. `==` unwraps, so this must too — otherwise the
    // same comparison means two different things depending on where it is asked.
    const f = fn(`function f(x: 'yes' | 'no') { return x }`)
    expect(rejected(f(new String('yes')))).toBe(false)
    expect(rejected(f(new String('maybe')))).toBe(true)
  })

  it('`+0 | +1` is identical to `0 | 1`', () => {
    // Source-level numeric narrowing does not survive into a value, so a union cannot
    // distinguish them and must not pretend to.
    const plus = fn(`function f(n: +0 | +1) { return n }`)
    const plain = fn(`function f(n: 0 | 1) { return n }`)
    for (const v of [0, 1, 2, -1, 1.5]) {
      expect(`${v}:${rejected(plus(v))}`).toBe(`${v}:${rejected(plain(v))}`)
    }
  })

  it('`1 | 1.0` is a ONE-member union', () => {
    // They are the same value, so de-duplication is not an optimisation — a two-member
    // union here would be a lie about what was written.
    const f = fn(`function f(n: 1 | 1.0) { return n }`)
    expect(f(1)).toBe(1)
    expect(rejected(f(2))).toBe(true)
  })

  it('a boxed number is a member', () => {
    const f = fn(`function f(n: 1 | 2) { return n }`)
    expect(rejected(f(new Number(2)))).toBe(false)
  })
})

describe('what a literal union is NOT', () => {
  it('a MIXED-type union still widens, as before', () => {
    // `0 | ''` is a union of TYPES — it already worked and must keep working. Only a
    // union whose members are all literals of describable values becomes a set.
    const f = fn(`function f(x: 0 | '') { return x }`)
    expect(f(1)).toBe(1)
    expect(f('s')).toBe('s')
    expect(rejected(f(true))).toBe(true)
  })

  it('a nullable union is unaffected', () => {
    // `x: 0 | null` means "integer or absent" — nullability, not membership.
    const f = fn(`function f(x: 0 | null) { return x }`)
    expect(f(5)).toBe(5)
    expect(f(null)).toBe(null)
  })

  it('a union of TYPE NAMES is not a literal union', () => {
    const f = fn(`function f(x: string | number) { return x }`)
    expect(f('a')).toBe('a')
    expect(f(1)).toBe(1)
  })
})

/**
 * A literal union works WITH a return annotation.
 *
 * Signature-test arguments were built by evaluating the annotation source:
 * `new Function("return 'yes' | 'no'")()`. That is valid JavaScript meaning something else
 * entirely — **bitwise OR** — so it evaluated to `0`, the function was called as `pick(0)`,
 * and it failed its own parameter check with a diagnostic that made no sense:
 *
 *     Function signature example is inconsistent:
 *       expected: "\"yes\" | \"no\"", actual: "number"
 *
 * Numeric unions were wrong more quietly still: `1 | 2` evaluates to `3`.
 *
 * The blast radius was wider than `tjs check`, which merely exits 1 — plain `tjs(source)`
 * THROWS, so the playground, `tjs emit`, `tjs test` and every programmatic consumer failed
 * on a function using a feature this release announces under **Added**.
 *
 * It survived because every example in `CLAUDE-TJS-SYNTAX.md` §Literal Unions omits a
 * return annotation. The COMBINATION is what breaks, and the documentation never showed
 * it — so the tests written from the documentation could not have found it.
 */
describe('literal unions survive a return annotation', () => {
  const ok = (src: string) =>
    expect(() => tjs(src, { filename: 'lu.tjs' })).not.toThrow()

  it('string union with a worked return example', () => {
    ok("function pick(x: 'yes' | 'no'): 'yes' { return x }")
  })

  it('numeric union with a worked return example', () => {
    // `1 | 2` evaluated to 3 — a valid number, so this failed with `actual: "number"`
    // rather than anything that pointed at the union.
    ok('function n(x: 1 | 2): 1 { return x }')
  })

  it('union with a type-only return example', () => {
    ok("function pick(x: 'yes' | 'no'):! '' { return x }")
  })

  it('a union member containing a pipe is not split on it', () => {
    // The separator scan runs over the masked view, so `|` inside a string is data.
    ok("function pick(x: 'a|b' | 'c'): 'a|b' { return x }")
  })

  it('an INCONSISTENT worked example still fails — as it must', () => {
    // The control, and the reason this is not simply "make unions never fail".
    // `pick('yes')` returns `'yes'`, not `''`. A return example is a WORKED EXAMPLE
    // compared by deep equality (`CLAUDE.md` → signature test canaries), exactly as
    // `function add(a: 2, b: 3): 0` must fail. `:!` is the opt-out for a type-only
    // example. A fix that made this pass would have deleted the feature.
    expect(() =>
      tjs("function pick(x: 'yes' | 'no'): '' { return x }", {
        filename: 'lu.tjs',
      })
    ).toThrow(/signature example is inconsistent/)
  })
})
