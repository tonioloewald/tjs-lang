/**
 * An anonymous `export default function` gets its metadata, and the module loads.
 *
 * The emitter names a function by `func.id`, and an anonymous default export has none, so
 * every name-based site fell back to the literal `anonymous`: the metadata came out as
 * `anonymous.__tjs = {…}`, a ReferenceError the moment the module evaluated. Any `.tjs` or
 * converted `.ts` file with `export default function (…)` could not be imported — which is
 * how 105 of zod's test suites failed to load (every zod locale ends that way).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

function load(src: string) {
  const saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
  try {
    const js = tjs(src, { runTests: false }).code
    // Drop `export default` and return the declaration by the name it binds — which is what
    // the module's own metadata line needs to resolve, so a missing binding fails here.
    const name = js.match(
      /^export default (?:async\s+)?function\s*\*?\s*(?:\/\*[\s\S]*?\*\/\s*)*([\w$]+)/m
    )?.[1]
    if (!name) throw new Error('the default export binds no name')
    return new Function(
      js.replace(/^export default /m, '') + `\nreturn ${name}`
    )()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

describe('anonymous export default function', () => {
  it('loads, validates, and carries metadata', () => {
    const f = load('export default function (x: 0) { return x + 1 }')
    expect(f(1)).toBe(2)
    expect(isMonadicError(f('x'))).toBe(true)
    expect(f.__tjs.params.x.type.kind).toBe('integer')
  })

  it('keeps the name JavaScript gives it', () => {
    expect(load('export default function (x: 0) { return x }').name).toBe(
      'default'
    )
  })

  it('async and generator forms load too', () => {
    expect(() =>
      load('export default async function (x: 0) { return x }')
    ).not.toThrow()
    expect(() =>
      load('export default function* (x: 0) { yield x }')
    ).not.toThrow()
  })

  it('a NAMED default export is unchanged (control)', () => {
    const f = load('export default function inc(x: 0) { return x + 1 }')
    expect(f.name).toBe('inc')
    expect(f.__tjs.params.x.type.kind).toBe('integer')
  })
})

describe('anonymous export default — what it publishes', () => {
  it('its metadata is keyed `default`, the name a consumer imports', () => {
    const r = tjs('export default function (x: 0) { return x }', {
      runTests: false,
    })
    expect(Object.keys(r.types)).toEqual(['default'])
  })

  it('its .d.ts declares a default export, not a named one', async () => {
    const { generateDTS } = await import('./emitters/dts')
    for (const src of [
      'export default function (x: 0) { return x }',
      'export default async function (x: 0) { return x }',
    ]) {
      const dts = generateDTS(tjs(src, { runTests: false }), src).trim()
      expect(dts).toBe('export default function(x: number): any;')
    }
  })

  it('`export async function` is declared exported (it was missed)', async () => {
    const { generateDTS } = await import('./emitters/dts')
    const src = 'export async function g(x: 0) { return x }'
    expect(generateDTS(tjs(src, { runTests: false }), src)).toContain(
      'export declare function g('
    )
  })

  it('a `(` inside a comment before the params does not capture the name', () => {
    // Untyped: a comment before a TYPED parameter list is a separate parser gap (TODO.md).
    const f = load('export default function /* ( */ (x) { return x + 1 }')
    expect(f(1)).toBe(2)
  })
})

describe('anonymous export default keeps its RETURN type (0.14.0 final review, m-3)', () => {
  it('in types.default, in the .d.ts, and error paths say `default`', async () => {
    const { generateDTS } = await import('./emitters/dts')
    const src = 'export default function (a: 0): 0 { return a }'
    const r = tjs(src)
    expect(JSON.stringify((r.types as any).default.returns)).toContain(
      'integer'
    )
    expect((r.types as any).default.name).toBe('default')
    expect(generateDTS(r, src).trim()).toBe(
      'export default function(a: number): number;'
    )
    const saved = (globalThis as any).__tjs
    ;(globalThis as any).__tjs = createRuntime()
    try {
      const f = new Function(
        r.code.replace(/export default /, '') + '\nreturn __tjs_default'
      )()
      const e = f('x')
      expect(isMonadicError(e)).toBe(true)
      expect(e.message).toContain('default.a')
      expect(e.message).not.toContain('__tjs_default')
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })
})
