/* tjs <- input.ts */

import { describe, test, expect } from 'bun:test'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang'

describe('tosijs convert issues', () => {
  test('symbol in union type emits invalid JS (false | Symbol bitwise OR)', () => {
    const source = `
type OptionalSymbol = symbol | undefined
type _BooleanFunction = () => boolean
type _PathTestFunction = (path: string) => boolean | symbol
export type PathTestFunction = _BooleanFunction | _PathTestFunction

type _CallbackFunction = (() => void) | (() => OptionalSymbol)
type _PathCallbackFunction = ((path: string) => void) | ((path: string) => OptionalSymbol)
export type ObserverCallbackFunction = _PathCallbackFunction | _CallbackFunction
`

    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'symbol-union.ts',
    })

    const jsResult = tjs(tjsResult.code, {
      filename: 'symbol-union.ts',
      runTests: false,
    })

    expect(jsResult.code).not.toMatch(/false\s*\|\s*Symbol/)
    expect(jsResult.code).not.toMatch(/'\w+'\s*\|\s*Symbol/)

    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      new Function(safeCode)()
    }).not.toThrow()
  })
  test('rest parameter called with no args rejected as non-array', () => {
    const source = `
function create(...contents: string[]): string {
  return contents.join(', ')
}

const result = create()
console.log(result)
`

    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'rest-param.ts',
    })

    const jsResult = tjs(tjsResult.code, {
      filename: 'rest-param.ts',
      runTests: false,
    })

    const fn = new Function(jsResult.code + '\n return result;')
    const result = fn()
    expect(result).toBe('')
  })
  test('literal "any" emitted as runtime value in interface/type', () => {
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

    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      new Function(safeCode)()
    }).not.toThrow()
  })
  test('TS private keyword should not convert to # (changes semantics)', () => {
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

    expect(jsResult.code).not.toContain('#_tagName')

    const safeCode = jsResult.code.replace(/^export /gm, '')
    expect(() => {
      const fn = new Function(safeCode + '\n return tag;')
      const result = fn()
      if (result !== 'my-tag')
        throw new Error(`Expected 'my-tag', got '${result}'`)
    }).not.toThrow()
  })
  test('static getter loses static keyword during conversion', () => {
    const source = `
class Foo {
  static _label: string = ''
  static get label() { return this._label }
  static set label(v: string) { this._label = v }
}
`

    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'static-getter.ts',
    })
    expect(tjsResult.code).toContain('static get label')
    expect(tjsResult.code).toContain('static set label')
  })
  test('destructured arrow param in class property fails TJS parse', () => {
    const source = `
class TestComponent {
  content = ({ div, span }: { div: Function, span: Function }) => [
    div({ part: 'container' }, span({ part: 'label' }, 'Test')),
  ]

  render() {}
}
`
    const tjsResult = fromTS(source, {
      emitTJS: true,
      filename: 'destructured-param.ts',
    })

    expect(tjsResult.code).toContain('content')

    expect(() => {
      tjs(tjsResult.code, {
        filename: 'destructured-param.ts',
        runTests: false,
      })
    }).not.toThrow()
  })
  test('shorthand property assignment in destructuring converts', () => {
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
