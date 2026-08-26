/**
 * The DEPLOYED cloud function runs a hardened VM.
 *
 * `functions/` serves `run` (public `onRequest`) and `agentRun` (`onCall`), both of which
 * execute agent code. So the VM inside `functions/lib/index.js` is not an internal detail —
 * it is the security boundary of a public endpoint, and it is a **committed build
 * artifact**, which means it can be stale without anything in the source tree looking wrong.
 *
 * It was. Found 2026-08-26, one day after 0.13.5:
 *
 *     functions/package.json   dependencies     tjs-lang ^0.13.3
 *     functions/package.json   devDependencies  tjs-lang ^0.2.8     <- npm resolves THIS
 *     functions/node_modules                    tjs-lang 0.2.8
 *     functions/lib/index.js   "Capability boundary rejected"   0 occurrences
 *
 * The same package in both sections, and the older dev range won the install. The bundle
 * was rebuilt the previous day, so it was *recent* — and carried a full `AgentVM` with none
 * of the 0.12/0.13 hardening: no capability membrane, no `methodCall` allowlist, no heap
 * ceiling, on a public endpoint that evaluates submitted code.
 *
 * Nothing caught it. The dependency-audit gate covers `functions/` and was green (it reads
 * advisories, not versions). `npm install` was silent — a package in both sections is legal.
 * The build reported success. This is the `demo-bundle.test.ts` failure with a worse blast
 * radius: **a lockfile can be right while the installed tree is wrong**, and only the
 * artifact tells the truth.
 *
 * So this checks the ARTIFACT, and it does so without needing an install — `functions/lib`
 * is committed, so the guard is never vacuous the way a self-skipping one would be. The
 * declaration check below catches the specific footgun; the marker check catches the harm
 * whatever caused it.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const FN = join(ROOT, 'functions')
const BUNDLE = join(FN, 'lib', 'index.js')

const pkg = JSON.parse(readFileSync(join(FN, 'package.json'), 'utf-8'))

describe('functions/ declares its dependencies unambiguously', () => {
  it('no package appears in both dependencies and devDependencies', () => {
    // The root cause, stated generally. npm resolves ONE of the two and does not say which,
    // so a stale range in either section silently decides the install. Nothing warns.
    const deps = Object.keys(pkg.dependencies ?? {})
    const dev = new Set(Object.keys(pkg.devDependencies ?? {}))
    const both = deps.filter((d) => dev.has(d))
    expect(
      both,
      'a package in both sections lets the narrower range win the install tree silently'
    ).toEqual([])
  })

  it('depends on a tjs-lang new enough to have the capability membrane', () => {
    // The membrane, the methodCall allowlist and the heap ceiling all landed in 0.12.0.
    // Anything below that is a VM without a security boundary.
    const range = String(pkg.dependencies?.['tjs-lang'] ?? '')
    const [major, minor] = range
      .replace(/^[^\d]*/, '')
      .split('.')
      .map(Number)
    expect(range, 'functions/ must depend on tjs-lang').not.toBe('')
    expect(
      major > 0 || minor >= 12,
      `functions/ depends on tjs-lang ${range}; the membrane landed in 0.12.0`
    ).toBe(true)
  })
})

describe('the committed functions bundle carries the hardening', () => {
  it('the artifact exists (it is committed, and it is what deploys)', () => {
    // Not a self-skip. `functions/lib/index.js` is tracked, so its absence is a real
    // finding — and a guard that skips reports exactly the same green as one that passes.
    expect(existsSync(BUNDLE), `${BUNDLE} is missing`).toBe(true)
  })

  const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf-8') : ''

  it('contains a VM at all — the apparatus check', () => {
    // If the bundle stopped containing a VM, every marker assertion below would pass
    // vacuously and this guard would report green over an unchecked artifact.
    expect(bundle).toContain('AgentVM')
  })

  it('reports the tjs-lang it was built against, and it is a real version', () => {
    // `/health` now returns this, so a running deployment can be ASKED what VM it has —
    // the question that had no answer while a pre-0.12 bundle sat in production.
    //
    // The "and it is a real version" half is not padding. The first implementation stamped
    // it with `bun build --define:`, which does not substitute at all in bun 1.4.0 (filed
    // upstream, two-line repro) — and the build still reported SUCCESS with the literal
    // placeholder `__TJS_LANG_VERSION__` sitting in the output. A stamp that can silently
    // fail open is worth less than no stamp, because it reads as an answer.
    const stamped = bundle.match(/TJS_LANG_VERSION\s*=\s*"([^"]+)"/)?.[1]
    expect(
      stamped,
      'functions/lib/index.js has no resolved TJS_LANG_VERSION — did build:version run?'
    ).toMatch(/^\d+\.\d+\.\d+/)
    const [major, minor] = String(stamped).split('.').map(Number)
    expect(
      major > 0 || minor >= 12,
      `the deployed bundle was built against tjs-lang ${stamped}; the membrane landed in 0.12.0`
    ).toBe(true)
  })

  it('contains the capability membrane and its budgets', () => {
    // `Capability boundary rejected` is a user-facing error string, so it survives any
    // minification the build might later grow. The other two are run options.
    for (const marker of [
      'Capability boundary rejected',
      'membraneMaxBytes',
      'maxHeapBytes',
    ]) {
      expect(
        bundle.includes(marker),
        `functions/lib/index.js has no "${marker}" — the deployed VM predates the ` +
          `capability membrane. Rebuild: (cd functions && npm install && npm run build)`
      ).toBe(true)
    }
  })
})
