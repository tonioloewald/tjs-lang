/**
 * Issues discovered converting tosijs to JS via `tjs convert`
 *
 * These are minimal reproductions of bugs found when running
 * `tjs convert src/ -o tjs-out/` on the tosijs codebase and
 * then running the transpiled tests with `bun test tjs-out/`.
 */

import { describe, test, expect } from 'bun:test'
import { fromTS } from '../lang/emitters/from-ts'
import { tjs } from '../lang'

describe('tosijs convert issues', () => {
  test('symbol in union type emits invalid JS (false | Symbol bitwise OR)', () => {
    // tjs convert does TS→TJS (via fromTS) then TJS→JS (via tjs()).
    // When a function return type is `boolean | symbol`, the TJS→JS
    // pipeline emits: FunctionPredicate(..., { returns: false | Symbol('example') })
    // JS interprets `false | Symbol(...)` as bitwise OR, throwing:
    //   TypeError: Cannot convert a symbol to a number
    //
    // This crashes the module at load time.
    // Reproduces the pattern from tosijs/src/xin-types.ts.

    const source = `
type OptionalSymbol = symbol | undefined
type _BooleanFunction = () => boolean
type _PathTestFunction = (path: string) => boolean | symbol
export type PathTestFunction = _BooleanFunction | _PathTestFunction

type _CallbackFunction = (() => void) | (() => OptionalSymbol)
type _PathCallbackFunction = ((path: string) => void) | ((path: string) => OptionalSymbol)
export type ObserverCallbackFunction = _PathCallbackFunction | _CallbackFunction
`
    // Step 1: TS → TJS
    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'symbol-union.ts',
    })

    // Step 2: TJS → JS (this is where the bad code is emitted)
    const jsResult = tjs(tjsResult.code, {
      filename: 'symbol-union.ts',
      runTests: false,
    })

    // The emitted code should not contain bitwise OR with Symbol
    expect(jsResult.code).not.toMatch(/false\s*\|\s*Symbol/)
    expect(jsResult.code).not.toMatch(/'\w+'\s*\|\s*Symbol/)

    // The emitted code should not crash when evaluated
    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      new Function(safeCode)()
    }).not.toThrow()
  })

  test('shorthand property assignment in destructuring converts', () => {
    // component.test.ts fails to convert with:
    //   "Shorthand property assignments are valid only in destructuring patterns"
    //
    // Minimal pattern that triggers the error:
    //   const { mode = 'default' } = getConfig()

    const source = `
function getConfig(): { mode?: string } {
  return {}
}

const { mode = 'default' } = getConfig()
console.log(mode)
`
    const result = fromTS(source, { filename: 'shorthand.ts' })
    expect(result.code).toBeDefined()
    expect(result.code).toContain('mode')
  })
})
