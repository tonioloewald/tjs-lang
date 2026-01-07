import { describe, test, expect } from 'bun:test'
import { js, AgentVM } from '..'

describe('Builtins', () => {
  const vm = new AgentVM()

  test('Math methods work', async () => {
    const ast = js(`
      function testMath() {
        let a = Math.floor(3.7)
        let b = Math.ceil(3.2)
        let c = Math.abs(-5)
        let d = Math.max(1, 5, 3)
        let e = Math.PI
        let f = Math.sqrt(16)
        return { a, b, c, d, e, f }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.a).toBe(3)
    expect(result.result.b).toBe(4)
    expect(result.result.c).toBe(5)
    expect(result.result.d).toBe(5)
    expect(result.result.e).toBeCloseTo(3.14159, 4)
    expect(result.result.f).toBe(4)
  })

  test('Math.random uses crypto when available', async () => {
    const ast = js(`
      function testRandom() {
        let a = Math.random()
        let b = Math.random()
        return { a, b, different: a !== b }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.a).toBeGreaterThanOrEqual(0)
    expect(result.result.a).toBeLessThan(1)
    expect(result.result.b).toBeGreaterThanOrEqual(0)
    expect(result.result.b).toBeLessThan(1)
  })

  test('JSON methods work', async () => {
    const ast = js(`
      function testJSON() {
        let obj = { name: 'test', value: 42 }
        let str = JSON.stringify(obj)
        let parsed = JSON.parse(str)
        return { str, parsed }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.str).toBe('{"name":"test","value":42}')
    expect(result.result.parsed).toEqual({ name: 'test', value: 42 })
  })

  test('Array static methods work', async () => {
    const ast = js(`
      function testArray() {
        let arr = [1, 2, 3]
        let isArr = Array.isArray(arr)
        let notArr = Array.isArray('hello')
        let created = Array.of(4, 5, 6)
        return { isArr, notArr, created }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.isArr).toBe(true)
    expect(result.result.notArr).toBe(false)
    expect(result.result.created).toEqual([4, 5, 6])
  })

  test('Object static methods work', async () => {
    const ast = js(`
      function testObject() {
        let obj = { a: 1, b: 2, c: 3 }
        let keys = Object.keys(obj)
        let values = Object.values(obj)
        return { keys, values }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.keys).toEqual(['a', 'b', 'c'])
    expect(result.result.values).toEqual([1, 2, 3])
  })

  test('Global functions work', async () => {
    const ast = js(`
      function testGlobals() {
        let a = parseInt('42')
        let b = parseFloat('3.14')
        let c = isNaN(NaN)
        let d = isFinite(100)
        let e = encodeURIComponent('hello world')
        return { a, b, c, d, e }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.a).toBe(42)
    expect(result.result.b).toBeCloseTo(3.14, 2)
    expect(result.result.c).toBe(true)
    expect(result.result.d).toBe(true)
    expect(result.result.e).toBe('hello%20world')
  })

  test('String instance methods work', async () => {
    const ast = js(`
      function testStringMethods() {
        let str = 'hello world'
        let upper = str.toUpperCase()
        let parts = str.split(' ')
        let trimmed = '  padded  '.trim()
        let replaced = str.replace('world', 'there')
        return { upper, parts, trimmed, replaced }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.upper).toBe('HELLO WORLD')
    expect(result.result.parts).toEqual(['hello', 'world'])
    expect(result.result.trimmed).toBe('padded')
    expect(result.result.replaced).toBe('hello there')
  })

  test('Array instance methods work', async () => {
    const ast = js(`
      function testArrayMethods() {
        let arr = [3, 1, 4, 1, 5]
        let joined = arr.join('-')
        let includes = arr.includes(4)
        let indexOf = arr.indexOf(1)
        let sliced = arr.slice(1, 3)
        return { joined, includes, indexOf, sliced }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.joined).toBe('3-1-4-1-5')
    expect(result.result.includes).toBe(true)
    expect(result.result.indexOf).toBe(1)
    expect(result.result.sliced).toEqual([1, 4])
  })

  test('Number static methods work', async () => {
    const ast = js(`
      function testNumber() {
        let a = Number.isInteger(5)
        let b = Number.isInteger(5.5)
        let c = Number.isNaN(NaN)
        let d = Number.MAX_SAFE_INTEGER
        return { a, b, c, d }
      }
    `)
    const result = await vm.run(ast, {})
    expect(result.error).toBeUndefined()
    expect(result.result.a).toBe(true)
    expect(result.result.b).toBe(false)
    expect(result.result.c).toBe(true)
    expect(result.result.d).toBe(9007199254740991)
  })

  test('Unsupported builtins give helpful transpile errors', () => {
    // setTimeout should fail at transpile time with a helpful message
    expect(() => {
      js(`
        function testSetTimeout() {
          let x = setTimeout(() => {}, 100)
          return { x }
        }
      `)
    }).toThrow('setTimeout is not available')
  })

  test("'new' keyword is caught at transpile time with helpful error for Date", () => {
    expect(() => {
      js(`
        function test() {
          let d = new Date()
          return { d }
        }
      `)
    }).toThrow("The 'new' keyword is not supported")
    expect(() => {
      js(`
        function test() {
          let d = new Date()
          return { d }
        }
      `)
    }).toThrow("Use Date() or Date('2024-01-15')")
  })

  test("'new' keyword is caught at transpile time with helpful error for Set", () => {
    expect(() => {
      js(`
        function test() {
          let s = new Set([1, 2, 3])
          return { s }
        }
      `)
    }).toThrow("The 'new' keyword is not supported")
    expect(() => {
      js(`
        function test() {
          let s = new Set([1, 2, 3])
          return { s }
        }
      `)
    }).toThrow('Use Set([items])')
  })

  test("'new' keyword is caught for unknown constructors", () => {
    expect(() => {
      js(`
        function test() {
          let x = new SomeClass()
          return { x }
        }
      `)
    }).toThrow("The 'new' keyword is not supported")
    expect(() => {
      js(`
        function test() {
          let x = new SomeClass()
          return { x }
        }
      `)
    }).toThrow('Use factory functions or object literals')
  })
})
