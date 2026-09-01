import { describe, it, expect } from 'bun:test'
import { fromTS as fromTSToTJS } from './emitters/from-ts'
import { tjs } from './index'

/**
 * The composed path: TS -> TJS -> JS.
 *
 * `fromTS` emits TJS and stops; `tjs` takes it the rest of the way. These tests assert on
 * JavaScript, so they compose the two — which is now the ONLY route to JS. It used to be one
 * call, because `fromTS` also emitted JS via `ts.transpileModule`; that meant these
 * assertions were checking the TypeScript compiler's output, not ours. See
 * `src/no-ts-emitter.test.ts`.
 */
const fromTS = (source: string, options: any = {}) => {
  const t = fromTSToTJS(source, options)
  if (options.emitTJS) return t
  return { ...t, code: tjs(t.code, { runTests: false }).code }
}

describe('TypeScript to TJS Transpiler', () => {
  describe('fromTS with emitTJS', () => {
    it('should convert string type to empty string example', () => {
      const result = fromTS(`function greet(name: string) { return name }`, {
        emitTJS: true,
      })
      expect(result.code).toContain('name: string')
    })

    it('should convert number type to 0 example', () => {
      const result = fromTS(
        `function add(a: number, b: number) { return a + b }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('a: number')
      expect(result.code).toContain('b: number')
    })

    it("keeps an optional param optional, in TypeScript's own spelling", () => {
      // `T | undefined`, NOT `?:`. TJS's `?:` is documented as "same as `name = value`"
      // (CLAUDE-TJS-SYNTAX.md), so it is precisely the wrong spelling for a TypeScript
      // optional, which means "undefined when omitted" and never "defaults to an example".
      //
      // This briefly asserted `?:`, to fix the emitted metadata saying `required: true` for a
      // parameter the converter had just called optional. That traded a metadata bug for a
      // BEHAVIOUR bug: every optional gained its type example as a default, and radash's
      // `toKey ? toKey(item) : item` then called a truthy FunctionPredicate object. Only
      // radash's own suite caught it — the output was valid JavaScript doing the wrong thing.
      // The metadata is now fixed at its source, so the union is right on both axes.
      const result = fromTS(
        `function greet(name: string, title?: string) { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('name: string')
      expect(result.code).toContain('title: string | undefined')
      // The property that was actually broken — asserted through the emitted metadata,
      // because that is what a consumer reads.
      const js = tjs(result.code, { runTests: false }).code
      const meta = new Function(`${js}; return greet.__tjs;`)()
      expect(meta.params.title.required).toBe(false)
      // `union` — the annotation is `string | undefined`. See the note in codegen.test.ts.
      expect(meta.params.title.type.kind).toBe('union')
    })

    it('should convert return type to -! annotation (skip signature test)', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! string') // :! skips signature test for TS-transpiled code
    })

    it('should handle array types', () => {
      const result = fromTS(
        `function sum(nums: number[]): number { return 0 }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('nums: [number]')
    })

    it('should handle object literal types', () => {
      const result = fromTS(
        `function getUser(): { name: string, age: number } { return { name: '', age: 0 } }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! { name: string, age: number }') // :! for TS-transpiled
    })

    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! string | null') // :! for TS-transpiled
    })

    it('should preserve default values', () => {
      const result = fromTS(
        `function greet(name: string = 'world') { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("name = 'world'")
    })
  })

  describe('fromTS with JS output', () => {
    it('should strip types and add __tjs metadata', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`
      )
      expect(result.code).toContain('function greet(name)')
      expect(result.code).toContain('greet.__tjs')
      expect(result.types?.greet).toBeDefined()
      expect(result.types?.greet.params.name.type.kind).toBe('string')
      expect(result.types?.greet.params.name.required).toBe(true)
    })

    it('should mark optional params as not required', () => {
      const result = fromTS(`function test(a: string, b?: number) { return a }`)
      expect(result.types?.test.params.a.required).toBe(true)
      expect(result.types?.test.params.b.required).toBe(false)
    })

    it('should capture return type in metadata', () => {
      const result = fromTS(
        `function add(a: number, b: number): number { return a + b }`
      )
      expect(result.types?.add.returns?.kind).toBe('number')
    })

    it('should handle multiple functions', () => {
      const result = fromTS(`
        function foo(x: string) { return x }
        function bar(y: number) { return y }
      `)
      expect(result.types?.foo).toBeDefined()
      expect(result.types?.bar).toBeDefined()
      expect(result.code).toContain('foo.__tjs')
      expect(result.code).toContain('bar.__tjs')
    })

    it('should handle arrow functions', () => {
      const result = fromTS(
        `const greet = (name: string): string => \`Hello, \${name}!\``
      )
      expect(result.types?.greet).toBeDefined()
      expect(result.types?.greet.params.name.type.kind).toBe('string')
      expect(result.types?.greet.returns?.kind).toBe('string')
    })

    it('should handle const function expressions', () => {
      const result = fromTS(
        `const add = function(a: number, b: number): number { return a + b }`
      )
      expect(result.types?.add).toBeDefined()
      expect(result.types?.add.params.a.type.kind).toBe('number')
      expect(result.types?.add.params.b.type.kind).toBe('number')
    })
  })

  describe('End-to-end execution', () => {
    it('should produce executable JS from TypeScript', () => {
      const tsSource = `
        function add(a: number, b: number): number {
          return a + b
        }
      `
      const result = fromTS(tsSource)

      // Execute the generated JS
      const fn = new Function(`${result.code}; return add(2, 3);`)
      expect(fn()).toBe(5)
    })

    it('should produce executable JS with correct metadata', () => {
      const tsSource = `
        function greet(name: string, excited?: boolean): string {
          return excited ? \`Hello, \${name}!\` : \`Hello, \${name}\`
        }
      `
      const result = fromTS(tsSource)

      // Execute and check result
      const fn = new Function(`${result.code}; return greet('World', true);`)
      expect(fn()).toBe('Hello, World!')

      // Also verify metadata is attached
      const metaFn = new Function(`${result.code}; return greet.__tjs;`)
      const meta = metaFn()
      // The CANONICAL descriptor shape — `{ kind: 'string' }`, exactly what a hand-written
      // `.tjs` file emits. These used to assert the flat `type: 'string'`, which only the
      // deleted `ts.transpileModule` branch ever produced (`{ type: v.type.kind }`). Keeping
      // it would mean emitting two different metadata shapes depending on where the source
      // came from, which is the disease rather than the cure.
      expect(meta.params.name.type.kind).toBe('string')
      expect(meta.params.name.required).toBe(true)
      expect(meta.params.excited.required).toBe(false)
      expect(meta.returns.type.kind).toBe('string')
    })

    it('should handle arrow functions end-to-end', () => {
      const tsSource = `
        const multiply = (a: number, b: number): number => a * b
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(`${result.code}; return multiply(4, 5);`)
      expect(fn()).toBe(20)

      // Check metadata
      const metaFn = new Function(`${result.code}; return multiply.__tjs;`)
      const meta = metaFn()
      expect(meta.params.a.type.kind).toBe('number')
      expect(meta.params.b.type.kind).toBe('number')
    })

    it('should handle complex types end-to-end', () => {
      const tsSource = `
        function processUser(user: { name: string, age: number }): string {
          return \`\${user.name} is \${user.age} years old\`
        }
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(
        `${result.code}; return processUser({ name: 'Alice', age: 30 });`
      )
      expect(fn()).toBe('Alice is 30 years old')
    })
  })
})
// =============================================================================
// @tjs annotations
// =============================================================================

describe('@tjs annotations', () => {
  describe('@tjs-skip', () => {
    it('should skip interface with @tjs-skip', () => {
      const result = fromTS(
        `/* @tjs-skip */\nexport interface Internal { x: string }`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Type Internal')
    })

    it('should skip type alias with @tjs-skip', () => {
      const result = fromTS(
        `/* @tjs-skip */\nexport type Complex<T> = T extends Array<infer U> ? U : T`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Complex')
    })

    it('should only skip annotated declaration', () => {
      const result = fromTS(
        `/* @tjs-skip */\ninterface Hidden { x: string }\ninterface Visible { y: number }`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Hidden')
      expect(result.code).toContain('Type Visible')
    })
  })

  describe('@tjs example', () => {
    it('should use custom example on interface', () => {
      const result = fromTS(
        `/* @tjs example: { name: 'Alice', age: 30 } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("example: { name: 'Alice', age: 30 }")
    })

    it('should override auto-generated example', () => {
      const result = fromTS(
        `/* @tjs example: { id: 42, label: 'test' } */\nexport interface Item { id: number; label: string; meta?: any }`,
        { emitTJS: true }
      )
      // Should use the annotation, not the auto-generated one
      expect(result.code).toContain("{ id: 42, label: 'test' }")
      expect(result.code).not.toContain('meta:')
    })
  })

  describe('@tjs predicate', () => {
    it('should use custom predicate on interface', () => {
      const result = fromTS(
        `/* @tjs predicate(x) { return typeof x.name === 'string' && x.age >= 0 } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x) { return typeof x.name === 'string' && x.age >= 0 }"
      )
    })

    it('should use custom predicate on generic interface', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) } */\nexport interface Box<T> { value: T; label: string }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) }"
      )
    })

    it('should use custom predicate on generic type alias', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return Array.isArray(x) && x.every(T) } */\nexport type TypedArray<T> = Array<T> & { __brand: 'typed' }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        'predicate(x, T) { return Array.isArray(x) && x.every(T) }'
      )
    })
  })

  describe('@tjs declaration', () => {
    it('should include declaration block on generic interface', () => {
      const result = fromTS(
        `/* @tjs declaration { value: T; path: string; observe(cb: (path: string) => void): void } */\nexport interface BoxedProxy<T> { value: T; path: string }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        'declaration { value: T; path: string; observe(cb: (path: string) => void): void }'
      )
    })
  })

  describe('combined annotations', () => {
    it('should support example + predicate together', () => {
      const result = fromTS(
        `/* @tjs example: { name: 'Alice', age: 30 } */\n/* @tjs predicate(x) { return typeof x.name === 'string' } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("example: { name: 'Alice', age: 30 }")
      expect(result.code).toContain(
        "predicate(x) { return typeof x.name === 'string' }"
      )
    })

    it('should support predicate + declaration on generic', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } */\n/* @tjs declaration { value: T; unwrap(): T } */\nexport interface Box<T> { value: T }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x, T) { return typeof x === 'object' && T(x.value) }"
      )
      expect(result.code).toContain('declaration { value: T; unwrap(): T }')
    })
  })
})

