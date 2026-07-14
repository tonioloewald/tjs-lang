/**
 * Guardrail: every file in `examples/` must actually work.
 *
 * These are the first thing anyone runs, and they had rotted badly — five of the
 * seven were broken at once (a double-preprocess that dropped the wasm bootstrap,
 * a runtime prelude that collided with emitted code, `import`/`export` being
 * illegal in the function body `tjs run` evaluated, a Generic whose type params
 * arrived as raw values instead of check functions, and two genuinely inconsistent
 * signature examples). Nothing caught it, because nothing ran them.
 *
 * Two distinct checks, because they fail differently:
 *   - `check`  — transpiles WITH signature tests, so an example whose declared
 *                example values are inconsistent with what the function returns
 *                fails here. (`:!` opts a return example out of being a test.)
 *   - `run`    — actually executes the file end to end.
 *
 * If you add an example, it must pass both. That is the point.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync } from 'fs'
import { join } from 'path'

const EXAMPLES_DIR = join(import.meta.dir, '..', 'examples')
const CLI = join(import.meta.dir, 'cli', 'tjs.ts')

const examples = readdirSync(EXAMPLES_DIR)
  .filter((f) => f.endsWith('.tjs'))
  .sort()

// A rename or a move should fail loudly rather than silently testing nothing.
it('finds the examples', () => {
  expect(examples.length).toBeGreaterThan(0)
})

// `tjs run` writes the emitted module beside the source and deletes it again. It
// must leave nothing behind — including when the program fails, which is exactly
// where it used to leak: `process.exit()` does not run `finally` blocks.
it('tjs run leaves no temp modules behind', () => {
  const strays = readdirSync(EXAMPLES_DIR).filter((f) => f.includes('.tjsrun.'))
  expect(strays).toEqual([])
})

describe('examples/', () => {
  for (const name of examples) {
    const path = join(EXAMPLES_DIR, name)

    it(`${name}: type checks (signature examples are consistent)`, async () => {
      const proc = Bun.spawn(['bun', CLI, 'check', path], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (code !== 0) throw new Error(`tjs check failed:\n${err || out}`)
    }, 30_000)

    it(`${name}: runs`, async () => {
      const proc = Bun.spawn(['bun', CLI, 'run', path], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (code !== 0) throw new Error(`tjs run failed:\n${err || out}`)
    }, 30_000)
  }
})
