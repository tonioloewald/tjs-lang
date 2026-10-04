import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { maskLiterals } from '../strip-comments'

/**
 * The membrane never reads a host value directly. Enforced by reading the source.
 *
 * This invariant was previously held by REMEMBERING, and remembering failed three times in
 * a row on the same walk: the object branch read `v[k]`, the array branch read `v[i]` (the
 * identical defect, fixed one morning later in the twin nobody looked at), and the
 * collection branch used `for (const … of v)` — which consults a guest-controllable
 * `Symbol.iterator` while `structuredClone` reads the internal slots, so a lying `Map`
 * subclass presented itself as empty and carried 20,000 entries past a 1KB budget.
 *
 * A behavioural test can only catch the shapes someone thought to write down. This catches
 * the SHAPE OF THE MISTAKE, so a fourth branch added later cannot reintroduce it quietly.
 * It is deliberately a source-level check: there is no runtime observation that
 * distinguishes "did not read a getter" from "there was no getter to read".
 *
 * If this fails, do not relax the pattern — route the new branch through `readOwnData()`
 * (descriptors, accessors rejected) and the intrinsic iterator methods.
 */
describe('membrane invariant — no direct reads of host values', () => {
  // Scanned with comments and string literals blanked. Necessary, and pleasingly
  // self-demonstrating: the first version of this test failed against a correct
  // implementation, because it matched the PROSE explaining why `v[k]` is forbidden. A
  // scanner that does not understand comments finds what it is looking for inside the
  // documentation of the thing it is looking for — the exact defect class this release
  // spent its largest change consolidating away.
  const source = maskLiterals(
    readFileSync(join(import.meta.dir, 'runtime.ts'), 'utf-8')
  )

  /**
   * The body of `membraneValue` AND the helpers the walk runs: the walked value is read in all of
   * them. (This used to scan `membraneValue` only, so `readArrayData`'s `v.length`, an ordinary
   * read whose result reached the Array constructor, went unseen: cumulative review 17.)
   */
  const bodyOf = (name: string) => {
    const start = source.indexOf(`function ${name}(`)
    expect(start, `${name} must exist`).toBeGreaterThan(-1)
    const next = source.indexOf('\nfunction ', start + 1)
    return source.slice(start, next === -1 ? source.length : next)
  }
  const membraneBody = bodyOf('membraneValue')
  const walkBodies = [
    'membraneValue',
    'readArrayData',
    'readOwnData',
    'dateTime',
  ]
    .map(bodyOf)
    .join('\n')

  /** Ordinary reads of the walked value `v`: `v.x`, `v?.x`, `v[k]`, and the same through a cast. */
  const ordinaryReads = (text: string) =>
    text.match(
      /(\bv|\(v as [^)]*\))(\?\.|\.)[A-Za-z_$][\w$]*|(\bv|\(v as [^)]*\))\[[^\]]+\]/g
    ) ?? []

  it('the scan catches every shape of ordinary read (apparatus)', () => {
    expect(
      ordinaryReads(
        'const a = v.length; const b = v?.x; const c = v[k]; f(v); g((v as any).length); h((v as T)[i])'
      )
    ).toEqual(['v.length', 'v?.x', 'v[k]', '(v as any).length', '(v as T)[i]'])
  })

  it('never reads the walked value by ordinary access, in the walk or its helpers', () => {
    expect(
      ordinaryReads(walkBodies),
      'read through Object.getOwnPropertyDescriptor and the intrinsics: an ordinary read runs a getter or a Proxy trap, and its result was not walked'
    ).toEqual([])
  })

  it('never indexes the walked value directly', () => {
    // `v[k]`, `v[i]`, `v[key]` — any computed read of the value under inspection.
    const directReads = membraneBody.match(/\bv\[[^\]]+\]/g) ?? []
    expect(
      directReads,
      'read descriptors via readOwnData() instead — v[k] runs a getter'
    ).toEqual([])
  })

  it('never iterates the walked value with for…of', () => {
    // `for (const x of v)` / `for (const [k, v2] of v as Map<…>)` dispatch to the object's
    // own Symbol.iterator. Use `Map.prototype.entries.call(v)` and drive `.next()`.
    const forOf = membraneBody.match(/for\s*\([^)]*\bof\s+\(?v\b[^)]*\)/g) ?? []
    expect(
      forOf,
      'iterate via the intrinsic Map/Set methods — for…of is guest-controllable'
    ).toEqual([])
  })

  it('still reaches for descriptors and brand checks', () => {
    // The positive control: a pass that deleted the walk entirely would satisfy both
    // checks above. Assert the safe machinery is actually present. (Since round 39 Map and Set
    // are REFUSED rather than walked, so the intrinsic-iterator assertions became a Date brand
    // assertion: Tonio, 2026-10-04.)
    expect(membraneBody).toMatch(/readOwnData\(/)
    expect(membraneBody).toMatch(/readArrayData\(/)
    expect(source).toMatch(/Object\.getOwnPropertyDescriptor/)
    expect(source).toMatch(/DATE_GET_TIME\.call/)
  })

  it('builds its own copy: no structuredClone (round 39)', () => {
    // structuredClone copies internal SLOTS the walk never sees, so what was checked and what
    // was forwarded were two representations (cumulative review 13). The membrane builds the
    // copy from exactly what it read.
    expect(membraneBody).not.toMatch(/structuredClone/)
  })
})
