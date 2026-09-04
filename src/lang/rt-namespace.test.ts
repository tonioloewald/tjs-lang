/**
 * The emitted runtime lives in `__tjs_rt`, and generated code reaches it only through that.
 *
 * GUARDRAIL. This encodes a promise rather than a behaviour: **emitted code must never put
 * a helper into the author's namespace where it can collide.** For a long time it did —
 * `Eq`, `Is`, `Type`, `MonadicError` and ten more were declared at module scope — so a file
 * that imported any of them and also used the syntax that generates it was a duplicate
 * declaration, and Node refused to load the module at all (#39). Ten of this repo's own
 * suites were in exactly that state; because the failure happens BEFORE any code runs, the
 * dogfood gate scored them as six broken tests rather than the ~760 lost assertions they
 * really were.
 *
 * Three properties, and each one is load-bearing in a different direction:
 *
 *   1. A name the author binds is never re-declared by us      (the collision itself)
 *   2. A name the author does NOT bind is still available      (the ambient surface —
 *      `Is(a, b)` and friends are documented as simply there, and moving the declarations
 *      inside the IIFE would have deleted that quietly)
 *   3. Everything declared inside the IIFE is reachable        (a helper that is not
 *      exported is a `ReferenceError` at first call, which is the failure this change
 *      exists to remove, reintroduced one layer down)
 *
 * If one of these goes red, the invariant broke — reason about it before touching the
 * expectation.
 */
import { describe, it, expect } from 'bun:test'
import { parse } from 'acorn'
import { tjs } from './index'
import { RT_NS, RT_NAMES } from './rt-namespace'

const parseModule = (code: string) =>
  parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as any

/** A file that pulls in as much of the inline runtime as one file can. */
const KITCHEN_SINK = [
  `Type Age 0`,
  `Enum Color 'a colour' {\n  Red: 'red'\n  Green: 'green'\n}`,
  `Union Dir 'up' | 'down'`,
  `Generic Box<T> {\n  description: 'a box'\n  predicate(x, T) { return T(x) }\n}`,
  `FunctionPredicate Cb { params: { x: 0 }, returns: false }`,
  `export function f(a: 0, b: 0): false {`,
  `  const t = typeof a`,
  `  const u = a Is b`,
  `  const w = a IsNot b`,
  `  const y = DangerousLegacyEquals(a, b)`,
  `  const z = LegacyExactly(a, b)`,
  `  return a != b`,
  `}`,
].join('\n')

