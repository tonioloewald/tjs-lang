/**
 * `typeof` binds to the WHOLE member expression, not just the object.
 *
 * The lowering to `TypeOf(…)` consumed only `.name` / `?.name` chains, so a COMPUTED access
 * fell outside the call:
 *
 *     typeof obj[k] !== 'function'    ->    TypeOf(obj)[k] !== 'function'
 *
 * `TypeOf(obj)` is the string `'object'`, `'object'[k]` is `undefined`, and
 * `undefined !== 'function'` is ALWAYS TRUE. Every guard of that shape silently inverted to
 * "always pass" — no parse error, no type error, no warning, and the source reads correctly.
 * Reported from an ecosystem security sweep (issue #29); reproduces back to 0.8.1.
 *
 * Calls were wrong too, though loudly: `typeof f()` became `TypeOf(f)()`, calling a string.
 *
 * Every operand shape is enumerated rather than spot-checked, because the reported case was
 * one of SIX broken forms and fixing only the reported one is this codebase's most expensive
 * recurring mistake.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** The emitted `TypeOf(...)` call for `expr`, as text. */
function lowered(expr: string): string {
  const code = tjs(
    `export function t(x, k, j, f, a, b) { return ${expr} === 'z' }\n`
  ).code
  return (code.match(/TypeOf\(.*?\) === 'z'/)?.[0] ?? '(none)').replace(
    / === 'z'$/,
    ''
  )
}

describe('typeof lowers the whole operand', () => {
  const CASES: Array<[string, string]> = [
    ['typeof x', 'TypeOf(x)'],
    ['typeof x.foo', 'TypeOf(x.foo)'],
    ['typeof x?.foo', 'TypeOf(x?.foo)'],
    // Every one of these was broken.
    ['typeof x[k]', 'TypeOf(x[k])'],
    ['typeof x[0]', 'TypeOf(x[0])'],
    [`typeof x['lit']`, `TypeOf(x['lit'])`],
    ['typeof x[k].foo', 'TypeOf(x[k].foo)'],
    ['typeof x.foo[k]', 'TypeOf(x.foo[k])'],
    ['typeof x[k][j]', 'TypeOf(x[k][j])'],
    ['typeof x[a[b]]', 'TypeOf(x[a[b]])'],
    ['typeof f()', 'TypeOf(f())'],
  ]

  for (const [src, want] of CASES) {
    it(`${src} -> ${want}`, () => {
      expect(lowered(src)).toBe(want)
    })
  }
})

describe('the guard that silently always passed', () => {
  const run = (src: string, name: string) =>
    new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()

  it('filters out functions, as written', () => {
    // The exact reproduction from the issue. Before the fix this returned all three keys.
    const keep = run(
      `export function keep(obj) {
  const out = []
  for (const k of Object.keys(obj)) { if (typeof obj[k] !== 'function') out.push(k) }
  return out
}\n`,
      'keep'
    )
    expect(keep({ a: 1, fn: () => {}, b: 2 })).toEqual(['a', 'b'])
  })

  it('a computed access still gets the typeof-null correction', () => {
    // TypeOf exists to fix `typeof null === 'object'`. Through a computed access it was not
    // being applied at all — the value never reached TypeOf.
    const t = run(`export function t(o, k) { return typeof o[k] }\n`, 't')
    expect(t({ x: null }, 'x')).toBe('null')
    // TypeOf corrects null and leaves everything else as JS reports it — an array is
    // 'object', same as native typeof. (I asserted 'array' first; that was invented.)
    expect(t({ x: [] }, 'x')).toBe('object')
  })

  it('a bracket inside a STRING is not structure', () => {
    // The operand scan runs over a masked view; a literal must not extend the operand.
    const t = run(`export function t(x) { return typeof x + '[k]' }\n`, 't')
    expect(t(1)).toBe('number[k]')
  })
})
