/**
 * An annotated ARROW parameter is checked, exactly like a `function` parameter.
 *
 * Until this existed, only top-level `function` declarations got boundary checks —
 * `findAllFunctions` walked `program.body` and matched `FunctionDeclaration` and nothing
 * else. So:
 *
 *     function decl(n: 0) { return n }      decl('x')   -> MonadicError
 *     const arrow = (n: 0) => n             arrow('x')  -> 'x'
 *
 * The same annotation, silently unenforced depending on which spelling you used. That is
 * the failure mode this project treats as worse than no type at all — it parses, it looks
 * typed, and it protects nothing — and it is the one `predicate =>` was tombstoned for.
 * Arrows and `const fn = function …` are most of real TypeScript, so this was the largest
 * silent hole in the language.
 *
 * Scoped to a NAMED binding (`const f = …`), because the name is what the error message
 * reports and what `__tjs` metadata attaches to. An anonymous callback argument has
 * neither and is a separate problem.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

/** Compile and evaluate, returning the named bindings. */
function build(src: string, names: string[]): Record<string, any> {
  const { code } = tjs(src, { filename: 'arrow.tjs', runTests: false })
  return new Function(`${code}\nreturn { ${names.join(', ')} }`)()
}

const isErr = (v: unknown) => String(v).startsWith('MonadicError')

describe('arrow and function-expression params are validated', () => {
  it('an arrow rejects a bad argument, like a declaration does', () => {
    const m = build(
      `function decl(n: 0) { return n }\nconst arrow = (n: 0) => n`,
      ['decl', 'arrow']
    )
    // The control and the subject must agree — that is the entire point.
    expect(isErr(m.decl('x'))).toBe(true)
    expect(isErr(m.arrow('x'))).toBe(true)
    expect(m.arrow(3)).toBe(3)
  })

  it('a block-bodied arrow is validated too', () => {
    const m = build(`const f = (n: 0) => { return n * 2 }`, ['f'])
    expect(isErr(f_call(m, 'x'))).toBe(true)
    expect(m.f(3)).toBe(6)
  })

  it('`const f = function (…)` is validated', () => {
    const m = build(`const f = function (n: 0) { return n }`, ['f'])
    expect(isErr(m.f('x'))).toBe(true)
    expect(m.f(3)).toBe(3)
  })

  it('multiple params, and a good call still passes through', () => {
    const m = build(`const add = (a: 0, b: 0) => a + b`, ['add'])
    expect(m.add(2, 3)).toBe(5)
    expect(isErr(m.add(2, 'x'))).toBe(true)
    expect(isErr(m.add('x', 3))).toBe(true)
  })

  it('an UNANNOTATED arrow is untouched', () => {
    // The control that matters most: TJS ⊇ JS. A plain arrow must keep working, and must
    // not acquire checks it never asked for.
    const m = build(`const f = (n) => n`, ['f'])
    expect(m.f('x')).toBe('x')
    expect(m.f(3)).toBe(3)
  })

  it('an exported arrow is validated', () => {
    const { code } = tjs(`export const f = (n: 0) => n`, {
      filename: 'arrow.tjs',
      runTests: false,
    })
    // `export` is stripped for evaluation; the check must survive it.
    const f = new Function(
      `${code.replace(/^export /gm, '')}\nreturn f`
    )() as any
    expect(isErr(f('x'))).toBe(true)
    expect(f(3)).toBe(3)
  })

  it('carries `__tjs` metadata, like a declaration', () => {
    // Docs, .d.ts emit and introspection all read this; an arrow that validates but
    // reports nothing about itself is only half-integrated.
    const m = build(`const f = (n: 0) => n`, ['f'])
    expect(m.f.__tjs?.params?.n).toBeTruthy()
  })
})

/** `m.f(x)` with the argument applied — kept separate so the assertion reads cleanly. */
function f_call(m: Record<string, any>, arg: unknown): unknown {
  return m.f(arg)
}

/**
 * An arrow is a function declaration by another spelling, and the two must agree.
 *
 * This file's original premise — "the control and the subject must agree" — was right, and
 * it contained NO ZERO-ARGUMENT CALL anywhere, so the disagreement it existed to catch was
 * invisible to it:
 *
 *     function g(n: 0) { … }      g()  ->  MonadicError      (`:` means required)
 *     const f = (n: 0) => …       f()  ->  0                 (example became a default)
 *
 * Arrows were parsed with `trackRequired: false`, so the colon EXAMPLE silently became a
 * JS DEFAULT — contradicting the language's central rule in the parameter shape most
 * TypeScript actually uses. Separately, an arrow's `: T` return annotation was parsed by
 * the preprocessor and thrown away: no `returns` metadata, no `:?` validation.
 *
 * Every test below calls with MISSING or WRONG arguments, because that is the only place
 * "required" and "validated" are observable.
 */