// Regression: TS→TJS must never emit TJS that won't re-parse. These real-world
// shapes (from tosijs) used to leak raw TS into Type/Generic blocks — generic
// interfaces emitted raw member types in `declaration {}`, and intersections /
// complex types emitted MULTI-LINE `// TS:` comments whose lines 2+ leaked as
// raw TS. fromTS now converts members via typeToExample and collapses
// un-representable bodies to a single-line comment (graceful degradation).
describe('TS→TJS round-trips (no raw-TS leak into TJS blocks)', () => {
  const { tjs } = require('./index') as { tjs: (s: string) => { code: string } }
  const roundTrips = (ts: string) => {
    const emitted = fromTS(ts, { emitTJS: true }).code
    expect(() => tjs(emitted)).not.toThrow() // emitted TJS must re-parse
    return emitted
  }

  it('generic interface with complex members (arrow, generic arrow, call-sig)', () => {
    const out = roundTrips(`export interface Acc<T = any> {
      value: T
      path: string
      touch: () => void
      bind: <E extends Element = Element>(el: E, b: any) => void
      find: { (selector: (item: any) => any, value: any): any }
    }`)
    // members converted to examples, not raw TS
    expect(out).toContain("path: ''")
    expect(out).toContain('touch: FunctionPredicate')
    expect(out).not.toMatch(/path: string\b/) // no raw type leak
  })

  it('intersection type alias (typeof / index signature) degrades, single-line', () => {
    const out = roundTrips(`export type ProxyObj = Props<object> & {
      [key: string]: ProxyObj | string | null
    }`)
    // un-representable → comment-only Type, collapsed to one line (no leak)
    expect(out).toMatch(/\/\/ TS:.*&/)
    expect(out).not.toMatch(/\n\s*\[key: string\]:/) // the body didn't leak raw
  })

  it('generic type alias with object body + arrow member', () => {
    roundTrips(`export type Wrap<T> = { value: T; build: (x: T) => T }`)
  })

  it('plain type alias with arrow + union return still works', () => {
    roundTrips(
      `export type AnyFunction = (...args: any[]) => any | Promise<any>`
    )
  })
})

