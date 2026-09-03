/**
 * The committed `dist/` bundles must be built from the current source.
 *
 * `dist/` is a build artifact that is COMMITTED and PUBLISHED, and until now nothing checked
 * it against its inputs. `editors/**` has exactly this guard (`editors-build.test.ts`) for
 * exactly this reason; `dist/` is larger, more load-bearing, and had none.
 *
 * ## What it cost
 *
 * 0.13.7 shipped a security fix — a VM-target transpile no longer executes the code it is
 * transpiling — and shipped it in `src/` only. `dist/` had been built 35 minutes earlier.
 * Bun resolves this package to `src/`, so every local check passed; Node resolves it to
 * `dist/`, so every Node consumer got the vulnerable build. The published tarball contained
 * the fix and the fixed artifact did not exist in it.
 *
 * The mechanical release check had already said so — `artifact freshness — no build script`,
 * printed as a SKIP, on a tool whose own summary line reads "skips are NOT passes". It was
 * read as a pass anyway. This test exists so the next person does not get the option.
 *
 * ## Why a timestamp rather than a rebuild-and-compare
 *
 * `editors-build.test.ts` can rebuild and diff because two thin adapters bundle in
 * milliseconds. A full `bun run make` takes minutes and regenerates docs, grammars and
 * demo output, so running it inside the fast lane would either be skipped or ignored.
 *
 * Comparing mtimes is weaker — it cannot see a build from *different* source — but it catches
 * the failure that actually happened, costs nothing, and cannot itself go stale. The strong
 * check is `bun run make` in CI, which already runs before the tests.
 */
import { describe, it, expect } from 'bun:test'
import { statSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

/** Newest mtime under a directory, ignoring anything not bundled. */
function newestSource(dir: string, out: { path: string; mtime: number }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      newestSource(p, out)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue
    // Tests are not bundled, so a test edit must not make `dist` look stale — that would be
    // a guard that cries wolf on every commit, which is a guard nobody keeps.
    if (entry.name.endsWith('.test.ts')) continue
    const m = statSync(p).mtimeMs
    if (m > out.mtime) {
      out.mtime = m
      out.path = p
    }
  }
}

describe('dist is built from the current source', () => {
  it('no shipped source file is newer than the bundles', () => {
    if (!existsSync(DIST)) {
      // In CI `bun run make` runs before the tests, so an absent dist is a build failure and
      // must fail here rather than silently skip — the same rule bundle-size.test.ts learned.
      if (process.env.CI) throw new Error('dist/ is missing in CI')
      return
    }
    const bundles = readdirSync(DIST).filter((f) => f.endsWith('.js'))
    expect(bundles.length).toBeGreaterThan(0)
    const oldestBundle = Math.min(
      ...bundles.map((f) => statSync(join(DIST, f)).mtimeMs)
    )

    const newest = { path: '', mtime: 0 }
    newestSource(join(ROOT, 'src'), newest)

    // Only meaningful when the source file is actually tracked — a scratch file or a
    // just-checked-out tree would otherwise report a false positive.
    let tracked = true
    try {
      execSync(`git ls-files --error-unmatch "${newest.path}"`, {
        cwd: ROOT,
        stdio: 'ignore',
      })
    } catch {
      tracked = false
    }
    if (!tracked) return

    const stale = newest.mtime > oldestBundle
    expect({
      stale,
      newestSource: stale ? newest.path.slice(ROOT.length + 1) : null,
    }).toEqual({ stale: false, newestSource: null })
  })
})
