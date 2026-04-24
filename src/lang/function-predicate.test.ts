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
    expect(Callback.check(42)).toBe('expected function, got number')
    expect(Callback.check('not a function')).toBe(
      'expected function, got string'
    )
    expect(Callback.check(null)).toBe('expected function, got null')
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

  it('should reject function with wrong arity via __tjs metadata', () => {
    const Binop = FunctionPredicate('Binop', {
      params: { a: 0, b: 0 },
      returns: 0,
    })
    // Function with matching arity + types → pass
    const goodFn = (a: number, b: number) => a + b
    ;(goodFn as any).__tjs = {
      params: {
        a: { type: { kind: 'integer' }, example: 0 },
        b: { type: { kind: 'integer' }, example: 0 },
      },
    }
    expect(Binop.check(goodFn)).toBe(true)

    // Function with wrong arity → fail
    const wrongArity = (x: number) => x
    ;(wrongArity as any).__tjs = {
      params: {
        x: { type: { kind: 'integer' }, example: 0 },
      },
    }
    expect(Binop.check(wrongArity)).toBe('expected 2 params, got 1')
  })

  it('should reject function with wrong param types via __tjs metadata', () => {
    const StrFn = FunctionPredicate('StrFn', {
      params: { name: '' },
      returns: '',
    })
    // Function with string param → pass
    const goodFn = (s: string) => s
    ;(goodFn as any).__tjs = {
      params: { s: { type: { kind: 'string' }, example: '' } },
    }
    expect(StrFn.check(goodFn)).toBe(true)

    // Function with number param → fail
    const badFn = (n: number) => String(n)
    ;(badFn as any).__tjs = {
      params: { n: { type: { kind: 'integer' }, example: 0 } },
    }
    expect(StrFn.check(badFn)).toBe("param 'name' expected string, got integer")
  })

  it('should accept function with any-typed params', () => {
    const Binop = FunctionPredicate('Binop', {
      params: { a: 0, b: 0 },
    })
    const fn = (a: any, b: any) => a + b
    ;(fn as any).__tjs = {
      params: {
        a: { type: { kind: 'any' }, example: null },
        b: { type: { kind: 'any' }, example: null },
      },
    }
    expect(Binop.check(fn)).toBe(true)
  })

  it('should accept plain functions without __tjs metadata', () => {
    const Callback = FunctionPredicate('Callback', {
      params: { x: 0 },
    })
    // Plain function with no metadata — should still pass (can't validate)
    expect(Callback.check(() => {})).toBe(true)
    expect(Callback.check(Math.abs)).toBe(true)
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
      'FunctionPredicate Callback {\n  params: { x: 0 }\n  returns: false\n}',
      { runTests: false }
    )
    expect(result.code).toContain('FunctionPredicate')
    expect(result.code).toContain('Callback')
  })
})

describe('FunctionPredicate in fromTS', () => {
  it('should convert function type alias to FunctionPredicate', () => {
    const result = fromTS('type Callback = (x: number) => void', {
      emitTJS: true,
    })
    expect(result.code).toContain('FunctionPredicate Callback')
    expect(result.code).toContain('params: { x: 0.0 }')
  })

  it('should convert function type with return to FunctionPredicate', () => {
    const result = fromTS('type Mapper = (value: string) => number', {
      emitTJS: true,
    })
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
    const result = fromTS('type VoidFn = () => void', { emitTJS: true })
    expect(result.code).toContain('FunctionPredicate VoidFn')
  })

  it('should preserve export on function type alias', () => {
    const result = fromTS('export type Handler = (event: Event) => boolean', {
      emitTJS: true,
    })
    expect(result.code).toContain('export FunctionPredicate Handler')
  })
})

describe('FunctionPredicate regression fixes', () => {
  it('should handle nested braces in params (registry.tjs bug)', () => {
    const result = preprocess(
      "FunctionPredicate BindFunc {\n  params: { element: {}, path: '', binding: null, options: null }\n}"
    )
    expect(result.source).toContain("FunctionPredicate('BindFunc'")
    expect(result.source).toContain('element: {}')
    expect(result.source).toContain("path: ''")
    expect(result.source).toContain('options: null')
  })

  it('should handle FunctionPredicate call in return type position', () => {
    const result = tjs(
      "function makeStyle(spec: {}):! FunctionPredicate('function', { params: { el: {} } }) {\n  return (el) => el\n}",
      { runTests: false }
    )
    // Should not error — FunctionPredicate(...) is a valid return type
    expect(result.code).toContain('function makeStyle(spec)')
  })
})