/**
 * Type-only wrappers in PARAMETER DEFAULTS.
 *
 * `param.initializer.getText()` returns raw source, so `m = {} as M` carried the cast into
 * the emitted TJS, where `as` is not valid in a parameter default — the converted file
 * simply would not parse. Fixed in 3f2428d by unwrapping at the AST level, repeatedly,
 * since `x as unknown as T` and `(x as T)!` both occur in real code.
 *
 * That fix shipped with NO regression test, against this project's own hard rule. Proved
 * by experiment during the pre-release review: reverting it left `test:fast` bit-identical,
 * and it was caught only by the 130-second dogfood corpus behind SKIP_BENCHMARKS — which
 * `test:fast` sets. Worse, the corpus's coverage of it was INCIDENTAL: exactly 2 of its 93
 * files exercise this path at all.
 *
 * The drop is deliberately VISIBLE rather than silent, per the conversion contract in
 * PRINCIPLES.md — we do not erase TypeScript, we upgrade it or comment on it.
 */
describe('type-only wrappers in parameter defaults', () => {
  const convert = (ts: string) => fromTS(ts, { emitTJS: true }).code

  const CASES: Array<[label: string, ts: string]> = [
    ['as', `export function f(m = {} as any) { return m }`],
    ['double as', `export function f(m = {} as unknown as any) { return m }`],
    ['non-null assertion', `export function f(m = ({} as any)!) { return m }`],
    ['satisfies', `export function f(m = {} satisfies object) { return m }`],
    [
      'in a constructor',
      `export class C { constructor(m = {} as any) { this.m = m } }`,
    ],
  ]

  for (const [label, ts] of CASES) {
    it(`${label}: the converted TJS parses`, () => {
      const converted = convert(ts)
      // The actual regression: `as` reaching a parameter default made the output
      // un-parseable, so the failure was a hard error two steps downstream.
      expect(() => tjs(converted, { runTests: false })).not.toThrow()
    })

    it(`${label}: the drop is visible, not silent`, () => {
      // "with guidance" is the third obligation of the conversion contract. A silently
      // erased cast leaves the reader believing a type survived that did not.
      expect(convert(ts)).toMatch(/TJS: dropped/)
    })
  }

  it('does not annotate a default that had no cast to drop', () => {
    expect(convert(`export function f(m = {}) { return m }`)).not.toMatch(
      /TJS: dropped/
    )
  })
})