describe('the emitted runtime never lands in the author’s namespace', () => {
  it('a name the author binds is not re-declared (the #39 reproduction)', () => {
    // The exact reported shape: import a runtime name, then use the syntax that generates
    // it. Before the fix this emitted `function Eq(…)` beside `import { Eq }` and died with
    // `SyntaxError: Identifier 'Eq' has already been declared`.
    const code = tjs(
      `import { Eq, Is } from 'tjs-lang/runtime'\n` +
        `export function same(a: 0, b: 0): true { return a == b }\n` +
        `export function deep(x: [0], y: [0]): true { return x Is y }\n`
    ).code
    expect(() => parseModule(code)).not.toThrow()
    // …and the generated calls went to the namespace, not to the author's import. That
    // second half matters: suppressing the alias without redirecting the call sites would
    // silently hand our `==` lowering to whatever the author imported.
    expect(code).toContain(`${RT_NS}.Eq(`)
    expect(code).toContain(`${RT_NS}.Is(`)
  })

  it('a top-level declaration of the same name is equally respected', () => {
    const code = tjs(
      `function Type(x) { return x }\n` +
        `export function f(a: 0, b: 0): true { return a == b }\n` +
        `export const t = Type(1)\n`
    ).code
    expect(() => parseModule(code)).not.toThrow()
  })

  it('but a NESTED binding does not cost the file its ambient name', () => {
    // Scope matters. A parameter named `Is` shadows only inside that function, so the
    // module-scope alias is still safe to emit — and still needed by the call below.
    const code = tjs(
      `function helper(Is) { return Is }\n` +
        `export function f(a: [0], b: [0]): true { return Is(a, b) }\n`
    ).code
    const fn = new Function(
      code.replace(/^export /gm, '') + '\nreturn f'
    )() as any
    expect([fn([1], [1]), fn([1], [2])]).toEqual([true, false])
  })

  it('the ambient surface still works with no import at all', () => {
    // `Is`/`IsNot`/`DangerousLegacyEquals` and the type constructors are documented as
    // simply available (CLAUDE-TJS-SYNTAX.md). Moving them inside the IIFE without aliasing
    // them back out would have removed a documented part of the language.
    const code = tjs(
      `export function f(a: [0], b: [0]): false { return IsNot(a, b) }\n` +
        `export function g(a: 0, b: '') { return DangerousLegacyEquals(a, b) }\n`
    ).code
    const m = new Function(
      code.replace(/^export /gm, '') + '\nreturn { f, g }'
    )() as any
    expect(m.f([1], [2])).toBe(true)
    expect(m.g(0, '')).toBe(true) // JS coercion, by explicit request
  })

  it('every name declared inside the IIFE is reachable through the namespace', () => {
    const code = tjs(KITCHEN_SINK, { runTests: false }).code
    const program = parseModule(code)

    // Find `const __tjs_rt = (() => { … })()` and read its body.
    let body: any[] | null = null
    let returned: string[] | null = null
    for (const stmt of program.body) {
      if (stmt.type !== 'VariableDeclaration') continue
      const d = stmt.declarations[0]
      if (d?.id?.name !== RT_NS) continue
      const arrow = d.init?.callee
      body = arrow?.body?.body ?? null
      const ret = body?.find((n: any) => n.type === 'ReturnStatement')
      returned = (ret?.argument?.properties ?? []).map((p: any) => p.key.name)
    }
    expect(body).not.toBeNull()

    const declared = new Set<string>()
    for (const n of body!) {
      if (n.type === 'FunctionDeclaration' && n.id) declared.add(n.id.name)
      if (n.type === 'VariableDeclaration')
        for (const d of n.declarations)
          if (d.id.type === 'Identifier') declared.add(d.id.name)
    }

    // Implementation details of an exported helper, reached only from inside the IIFE.
    // Each is listed WITH ITS REASON — an unexplained exemption is a silent hole.
    const PRIVATE: Record<string, string> = {
      __arrKinds: 'builds the "array of X | Y" string for typeError',
      __goIs: 'the recursive worker behind Is',
      __ex2js: 'example -> JSON Schema, reached via a Type’s .toJSONSchema()',
      __match: 'structural matcher, reached via Type/Generic .check()',
      __stack: 'the call-stack ring buffer itself',
      __stackSize: 'ring capacity',
      __stackHead: 'ring cursor',
      __stackCount: 'ring occupancy',
      __swNaN: 'the NaN sentinel swKey returns',
    }

    // Apparatus check FIRST. An empty or near-empty preamble would make the assertion below
    // pass while proving nothing, and a fixture that stops exercising a construct is
    // exactly how that happens quietly.
    expect(
      ['Eq', 'NotEq', 'Is', 'IsNot', 'TypeOf', 'Type', 'Generic'].filter(
        (n) => !declared.has(n)
      )
    ).toEqual([])

    const unreachable = [...declared].filter(
      (n) => !returned!.includes(n) && !(n in PRIVATE)
    )
    expect(unreachable).toEqual([])
  })

  it('no runtime name is declared at module scope', () => {
    const code = tjs(KITCHEN_SINK, { runTests: false }).code
    const program = parseModule(code)

    // The aliases ARE module-scope `const`s — that is the point of them — so what this
    // asserts is narrower and more useful: nothing is DEFINED there. An alias reads its
    // value off the namespace; a `function Eq(…)` or a `const Eq = Symbol…` would be a
    // second definition, which is what used to collide.
    const defined: string[] = []
    for (const stmt of program.body) {
      if (stmt.type === 'FunctionDeclaration' && stmt.id)
        defined.push(stmt.id.name)
      if (stmt.type === 'VariableDeclaration')
        for (const d of stmt.declarations) {
          if (d.id.type !== 'Identifier') continue
          const init = d.init
          const isAlias =
            init?.type === 'MemberExpression' && init.object?.name === RT_NS
          if (!isAlias) defined.push(d.id.name)
        }
    }
    expect(
      defined.filter((n) => (RT_NAMES as readonly string[]).includes(n))
    ).toEqual([])
  })
})