describe('arrows and declarations agree about required parameters', () => {
  const load = (src: string, name: string) =>
    new Function(
      `${tjs(src, { filename: 'p.tjs', runTests: false }).code}\nreturn ${name}`
    )()

  const FORMS: Array<[string, string]> = [
    ['declaration', 'function subject(n: 0) { return n * 2 }'],
    ['arrow', 'const subject = (n: 0) => n * 2'],
    ['arrow with block body', 'const subject = (n: 0) => { return n * 2 }'],
    ['function expression', 'const subject = function (n: 0) { return n * 2 }'],
    ['async arrow', 'const subject = async (n: 0) => n * 2'],
  ]

  for (const [label, src] of FORMS) {
    it(`${label}: a missing required argument is an error`, async () => {
      const fn = load(src, 'subject')
      expect(String(await fn())).toContain('Expected integer')
    })

    it(`${label}: a wrong-typed argument is an error`, async () => {
      const fn = load(src, 'subject')
      expect(String(await fn('x'))).toContain('Expected integer')
    })

    it(`${label}: a valid argument passes through`, async () => {
      // The control. A form that rejected everything would satisfy both tests above.
      expect(await load(src, 'subject')(3)).toBe(6)
    })
  }

  it('`=` still means optional, in an arrow too', () => {
    // The other direction: widening `:` to required must not drag `=` along with it.
    expect(load('const f = (n = 5) => n * 2', 'f')()).toBe(10)
  })
})

describe('an arrow return annotation is not thrown away', () => {
  const load = (src: string, name: string) =>
    new Function(
      `${tjs(src, { filename: 'p.tjs', runTests: false }).code}\nreturn ${name}`
    )()

  it('produces `returns` metadata', () => {
    const h = load('const h = (n: 0): 0 => n * 2', 'h')
    expect(h.__tjs?.returns?.type?.kind).toBe('integer')
  })

  it('`:?` validates the return value', () => {
    const bad = load("const bad = (n: 0):? 0 => 'not a number'", 'bad')
    expect(String(bad(1))).toContain('Expected integer')
  })

  it('`:?` lets a correct return through', () => {
    expect(load('const good = (n: 0):? 0 => n * 2', 'good')(2)).toBe(4)
  })

  it('survives a parameter default containing a paren', () => {
    // The old extractor was `function\\s+NAME\\s*\\([^)]*\\)` — `[^)]*` cannot cross the
    // `)` in `Math.max(1, 2)`, so the annotation was missed even for named functions.
    const f = load('const f = (n = Math.max(1, 2)): 0 => n', 'f')
    expect(f.__tjs?.returns?.type?.kind).toBe('integer')
  })
})

/**
 * A PARENTHESISED concise body emits JavaScript that parses.
 *
 * `(x, y) => ({ x, y })` is one of the most ordinary shapes in JavaScript — the parens are
 * how you return an object literal at all. The validation preamble was anchored on
 * `func.body`, whose span EXCLUDES those parens, so the opening brace landed inside them
 * and the result parsed as an object literal:
 *
 *     (a, b) => ({ __tjs.pushStack('…'); … return { a, b } })
 *     SyntaxError: Unexpected token '.'
 *
 * Three things made it worse than a formatting slip:
 *
 *   - It needs NO annotation. Plain JavaScript in a `.tjs` file emitted unparseable
 *     output, which is a `PRINCIPLES.md` "TJS ⊇ JS" subset violation.
 *   - `tjs check` reported the file clean. Only `tjs run` failed, at module load.
 *   - `arrow-validation.test.ts` had no parenthesised case at all, so the suite was green.
 *
 * Every test here asserts the emitted code PARSES and returns the right value — checking
 * the string would have missed it, and so would checking only that transpilation
 * succeeded.
 */
describe('a parenthesised concise arrow body emits parseable JS', () => {
  const load = (src: string, name: string) => {
    const { code } = tjs(src, { filename: 'p.tjs', runTests: false })
    // Parse first, with the failure naming the emitted line — a value assertion on
    // unparseable code reports `new Function` noise instead of the defect.
    try {
      new Function(code)
    } catch (e: any) {
      throw new Error(`emitted JS does not parse: ${e.message}\n---\n${code}`, {
        cause: e,
      })
    }
    return new Function(`${code}\nreturn ${name}`)()
  }

  it('returns an object literal', () => {
    expect(
      load('const point = (x: 0, y: 0) => ({ x, y })', 'point')(1, 2)
    ).toEqual({
      x: 1,
      y: 2,
    })
  })

  it('works with NO annotations — this is plain JavaScript', () => {
    // The subset violation. `.tjs` must not break legal JS.
    expect(load('const plain = (a, b) => ({ a, b })', 'plain')(1, 2)).toEqual({
      a: 1,
      b: 2,
    })
  })

  it('handles a parenthesised NON-object expression', () => {
    // The paren is outside the body span whatever it wraps, so this failed too.
    expect(load('const inc = (n: 0) => (n + 1)', 'inc')(4)).toBe(5)
  })

  it('handles an async parenthesised body', async () => {
    const a = load('const a = async (n: 0) => ({ n })', 'a')
    expect(await a(5)).toEqual({ n: 5 })
  })

  it('handles an exported one', () => {
    const { code } = tjs('export const mk = (n: 0) => ({ n })', {
      filename: 'p.tjs',
      runTests: false,
    })
    expect(() => new Function(code.replace(/^export /gm, ''))).not.toThrow()
  })

  it('still VALIDATES — growing a body must not lose the checks', () => {
    // The control. Emitting `=> ({x, y})` untouched would pass every test above.
    const point = load('const point = (x: 0, y: 0) => ({ x, y })', 'point')
    expect(String(point('a', 2))).toContain('Expected integer')
  })

  it('the unparenthesised forms still work', () => {
    expect(load('const dbl = (n: 0) => n * 2', 'dbl')(3)).toBe(6)
    expect(load('const box = (n: 0) => [n]', 'box')(3)).toEqual([3])
  })
})

