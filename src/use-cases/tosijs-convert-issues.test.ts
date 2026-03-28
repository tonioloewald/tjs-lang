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

  test('rest parameter called with no args rejected as non-array', () => {
    // In tosijs elements.ts, element creators use rest params:
    //   function create(...contents: ElementPart[]) { ... }
    //
    // Calling create() with no args is valid TS — contents becomes [].
    // But tjs convert emits a type check that rejects undefined:
    //   if (!Array.isArray(contents)) return typeError(...)
    //
    // This causes elements.input(), elements.div(), etc. to silently
    // return a MonadicError instead of an HTMLElement, breaking all
    // DOM-related tests.

    const source = `
function create(...contents: string[]): string {
  return contents.join(', ')
}

const result = create()
console.log(result)
`
    // Step 1: TS → TJS
    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'rest-param.ts',
    })

    // Step 2: TJS → JS
    const jsResult = tjs(tjsResult.code, {
      filename: 'rest-param.ts',
      runTests: false,
    })

    // Calling with no args should work — rest params default to []
    const fn = new Function(jsResult.code + '\n return result;')
    const result = fn()
    expect(result).toBe('') // [].join(', ') === ''
  })

  test('literal "any" emitted as runtime value in interface/type', () => {
    // In tosijs form-validation.ts, an interface has a property typed as `any`:
    //   interface FormValidation { validity: any; ... }
    //
    // The TS→TJS→JS pipeline emits a Type() call with the literal `any`
    // as a JS value: Type('FormValidation', undefined, { validity: any | undefined })
    // which throws: ReferenceError: any is not defined
    //
    // The converter should emit null or skip the field for `any` types.

    const source = `
export interface FormValidation {
  internals: any
  validity: any | undefined
  validationMessage: string
  willValidate: boolean
}
`
    const tjsResult = fromTS(source, { emitTJS: true, filename: 'any-type.ts' })
    const jsResult = tjs(tjsResult.code, {
      filename: 'any-type.ts',
      runTests: false,
    })

    // Should not contain bare `any` as a runtime identifier
    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      new Function(safeCode)()
    }).not.toThrow()
  })

  test('TS private keyword should not convert to # (changes semantics)', () => {
    // In tosijs component.ts:
    //   class Component { private static _tagName: string = '' }
    //   function elementCreator(componentClass: typeof Component) {
    //     componentClass._tagName = 'my-tag'  // valid TS — private is compile-time only
    //   }
    //
    // The converter rewrites `private _tagName` to `#_tagName`, which makes
    // the field a true JS private field. External access then fails:
    //   TypeError: Cannot access invalid private field
    //
    // TS `private` is compile-time access control, not JS `#` runtime privacy.
    // The converter should leave `private` fields as regular fields (strip the keyword).

    const source = `
class Component {
  private static _tagName: string = ''

  static getTag() {
    return this._tagName
  }
}

function setup(cls: typeof Component) {
  (cls as any)._tagName = 'my-tag'
}

setup(Component)
const tag = Component.getTag()
`
    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'private-kw.ts',
    })
    const jsResult = tjs(tjsResult.code, {
      filename: 'private-kw.ts',
      runTests: false,
    })

    // Should not convert `private` to `#`
    expect(jsResult.code).not.toContain('#_tagName')

    // The code should execute without error
    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      const fn = new Function(safeCode + '\n return tag;')
      const result = fn()
      if (result !== 'my-tag')
        throw new Error(`Expected 'my-tag', got '${result}'`)
    }).not.toThrow()
  })

  test('static getter loses static keyword during conversion', () => {
    // In tosijs component.ts:
    //   class Component extends HTMLElement {
    //     static _tagName: string | null = null
    //     static get tagName() { return this._tagName }
    //   }
    //
    // The converter emits `get tagName()` (instance getter) instead of
    // `static get tagName()`. This overrides HTMLElement.tagName with a
    // getter that returns null, crashing the constructor.

    const source = `
class Foo {
  static _label: string = ''
  static get label() { return this._label }
  static set label(v: string) { this._label = v }
}
`
    // The bug is in TS→TJS: static is dropped from getters/setters
    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'static-getter.ts',
    })
    expect(tjsResult.code).toContain('static get label')
    expect(tjsResult.code).toContain('static set label')
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
