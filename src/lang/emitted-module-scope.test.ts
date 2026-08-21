/**
 * Emitted output must be a loadable ES MODULE, not merely something Bun tolerates.
 *
 * Every inline helper prepended its own dependencies, and two helpers that shared one
 * emitted it twice. At module top level a duplicate function declaration is a hard error:
 *
 *     $ node -e "import('./emitted.mjs')"
 *     SyntaxError: Identifier '__ub' has already been declared
 *
 * Any emitted module using BOTH `==` and `Is` — an ordinary combination — was therefore
 * dead on arrival for a Node consumer. Bun runs it without complaint, so the whole suite
 * stayed green. That is the same shape as the `typescript` import snowfox hit in
 * production: correct in our runtime, broken in theirs.
 *
 * Parsing as `sourceType: 'module'` is what makes the difference visible — script scope
 * permits the redeclaration, module scope rejects it. Acorn is already a dependency, so
 * this costs nothing and needs no subprocess.
 *
 * The corpus below drives the helpers PAIRWISE as well as individually, because the defect
 * only appears in combination — a per-feature test would have passed throughout.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'acorn'
import { tjs } from './index'

/**
 * Each entry forces its named inline helper to be emitted, and carries the call needed to
 * EXERCISE it — because loading alone is not enough (see `runError` below).
 */
const FEATURES: Array<{
  name: string
  src: string
  fn: string
  args: unknown[]
}> = [
  {
    name: 'Eq',
    src: `export function a(x: 1):! 0 { return x == 1 ? 1 : 0 }`,
    fn: 'a',
    args: [1],
  },
  {
    name: 'NotEq',
    src: `export function b(x: 1):! 0 { return x != 1 ? 1 : 0 }`,
    fn: 'b',
    args: [1],
  },
  {
    name: 'Is',
    src: `export function c(x: 1):! 0 { return Is(x, 1) ? 1 : 0 }`,
    fn: 'c',
    args: [1],
  },
  {
    name: 'IsNot',
    src: `export function d(x: 1):! 0 { return IsNot(x, 1) ? 1 : 0 }`,
    fn: 'd',
    args: [1],
  },
  {
    name: 'IsNot-infix',
    src: `export function d2(x: 1, y: 2):! 0 { return (x IsNot y) ? 1 : 0 }`,
    fn: 'd2',
    args: [1, 2],
  },
  {
    name: 'oneOf',
    src: `export function e(m: 'a' | 'b'):! '' { return m }`,
    fn: 'e',
    args: ['a'],
  },
  {
    name: 'Type',
    src: `Type Point {\n  example: { x: 0, y: 0 }\n}\nexport function f(p: Point):! 0 { return p.x }`,
    fn: 'f',
    args: [{ x: 1, y: 2 }],
  },
  {
    name: 'Enum',
    src: `Enum Color 'a colour' {\n  Red = 'red'\n  Green = 'green'\n}\nexport function g():! '' { return Color.Red }`,
    fn: 'g',
    args: [],
  },
  {
    name: 'TypeOf',
    src: `export function h(x: 1):! '' { return TypeOf(x) }`,
    fn: 'h',
    args: [1],
  },
  {
    name: 'bang',
    src: `export function i(o: { a: 1 }):! 0 { return o!.a }`,
    fn: 'i',
    args: [{ a: 1 }],
  },
  {
    name: 'toBool',
    src: `export function j(x: 1):! 0 { return x ? 1 : 0 }`,
    fn: 'j',
    args: [1],
  },
  {
    name: 'schema',
    src: `Type P {\n  example: { x: 0 }\n}\nexport function k():! 0 {\n  const s = P.toJSONSchema()\n  return 0\n}`,
    fn: 'k',
    args: [],
  },
]

/** Parse as a module and surface the first duplicate-declaration error, if any. */
function moduleError(code: string): string | null {
  try {
    parse(code, { ecmaVersion: 2022, sourceType: 'module' })
    return null
  } catch (e: any) {
    return e.message
  }
}

