/**
 * The parser's per-parameter side channels are keyed so one function cannot affect another.
 *
 * Two facts live only in the parser, because the AST cannot carry them:
 *
 *   - `n?: number` is rewritten to `n = number` so acorn can parse it and inference can
 *     read the type off the identifier — but that default is a DANGLING REFERENCE, and the
 *     emitter must delete it. `n?: MyThing` and `x = someVar` produce byte-identical AST.
 *   - `{a: 2}` marks a destructured member REQUIRED, and the example must not survive as a
 *     default, or "required" means nothing.
 *
 * Both were recorded in a set keyed by bare NAME, for the whole module. A name is not a
 * function-scoped identifier, so `function a(n?: number)` reached into `function b(n = 5)`
 * and deleted a default it had no business touching — emitting `function b(n)`, silently,
 * with no warning and no recorder entry.
 *
 * That is a `PRINCIPLES.md` violation, not merely a bug: `function b(n = 5)` is legal
 * JavaScript, TJS ⊇ JS, and its MEANING changed. `b()` returned `undefined` instead of 5.
 *
 * The tests below deliberately use TWO functions. A single-function test passes under both
 * the broken and the fixed implementation, which is exactly how this shipped.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const compile = (src: string) =>
  tjs(src, { filename: 't.tjs', runTests: false }).code
const load = (src: string, name: string) =>
  new Function(`${compile(src)}\nreturn ${name}`)()

describe('a type-name optional does not delete another function default', () => {
  /**
   * Every case here defaults to an IDENTIFIER, deliberately.
   *
   * The emitter only deletes when the default is an `Identifier` — `n = 5` is a `Literal`
   * and was never at risk. A first draft of these tests used literal defaults and passed
   * against the BROKEN implementation, which is exactly how a name-keyed side channel
   * survives a 3,500-test suite.
   */
  it('keeps a genuine default in a sibling function', () => {
    const src = `
const fallback = 7
function a(n?: number) { return n }
function b(n = fallback) { return n }
`
    expect(load(src, 'b')()).toBe(7)
  })

  it('still deletes the dangling annotation in the function that has it', () => {
    // The other direction. Over-narrowing the key would leave `n = number` in the output,
    // and `a()` would throw `number is not defined` — the defect the side channel exists
    // to prevent. Both directions, or the fix is half a fix.
    const src = `
const fallback = 7
function a(n?: number) { return n }
function b(n = fallback) { return n }
`
    expect(() => load(src, 'a')()).not.toThrow()
    expect(load(src, 'a')()).toBe(undefined)
  })

  it('holds for an arrow function', () => {
    const src = `
const fallback = 7
function a(n?: number) { return n }
const b = (n = fallback) => n
`
    expect(load(src, 'b')()).toBe(7)
  })

  it('holds for a class method', () => {
    const src = `
const greeting = 'hi'
function a(value?: string) { return value }
class C {
  m(value = greeting) { return value }
}
`
    const C = load(src, 'C')
    expect(new C().m()).toBe('hi')
  })
})

/**
 * Class methods get the parameter rewrites at all.
 *
 * A SEPARATE defect from the name-keyed side channel above, found while testing it and
 * worse in kind: no collision is needed. `findAllFunctions` collects declarations, exports
 * and named arrows — never methods — so the deletion loop never saw one, and
 * `m(value?: string)` shipped as `m(value = string)`. That throws `string is not defined`
 * on the happy path, from the shape a TypeScript author pastes first.
 */
describe('class method parameters are rewritten like function parameters', () => {
  const C = () =>
    load(
      `
class C {
  optional(value?: string) { return value }
  required(x: 0) { return x }
  defaulted(n = 3) { return n }
}
`,
      'C'
    )

  it('an optional type-name annotation does not become a dangling default', () => {
    expect(new (C())().optional()).toBe(undefined)
  })

  it('a required annotation does not become a silent default', () => {
    // `x: 0` is an example, not a default. Left in place, `required()` would return 0
    // instead of reporting a missing argument.
    expect(new (C())().required(5)).toBe(5)
  })

  it('a genuine default is left alone', () => {
    expect(new (C())().defaulted()).toBe(3)
  })
})

describe('a required destructured member does not delete a sibling default', () => {
  it('keeps a defaulted member in another function', () => {
    // The sibling site: the same name-keyed lookup, one branch higher in the same loop.
    // `{x: 2}` marks x required in `a`; `b`'s `{x = 5}` is a genuine default.
    const src = `
function a({x: 2}) { return x }
function b({x = 5}) { return x }
`
    expect(load(src, 'b')({})).toBe(5)
  })

  it('still enforces required in the function that declared it', () => {
    const src = `
function a({x: 2}) { return x }
function b({x = 5}) { return x }
`
    const a = load(src, 'a')
    // Absent required member → MonadicError, not a silent default to the example.
    expect(String(a({}))).toContain('Error')
  })
})
