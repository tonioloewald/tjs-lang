/**
 * Firestore values reach a security rule as PLAIN data (tjs-lang 0.14 final re-review 2, M-2).
 *
 * The sandbox now refuses a class instance instead of copying its own fields — which read a
 * Timestamp's `seconds` getter as undefined and flipped a negated rule from deny to ALLOW.
 * Rules read `doc.createdAt.seconds`, so the conversion keeps those fields.
 */
import { describe, it, expect } from 'bun:test'
import { plainData } from './rbac.tjs'
import { Timestamp, GeoPoint } from 'firebase-admin/firestore'

describe('plainData', () => {
  it('a Timestamp keeps the fields rules read', () => {
    const t = new Timestamp(50, 7)
    expect(plainData({ doc: { createdAt: t } })).toEqual({
      doc: { createdAt: { seconds: 50, nanoseconds: 7 } },
    })
  })
  it('a GeoPoint, nested in an array', () => {
    expect(plainData({ at: [new GeoPoint(1, 2)] })).toEqual({
      at: [{ latitude: 1, longitude: 2 }],
    })
  })
  it('plain data and Dates pass through; an unknown class is left for the boundary to refuse', () => {
    class Weird {
      x = 1
    }
    const d = new Date(0)
    const w = new Weird()
    const out: any = plainData({ a: 1, d, w, n: null })
    expect(out.a).toBe(1)
    expect(out.d).toBe(d)
    expect(out.w).toBe(w)
    expect(out.n).toBe(null)
  })
})
