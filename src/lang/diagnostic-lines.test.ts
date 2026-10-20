/**
 * A compile error points at the line it is about.
 *
 * `extractTests` returned the code with its `test` blocks CUT OUT, runs of blank lines
 * collapsed and the ends trimmed, and every pass after it (the parser, `preprocess`, the wasm
 * scanner) reported positions in that shortened text. So an error below a `test` block, or
 * below a few comment lines (blanked to whitespace by `stripLineComments`, then trimmed away),
 * named the wrong line, which in most real files means every error, since tests sit above the
 * code they test. Found because the WASM QuickStart's new "discarded value" error said line 3
 * for code on line 8.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { transformTypeDeclarations } from './parser-transforms'

/** The line a compile error reports, from `<source>:LINE:COL` in its message. */
function reportedLine(source: string): number | undefined {
  try {
    tjs(source, { runTests: false })
  } catch (e: any) {
    const m = String(e?.message).match(/:(\d+):\d+/)
    return m ? Number(m[1]) : undefined
  }
  return undefined
}

/** The 1-based line of the first line containing `needle`. */
const lineOf = (source: string, needle: string) =>
  source.split('\n').findIndex((l) => l.includes(needle)) + 1

describe('compile errors name the right line', () => {
  it('below a test block', () => {
    const src = `test 'adds' {
  expect(1 + 1).toBe(2)
}

function f() {
  var x = 1
  return x
}`
    expect(reportedLine(src)).toBe(lineOf(src, 'var x'))
  })

  it('below leading comment lines', () => {
    const src = `// a header comment
// and another



function f() {
  var x = 1
  return x
}`
    expect(reportedLine(src)).toBe(lineOf(src, 'var x'))
  })

  it('in a wasm block below comments (the QuickStart case)', () => {
    const src = `// a header comment
// and another

function add(! a: 0, b: 0):! 0 {
  return wasm {
    a + b
  } fallback {
    return a + b
  }
}`
    expect(reportedLine(src)).toBe(lineOf(src, '    a + b'))
  })
})

/**
 * A RUNTIME error names the right line after a declaration block (#3404). Each declaration
 * form became one line of output, so a type error from a function below a four-line `Type`
 * said line 2 for a function on line 5. Compile errors were fixed above; this is the
 * `<source>:LINE:` in a type error's path, read from the emitted metadata.
 */
describe('runtime errors name the right line after a declaration', () => {
  const runtimeLine = (src: string): number | undefined => {
    const r = tjs(src, { runTests: false })
    const f = new Function(`${r.code}\nreturn f`)()
    const m = String(f('not a number')?.message).match(/:(\d+):f\.n/)
    return m ? Number(m[1]) : undefined
  }
  const FN = `function f(n: 0) {\n  return n\n}`

  for (const [form, decl] of [
    [
      'Type',
      `Type Point {\n  description: 'a point'\n  example: { x: 0, y: 0 }\n}`,
    ],
    [
      'Generic',
      `Generic Box<T> {\n  description: 'a box'\n  predicate(x, T) { return true }\n}`,
    ],
    [
      'FunctionPredicate',
      `FunctionPredicate Callback {\n  params: { x: 0 }\n  returns: ''\n}`,
    ],
    ['Union', `Union Dir 'a direction'\n  'up'\n  | 'down'`],
    ['Enum', `Enum Color 'a colour' {\n  Red = 'red'\n  Green = 'green'\n}`],
  ]) {
    it(`after a ${form}`, () => {
      const src = `${decl}\n\n${FN}`
      expect(runtimeLine(src)).toBe(lineOf(src, 'function f'))
    })
  }

  it('after two declarations and a test block', () => {
    const src = `Type A {\n  example: { a: 0 }\n}\ntest 'a' {\n  expect(1).toBe(1)\n}\nType B {\n  example: { b: '' }\n}\n${FN}`
    expect(runtimeLine(src)).toBe(lineOf(src, 'function f'))
  })
})

/**
 * Keeping the line count must not cost a quadratic transform. The first `lineKeeper` read
 * the output (a rope) on every copied character, which flattened it each time, and the
 * dogfood conversion overran its 180s budget; the second read it once per declaration and
 * was still superlinear (247ms vs 75ms at 718KB). Best of N, as in param-markers.test.ts.
 */
describe('the declaration transforms stay linear', () => {
  const gen = (n: number) =>
    Array.from(
      { length: n },
      (_, k) =>
        `Type T${k} {\n  example: { a: 0, b: '' }\n}\nfunction f${k}(x: 0) {\n  const s = 'text ${k}'\n  return x + ${k}\n}\n`
    ).join('\n')
  const time = (src: string) => {
    transformTypeDeclarations(src)
    let best = Infinity
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now()
      transformTypeDeclarations(src)
      best = Math.min(best, performance.now() - t0)
    }
    return best
  }

  it('quadrupling the input does not 16× the work', () => {
    const ratio = time(gen(3200)) / Math.max(time(gen(800)), 0.1)
    // Linear predicts ~4× (measured 16ms → 36ms over a similar 4× pair). This catches the
    // per-character quadratic version; the per-declaration one measured only ~5× over 4×
    // (18ms → 91ms) and would pass, so it is pinned by the design (`keep` never reads the
    // output), not by this number.
    expect(ratio).toBeLessThan(8)
  })
})
