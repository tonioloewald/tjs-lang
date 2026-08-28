/**
 * An IMPORTED Type works in annotation position, not just as a value (#46).
 *
 * `declaredTypes` is populated per-module, so an imported name was not promotable and the
 * annotation degraded to `any`. Measured before the fix:
 *
 *     called(50)      -> true     the predicate crossed the module boundary
 *     annotated(500)  -> 500      the TYPE did not — unchecked, with a warning
 *
 * That is the difference between publishing predicate HELPERS and publishing a type
 * LIBRARY, and it capped `Matches`/`Range`/`Within` at being built-ins nobody else could
 * write: a user could define `Within`, export it, and consumers could only ever call it.
 *
 * Checked at RUNTIME rather than resolved statically, deliberately. Knowing the type at
 * build time needs cross-module analysis; the alternative to paying for a runtime check is
 * degrading to `any`, which is how the gap went unnoticed. Runtime overhead was always the
 * price of not degrading.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Transpile two modules and link them by hand — no filesystem, no import resolution. */
function link(lib: string, use: string, name: string) {
  const libJs = tjs(lib).code.replace(/^export /gm, '')
  // Drop the import: the library's declarations are concatenated into one scope below, and
  // the emitted preamble is per-module (two would collide on `__tjs`).
  const useJs = tjs(use)
    .code.replace(/^import[^\n]*\n/gm, '')
    .replace(/^export /gm, '')
  const libDecls = libJs.replace(/^const __tjs[\s\S]*?;\n/m, '')
  return new Function(`${useJs}\n${libDecls}\nreturn ${name}`)()
}

const LIB = `export Type Within100 {
  description: 'a number from 0 to 100'
  predicate(v) { return typeof v === 'number' && v >= 0 && v <= 100 }
}
`
const isErr = (v: unknown) =>
  !!v && typeof v === 'object' && (v as any).name === 'MonadicError'

describe('an imported Type is honoured in type position', () => {
  const USE = `import { Within100 } from './mymath'

export function pct(v: Within100):! 0 { return v }
`

  it('emits a runtime check rather than degrading to any', () => {
    const code = tjs(USE).code
    expect(code).toContain('Within100.check')
  })

  it('no longer warns that the name could not be resolved', () => {
    // The old warning also gave misleading advice — it suggested declaring a Type when one
    // IS declared, just in another module.
    const w = (tjs(USE).warnings ?? []).filter((m) =>
      String(m).includes('could not be resolved')
    )
    expect(w).toEqual([])
  })

  it('accepts a conforming value and rejects the rest', () => {
    const pct = link(LIB, USE, 'pct')
    expect(pct(50)).toBe(50)
    expect(isErr(pct(500))).toBe(true)
    expect(isErr(pct('x'))).toBe(true)
  })

  it('degrades rather than throwing when the import is not a runtime type', () => {
    // An imported binding might be a plain function or a value. The shape guard means that
    // is UNCHECKED, not a crash — a legal JS ordering must not become an error (TJS ⊇ JS).
    const use = `import { helper } from './util'

export function f(v: helper):! 0 { return 1 }
`
    const f = new Function(
      tjs(use)
        .code.replace(/^import[^\n]*\n/gm, '')
        .replace(/^export /gm, '') + '\nconst helper = () => {}\nreturn f'
    )()
    expect(() => f('anything')).not.toThrow()
    expect(f('anything')).toBe(1)
  })

  it('a LOCAL declaration still takes the static path', () => {
    // The control: promoting imports must not change how in-module types are handled, which
    // are resolved statically and guarded by their hoisted sentinel.
    const code = tjs(
      `Type Local { example: 0.0 }\nexport function f(v: Local):! 0 { return 1 }`
    ).code
    expect(code).toContain('__tjs_has_Local')
  })
})
