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
import { describe, it, expect } from 'bun:test'
import { parse } from 'acorn'
import { tjs } from './index'

/** Each entry is a snippet that forces its named inline helper to be emitted. */
const FEATURES: Array<[string, string]> = [
  ['Eq', `export function a(x: 1):! 0 { return x == 1 ? 1 : 0 }`],
  ['NotEq', `export function b(x: 1):! 0 { return x != 1 ? 1 : 0 }`],
  ['Is', `export function c(x: 1):! 0 { return Is(x, 1) ? 1 : 0 }`],
  ['IsNot', `export function d(x: 1):! 0 { return IsNot(x, 1) ? 1 : 0 }`],
  ['oneOf', `export function e(m: 'a' | 'b'):! '' { return m }`],
  [
    'Type',
    `Type Point {\n  example: { x: 0, y: 0 }\n}\nexport function f(p: Point):! 0 { return p.x }`,
  ],
  [
    'Enum',
    `Enum Color 'a colour' {\n  Red = 'red'\n  Green = 'green'\n}\nexport function g():! '' { return Color.Red }`,
  ],
  ['TypeOf', `export function h(x: 1):! '' { return TypeOf(x) }`],
  ['bang', `export function i(o: { a: 1 }):! 0 { return o!.a }`],
  ['toBool', `export function j(x: 1):! 0 { return x ? 1 : 0 }`],
  [
    'schema',
    `Type P {\n  example: { x: 0 }\n}\nexport function k():! 0 {\n  const s = P.toJSONSchema()\n  return 0\n}`,
  ],
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

describe('emitted output loads as an ES module', () => {
  it('the check really catches a duplicate top-level declaration (apparatus check)', () => {
    // Without this, a check that silently accepted everything would look like a pass.
    expect(
      moduleError('function z(){}\nfunction z(){}\nexport const q=1')
    ).toContain('already been declared')
    expect(moduleError('export const q=1')).toBeNull()
  })

  for (const [name, src] of FEATURES) {
    it(`${name} alone`, () => {
      expect(moduleError(tjs(src).code)).toBeNull()
    })
  }

  // The defect needed TWO helpers in one file. Individually every case above passed.
  for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
      const [na, sa] = FEATURES[i]
      const [nb, sb] = FEATURES[j]
      it(`${na} + ${nb} together`, () => {
        expect(moduleError(tjs(`${sa}\n${sb}\n`).code)).toBeNull()
      })
    }
  }
})
