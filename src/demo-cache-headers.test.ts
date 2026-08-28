/**
 * No UNHASHED asset may be cached immutably.
 *
 * `firebase.json` applied `max-age=31536000, immutable` to every `.js` file. Three of the
 * built demo's scripts are not content-hashed — `index.js` (the ENTRY POINT),
 * `tfs-worker.js` (a service worker) and `tjs-runtime.js` — so a returning browser pinned
 * them for a YEAR, and `immutable` means it does not even revalidate.
 *
 * The failure is total, and invisible from the server side:
 *
 *     stale index.js  ->  imports chunk-OLDHASH.js  ->  404
 *     404             ->  SPA rewrite serves index.html
 *     import() HTML   ->  SyntaxError; the app never boots and the shell spins forever
 *
 * Meanwhile `curl` has no cache, so every check from a terminal reports a healthy site. That
 * is what makes this worth a test rather than care: the person deploying cannot see it, only
 * a returning visitor can, and the symptom looks like an application bug rather than a
 * caching one. It cost a real debugging session and two wrong diagnoses.
 *
 * Read against the ACTUAL built artifacts, so it fails when a new unhashed file appears as
 * well as when the rules change.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const config = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf-8'))
const headers: Array<{
  source: string
  headers: Array<{ key: string; value: string }>
}> = config.hosting?.headers ?? []

/** `chunk-17nwb3w7.js` — a name that changes when the content does. */
const isHashed = (f: string) => /-[a-z0-9]{6,}\.(js|map)$/.test(f)

/** The FIRST matching rule wins, which is how Firebase resolves them. */
function cacheControlFor(path: string): string | undefined {
  for (const rule of headers) {
    const rx = new RegExp(
      '^' +
        rule.source
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          // `**` first, via a token no path contains, so the single-`*` pass cannot
          // corrupt it. (A whitespace or NUL sentinel trips `no-control-regex`.)
          .replace(/\*\*/g, 'GLOBSTAR_TOKEN')
          .replace(/\*/g, '[^/]*')
          .replace(/GLOBSTAR_TOKEN/g, '.*') +
        '$'
    )
    const p = path.startsWith('/') ? path : `/${path}`
    if (rx.test(p) || rx.test(path)) {
      return rule.headers.find((h) => h.key === 'Cache-Control')?.value
    }
  }
  return undefined
}

describe('cache headers cannot pin a stale entry point', () => {
  it('the rules parse, and something IS immutable (apparatus check)', () => {
    // With no immutable rule at all, every assertion below would pass for the wrong reason.
    expect(headers.length).toBeGreaterThan(0)
    expect(
      headers.some((h) => h.headers.some((x) => /immutable/.test(x.value)))
    ).toBe(true)
  })

  it('a content-hashed chunk IS cached immutably', () => {
    // The other half of the trade: hashing exists so these can be cached forever.
    expect(cacheControlFor('chunk-17nwb3w7.js')).toContain('immutable')
  })

  for (const f of ['index.js', 'tfs-worker.js', 'tjs-runtime.js']) {
    it(`${f} is NOT cached immutably`, () => {
      const cc = cacheControlFor(f) ?? ''
      expect(
        cc,
        `${f} is not content-hashed, so it must revalidate`
      ).not.toContain('immutable')
      expect(cc).toMatch(/no-cache|must-revalidate|max-age=0/)
    })
  }

  it('every UNHASHED script in the built demo revalidates', () => {
    // The general rule, checked against reality rather than a remembered list — an unhashed
    // entry point added later fails here instead of shipping a year-long cache.
    const demo = join(ROOT, '.demo')
    if (!existsSync(demo)) {
      expect(
        process.env.CI,
        '.demo missing — run `bun run build:demo`'
      ).toBeFalsy()
      return
    }
    const offenders = readdirSync(demo)
      .filter((f) => f.endsWith('.js') && !isHashed(f))
      .filter((f) => /immutable/.test(cacheControlFor(f) ?? ''))
    expect(offenders).toEqual([])
  })
})
