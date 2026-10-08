/**
 * The `==` rewrite groups its operands the way JavaScript does: a DIFFERENTIAL test.
 *
 * TJS rewrites `a == b` to `Eq(a, b)` by scanning text for where each operand ends, a
 * hand-written precedence parser. `await f() == 3` shipped grouping wrong (it compared the
 * Promise), found by tosijs-ui's console review. One reported shape fixed is not a scanner
 * shown correct, so this generates expressions across the precedence table and requires the
 * transpiled TJS to agree with JavaScript.
 *
 * Every operand is a number (or a boolean from a comparison), so TJS `==` and JavaScript
 * `===` must give the same answer; the reference is the same expression with `==` spelled
 * `===`, which TJS leaves alone. Any disagreement is a grouping error.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

/** Shapes around one or two equality operators. `A`/`B`/`C` are filled with operands. */
const SHAPES = [
  'A == B',
  'A != B',
  'A + 1 == B',
  'A == B + 1',
  'A * 2 == B - 1',
  'A < B == C < A', // relational binds tighter than ==
  'A == B < C',
  '(A == B) == (B == C)',
  'A == B == C', // left-associative; compares a boolean with a number
  'A == B && B == C',
  'A == B || B != C',
  'A == B ? 1 : 2',
  'A ? B == C : 0',
  'A & B == C', // == binds tighter than &
  'A | B == C',
  '!A == B', // unary binds tighter than ==
  'A == !B',
  '-A == B',
  'A == -B',
  'typeof A == "number"',
  'void A == undefined',
  'await f(A) == B',
  'A == await f(B)',
  '1 + await f(A) == B',
  'await f(A) + 1 == B + 1',
  'f2(A == B, B == C)',
  '[A == B, B != C][0]',
  '(A, B == C)',
  'A == B ? B == C : C == A',
]

const VALUES = [0, 1, 2, -1]

function expressions(): string[] {
  const out: string[] = []
  for (const shape of SHAPES)
    for (const a of VALUES)
      for (const b of VALUES)
        for (const c of [0, 2])
          out.push(
            shape
              .replaceAll('A', `(${a})`)
              .replaceAll('B', `(${b})`)
              .replaceAll('C', `(${c})`)
          )
  return out
}

async function viaTjs(expr: string): Promise<unknown> {
  const src = `async function probe(f, f2) { return ${expr} }`
  const code = tjs(src, { runTests: false }).code
  return await new Function(`${code}\nreturn probe`)()(
    async (x: number) => x,
    (x: unknown, y: unknown) => [x, y]
  )
}

async function viaJs(expr: string): Promise<unknown> {
  // `==` → `===`; `!=` → `!==`. The operands are numbers and booleans, so this IS what TJS
  // equality means for them.
  const strict = expr.replace(/([!=])=(?!=)/g, '$1==')
  return await new Function('f', 'f2', `return (async () => (${strict}))()`)(
    async (x: number) => x,
    (x: unknown, y: unknown) => [x, y]
  )
}

describe('== groups its operands as JavaScript does', () => {
  const exprs = expressions()

  it('the corpus is large and exercises the rewrite (apparatus)', () => {
    expect(exprs.length).toBeGreaterThan(400)
    expect(tjs('const q = 1 == 2', { runTests: false }).code).toContain('Eq(')
  })

  it('every expression agrees with JavaScript', async () => {
    const prev = (globalThis as any).__tjs
    ;(globalThis as any).__tjs = createRuntime()
    const wrong: string[] = []
    try {
      for (const e of exprs) {
        let got: unknown
        try {
          got = await viaTjs(e)
        } catch (err) {
          got = `threw ${(err as Error).message.split('\n')[0]}`
        }
        const want = await viaJs(e)
        if (JSON.stringify(got) !== JSON.stringify(want))
          wrong.push(
            `${e}  → TJS ${JSON.stringify(got)}, JS ${JSON.stringify(want)}`
          )
      }
    } finally {
      ;(globalThis as any).__tjs = prev
    }
    expect(wrong.slice(0, 20)).toEqual([])
  })
})
