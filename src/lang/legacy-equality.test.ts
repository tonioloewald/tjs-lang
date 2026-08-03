/**
 * `DangerousLegacyEquals` / `DangerousLegacyNot` / `LegacyExactly` / `LegacyNotExactly` — bridges back to
 * JavaScript's equality.
 *
 * TJS fixes `==` and `===`, and a fixed OPERATOR has no construct to mark: it is still
 * spelled the same, so `unsafe` has nothing to point at. The escape therefore has to be a
 * NAME. That makes reaching for one deliberate and greppable, and the word `Legacy` does
 * the teaching — you are asking for the behavior TJS exists to correct.
 *
 * This is what makes abolishing `TjsEquals` possible: the mode existed because there was no
 * other way to get JS semantics back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { tjs } from './index'
import {
  createRuntime,
  Eq,
  Is,
  toBool,
  DangerousLegacyEquals,
  DangerousLegacyNot,
  LegacyExactly,
  LegacyNotExactly,
  LegacyDefault,
} from './runtime'

let saved: any
beforeAll(() => {
  saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
})
afterAll(() => {
  ;(globalThis as any).__tjs = saved
})

describe('legacy equality reproduces JavaScript exactly', () => {
  it('DangerousLegacyEquals coerces, where TJS `==` refuses to', () => {
    expect(DangerousLegacyEquals(1, '1')).toBe(true)
    expect(Eq(1, '1')).toBe(false)
    expect(DangerousLegacyEquals(0, '')).toBe(true)
    expect(DangerousLegacyEquals(false, [])).toBe(true)
  })

  it("LegacyExactly keeps JS's two famous warts", () => {
    // NaN is not itself…
    expect(LegacyExactly(NaN, NaN)).toBe(false)
    expect(Eq(NaN, NaN)).toBe(true)
    // …and a boxed primitive is not its value.
    expect(LegacyExactly(new String('a'), 'a')).toBe(false)
    expect(Eq(new String('a'), 'a')).toBe(true)
  })

  it('null vs undefined: legacy `===` separates, TJS `==` does not', () => {
    expect(LegacyExactly(null, undefined)).toBe(false)
    expect(DangerousLegacyEquals(null, undefined)).toBe(true) // JS `==` also conflates
    expect(Eq(null, undefined)).toBe(true)
  })

  it('the negations are exact inversions', () => {
    for (const [a, b] of [
      [1, '1'],
      [NaN, NaN],
      [null, undefined],
      [{}, {}],
    ] as Array<[unknown, unknown]>) {
      expect(DangerousLegacyNot(a, b)).toBe(!DangerousLegacyEquals(a, b))
      expect(LegacyNotExactly(a, b)).toBe(!LegacyExactly(a, b))
    }
  })
})

describe('they work in emitted standalone code', () => {
  // Emitted JS calls these bare, so the inline runtime must define them — and only when
  // the source actually reached for one (see CLAUDE.md, "the inline runtime is NOT the
  // real runtime").
  const NAMES = [
    ['DangerousLegacyEquals', true],
    ['DangerousLegacyNot', false],
    ['LegacyExactly', false],
    ['LegacyNotExactly', true],
  ] as const

  for (const [name, expected] of NAMES) {
    it(`${name} is inlined and runs`, () => {
      const code = tjs(`function f(a: 0, b: '') { return ${name}(a, b) }`, {
        runTests: false,
      }).code
      expect(code).toContain(`function ${name}(`)
      const f = new Function(code + '\nreturn f')()
      expect(f(1, '1')).toBe(expected)
    })
  }

  it('are NOT inlined when unused — no dead weight', () => {
    const code = tjs(`function f(a: 0, b: 0) { return a == b }`, {
      runTests: false,
    }).code
    expect(code).not.toContain('function DangerousLegacyEquals(')
  })
})

describe('LegacyDefault — per-parameter escape from dictionary defaults', () => {
  // TJS treats an object-literal default as a DICTIONARY: members defaulted individually,
  // merged on a partial argument, type-checked, excess keys stripped. JavaScript treats it
  // as one atomic value used only when the argument is undefined.
  //
  // The escape has to be PER-PARAMETER. The previous one — marking the whole function
  // unsafe with a leading `!` — disabled all of that function's validation rather than just
  // the merge, making the escape more destructive than the thing being escaped.
  const fn = (src: string) =>
    new Function(tjs(src, { runTests: false }).code + '\nreturn f')()

  it('a bare object literal merges on partial (TJS dictionary semantics)', () => {
    const f = fn(`function f(args = {x: 0, y: 0}) { return args }`)
    expect(f({ x: 5 })).toEqual({ x: 5, y: 0 })
  })

  it('LegacyDefault restores JavaScript: atomic, no merge', () => {
    const f = fn(
      `function f(args = LegacyDefault({x: 0, y: 0})) { return args }`
    )
    expect(f({ x: 5 })).toEqual({ x: 5 })
  })

  it('…and still applies the whole default when the argument is omitted', () => {
    const f = fn(
      `function f(args = LegacyDefault({x: 0, y: 0})) { return args }`
    )
    expect(f()).toEqual({ x: 0, y: 0 })
  })

  it('is identity at runtime — the marker is compile-time only', () => {
    const obj = { a: 1 }
    expect(LegacyDefault(obj)).toBe(obj)
  })

  it('is inlined into standalone output when used', () => {
    const code = tjs(
      `function f(args = LegacyDefault({x: 0})) { return args }`,
      {
        runTests: false,
      }
    ).code
    expect(code).toContain('function LegacyDefault(')
  })
})

describe('Eq cannot be made to run user code (the safe path must BE safe)', () => {
  // `==` invokes valueOf()/toString() on any object operand, so a comparison can throw,
  // mutate state, or lie. Eq exists to be the safe path, so it must not reproduce even a
  // narrow version of that: it unwraps boxed primitives via the PROTOTYPE method, reading
  // the internal slot, which an override cannot intercept.
  class Bomb extends String {
    valueOf(): string {
      throw new Error('boom')
    }
  }
  class Liar extends Number {
    valueOf(): number {
      return 999
    }
  }

  it('an overridden valueOf on a boxed subclass cannot throw from inside Eq', () => {
    expect(() => Eq(new Bomb('x'), 'x')).not.toThrow()
    expect(Eq(new Bomb('x'), 'x')).toBe(true)
  })

  it('…and cannot lie about the value', () => {
    expect(Eq(new Liar(5), 5)).toBe(true)
    expect(Eq(new Liar(5), 999)).toBe(false)
  })

  it('a plain object with valueOf is untouched by Eq — but not by `==`', () => {
    let called = false
    const probe = {
      valueOf() {
        called = true
        return 1
      },
    }
    Eq(probe, 1)
    expect(called, 'Eq must not coerce a plain object').toBe(false)

    DangerousLegacyEquals(probe, 1)
    expect(called, '`==` does — which is why the name says Dangerous').toBe(
      true
    )
  })

  it('unwrapping still works for ordinary boxed primitives', () => {
    expect(Eq(new String('a'), 'a')).toBe(true)
    expect(Eq(new Boolean(false), false)).toBe(true)
  })
})

/**
 * The slot-read discipline applies to EVERY operator that touches a boxed primitive.
 *
 * `Eq` was hardened alone, and the CHANGELOG said "`Eq` can no longer be made to run user
 * code" — true, and misleading about the hotter path. `toBool` is injected at EVERY
 * truthiness site in a `.tjs` file, so its reach is far wider than `==`'s, and it still
 * called `value.valueOf()`. With a plain subclass — no Proxy, no exotic object — the two
 * disagreed outright: `Eq(e, false)` was `true` having run no user code, while
 * `toBool(e)` ran user code and returned the opposite. A throwing `valueOf` threw out of
 * every `if` in the file, in a language whose promise is that errors are returned.
 *
 * One table, three operators, so the next one added cannot be hardened alone.
 */
