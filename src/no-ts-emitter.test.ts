/**
 * TypeScript may READ TypeScript. It may never WRITE our JavaScript.
 *
 * This should have been a red line from the first day `from-ts.ts` existed, and it was not,
 * so the project spent months citing evidence it had not earned:
 *
 *   - `fromTS(source)` emitted JS via `ts.transpileModule` — a second JavaScript emitter,
 *     sitting beside our own.
 *   - The **compat lane** — described in CLAUDE.md as "the most honest evidence the converter
 *     works that this repo has" — called exactly that branch. Its `--full` flag (TS → TJS → JS)
 *     defaulted OFF, three of the six scripts never had the flag at all, and `compat-all.ts`
 *     spawned every script with no arguments. So ts-pattern 453/453, kysely 303/303 and
 *     effect 363/363 were, in the main, evidence that the TypeScript compiler works.
 *   - The **Bootstrap Canary** — the test literally named "True self-hosting" — called it
 *     under a comment reading `// Transpile with TJS`.
 *
 * A green result produced by someone else's emitter says nothing about ours. Worse, it says
 * it loudly, in a number, in a file people cite. That is not a gap in coverage; it is
 * coverage pointed at the wrong program.
 *
 * Two guards, because the problem has two shapes.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

const ROOT = join(import.meta.dir, '..')
const sourceFiles = () =>
  execSync('git ls-files src scripts bin demo/src', { cwd: ROOT })
    .toString()
    .trim()
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))

describe('no lane can reach the TypeScript emitter for OUTPUT', () => {
  it('`fromTS` refuses to emit JavaScript, and says what to do instead', async () => {
    // The API-level red line. `fromTS` does TS -> TJS; `tjs` does TJS -> JS. Two units,
    // composed at the call site, so the path is visible in the code that uses it.
    const { fromTS } = await import('./lang/emitters/from-ts')
    expect(() => fromTS('const x: number = 1', { emitTJS: false })).toThrow(
      /no longer emits JavaScript/
    )
  })

  it('the composed path is the only way to JS, and it works', async () => {
    // The control. A guard that only proves something is refused would pass just as well if
    // the whole converter were broken.
    const { fromTS } = await import('./lang/emitters/from-ts')
    const { tjs } = await import('./lang/index')
    const js = tjs(
      fromTS('export function add(a: number): number { return a }').code,
      {
        runTests: false,
      }
    ).code
    expect(js).toContain('function add')
    expect(js).not.toContain(': number')
  })
})

/**
 * The deeper shape, and the reason this is a RATCHET rather than a ban.
 *
 * `ts.transpileModule` is still used inside the TS → TJS step to strip type annotations out
 * of function BODIES. So TypeScript still writes some of the JavaScript that reaches the
 * output — less of it, and never the whole module, but not none.
 *
 * Removing that means writing our own TypeScript statement stripper, which is real work and
 * not something to do quietly in passing. So the count is pinned instead: it may go DOWN and
 * may never go UP, and the promote-check demands the ceiling be lowered when it does. A red
 * line nobody can cross further, plus steady pressure in the one direction that finishes it.
 */
describe('the remaining TypeScript-emitter dependency only shrinks', () => {
  /** Sites where `ts.transpileModule` strips types from a fragment. Lower is better. */
  const CEILING = 10

  const count = () => {
    let n = 0
    for (const f of sourceFiles()) {
      const src = readFileSync(join(ROOT, f), 'utf-8')
      // Call sites only — the prose explaining why they are here must not inflate the count.
      n += (src.match(/\bts\.transpileModule\s*\(/g) ?? []).length
    }
    return n
  }

  it(`is at or below ${CEILING} call sites`, () => {
    expect(count()).toBeLessThanOrEqual(CEILING)
  })

  it('and the ceiling is lowered when it improves', () => {
    // Without this, a fix that removed sites would leave slack a later regression could
    // occupy in silence — which is how the dogfood ratchets rotted.
    const n = count()
    expect(
      n < CEILING
        ? `improved to ${n} — lower CEILING in this file`
        : `at ceiling ${CEILING}`
    ).toBe(`at ceiling ${CEILING}`)
  })

  it('none of them produce a whole module of output', () => {
    // The shape that matters: stripping a function body is delegation, emitting the module is
    // replacement. Only `from-ts.ts` may call it at all, and only on fragments.
    const offenders = sourceFiles().filter(
      (f) =>
        f !== 'src/lang/emitters/from-ts.ts' &&
        /\bts\.transpileModule\s*\(/.test(readFileSync(join(ROOT, f), 'utf-8'))
    )
    expect(offenders).toEqual([])
  })
})
