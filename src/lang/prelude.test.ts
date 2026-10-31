/**
 * The shared prelude (#3594, docs/runtime-fusion.md §8): `prelude: 'import'` output takes its
 * inline runtime from `tjs-lang/prelude`, once per bundle, instead of carrying a copy per
 * module. tosijs-native bundled six modules and got six preludes.
 *
 * What has to hold:
 *   - the committed `prelude.generated.js` is what the emitter builds now (no drift);
 *   - the SAME behaviour either way: the shared prelude is the full-featured variant, and a
 *     file that needed only the narrow one must not notice (a differential corpus);
 *   - state stays per module: one module's `extend` does not reach another's `==` or `if`;
 *   - a prelude from a different emitter is refused at load, by name;
 *   - default output is untouched (every other test in the suite runs it).
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tjs } from './index'
import { PRELUDE_SPECIFIER } from './emitters/js'
import { render } from '../../scripts/build-prelude'

const GENERATED = join(import.meta.dir, 'prelude.generated.js')

describe('the committed prelude is current', () => {
  it('matches what the emitter builds (bun run build:prelude)', () => {
    expect(readFileSync(GENERATED, 'utf8')).toBe(render())
  })
})

let dir = ''
let n = 0
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-prelude-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** Emit `src` in one mode and import it as a real ES module (no global runtime). */
async function load(src: string, prelude: 'inline' | 'import') {
  const code = tjs(src, { runTests: false, prelude }).code.replace(
    `'${PRELUDE_SPECIFIER}'`,
    JSON.stringify(GENERATED)
  )
  // A fresh directory per module: Bun caches a directory's entries on first resolve, so a
  // second file written into the same one is "not found".
  const sub = mkdtempSync(join(dir, `m${n++}-`))
  const file = join(sub, 'm.mjs')
  writeFileSync(file, code)
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return await import(file)
  } finally {
    g.__tjs = prev
  }
}

/** A result as data: an error by its message and path, a function by its kind. */
const view = (v: any): any => {
  if (v instanceof Error)
    return { error: v.message, path: (v as any).path ?? null }
  if (typeof v === 'function') return 'function'
  if (Array.isArray(v)) return v.map(view)
  if (v && typeof v === 'object') {
    const o: any = {}
    for (const k of Object.keys(v)) o[k] = view(v[k])
    return o
  }
  return v
}

/** [what it covers, source exporting `probe()` that returns every result to compare] */
const CORPUS: [string, string][] = [
  [
    'parameter and return checks',
    `function f(a: 0, b: ''): '' { return b + a }
export function probe() { return [f(1, 'x'), f('x', 'y'), f(1.5, 'x')] }`,
  ],
  [
    'a narrow Type (no kind markers) vs the full one',
    `const Box = Type('box', { v: 0, tag: '' })
export function probe() {
  return [Box.check({ v: 1, tag: 'a' }), Box.check({ v: 'x', tag: 'a' }),
    Box.check({ v: 1, tag: 'a', __k: 'ref' }), Box.check({ __k: 'num', v: 2, tag: '' })]
}`,
  ],
  [
    'kind markers: floats, non-negatives, unions, sets',
    `Type T { example: { price: 0.0, qty: +0, mode: 'on' | 'off', name: '' | null } }
export function probe() {
  return [T.check({ price: 9.99, qty: 2, mode: 'on', name: null }),
    T.check({ price: 9.99, qty: -1, mode: 'on', name: 'a' }),
    T.check({ price: 9.99, qty: 1, mode: 'dim', name: 'a' })]
}`,
  ],
  [
    'schema and strip',
    `const P = Type('pt', { x: 0, y: 0 })
export function probe() { return [P.toJSONSchema(), P.strip({ x: 1, y: 2, z: 3 })] }`,
  ],
  [
    'equality and truthiness',
    `export function probe() {
  return [1 == 1, null == undefined, '5' == 5, Is({ a: 1 }, { a: 1 }), IsNot([1], [2]),
    new Boolean(false) ? 1 : 0, typeof null]
}`,
  ],
  [
    'enums, unions, Exactly',
    `const C = Enum('Color', { Red: 'red', Blue: 'blue' })
const D = Union('dir', 'up', 'down')
export function probe() {
  return [C.check('red'), C.check('green'), C.members.Red, D.check('up'), D.check(1)]
}`,
  ],
  [
    'given and bang',
    `function name(x: '') {
  given x { 'a', 'b' { return 'ab' } 'c' { return 'c' } } else { return 'other' }
}
function deep(o: {}) { return o!.a!.b }
export function probe() { return [name('a'), name('c'), name('z'), deep({ a: { b: 2 } }), deep({})] }`,
  ],
  [
    'destructured and typed-default parameters',
    `function d({ w: 0, h = 2 }) { return w * h }
function g(mode: 'grant' | 'deny' = 'grant') { return mode }
export function probe() { return [d({ w: 3 }), d(null), g(), g('deny'), g('maybe')] }`,
  ],
  [
    'callable classes',
    `class Box { constructor(v: 0) { this.v = v } static of(v: 0) { return Box(v) } }
export function probe() { return [Box(2).v, Box('s'), Box.of(3).v] }`,
  ],
]

describe('the same behaviour inline and imported', () => {
  for (const [what, src] of CORPUS)
    it(what, async () => {
      const inline = view((await load(src, 'inline')).probe())
      const shared = view((await load(src, 'import')).probe())
      expect(shared).toEqual(inline)
    })
})

describe('state stays per module', () => {
  it("one module's extend does not reach another module's == or if", async () => {
    class Stamp {
      constructor(public s: number) {}
    }
    const a = await load(
      `extend Stamp { asCompared() { return this.s } }
export function eq(a: {}, b: {}):! false { return a == b }
export function truthy(r: {}):! 0 { return r ? 1 : 0 }`,
      'import'
    )
    const b = await load(
      `export function eq(a: {}, b: {}):! false { return a == b }
export function truthy(r: {}):! 0 { return r ? 1 : 0 }`,
      'import'
    )
    expect(a.eq(new Stamp(1), new Stamp(1))).toBe(true) // projected
    expect(b.eq(new Stamp(1), new Stamp(1))).toBe(false) // identity: not A's table
    expect(a.truthy(new Stamp(0))).toBe(0)
    expect(b.truthy(new Stamp(0))).toBe(1)
  })
})

describe('a prelude from another emitter is refused at load', () => {
  it('names both hashes', async () => {
    const { createPrelude, PRELUDE_HASH } = await import(GENERATED)
    expect(() => createPrelude('0000000000000000')).toThrow(PRELUDE_HASH)
    expect(typeof createPrelude(PRELUDE_HASH).Type).toBe('function')
  })
})

describe('import mode output', () => {
  it('imports the factory and carries no prelude of its own', () => {
    const out = tjs(`export function f(a: 0) { return a == 1 }`, {
      runTests: false,
      prelude: 'import',
    })
    expect(out.code).toContain(`from '${PRELUDE_SPECIFIER}'`)
    expect(out.code).not.toContain('class MonadicError')
    expect(out.prelude).toContain('__tjs_createPrelude(')
  })
})
