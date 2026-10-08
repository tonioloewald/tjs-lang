/**
 * `tjs()` returns its runtime prelude separately (`prelude`, `body`), so a REPL host can
 * evaluate ONE line for its value (tjs-lang #3134, from tosijs-ui 1.16.9).
 *
 * tosijs-ui's console runs each line through the example's transform. With the prelude in
 * front of the translated line, the host could not tell where the setup ended: a
 * declaration evaluated to the prelude's last assignment (it printed the `__tjs.toBool`
 * function), and an `await` line, which needs an expression wrapper, had no value at all.
 *
 * The host below does what tosijs-ui's does: try `return (line)`, fall back to running the
 * line as statements. The difference is that the prelude now runs first, on its own.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/** Evaluate one transpiled line the way a console does, with `x` in scope. */
async function consoleLine(line: string, x: unknown) {
  const { prelude, body } = tjs(line, { runTests: false })
  try {
    return await new AsyncFunction('x', `${prelude}\nreturn (${body}\n)`)(x)
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e
    return await new AsyncFunction('x', `${prelude}\n${body}`)(x)
  }
}

describe('a console line evaluates to its own value', () => {
  it('an expression shows its value, with TJS semantics', async () => {
    expect(await consoleLine(`x == '5'`, 5)).toBe(false)
    expect(await consoleLine(`x == 5`, 5)).toBe(true)
  })

  it('a declaration shows undefined, as a browser console does', async () => {
    // Before: the prelude's last statement was the value, so this printed a function.
    expect(await consoleLine(`const z = x == '5'`, 5)).toBeUndefined()
  })

  it('a line needing both the prelude and await has its value', async () => {
    // Before: undefined. The prelude made the wrapped body a statement list with no value.
    expect(await consoleLine(`(await Promise.resolve(5)) == '5'`, 5)).toBe(
      false
    )
    expect(await consoleLine(`await Promise.resolve(x) == 5`, 5)).toBe(true)
  })
})

describe('prelude and body partition code exactly', () => {
  const sources = [
    `const a = x == '5'`,
    `function f(n: 0) { return n + 1 }`,
    `const s = \`a   \nb\`; const t = s == 'q'`,
    `const plain = 1 + 2`,
  ]
  for (const src of sources)
    it(JSON.stringify(src), () => {
      const r = tjs(src, { runTests: false })
      if (!r.prelude) {
        expect(r.body).toBe(r.code)
        return
      }
      const at = r.code.indexOf(r.prelude)
      expect(at).toBeGreaterThanOrEqual(0)
      expect(r.code.slice(0, at) + r.code.slice(at + r.prelude.length)).toBe(
        r.body
      )
      // the body is the source's translation only: no runtime declarations in it
      expect(r.body).not.toContain('const __tjs_rt =')
      expect(r.body).not.toContain('const __tjs =')
    })

  it('needs-no-runtime code has an empty prelude (apparatus: the partition is exercised)', () => {
    expect(tjs(`const plain = 1 + 2`, { runTests: false }).prelude).toBe('')
    expect(tjs(`const a = x == '5'`, { runTests: false }).prelude).not.toBe('')
  })
})
