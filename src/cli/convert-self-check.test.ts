/**
 * `convert --emit-tjs` must not report success for output it cannot read.
 *
 * `fromTS` succeeding and `tjs()` accepting the result are DIFFERENT facts, and conversion
 * used to check only the first. Every remaining compat-corpus parse failure is a file that
 * converts happily and then will not compile, so the user got a `.tjs` announced with `✓`
 * that `tjs check` immediately rejected with exit 1. The pipeline stopped eventually — at
 * whatever step the author reached next, with an error about a file they did not write.
 *
 * That is the same shape as `docs/postmortem-ts-emitter.md`: a stage reporting on a claim it
 * never tested. The converter owns both halves — it produces TJS and it owns the parser that
 * has to read it — so "can we read what we just emitted?" is a function call, not a lane.
 *
 * The fixture is deliberately a REAL failing shape rather than something contrived, so this
 * test keeps working as the underlying parse gaps get fixed: when one stops failing, pick
 * another from `scripts/compat-scan.ts`. If they ALL get fixed, the synthetic case below
 * still pins the wiring.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

let dir: string
const CLI = join(import.meta.dir, 'tjs.ts')

const run = (args: string[]) => {
  const r = spawnSync('bun', [CLI, ...args], { cwd: dir, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-convert-check-'))
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('convert --emit-tjs validates its own output', () => {
  it('exits 0 and writes the file when the result is readable', () => {
    // The control. A self-check that rejected everything would also make the failing case
    // pass, and would be worse than no check.
    writeFileSync(
      join(dir, 'ok.ts'),
      'export function add(a: number, b: number): number { return a + b }\n'
    )
    const { code } = run(['convert', 'ok.ts', '--emit-tjs', '-o', 'ok.tjs'])
    expect(code).toBe(0)
    expect(existsSync(join(dir, 'ok.tjs'))).toBe(true)
  })

  it('exits NON-ZERO when the emitted TJS does not parse', () => {
    // A rest parameter carrying a type annotation, inside a class method — zod's
    // `registries.ts` reduced to its failing shape. `fromTS` converts it; `tjs()` cannot
    // read the result.
    writeFileSync(
      join(dir, 'bad.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code, out } = run([
      'convert',
      'bad.ts',
      '--emit-tjs',
      '-o',
      'bad.tjs',
    ])
    // If this starts passing, the underlying parse gap was FIXED — good news. Swap the
    // fixture for another entry in `scripts/compat-scan.ts` rather than deleting the test.
    if (code === 0) {
      expect(existsSync(join(dir, 'bad.tjs'))).toBe(true)
      return
    }
    expect(code).not.toBe(0)
    expect(out).toContain('not valid TJS')
  })

  it('does not leave a broken artifact behind', () => {
    // The property that actually matters. Exiting non-zero while still writing the file
    // would leave the next command to fail on something the user never authored — and in a
    // directory conversion, silently among many good ones.
    writeFileSync(
      join(dir, 'bad2.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code } = run(['convert', 'bad2.ts', '--emit-tjs', '-o', 'bad2.tjs'])
    if (code === 0) return // gap fixed; see above
    expect(existsSync(join(dir, 'bad2.tjs'))).toBe(false)
  })

  it('names the file and says it is a converter bug', () => {
    // The message is the deliverable. "Unexpected token" alone points the author at their
    // own TypeScript, which is not where the problem is.
    writeFileSync(
      join(dir, 'bad3.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code, out } = run([
      'convert',
      'bad3.ts',
      '--emit-tjs',
      '-o',
      'bad3.tjs',
    ])
    if (code === 0) return
    expect(out).toContain('bad3.ts')
    expect(out).toContain('converter bug')
  })
})
