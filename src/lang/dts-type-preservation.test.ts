/**
 * A TypeScript type TJS cannot EXECUTE must still survive to the `.d.ts`.
 *
 * This is the reversibility half of the pitch. TJS answers conditional, mapped and
 * template-literal types with a predicate you can read and run — but for types that are
 * genuinely type-level programs, there is no predicate, and the honest move is to preserve
 * the original and hand it back to TypeScript tooling untouched. `fromTS` already writes
 * them into a `declaration { … }` block as `// TS: …`; the `.d.ts` emitter turns them back
 * into real `export type` declarations.
 *
 * Get this right and adopting TJS costs a TS consumer *nothing* in tooling fidelity, even
 * for the metaprogramming TJS declines to run. Get it wrong and every complex type in the
 * codebase silently becomes `any` — which is the outcome the whole project exists to
 * prevent, arriving through the back door.
 *
 * Two defects fixed here, both found by driving a real `fromTS` round trip:
 *   - `detectGenerics` matched only the `Generic X<T>` spelling, so after `Type X<T>`
 *     subsumed it, a parameterized `Type` emitted no declaration at all.
 *   - the `// TS:` capture terminated at the next `}`, so a type CONTAINING one was
 *     truncated: `` `/${string}/${number}` `` came back as `` `/${string ``, which is a
 *     syntax error rather than a type.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { generateDTS } from './emitters/dts'

/** Transpile TJS and emit its `.d.ts`. */
function dts(src: string): string {
  return generateDTS(tjs(src, { runTests: false }), src)
}

describe('complex TypeScript types survive to the .d.ts', () => {
  it('preserves a conditional type with `infer`', () => {
    const src = `export Generic Unwrap<T> {
  description: 'Unwrap'
  predicate(x, T) { return true }
  declaration {
    // TS: T extends Promise<infer U> ? U : T
  }
}
`
    expect(dts(src)).toContain(
      'export type Unwrap<T> = T extends Promise<infer U> ? U : T;'
    )
  })

  it('preserves a template-literal type containing braces', () => {
    // The capture used to stop at the `}` inside `${string}`, yielding
    // "export type Route = `/${string;" — not a truncated type, an invalid one.
    const src = `export Type Route {
  // TS: \`/\${string}/\${number}\`
}
`
    const out = dts(src)
    expect(out).toContain('export type Route = `/${string}/${number}`;')
    expect(out).not.toContain('`/${string;')
  })

  it('emits a parameterized type declared with the `Type` spelling', () => {
    // `Type X<T>` subsumed `Generic X<T>`; this detector knew only the old spelling, so
    // the unification silently stopped emitting declarations for the new one.
    const src = `export Type Boxed<T> {
  predicate(x, T) { return T(x.value) }
  declaration {
    value: T
    path: string
  }
}
`
    const out = dts(src)
    expect(out).toContain('export interface Boxed<T>')
    expect(out).toContain('value: T')
  })

  it('emits identical declarations for the Type and Generic spellings', () => {
    const body = `{
  predicate(x, T) { return true }
  declaration {
    // TS: T extends string ? 1 : 0
  }
}
`
    expect(dts(`export Type Same<T> ${body}`)).toBe(
      dts(`export Generic Same<T> ${body}`)
    )
  })

  it('names a declared type in a signature rather than erasing it to any', () => {
    // The runtime checks `n` against `Even`; emitting `any` throws away the one thing a
    // TypeScript consumer could still have used.
    const src = `export Type Even {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
export function double(n: Even) { return n * 2 }
`
    const out = dts(src)
    expect(out).toContain('double(n: Even)')
    expect(out).not.toContain('double(n: any)')
  })
})