/**
 * The return annotation belongs to THIS function, not to whichever binding shares its name.
 *
 * `findSignatureReturn` name-searched the whole file and took the first anchor it found, so
 * an unrelated same-named binding in another scope stole it:
 *
 *     function outer() { const helper = (a) => a; return helper }
 *     export function helper(x: 0): 0 { return x }   // silently loses `returns`
 *
 * The real `helper` lost its `returns` metadata, its `:?` return wrapper and its safety
 * marker — and `tjs check` reported the file clean, because nothing downstream knows a
 * signature was supposed to be there. A regression from the older `function\s+NAME(`-only
 * anchor, introduced when arrow support widened it.
 *
 * Non-first declarators were unreachable for the opposite reason: the pattern demanded
 * `const` immediately before the name, so `const a = 1, mk = (x: 0): 0 => x` bound nothing.
 */
describe('signature anchoring', () => {
  const returnsOf = (src: string, name: string) =>
    (tjs(src, { filename: 'a.tjs', runTests: false }).metadata as any)?.[name]
      ?.returns?.kind ?? null

  it('a same-named binding in another scope does not steal the anchor', () => {
    expect(
      returnsOf(
        `function outer() { const helper = (a) => a; return helper }\nexport function helper(x: 0): 0 { return x }`,
        'helper'
      )
    ).toBe('integer')
  })

  it('a non-first declarator is still found', () => {
    expect(returnsOf(`export const a = 1, mk = (x: 0): 0 => x`, 'mk')).toBe(
      'integer'
    )
  })

  it('a function with genuinely no annotation still reports none', () => {
    // The control. "Try every anchor until one yields a signature" must not invent one.
    expect(returnsOf(`export function bare(x: 0) { return x }`, 'bare')).toBe(
      null
    )
  })
})

/**
 * A `:?` return check applies wherever the function is CALLED, not wherever it is written.
 *
 * The wrapper reassigns the binding (`name = function (...) { … }`), and that statement ran
 * only when control reached the closing brace — while the `function` declaration itself is
 * hoisted. So a call ABOVE the declaration got the raw function and no return validation:
 *
 *     const early = bad()                     // 'BAD'        — unvalidated
 *     function bad():? 0 { return 'BAD' }
 *     const late  = bad()                     // MonadicError — validated
 *
 * Same function, same argument, opposite answers, decided by call position — which is
 * exactly the kind of difference nobody thinks to test for.
 */
describe('return validation and hoisting', () => {
  const run = (src: string, expr: string) => {
    const saved = (globalThis as any).__tjs
    ;(globalThis as any).__tjs = createRuntime()
    try {
      return new Function(
        `${
          tjs(src, { filename: 'h.tjs', runTests: false }).code
        }\nreturn ${expr}`
      )()
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  it('a call ABOVE the declaration is validated', () => {
    const out = run(
      `const early = bad()\nfunction bad():? 0 { return 'BAD' }`,
      'early'
    )
    expect(String(out)).toContain('MonadicError')
  })

  it('a call below it still is (control)', () => {
    const out = run(
      `function bad():? 0 { return 'BAD' }\nconst late = bad()`,
      'late'
    )
    expect(String(out)).toContain('MonadicError')
  })

  it('a VALID return still passes through', () => {
    // Wrapping everything in an error would satisfy both tests above.
    expect(run(`function good():? 0 { return 5 }\nconst r = good()`, 'r')).toBe(
      5
    )
  })

  it('an arrow still validates — its wrapper cannot hoist', () => {
    // A `const` binding is not hoisted, so the arrow's wrapper stays where it was; it
    // never had the hole, and must not acquire a TDZ error from the fix.
    const out = run(`const mk = (n: 0):? 0 => 'BAD'\nconst r = mk(1)`, 'r')
    expect(String(out)).toContain('MonadicError')
  })
})