/**
 * TypeScript parameter properties (`constructor(public x: number)`) are not annotations —
 * they GENERATE `this.x = x`. They live on the parameter list, not in the body, so a
 * converter that transpiles only `member.body` drops them silently and every field is
 * `undefined` at runtime. The class still compiles and still runs, which is what makes it
 * expensive: nothing reports it.
 *
 * Found by asking whether the corpus covered constructor overloads. It did — this was
 * next to it.
 */
describe('fromTS — parameter properties', () => {
  it('emits the assignments TypeScript would generate', () => {
    const code = fromTS(
      `class P { constructor(public x: number, private label: string) {} }`,
      { emitTJS: true }
    ).code
    expect(code).toContain('this.x = x')
    expect(code).toContain('this.label = label')
  })

  it('leaves a plain parameter alone', () => {
    // The other direction: assigning every parameter would invent fields TS never had.
    const code = fromTS(`class P { constructor(x: number) {} }`, {
      emitTJS: true,
    }).code
    expect(code).not.toContain('this.x = x')
  })

  it('assigns AFTER super(), not before', () => {
    // TypeScript orders it this way because touching `this` before `super()` throws.
    const code = fromTS(
      `class B { constructor(n: number) {} }
class D extends B { constructor(public x: number) { super(x) } }`,
      { emitTJS: true }
    ).code
    const sup = code.lastIndexOf('super(')
    const assign = code.indexOf('this.x = x')
    expect(assign).toBeGreaterThan(sup)
  })

  it('round-trips through TJS to a working object', () => {
    // The assertion that would have caught this: the field actually holds the argument.
    const tjsSrc = fromTS(`class P { constructor(public x: number) {} }`, {
      emitTJS: true,
    }).code.replace(/^\/\* tjs <- .*\*\/\n/, '')
    const P = new Function(
      tjs(tjsSrc, { filename: 'pp.tjs' }).code + '\nreturn P'
    )() as any
    expect(P(7).x).toBe(7)
  })
})

