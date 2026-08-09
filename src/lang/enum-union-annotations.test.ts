/**
 * A declared `Enum` or `Union` is a runtime type, and an annotation naming one is CHECKED.
 *
 * It wasn't. `transformEnumDeclarations` and `transformUnionDeclarations` never received
 * `declaredTypes`, so `function f(c: Color)` degraded to `any`, emitted no guard, and
 * warned that `Color` "could not be resolved to a runtime type" — the type declared three
 * lines above it. `Color.check()` worked correctly the whole time; nothing ever asked it.
 *
 * Exactly the hole `Type`/`Generic` had, in the two sibling transforms nobody updated —
 * the "where else?" lens, which this repo added to its review checklist for this reason.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const build = (src: string, names: string[]) => {
  const r = tjs(src, { filename: 'eu.tjs', runTests: false })
  return {
    ...(new Function(`${r.code}\nreturn { ${names.join(', ')} }`)() as any),
    warnings: r.warnings ?? [],
  }
}
const rejected = (v: unknown) => String(v).startsWith('MonadicError')

const COLOR = `Enum Color 'a css color' {\n  Red = 'red'\n  Green = 'green'\n}\n`

describe('Enum annotations are enforced', () => {
  it('rejects a non-member and accepts a member', () => {
    const m = build(`${COLOR}function f(c: Color) { return c }`, ['f'])
    expect(m.f('red')).toBe('red')
    expect(rejected(m.f('mauve'))).toBe(true)
  })

  it('does not warn that its own declared type is unresolvable', () => {
    // The warning was the tell: it suggested declaring a type the file had declared.
    const m = build(`${COLOR}function f(c: Color) { return c }`, ['f'])
    expect(m.warnings.filter((w: string) => w.includes('Color'))).toEqual([])
  })

  it('carries `members`, `names` and `keys` in EMITTED code', () => {
    // The real `Enum` documents `Color.members.Red` as the way to reference a member, and
    // the inline stub carried only `values` — so the documented access returned undefined
    // in every emitted file. The stub always wins in emitted code, so a field it omits is
    // a field the language does not have (docs/type-identity.md).
    const m = build(COLOR, ['Color'])
    expect(m.Color.members.Red).toBe('red')
    expect(m.Color.names.red).toBe('Red')
    expect(m.Color.keys).toEqual(['Red', 'Green'])
  })
})

describe('Union annotations are enforced', () => {
  it('rejects a value outside the union', () => {
    const m = build(
      `Union Small 'small' { 1 | 2 }\nfunction f(n: Small) { return n }`,
      ['f']
    )
    expect(m.f(1)).toBe(1)
    expect(rejected(m.f(9))).toBe(true)
  })
})