describe('boxed primitives cannot run user code in ANY comparison path', () => {
  class BoolBomb extends Boolean {
    valueOf(): boolean {
      throw new Error('boom')
    }
  }
  class BoolLiar extends Boolean {
    valueOf(): boolean {
      return true // the real slot holds false
    }
  }
  class NumSpy extends Number {
    static ran = 0
    valueOf(): number {
      NumSpy.ran++
      return 999
    }
  }

  const OPERATORS: Array<[string, (v: unknown) => unknown]> = [
    ['Eq(v, false)', (v) => Eq(v, false)],
    ['toBool(v)', (v) => toBool(v)],
    ['Is(v, false)', (v) => Is(v, false)],
  ]

  for (const [label, apply] of OPERATORS) {
    it(`${label} does not throw when valueOf throws`, () => {
      expect(() => apply(new BoolBomb(false))).not.toThrow()
    })

    it(`${label} reads the real slot, not the overridden valueOf`, () => {
      // The slot holds `false`. An operator that consulted the override would report the
      // value as truthy.
      const v = new BoolLiar(false)
      const result = apply(v)
      expect(
        label === 'toBool(v)' ? result === false : result === true,
        `${label} must reflect the boxed false`
      ).toBe(true)
    })

    it(`${label} runs no user code at all`, () => {
      NumSpy.ran = 0
      apply(new NumSpy(5))
      expect(NumSpy.ran, `${label} invoked a user valueOf`).toBe(0)
    })
  }

  it('an instanceof-lying Proxy cannot throw a raw TypeError out of an operator', () => {
    // `instanceof` is spoofable via Symbol.hasInstance, so the guard passes and the slot
    // read then throws a raw TypeError — escaping as an exception rather than a
    // MonadicError. Fail-soft: a value that will not yield a primitive slot is not a
    // boxed primitive.
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('trap')
        },
      }
    )
    const original = Object.getOwnPropertyDescriptor(
      Boolean,
      Symbol.hasInstance
    )
    Object.defineProperty(Boolean, Symbol.hasInstance, {
      value: () => true,
      configurable: true,
    })
    try {
      for (const [label, apply] of OPERATORS) {
        expect(() => apply(trap), label).not.toThrow()
      }
    } finally {
      if (original) Object.defineProperty(Boolean, Symbol.hasInstance, original)
      else delete (Boolean as any)[Symbol.hasInstance]
    }
  })
})
