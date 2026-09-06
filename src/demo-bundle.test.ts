/**
 * The demo bundle contains ONE copy of `@codemirror/state`.
 *
 * CodeMirror identifies extensions with `instanceof`, so two copies of `@codemirror/state`
 * in one bundle make every extension unrecognisable to the editor that receives it:
 *
 *     Error: Unrecognized extension value in extension set ([object Object]).
 *     This sometimes happens because multiple instances of @codemirror/state are loaded,
 *     breaking instanceof checks.
 *
 * That happened, and the way it happened is the point. Nothing in the repo changed — no
 * commit touched `demo/`, `editors/`, `package.json` or `bun.lock`. The **node_modules
 * tree drifted**: five nested copies of `@codemirror/state@6.5.4` appeared under
 * `codemirror`, `@codemirror/lang-css`, `@codemirror/theme-one-dark` and friends, all
 * satisfying the same `^6.0.0` range that should have deduplicated to one. `bun install`
 * into a clean tree collapsed them back to a single copy with a byte-identical lockfile.
 *
 * The failure was **silent and total**. `bun run build:demo` reported success, every test
 * passed, and the built site threw nine exceptions on load: no editors, no sidebar, no
 * playground. It would have been deployed over a working production site if the build had
 * not been opened in a browser first.
 *
 * So the check is on the ARTEFACT, not on `node_modules` — a lockfile can be right while
 * the installed tree is wrong, which is exactly what happened. Counting the marker string
 * in the emitted bundle is the only place the truth shows up.
 *
 * Self-skips when `.demo/` is absent (fresh clone, fast loop) and bites after
 * `bun run build:demo`, which is what `deploy:hosting` runs.
 *
 * That self-skip made it VACUOUS in CI, which is the one place it most needed to run.
 * `bun run make` does not build the demo, so `.demo/` never existed there and this guard —
 * written after a silent, total site outage — had never once executed on a pull request.
 * CI now runs `build:demo`, and the meta-guard below fails **in CI only** if the artefact
 * is missing, so a future reorder that moves the build back behind the tests says so by
 * name instead of going quiet. Same pattern as `bundle-size.test.ts`.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DEMO = join(ROOT, '.demo')
const BUNDLE = join(DEMO, 'index.js')

/**
 * EVERY emitted script, not just the entry.
 *
 * This used to read `.demo/index.js` alone, and the demo is built with `splitting: true` —
 * so the moment CodeMirror landed in a chunk instead of the entry, the guard counted zero.
 * It did not silently pass (the apparatus check below refuses to), but a guard that can only
 * report "I cannot see anything" is not measuring the invariant either, and the arrangement
 * it exists to catch is EXACTLY the one that moves code into chunks. Found when bumping
 * tosijs-ui to 1.13.0 put two copies in a chunk while the entry read clean.
 *
 * Sourcemaps are excluded deliberately: a `.js.map` embeds the original sources, so the
 * marker appears there for reasons that say nothing about how many copies execute.
 */
const bundleFiles = (): string[] =>
  existsSync(DEMO)
    ? readdirSync(DEMO)
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(DEMO, f))
    : []

/** The literal `@codemirror/state` throws when `instanceof` fails — one per copy. */
const MARKER = 'Unrecognized extension value in extension set'

const built = existsSync(BUNDLE)

describe('the demo bundle has a single CodeMirror state instance', () => {
  it('CI actually built .demo/ before running this', () => {
    // Locally the skip is right: a fresh clone or the inner loop has not run
    // `bun run build:demo`, and failing for that would be noise. In CI it is not a
    // legitimate state — the workflow builds the demo, so a missing bundle means the guard
    // is measuring nothing.
    if (!process.env.CI) return
    expect(
      built,
      `.demo/index.js is missing in CI — run build:demo before test:fast`
    ).toBe(true)
  })

  it.skipIf(!built)('exactly one copy of @codemirror/state is bundled', () => {
    // One occurrence per copy holds for what actually gets BUNDLED: the marker appears once
    // in `@codemirror/state`'s ESM entry (`dist/index.js`, the `import` condition), which is
    // the only build a bundler pulls in. `dist/index.cjs` carries it too, but nothing here
    // resolves to CommonJS.
    const perFile = bundleFiles().map(
      (f) => [f, readFileSync(f, 'utf8').split(MARKER).length - 1] as const
    )
    const copies = perFile.reduce((n, [, c]) => n + c, 0)
    const where = perFile
      .filter(([, c]) => c > 0)
      .map(([f, c]) => `${c}x ${f.split('/').pop()}`)
      .join(', ')

    // Apparatus: zero would mean the marker moved and the count is meaningless, not that
    // the bundle is clean. Fail loudly rather than pass vacuously.
    expect(
      copies,
      `the '${MARKER}' marker is absent — @codemirror/state may have changed its ` +
        `error text, in which case this guard is measuring nothing and needs updating`
    ).toBeGreaterThan(0)

    expect(
      copies,
      `${copies} copies of @codemirror/state in the demo bundle (${where}). Every ` +
        `CodeMirror editor will fail with "Unrecognized extension value" and the site will ` +
        `render blank. Usually the install tree: rm -rf node_modules && bun install (the ` +
        `lockfile should not change). If a dependency nests its own copy, an \`overrides\` ` +
        `entry forces one — and if a copy survives that, the remaining fix is to stop ` +
        `importing @codemirror/* directly and use the dependency's own re-export ` +
        `(tosijs-ui#131).`
    ).toBe(1)
  })
})
