/**
 * The `Predicate` global slot: adopt ANY constructor, refuse only what cannot possibly be one.
 *
 * The decision (docs/runtime-fusion.md §7, maintainer, 2026-09-25): the slot takes the same trust
 * model as `MonadicError`. Validating what is found there would be security theatre — code that
 * runs before tjs-lang can build a class passing any structural check, and could as easily
 * patch `Function.prototype` itself — and it would have a real cost: a rejected slot splits the
 * brand per bundle, silently bringing back the 0.14.0 review's B2.
 *
 * The one guard that is NOT theatre is against an honest accident: something that is not a
 * constructor at all sitting under our exact key. Adopting it would break every predicate at
 * once, at the first `brandPredicate`, with an error naming nothing useful. So that case — and
 * only that case — falls back to the local class and says so in the flight recorder.
 *
 * Subprocesses, because the slot is read once, at module load: each case needs a fresh module
 * instance with the global seeded BEFORE the import.
 */
import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const BRAND = join(import.meta.dir, 'predicate-brand.ts')

function inFresh(preamble: string, body: string): any {
  const src = `${preamble}\nconst m = await import(${JSON.stringify(
    BRAND
  )})\n${body}`
  // cwd OUTSIDE the repo: this repo's bunfig.toml preloads the tjs plugin, which imports the
  // brand and claims the slot before a `-e` script runs — so a seed set by the script would
  // arrive too late and every case would measure the preload instead.
  const r = spawnSync('bun', ['-e', src], { encoding: 'utf8', cwd: tmpdir() })
  if (r.status !== 0) throw new Error(r.stderr || `exit ${r.status}`)
  return JSON.parse(r.stdout.trim().split('\n').pop()!)
}

const PROBE = `
const f = m.brandPredicate((v) => v === 1, 'one')
console.log(JSON.stringify({
  predicateIsFn: typeof m.Predicate === 'function',
  branded: f instanceof m.Predicate,
  decides: [f(1), f(2)],
  adoptedSeed: globalThis.__seed === undefined ? null : m.Predicate === globalThis.__seed,
  records: globalThis.__recs ?? [],
}))`

const RECORDER = `globalThis.__recs = []; globalThis.__tjs = { record: (e) => globalThis.__recs.push(e.message) }`

describe('the Predicate slot', () => {
  it('empty: claims it with the local class — the ordinary case', () => {
    const r = inFresh(RECORDER, PROBE)
    expect(r).toMatchObject({
      predicateIsFn: true,
      branded: true,
      decides: [true, false],
    })
    expect(r.records).toEqual([])
  })

  it('ANY constructor already there is adopted — no validation, by decision', () => {
    // Deliberately a class with nothing in common with ours: the point is that we do not check.
    const seed = `class Other {}; Object.setPrototypeOf(Other.prototype, Function.prototype)
globalThis.__seed = Other; globalThis.__tjs_Predicate_1 = Other`
    const r = inFresh(`${RECORDER}\n${seed}`, PROBE)
    expect(r).toMatchObject({
      adoptedSeed: true,
      branded: true,
      decides: [true, false],
    })
    expect(r.records).toEqual([])
  })

  for (const [label, value] of [
    ['a number', '42'],
    ['a plain object', '{}'],
    ['a string', "'Predicate'"],
    ['an arrow function — callable, but not a constructor', '() => {}'],
  ] as const) {
    it(`${label} is NOT adopted: local class, and it is RECORDED`, () => {
      const r = inFresh(
        `${RECORDER}\nglobalThis.__tjs_Predicate_1 = ${value}`,
        PROBE
      )
      expect(r).toMatchObject({
        predicateIsFn: true,
        branded: true,
        decides: [true, false],
      })
      expect(r.records.length).toBe(1)
      expect(r.records[0]).toMatch(/__tjs_Predicate_1/)
    })
  }
})
