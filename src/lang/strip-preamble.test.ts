/**
 * `stripTjsPreamble` (exported from `tjs-lang/lang`) removes the `__tjs` setup line so a test
 * runner can supply its own runtime. It matched one literal spelling of that line, which the
 * emitter had stopped producing, so it stripped nothing and nothing noticed. This pins it to
 * the line the emitter actually writes.
 */
import { describe, it, expect } from 'bun:test'
import { tjs, stripTjsPreamble } from './index'

describe('stripTjsPreamble strips the preamble the emitter actually writes', () => {
  it('removes the one `const __tjs =` line and nothing else', () => {
    const code = tjs('function f(x: 0):! 0 { return x }').code
    expect(code).toMatch(/^const __tjs = /m) // apparatus: the line is there to strip
    const stripped = stripTjsPreamble(code)
    expect(stripped).not.toMatch(/^const __tjs = /m)
    expect(code.split('\n').length - stripped.split('\n').length).toBe(1)
  })
  it('the stripped module runs against a runtime the caller provides', () => {
    const { createRuntime } = require('./runtime')
    const stripped = stripTjsPreamble(
      tjs('function f(x: 0):! 0 { return x }').code
    )
    const f = new Function('__tjs', stripped + '\nreturn f')(createRuntime())
    expect(f(2)).toBe(2)
    expect(f('no')).toBeInstanceOf(Error)
  })
})