/**
 * An optional object parameter is PASSED THROUGH, not upgraded.
 *
 * `opts?: { splitOnNumber?: boolean }` means "undefined when omitted" in TypeScript. TJS's
 * `?:` lowers to `= value`, which is the dictionary-default spelling, so the parameter would
 * arrive FILLED — and real code can tell the difference:
 *
 *     radash `snake('hello-world12_19-bye')`
 *       TypeScript -> 'hello_world_12_19_bye'
 *       filled     -> 'hello_world12_19_bye'
 *
 * because the body branches on `options?.splitOnNumber === false`, and a default of `false`
 * is not absence.
 *
 * A dictionary default is very likely what the author WANTED — cleaner and less buggy than a
 * hand-rolled fallback. But we cannot prove the two equivalent, and this code is bespoke: a
 * thing that looks like a failure mode may be deliberate. So conversion preserves behaviour
 * and HINTS at the upgrade; graduation is where upgrades belong.
 *
 * These tests previously asserted the opposite, when the conversion did upgrade.
 */
describe('an optional object param is passed through, with a hint', () => {
  const SRC = `export function pick(opts?: { a: number, b: number }): string {
       return opts === undefined ? 'ABSENT' : JSON.stringify(opts)
     }`

  const run = (tjsSource: string) =>
    new Function(
      tjs(tjsSource, { runTests: false }).code.replace(/^export /gm, '') +
        '\nreturn pick'
    )()

  it('is undefined when omitted, exactly as in TypeScript', () => {
    // The property that radash's `snake` depends on, and the whole reason for the decision.
    expect(run(fromTS(SRC, { emitTJS: true }).code)()).toBe('ABSENT')
  })

  it('still receives what the caller passes', () => {
    // Preserving absence must not cost the argument itself.
    expect(run(fromTS(SRC, { emitTJS: true }).code)({ a: 1, b: 2 })).toBe(
      '{"a":1,"b":2}'
    )
  })

  it('keeps the type in a warning, and names the upgrade', () => {
    // Behaviour is preserved and the type is not thrown away — it goes to `warnings`, in the
    // AUTHOR'S spelling, with the upgrade named. It was an inline `/* … */` beside the
    // parameter, which read better, until a block comment in a parameter list turned out to
    // break return-type stripping for a REGEX return example (see TODO.md).
    const { warnings } = fromTS(SRC, { emitTJS: true })
    const hint = (warnings ?? []).join('\n')
    expect(hint).toContain('opts?: { a: number, b: number }')
    expect(hint).toContain('docs/dictionary-defaults.md')
  })

  it('a SCALAR optional still uses `?:` (control)', () => {
    // Scalars carry no members to fill, so `?:` already means what TypeScript means. Passing
    // those through as comments too would be a pointless loss of annotation.
    const { code } = fromTS(
      `export function f(title?: string): string { return title ?? '' }`,
      { emitTJS: true }
    )
    expect(code).toContain('title: string | undefined')
  })
})

