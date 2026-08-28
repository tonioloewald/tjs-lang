/**
 * A union of DECLARED types validates — and a union with an unresolvable member doesn't
 * pretend to (#45).
 *
 * `s: Circle | Rect` emitted no check and no warning. A bare `s: Circle` validated
 * correctly the whole time, which is what made it invisible: the feature looked present and
 * was absent exactly where discriminated unions need it.
 *
 * The cause was one loop reading only the TOP-LEVEL `unresolved` marker, so a union's
 * members were never promoted from "unknown identifier" to "declared type", and the warning
 * branch never fired either. Both check generators already existed.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, name: string) =>
  new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()

const SHAPES = `Type Circle { example: { kind: 'circle', r: 0.0 } }
Type Rect { example: { kind: 'rect', w: 0.0, h: 0.0 } }
`
const isErr = (v: unknown) =>
  !!v && typeof v === 'object' && (v as any).name === 'MonadicError'

describe('a union of declared types is enforced', () => {
  const f = load(
    SHAPES + `export function tag(s: Circle | Rect):! '' { return s.kind }\n`,
    'tag'
  )

  it('accepts every member', () => {
    expect(f({ kind: 'circle', r: 2 })).toBe('circle')
    expect(f({ kind: 'rect', w: 1, h: 2 })).toBe('rect')
  })

  it('rejects a value matching NEITHER member', () => {
    expect(isErr(f({ kind: 'tri', a: 1 }))).toBe(true)
    expect(isErr(f(42))).toBe(true)
  })

  it('returns a MonadicError for null rather than THROWING', () => {
    // This was the sharpest half: an unchecked union parameter reached `s.kind` and threw a
    // raw TypeError, contradicting the language's central promise that errors are returned.
    let out: unknown
    expect(() => {
      out = f(null)
    }).not.toThrow()
    expect(isErr(out)).toBe(true)
  })

  it('three-member unions work — the nesting case', () => {
    // `A | B | C` parses as union(A, union(B, C)), so promotion has to recurse.
    const g = load(
      SHAPES +
        `Type Tri { example: { kind: 'tri', a: 0.0 } }\n` +
        `export function tag3(s: Circle | Rect | Tri):! '' { return s.kind }\n`,
      'tag3'
    )
    expect(g({ kind: 'tri', a: 1 })).toBe('tri')
    expect(g({ kind: 'circle', r: 1 })).toBe('circle')
    expect(isErr(g({ kind: 'hex' }))).toBe(true)
  })
})

describe('an unresolvable member degrades the WHOLE union, loudly', () => {
  const src =
    SHAPES + `export function g(s: Circle | Missing):! 0 { return 1 }\n`

  it('checks nothing rather than checking only the known member', () => {
    // Member checks are FAILURE conditions ANDed together, so dropping an uncheckable
    // member makes the union STRICTER — it would reject values that member allowed.
    // Silently narrowing a type is worse than not checking it, and it would break
    // TJS ⊇ JS by making legal code return errors.
    expect(load(src, 'g')({ kind: 'rect', w: 1, h: 2 })).toBe(1)
  })

  it('warns, naming the member and how to fix it', () => {
    const w = (tjs(src).warnings ?? []).filter((m) =>
      String(m).includes('could not be resolved')
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('Missing')
    expect(w[0]).toContain('WHOLE union is unchecked')
  })
})

describe('the forms that already worked still do', () => {
  it('a single declared type', () => {
    const f = load(
      SHAPES + `export function h(s: Circle):! 0 { return 1 }`,
      'h'
    )
    expect(f({ kind: 'circle', r: 1 })).toBe(1)
    expect(isErr(f({ nope: 1 }))).toBe(true)
  })

  it('a literal union', () => {
    const f = load(`export function m(x: 'a' | 'b'):! '' { return x }`, 'm')
    expect(f('a')).toBe('a')
    expect(isErr(f('z'))).toBe(true)
  })

  it('a declared Union', () => {
    const f = load(
      `Union Direction 'a cardinal direction' { 'up', 'down' }\n` +
        `export function go(d: Direction):! '' { return d }`,
      'go'
    )
    expect(f('up')).toBe('up')
    expect(isErr(f('sideways'))).toBe(true)
  })
})
