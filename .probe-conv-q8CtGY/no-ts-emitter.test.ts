/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'fs'

import { join } from 'path'

import { execSync } from 'child_process'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

/* line 29 */
function sourceFiles() {
  return execSync('git ls-files src scripts bin demo/src', { cwd: ROOT })
    .toString()
    .trim()
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
}
sourceFiles.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:29',
}

describe('no lane can reach the TypeScript emitter for OUTPUT', () => {
  it('`fromTS` refuses to emit JavaScript, and says what to do instead', async () => {
    const { fromTS } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'
    )
    expect(() => fromTS('const x: number = 1', { emitTJS: false })).toThrow(
      /no longer emits JavaScript/
    )
  })
  it('the composed path is the only way to JS, and it works', async () => {
    const { fromTS } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'
    )
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
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

describe('the remaining TypeScript-emitter dependency only shrinks', () => {
  /** Sites where `ts.transpileModule` strips types from a fragment. Lower is better. */

  const CEILING = 1
  const count = () => {
    let n = 0
    for (const f of sourceFiles()) {
      const src = readFileSync(join(ROOT, f), 'utf-8')

      n += (src.match(/\bts\s*\.\s*transpileModule\s*\(/g) ?? []).length
    }
    return n
  }
  it(`is at or below ${CEILING} call sites`, () => {
    expect(count()).toBeLessThanOrEqual(CEILING)
  })
  it('and the ceiling is lowered when it improves', () => {
    const n = count()
    expect(
      n < CEILING
        ? `improved to ${n} — lower CEILING in this file`
        : `at ceiling ${CEILING}`
    ).toBe(`at ceiling ${CEILING}`)
  })
  it('none of them produce a whole module of output', () => {
    const offenders = sourceFiles().filter(
      (f) =>
        f !== 'src/lang/emitters/from-ts.ts' &&
        /\bts\.transpileModule\s*\(/.test(readFileSync(join(ROOT, f), 'utf-8'))
    )
    expect(offenders).toEqual([])
  })
})