describe('overload groups keep their export', () => {
  const OVERLOADS = `export function pick(a: string): number
export function pick(a: number, b: number): number
export function pick(a: any, b?: any): number { return b === undefined ? 1 : 2 }`

  it('the emitted TJS exports each variant', () => {
    const { code } = fromTS(OVERLOADS, { emitTJS: true })
    expect(code).toContain('export function pick(')
  })

  it('and the dispatcher is exported and callable', () => {
    const js = tjs(fromTS(OVERLOADS, { emitTJS: true }).code, {
      runTests: false,
    }).code
    expect(js).toMatch(/export function pick\(/)
    // Exported AND still dispatching — a fix that exported a broken dispatcher would pass
    // the assertion above alone.
    const pick = new Function(js.replace(/^export /gm, '') + '\nreturn pick')()
    expect([pick('a'), pick(1, 2)]).toEqual([1, 2])
  })

  it('an UNexported group stays private (control)', () => {
    // Without this, unconditionally prefixing `export` would pass both assertions above.
    const { code } = fromTS(
      `function hidden(a: string): number
function hidden(a: number, b: number): number
function hidden(a: any, b?: any): number { return 1 }`,
      { emitTJS: true }
    )
    expect(code).not.toContain('export function hidden(')
  })
})

/**
 * A parameter property is assigned AFTER `super()`, wherever `super()` happens to be.
 *
 * TypeScript does not require `super()` to lead a derived constructor:
 *
 *     constructor(public input: unknown) {
 *       let displayed
 *       try { displayed = JSON.stringify(input) } catch { displayed = input }
 *       super(`… ${displayed}`)          // last, and legal
 *     }
 *
 * The splice looked only for a LEADING `super(`, found none, and emitted
 * `this.input = input` first — and touching `this` before `super()` is a ReferenceError.
 * ts-pattern's `NonExhaustiveError` is exactly this shape, and it was the last failure in
 * its suite; with this fixed the suite is 453/453.
 */
describe('parameter properties and a late super()', () => {
  const LATE_SUPER = `export class Boom extends Error {
  constructor(public input: unknown) {
    let displayed
    try { displayed = JSON.stringify(input) } catch (e) { displayed = input }
    super(\`no match: \${displayed}\`)
  }
}`

  it('assigns the property after the super() call', () => {
    const { code } = fromTS(LATE_SUPER, { emitTJS: true })
    expect(code.indexOf('super(')).toBeLessThan(code.indexOf('this.input'))
  })

  it('and the class actually constructs', () => {
    // The assertion above is about ordering; this is about it working. A `this` touched
    // before `super()` throws at construction, which no ordering check would notice if the
    // emitted text drifted in some other way.
    const js = tjs(fromTS(LATE_SUPER, { emitTJS: true }).code, {
      runTests: false,
    }).code
    const Boom = new Function(js.replace(/^export /gm, '') + '\nreturn Boom')()
    const e = new Boom({ a: 1 })
    expect(e.input).toEqual({ a: 1 })
    expect(e.message).toContain('no match')
    expect(e instanceof Error).toBe(true)
  })

  it('a LEADING super() still works (control)', () => {
    const js = tjs(
      fromTS(
        `export class Lead extends Error {
  constructor(public code: number) { super('x'); }
}`,
        { emitTJS: true }
      ).code,
      { runTests: false }
    ).code
    const Lead = new Function(js.replace(/^export /gm, '') + '\nreturn Lead')()
    expect(new Lead(7).code).toBe(7)
  })
})

/**
 * `any` is a TYPE, not a value — it must never reach a position that is evaluated.
 *
 * `T[]` normalised this already; `Array<T>` did not, and the two are the same type. So
 * `Array<any>` inside a type alias emitted
 *
 *     export Type Failure { example: { branch: [any] } }
 *
 * which throws `ReferenceError: any is not defined` the moment the module is imported.
 * superstruct's entire suite failed to COLLECT on it — 7 files, "no tests" — so the target
 * reported `Total: 0, Passed: 0, Failed: 0` and, until the lane learned to fail, counted as
 * a pass. With this fixed the suite is 225/225.
 */
describe('`any` never reaches a value position', () => {
  it('Array<any> becomes [null], like any[] already did', () => {
    const { code } = fromTS(
      'export type F = { branch: Array<any>, path: any[], n: Array<number> }',
      { emitTJS: true }
    )
    expect(code).toContain('branch: [null]')
    expect(code).toContain('path: [null]')
    // The control: a real element type is untouched, so this is not "replace everything".
    expect(code).toContain('n: [0.0]')
  })

  it('and the emitted module actually imports', () => {
    // The assertion above is about text; this is the property that failed. A `Type` holding
    // a bare `any` throws at module-evaluation time, which no string check would catch if
    // the shape drifted.
    const js = tjs(
      fromTS('export type F = { branch: Array<any> }', { emitTJS: true }).code,
      { runTests: false }
    ).code
    expect(() => new Function(js.replace(/^export /gm, ''))()).not.toThrow()
  })
})

/**
 * Two ways a class body was emitted wrong, both found by kysely.
 *
 * Neither is visible to a parse-rate metric in isolation — the first produced a file that
 * would not parse only because the pieces landed in the wrong order, and the second produced
 * something that parses and means something else entirely.
 */
describe('class bodies keep their shape', () => {
  it('a bodyless constructor overload is erased, not emitted empty', () => {
    // TypeScript erases overload SIGNATURES; only the implementation exists at runtime.
    // Emitting them gave `constructor(args) { }` once per signature — kysely declares two —
    // so the class had three constructors, the first two empty, and the real body was
    // detached with its `super(…)` outside any method.
    const { code } = fromTS(
      `export class K extends B {
  constructor(a: number)
  constructor(a: string)
  constructor(a: any) { super({ a }) }
}`,
      { emitTJS: true }
    )
    expect(code.match(/constructor\(/g) ?? []).toHaveLength(1)
    expect(code).toContain('super({ a })')
  })

  it('a generator body keeps `yield` as a keyword', () => {
    // The body is stripped by transpiling it, and a body ripped out of its function loses
    // what made its keywords keywords: outside a generator `yield` is an ordinary
    // identifier, so `yield {\n rows: [r],\n}` came back as `yield; { rows: [r], ; }` —
    // an expression statement plus a block with a stray label. Parses, means nothing like
    // the original.
    const { code } = fromTS(
      `export function* rows(): Generator<any> {
  yield {
    a: 1,
  }
}`,
      { emitTJS: true }
    )
    expect(code).not.toContain('yield;')
    expect(code).toContain('yield {')
  })

  it('and an async body keeps `await`', () => {
    const { code } = fromTS(
      `export async function go(): Promise<number> { const x = await f(); return x }`,
      { emitTJS: true }
    )
    expect(code).not.toContain('await;')
    expect(code).toContain('await f()')
  })

  it('a plain function body is untouched by the wrapper (control)', () => {
    // The wrap-and-peel only runs for async/generator bodies; a plain one must come through
    // the ordinary path unchanged.
    const { code } = fromTS(
      `export function add(a: number): number { return a + 1 }`,
      {
        emitTJS: true,
      }
    )
    expect(code).toContain('return a + 1')
  })
})

describe('a value binding of any shape blocks promoting a same-named type', () => {
  // TypeScript has two declaration spaces; TJS has one. So an interface that shares a name
  // with a VALUE cannot become a runtime `Type` — the emitted file would declare the
  // identifier twice. The guard for this existed; what it could not see was most of the ways
  // a value gets bound. Both shapes below are ordinary idiom, not corner cases.
  const converts = (src: string) => {
    const out = fromTS(src, { emitTJS: true, filename: 'a.ts' }).code
    expect(() => tjs(out, { runTests: false })).not.toThrow()
    return out
  }

  it('an import is a value binding', () => {
    // kysely's test-setup.ts: the class is imported and used as `new Database(...)`, the
    // interface is a schema used as `Kysely<Database>`. Legal TS, one name in each space.
    const out = converts(
      `import Database from 'better-sqlite3'\n` +
        `export interface Database { person: unknown }\n` +
        `export const open = () => new Database(':memory:')\n`
    )
    expect(out).not.toMatch(/\bType\s+Database\b/)
  })

  it('a destructured declaration binds every name in the pattern', () => {
    // effect's ShardingRegistrationEvent.ts. `d.name` here is an ObjectBindingPattern, so
    // reading it as an Identifier saw nothing at all.
    const out = converts(
      `declare const taggedEnum: any\n` +
        `export const { $match: match, EntityRegistered } = taggedEnum()\n` +
        `export interface EntityRegistered { readonly _tag: "EntityRegistered" }\n`
    )
    expect(out).not.toMatch(/\bType\s+EntityRegistered\b/)
  })

  it('the RENAMED name is the binding, not the key', () => {
    // `{ $match: match }` binds `match`. Collecting the key instead would both miss a real
    // collision on `match` and invent one on `$match`. Third instance of this distinction in
    // the converter — see the destructured-parameter rename and inference.ts.
    const out = converts(
      `declare const e: any\n` +
        `export const { $match: match } = e()\n` +
        `export interface match { a: number }\n`
    )
    expect(out).not.toMatch(/\bType\s+match\b/)
  })

  it('a type-only import is erased, so it does NOT block promotion', () => {
    // The guard must not be so broad it suppresses Types that are perfectly safe.
    const out = converts(
      `import type { Other } from './other'\n` +
        `export interface Thing { a: number }\n` +
        `export const use = (x: Other) => x\n`
    )
    expect(out).toMatch(/\bType\s+Thing\b/)
  })
})