describe('Generic FunctionPredicate runtime', () => {
  it('should create a factory from type params', () => {
    const Creator = FunctionPredicate('Creator', [['T', {}]], (T: any) => ({
      params: { contents: [null] },
      returns: T,
    }))
    // Should be a callable factory
    expect(typeof Creator).toBe('function')
    expect((Creator as any).description).toBe('Creator')
    expect((Creator as any).typeParamNames).toEqual(['T'])
    expect((Creator as any).__runtimeType).toBe(true)
  })

  it('should instantiate with type arg', () => {
    const Creator = FunctionPredicate('Creator', [['T', {}]], (T: any) => ({
      params: { x: '' },
      returns: T,
    })) as any
    const StringCreator = Creator('')
    expect(StringCreator.returns).toBe('')
    expect(StringCreator.params.x).toBe('')
    expect(StringCreator.check(() => {})).toBe(true)
    expect(StringCreator.check(42)).toBe('expected function, got number')
  })

  it('should use default type arg when none provided', () => {
    const Creator = FunctionPredicate(
      'Creator',
      [['T', 'default']],
      (T: any) => ({
        params: { x: 0 },
        returns: T,
      })
    ) as any
    const instance = Creator()
    expect(instance.returns).toBe('default')
  })

  it('should handle multiple type params', () => {
    const Mapper = FunctionPredicate(
      'Mapper',
      ['T', ['U', '']],
      (T: any, U: any) => ({
        params: { input: T },
        returns: U,
      })
    ) as any
    const NumToStr = Mapper(0, '')
    expect(NumToStr.params.input).toBe(0)
    expect(NumToStr.returns).toBe('')
    expect(NumToStr.check(() => {})).toBe(true)
  })
})

describe('Generic FunctionPredicate parser transform', () => {
  it('should transform generic block form', () => {
    const result = preprocess(
      "FunctionPredicate Creator<T = {}> {\n  params: { x: '' }\n  returns: T\n}"
    )
    expect(result.source).toContain("FunctionPredicate('Creator'")
    expect(result.source).toContain("['T', {}]")
    expect(result.source).toContain('(T) =>')
    expect(result.source).toContain('returns: T')
  })

  it('should transform multiple type params', () => {
    const result = preprocess(
      "FunctionPredicate Mapper<T, U = ''> {\n  params: { input: T }\n  returns: U\n}"
    )
    expect(result.source).toContain("'T'")
    expect(result.source).toContain("['U', '']")
    expect(result.source).toContain('(T, U) =>')
  })

  it('should transpile generic form through full pipeline', () => {
    const result = tjs(
      'FunctionPredicate Creator<T = {}> {\n  params: { x: 0 }\n  returns: T\n}',
      { runTests: false }
    )
    expect(result.code).toContain('FunctionPredicate')
    expect(result.code).toContain('Creator')
  })
})

describe('Generic FunctionPredicate in fromTS', () => {
  it('should convert generic function type alias', () => {
    const result = fromTS('type Creator<T> = (x: string) => T', {
      emitTJS: true,
    })
    expect(result.code).toContain('FunctionPredicate Creator<T>')
    expect(result.code).toContain("params: { x: '' }")
    expect(result.code).toContain('returns: T')
  })

  it('should convert generic function type with default', () => {
    const result = fromTS('type Factory<T = {}> = (name: string) => T', {
      emitTJS: true,
    })
    expect(result.code).toMatch(/FunctionPredicate Factory<T = \{[\s]*\}>/)
    expect(result.code).toContain('returns: T')
  })

  it('should convert generic function type with multiple params', () => {
    const result = fromTS(
      'type Mapper<T, U> = (input: T, index: number) => U',
      { emitTJS: true }
    )
    expect(result.code).toContain('FunctionPredicate Mapper<T, U>')
    expect(result.code).toContain('input: T')
    expect(result.code).toContain('index: 0.0')
    expect(result.code).toContain('returns: U')
  })

  it('should preserve export on generic function type', () => {
    const result = fromTS('export type Creator<T> = (x: string) => T', {
      emitTJS: true,
    })
    expect(result.code).toContain('export FunctionPredicate Creator<T>')
  })
})
