import { describe, it, expect } from 'bun:test'
import { FunctionPredicate } from '../types/Type'
import { preprocess } from './parser'
import { tjs } from './index'
import { fromTS } from './emitters/from-ts'

describe('FunctionPredicate runtime', () => {
  it('should create a type that accepts functions', () => {
    const Callback = FunctionPredicate('Callback', {
      params: { x: 0 },
      returns: '',
    })
    expect(Callback.check(() => {})).toBe(true)
    expect(Callback.check((x: number) => String(x))).toBe(true)
    expect(Callback.check(42)).toBe(false)
    expect(Callback.check('not a function')).toBe(false)
    expect(Callback.check(null)).toBe(false)
  })

  it('should create from existing typed function', () => {
    const fn = (a: number, b: number) => a + b
    ;(fn as any).__tjs = {
      params: {
        a: { type: { kind: 'integer' }, example: 0 },
        b: { type: { kind: 'integer' }, example: 0 },
      },
      returns: { type: { kind: 'integer' }, example: 0 },
    }
    const Adder = FunctionPredicate('Adder', fn)
    expect(Adder.params).toHaveProperty('a')
    expect(Adder.params).toHaveProperty('b')
    expect(Adder.description).toBe('Adder')
    expect(Adder.__runtimeType).toBe(true)
  })

  it('should have correct return contract', () => {
    const assert = FunctionPredicate('f', {
      returnContract: 'assertReturns',
    })
    const returns = FunctionPredicate('f', { returnContract: 'returns' })
    const checked = FunctionPredicate('f', {
      returnContract: 'checkedReturns',
    })
    expect(assert.returnContract).toBe('assertReturns')
    expect(returns.returnContract).toBe('returns')
    expect(checked.returnContract).toBe('checkedReturns')
  })

  it('should default to assertReturns contract', () => {
    const fp = FunctionPredicate('f', {})
    expect(fp.returnContract).toBe('assertReturns')
  })
})

describe('FunctionPredicate parser transform', () => {
  it('should transform block form', () => {
    const result = preprocess(
      "FunctionPredicate Callback {\n  params: { x: 0 }\n  returns: ''\n}"
    )
    expect(result.source).toContain("FunctionPredicate('Callback'")
    expect(result.source).toContain('params: { x: 0 }')
    expect(result.source).toContain("returns: ''")
  })

  it('should transform function form', () => {
    const result = preprocess(
      "FunctionPredicate Handler(myFn, 'event handler')"
    )
    expect(result.source).toContain("FunctionPredicate('event handler'")
    expect(result.source).toContain('myFn')
  })

  it('should transpile block form through full pipeline', () => {
    const result = tjs(
      "FunctionPredicate Callback {\n  params: { x: 0 }\n  returns: false\n}",
      { runTests: false }
    )
    expect(result.code).toContain('FunctionPredicate')
    expect(result.code).toContain('Callback')
  })
})

describe('FunctionPredicate in fromTS', () => {
  it('should convert function type alias to FunctionPredicate', () => {
    const result = fromTS(
      'type Callback = (x: number) => void',
      { emitTJS: true }
    )
    expect(result.code).toContain('FunctionPredicate Callback')
    expect(result.code).toContain('params: { x: 0.0 }')
  })

  it('should convert function type with return to FunctionPredicate', () => {
    const result = fromTS(
      'type Mapper = (value: string) => number',
      { emitTJS: true }
    )
    expect(result.code).toContain('FunctionPredicate Mapper')
    expect(result.code).toContain("params: { value: '' }")
    expect(result.code).toContain('returns: 0.0')
  })

  it('should handle inline function params', () => {
    const result = fromTS(
      'function process(cb: (x: number) => string): void {}',
      { emitTJS: true }
    )
    expect(result.code).toContain("FunctionPredicate('function'")
  })

  it('should handle void function type', () => {
    const result = fromTS(
      'type VoidFn = () => void',
      { emitTJS: true }
    )
    expect(result.code).toContain('FunctionPredicate VoidFn')
  })

  it('should preserve export on function type alias', () => {
    const result = fromTS(
      'export type Handler = (event: Event) => boolean',
      { emitTJS: true }
    )
    expect(result.code).toContain('export FunctionPredicate Handler')
  })
})
