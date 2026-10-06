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
