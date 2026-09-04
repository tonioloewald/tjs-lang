/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'fs'

import { join } from 'path'

import { maskLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

describe('membrane invariant — no direct reads of host values', () => {
  const source = maskLiterals(
    readFileSync(
      join('/Users/tonioloewald/tjs-lang/src/vm', 'runtime.ts'),
      'utf-8'
    )
  )
  /** The body of `membraneValue`, where the pre-walk lives. */
  const membraneBody = (() => {
    const start = source.indexOf('function membraneValue')
    expect(start, 'membraneValue must exist').toBeGreaterThan(-1)

    const next = source.indexOf('\nfunction ', start + 1)
    return source.slice(start, next === -1 ? source.length : next)
  })()
  it('never indexes the walked value directly', () => {
    const directReads = membraneBody.match(/\bv\[[^\]]+\]/g) ?? []
    expect(
      directReads,
      'read descriptors via readOwnData() instead — v[k] runs a getter'
    ).toEqual([])
  })
  it('never iterates the walked value with for…of', () => {
    const forOf = membraneBody.match(/for\s*\([^)]*\bof\s+\(?v\b[^)]*\)/g) ?? []
    expect(
      forOf,
      'iterate via the intrinsic Map/Set methods — for…of is guest-controllable'
    ).toEqual([])
  })
  it('still reaches for descriptors and the intrinsic iterators', () => {
    expect(membraneBody).toMatch(/readOwnData\(/)
    expect(source).toMatch(/Object\.getOwnPropertyDescriptor/)
    expect(membraneBody).toMatch(/Map\.prototype\.entries\.call/)
    expect(membraneBody).toMatch(/Set\.prototype\.values\.call/)
  })
})
export {}
