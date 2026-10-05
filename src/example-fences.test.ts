/**
 * Every playground example's code RUNS on the doc site.
 *
 * The site sets `liveExamples: 'opt-in'` (tjs-site.config.ts): prose pages illustrate with fences
 * that are not meant to run, and under the default policy ~80 of them failed in red. Under
 * opt-in a fence runs only if it names a mode, so an example written with a bare ```tjs fence
 * would render as plain code — silently, which is exactly how "the examples run" stops being
 * true without anyone noticing. This pins the other half of that decision.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..', 'guides', 'examples')
const files = readdirSync(ROOT, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.md'))

/** Executable fences (the languages the site runs) and their `:mode`, if any. */
function fences(text: string) {
  return [...text.matchAll(/^`{3,}(tjs|ajs|ts|js)(?::([a-z]+))?\s*$/gm)].map(
    (m) => ({ lang: m[1], mode: m[2] })
  )
}

describe('playground examples run on the doc site (opt-in policy)', () => {
  it('finds the corpus (apparatus)', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('every executable fence in an example names a mode', () => {
    const bare = files.flatMap((f) =>
      fences(readFileSync(join(ROOT, f), 'utf8'))
        .filter((x) => x.lang !== 'js' && x.mode === undefined)
        .map((x) => `${f}: \`\`\`${x.lang}`)
    )
    expect(bare).toEqual([])
  })

  it('the site config is opt-in (the reason the modes are needed)', () => {
    const config = readFileSync(
      join(import.meta.dir, '..', 'tjs-site.config.ts'),
      'utf8'
    )
    expect(config).toMatch(/liveExamples:\s*'opt-in'/)
  })
})
