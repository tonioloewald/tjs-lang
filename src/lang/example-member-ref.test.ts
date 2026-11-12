/**
 * A member expression in a Type example is a REFERENCE, never a silent "anything" (#4052).
 *
 * `markExampleKinds` turned a bare name (`cells: [Cell]`) into a lazy reference, but left a
 * member expression as a plain value. A Type has no `.example` property, so the natural
 * spelling `cells: [Cell.example]` evaluated to `[undefined]` and the field accepted
 * `{ row: 'x' }` without a word. Found writing the Tetris chapter of the book.
 *
 * Now `X.example` means the type `X` (what a reader means by it), any other member chain
 * (`shapes.Cell`) is a lazy reference read when the value is checked, and a reference that
 * reads `undefined` is recorded as unchecked (flight recorder), exactly as an undeclared name is
 * (TJS ⊇ JS: an unreadable example degrades with a warning, it never crashes the module).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

function load(src: string, names: string[], withRuntime: boolean) {
  const saved = (globalThis as any).__tjs
  if (withRuntime) (globalThis as any).__tjs = createRuntime()
  else delete (globalThis as any).__tjs
  try {
    return new Function(tjs(src).code + `\nreturn [${names.join(',')}]`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

const CELL = 'Type Cell { example: { row: 0, column: 0 } }\n'

/** [declarations, a value that must PASS, a value that must FAIL] */
const CASES: [string, string, unknown, unknown][] = [
  [
    'a field written X.example',
    `${CELL}Type T { example: { c: Cell.example } }`,
    { c: { row: 1, column: 2 } },
    { c: { row: 'x' } },
  ],
  [
    'list items written [X.example]',
    `${CELL}Type T { example: { cells: [Cell.example] } }`,
    { cells: [{ row: 1, column: 2 }] },
    { cells: [{ row: 'x' }] },
  ],
  [
    'a Type reached through an object',
    `${CELL}const shapes = { Cell }\nType T { example: { c: shapes.Cell } }`,
    { c: { row: 1, column: 2 } },
    { c: { row: 'x' } },
  ],
  [
    'a member declared AFTER the type (read when checked)',
    `Type T { example: { c: later.Cell } }\n${CELL}const later = { Cell }`,
    { c: { row: 1, column: 2 } },
    { c: { row: 'x' } },
  ],
  [
    'X.default still means the example value',
    `${CELL}Type T { example: { c: Cell.default } }`,
    { c: { row: 1, column: 2 } },
    { c: { row: 'x' } },
  ],
]

for (const withRuntime of [false, true])
  describe(`member expressions in Type examples (${
    withRuntime ? 'full runtime' : 'inline stub'
  })`, () => {
    for (const [what, src, pass, fail] of CASES)
      it(what, () => {
        const [T] = load(src, ['T'], withRuntime)
        expect(T.check(pass)).toBe(true)
        expect(T.check(fail)).not.toBe(true)
      })

    it('a member that reads undefined is recorded as UNCHECKED', () => {
      // The warning goes to the flight recorder, the runtime's record of what it noticed.
      const saved = (globalThis as any).__tjs
      const rt = ((globalThis as any).__tjs = createRuntime())
      try {
        const src = `const shapes = {}\nType T { example: { c: shapes.Typo } }`
        const T = new Function(tjs(src).code + '\nreturn T')()
        expect(T.check({ c: 1 })).toBe(true)
        const said = rt
          .records({ severity: 'warning' })
          .map((r: any) => r.message)
        expect(said.join('\n')).toMatch(/shapes\.Typo.*UNCHECKED/)
      } finally {
        ;(globalThis as any).__tjs = saved
      }
    })
  })

it('a computed member or a call is a value, as before', () => {
  for (const src of [
    `const xs = [{ a: 0 }]\nType T { example: { c: xs[0] } }`,
    `function mk() { return { a: 0 } }\nType T { example: { c: mk() } }`,
  ]) {
    const [T] = load(src, ['T'], false)
    expect(T.check({ c: { a: 5 } })).toBe(true)
    expect(T.check({ c: { a: 'x' } })).not.toBe(true)
  }
})