/**
 * Actually RUN the emitted code and CALL into it. Returns the failure, or null.
 *
 * Parsing alone is not enough, and this test learned that the hard way: it had `IsNot` in
 * its corpus and passed while emitted `IsNot` code threw
 * `ReferenceError: Is is not defined` on first call. `needsIs = code.includes('Is(')` was
 * false because `'IsNot('` does not contain `'Is('` — and the reference lives INSIDE a
 * function body, so nothing is wrong until you call it. The docstring said "loads as an ES
 * module"; it only parsed.
 *
 * The two checks catch different things and both are needed. `new Function` cannot replace
 * the parse (function scope permits the duplicate top-level declaration that module scope
 * rejects), and the parse cannot replace this (a reference inside a body resolves at call
 * time). `export` is stripped because `new Function` is not a module — the module-ness is
 * the parse check's job, and `nodeLoads` below covers it for real.
 */
function runError(code: string, fn: string, args: unknown[]): string | null {
  try {
    const f = new Function(code.replace(/^export /gm, '') + `\nreturn ${fn}`)()
    if (typeof f !== 'function') return `'${fn}' is not a function`
    f(...args)
    return null
  } catch (e: any) {
    return e.message
  }
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'tjs-emit-mod-'))
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }))
let seq = 0

/**
 * Load the emitted module in a real NODE subprocess and call into it.
 *
 * The expensive, unimpeachable version — actual ESM loading in the runtime our consumers
 * use, which is where the duplicate-`__ub` defect actually bit (Bun ran it happily). Used
 * for the few cases that earned it rather than all 91, because it costs a process each.
 */
async function nodeLoads(
  code: string,
  fn: string,
  args: unknown[]
): Promise<string | null> {
  const file = join(tmpRoot, `m${seq++}.mjs`)
  writeFileSync(
    file,
    `${code}\nconst __r = ${fn}(${args
      .map((a) => JSON.stringify(a))
      .join(', ')})\n` +
      `if (__r && __r.name === 'MonadicError') { console.error('MonadicError: ' + __r.message); process.exit(2) }\n`
  )
  const proc = Bun.spawn(['node', file], { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return (await proc.exited) === 0 ? null : (err || out).trim().split('\n')[0]
}

describe('emitted output loads as an ES module', () => {
  it('the check really catches a duplicate top-level declaration (apparatus check)', () => {
    // Without this, a check that silently accepted everything would look like a pass.
    expect(
      moduleError('function z(){}\nfunction z(){}\nexport const q=1')
    ).toContain('already been declared')
    expect(moduleError('export const q=1')).toBeNull()
  })

  for (const f of FEATURES) {
    it(`${f.name} alone parses as a module`, () => {
      expect(moduleError(tjs(f.src).code)).toBeNull()
    })

    it(`${f.name} alone LOADS and RUNS`, async () => {
      expect(await runError(tjs(f.src).code, f.fn, f.args)).toBeNull()
    })
  }

  // The two cases that earned a real Node process — the exact shapes that shipped broken.
  it('Eq + Is loads in a real Node process (the duplicate `__ub` case)', async () => {
    const eq = FEATURES.find((f) => f.name === 'Eq')!
    const is = FEATURES.find((f) => f.name === 'Is')!
    const code = tjs(`${eq.src}\n${is.src}\n`).code
    expect(await nodeLoads(code, eq.fn, eq.args)).toBeNull()
  })

  it('IsNot runs in a real Node process (the missing-`Is` case)', async () => {
    const f = FEATURES.find((x) => x.name === 'IsNot')!
    expect(await nodeLoads(tjs(f.src).code, f.fn, f.args)).toBeNull()
  })

  // The duplicate-declaration defect needed TWO helpers in one file. Individually every
  // case above passed.
  for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
      const a = FEATURES[i]
      const b = FEATURES[j]
      it(`${a.name} + ${b.name} together`, async () => {
        const code = tjs(`${a.src}\n${b.src}\n`).code
        expect(moduleError(code)).toBeNull()
        // Call BOTH — a helper missing for one of them only shows up on its own call.
        expect(await runError(code, a.fn, a.args)).toBeNull()
        expect(await runError(code, b.fn, b.args)).toBeNull()
      })
    }
  }
})
