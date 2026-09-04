function __ub(v) {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    return v
  }
  return v
}
const __ac = Object.create(null)
function __proj(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  let k
  try {
    k = v.constructor && v.constructor.name
  } catch {
    return v
  }
  let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null
  if (typeof f !== 'function') {
    try {
      f = v.asCompared
    } catch {
      return v
    }
  }
  if (typeof f !== 'function') return v
  let p
  try {
    p = f.call(v)
  } catch {
    return v
  }
  const t = typeof p
  return p === null ||
    p === undefined ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean'
    ? p
    : v
}
const tjsEquals = Symbol.for('tjs.equals')
function Is(a, b) {
  return __goIs(a, b, 0, null)
}
function __goIs(a, b, d, m) {
  if (a != null && typeof a === 'object' && typeof a[tjsEquals] === 'function')
    return a[tjsEquals](b)
  if (b != null && typeof b === 'object' && typeof b[tjsEquals] === 'function')
    return b[tjsEquals](a)
  if (a != null && typeof a === 'object' && typeof a.Equals === 'function')
    return a.Equals(b)
  if (b != null && typeof b === 'object' && typeof b.Equals === 'function')
    return b.Equals(a)
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (d >= 8) {
    if (m === null) m = new WeakMap()
    let s = m.get(a)
    if (s) {
      if (s.has(b)) return true
    } else {
      s = new WeakSet()
      m.set(a, s)
    }
    s.add(b)
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a)
      if (!b.has(k) || !__goIs(v, b.get(k), d + 1, m)) return false
    return true
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof RegExp && b instanceof RegExp)
    return a.toString() === b.toString()
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => __goIs(v, b[i], d + 1, m))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a),
    kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => __goIs(a[k], b[k], d + 1, m))
}
function IsNot(a, b) {
  return !Is(a, b)
}
function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  return t
}
function Generic(tp, pred, d) {
  const c = (a) => {
    if (a === null || a === undefined) return () => true
    if (a.__runtimeType && typeof a.check === 'function')
      return (v) => a.check(v) === true
    if (typeof a === 'function') return (v) => a(v) === true
    return (v) => __match(v, a)
  }
  const f = (...args) => {
    const ck = args.map(c)
    const t = {
      description: d || 'generic',
      __runtimeType: true,
      check: (v) => pred(v, ...ck),
    }
    return t
  }
  f.__runtimeType = true
  f.description = d
  return f
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  Is,
  tjsEquals,
  IsNot,
  Type,
  Generic,
}
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import * as stripComments from '/Users/tonioloewald/tjs-lang/src/strip-comments'

const STRIP_COMMENTS_EXPORTS = Object.keys(stripComments).filter(
  (k) => typeof stripComments[k] === 'function'
)

const STRIP_COMMENTS_VALUES = STRIP_COMMENTS_EXPORTS.map(
  (k) => stripComments[k]
)

import { fromTS as fromTSToTJS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang'

import { emitVerifiedPredicate } from '/Users/tonioloewald/tjs-lang/src/lang/predicate'

import * as fs from 'fs'

import * as path from 'path'

const ANNOTATION = /\/\* tjs <- [^*]*\*\//

/* line 56 */
function flattenModules(files, langDir) {
  let combined = ''
  files.forEach((file, i) => {
    const src = fs.readFileSync(path.join(langDir, file), 'utf-8')

    let code = tjs(fromTSToTJS(src, { filename: file }).code, {
      runTests: false,
    }).code
    if (i > 0) {
      const m = ANNOTATION.exec(code)
      if (m) code = code.slice(m.index + m[0].length)
    }
    combined +=
      code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+\{[^}]*\}\s+from\s+.*$/gm, '')
        .replace(/^export\s+/gm, '') + '\n'
  })
  return combined
}
flattenModules.__tjs = {
  params: {
    files: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
    langDir: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:56',
}

/* line 88 */
function fromTS(source, options = {}) {
  const t = fromTSToTJS(source, options)
  if (options.emitTJS) return t
  return { ...t, code: tjs(t.code, { runTests: false }).code }
}
fromTS.__tjs = {
  params: {
    source: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    options: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: false,
      default: {},
    },
  },
  unsafe: true,
  source: 'input.ts:88',
}

describe('Bootstrap Canary', () => {
  describe('TJS transpiles and executes its own modules', () => {
    it('should bootstrap inference.ts', () => {
      const start = performance.now()

      const sourcePath = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang/inference.ts'
      )
      const source = fs.readFileSync(sourcePath, 'utf-8')

      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart
      expect(result.code).toBeTruthy()
      expect(result.code.length).toBeGreaterThan(100)

      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const module = new Function(`
        ${strippedCode}
        return { inferTypeFromValue, extractLiteralValue, checkType, typeToString };
      `)()
      const execTime = performance.now() - execStart

      const testStart = performance.now()

      expect(module.checkType('hello', { kind: 'string' })).toBe(true)
      expect(module.checkType(42, { kind: 'number' })).toBe(true)
      expect(
        module.checkType([1, 2, 3], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(true)
      expect(
        module.checkType(
          { name: 'test' },
          { kind: 'object', shape: { name: { kind: 'string' } } }
        )
      ).toBe(true)
      expect(module.checkType(null, { kind: 'string', nullable: true })).toBe(
        true
      )
      expect(module.checkType(null, { kind: 'string' })).toBe(false)

      expect(module.typeToString({ kind: 'string' })).toBe('string')
      expect(module.typeToString({ kind: 'number' })).toBe('number')
      expect(
        module.typeToString({ kind: 'array', items: { kind: 'string' } })
      ).toBe('string[]')
      expect(module.typeToString({ kind: 'string', nullable: true })).toBe(
        'string | null'
      )
      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap inference.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })
    it('should bootstrap parser.ts core functions', () => {
      const start = performance.now()

      const sourcePath = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang/parser.ts'
      )
      const source = fs.readFileSync(sourcePath, 'utf-8')

      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart
      expect(result.code).toBeTruthy()

      expect(result.code).toContain('function')
      expect(result.code).toContain('preprocess')
      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap parser.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
      console.log(`    Output:    ${(result.code.length / 1024).toFixed(1)}KB`)
    })
    it('should bootstrap docs.ts and execute it', () => {
      const start = performance.now()

      const sourcePath = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang/docs.ts'
      )
      const source = fs.readFileSync(sourcePath, 'utf-8')

      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart
      expect(result.code).toBeTruthy()

      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')

      const module = new Function(
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${strippedCode}
        return { generateDocs };
      `
      )(...STRIP_COMMENTS_VALUES)
      const execTime = performance.now() - execStart

      const testStart = performance.now()

      const docs = module.generateDocs(`
        /*#
        # Math Functions
        Basic arithmetic operations.
        */

        function add(a: 0, b: 0): 0 {
          return a + b
        }

        function multiply(x: 1, y: 1): 1 {
          return x * y
        }
      `)
      expect(docs).toBeDefined()
      expect(docs.items).toBeDefined()
      expect(docs.items.length).toBeGreaterThan(0)
      expect(docs.markdown).toContain('Math Functions')
      expect(docs.markdown).toContain('function add')
      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap docs.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })
  })
  describe('TJS transpiles and runs its own test code', () => {
    it('should transpile and execute a TJS test file', () => {
      const start = performance.now()

      const tjsSource = `
        function add(a: 0, b: 0): 0 {
          return a + b
        }
        /* @test add(1, 2) is 3 */
        /* @test add(-1, 1) is 0 */
        /* @test add(0, 0) is 0 */

        function greet(name: 'World'): 'Hello, World!' {
          return 'Hello, ' + name + '!'
        }
        /* @test greet('TJS') is 'Hello, TJS!' */
        /* @test greet('Bootstrap') is 'Hello, Bootstrap!' */
      `

      const transpileStart = performance.now()
      const result = tjs(tjsSource, { runTests: 'report' })
      const transpileTime = performance.now() - transpileStart
      expect(result.code).toBeTruthy()
      expect(result.testResults).toBeDefined()

      const passed = result.testResults.filter((r) => r.passed).length
      const failed = result.testResults.filter((r) => !r.passed).length
      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap TJS test execution:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Tests:     ${passed} passed, ${failed} failed`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)

      expect(failed).toBe(0)
      expect(passed).toBeGreaterThan(0)
    })
  })
  describe('Full bootstrap benchmark', () => {
    it('should transpile all TJS lang modules', () => {
      const langDir = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang'
      )
      const files = fs
        .readdirSync(langDir)
        .filter(
          (f) =>
            f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
        )
      const results = []
      const totalStart = performance.now()
      for (const file of files) {
        const filePath = path.join(langDir, file)
        const source = fs.readFileSync(filePath, 'utf-8')
        const start = performance.now()
        try {
          const result = fromTS(source)
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: result.code.length,
            success: true,
          })
        } catch (e) {
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: 0,
            success: false,
            error: e.message,
          })
        }
      }
      const totalTime = performance.now() - totalStart

      console.log(`\n  Full bootstrap - ${files.length} files:`)
      console.log(
        `  ${'File'.padEnd(25)} ${'Time'.padStart(10)} ${'Size'.padStart(
          10
        )} Status`
      )
      console.log(`  ${'-'.repeat(60)}`)
      for (const r of results) {
        const status = r.success ? '✓' : `✗ ${r.error?.slice(0, 30)}`
        console.log(
          `  ${r.file.padEnd(25)} ${(r.time.toFixed(1) + 'ms').padStart(10)} ${(
            (r.size / 1024).toFixed(1) + 'KB'
          ).padStart(10)} ${status}`
        )
      }
      console.log(`  ${'-'.repeat(60)}`)
      console.log(
        `  ${'TOTAL'.padEnd(25)} ${(totalTime.toFixed(1) + 'ms').padStart(10)}`
      )

      const failures = results.filter((r) => !r.success)
      expect(failures.length).toBe(0)
    }, 60_000)
  })
  describe('True self-hosting: transpiled TJS validates types', () => {
    it('should execute transpiled checkType and typeToString', () => {
      const start = performance.now()

      const inferencePath = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang/inference.ts'
      )
      const inferenceSource = fs.readFileSync(inferencePath, 'utf-8')
      const transpileStart = performance.now()
      const inferenceResult = fromTS(inferenceSource)
      const transpileTime = performance.now() - transpileStart
      expect(inferenceResult.code).toBeTruthy()
      expect(inferenceResult.code.length).toBeGreaterThan(1000)

      const execStart = performance.now()
      const strippedInference = inferenceResult.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const inferenceModule = new Function(`
        ${strippedInference}
        return { checkType, typeToString };
      `)()
      const execTime = performance.now() - execStart

      const testStart = performance.now()

      expect(inferenceModule.checkType('hello', { kind: 'string' })).toBe(true)
      expect(inferenceModule.checkType(42, { kind: 'string' })).toBe(false)

      expect(inferenceModule.checkType(42, { kind: 'number' })).toBe(true)
      expect(inferenceModule.checkType('42', { kind: 'number' })).toBe(false)

      expect(inferenceModule.checkType(true, { kind: 'boolean' })).toBe(true)
      expect(inferenceModule.checkType(1, { kind: 'boolean' })).toBe(false)

      expect(inferenceModule.checkType(null, { kind: 'null' })).toBe(true)
      expect(
        inferenceModule.checkType(null, { kind: 'string', nullable: true })
      ).toBe(true)
      expect(inferenceModule.checkType(null, { kind: 'string' })).toBe(false)

      expect(
        inferenceModule.checkType([1, 2, 3], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(['a', 'b'], {
          kind: 'array',
          items: { kind: 'string' },
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType([1, 'a'], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(false)

      expect(
        inferenceModule.checkType(
          { name: 'test', age: 25 },
          {
            kind: 'object',
            shape: { name: { kind: 'string' }, age: { kind: 'number' } },
          }
        )
      ).toBe(true)

      expect(
        inferenceModule.checkType('hello', {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(42, {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(true, {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(false)

      expect(inferenceModule.typeToString({ kind: 'string' })).toBe('string')
      expect(inferenceModule.typeToString({ kind: 'number' })).toBe('number')
      expect(inferenceModule.typeToString({ kind: 'boolean' })).toBe('boolean')
      expect(
        inferenceModule.typeToString({
          kind: 'array',
          items: { kind: 'string' },
        })
      ).toBe('string[]')
      expect(
        inferenceModule.typeToString({ kind: 'string', nullable: true })
      ).toBe('string | null')
      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start
      console.log(`\n  True self-hosting test:`)
      console.log(
        `    Transpile inference.ts: ${transpileTime.toFixed(2)}ms (${(
          inferenceResult.code.length / 1024
        ).toFixed(1)}KB)`
      )
      console.log(`    Execute module:         ${execTime.toFixed(2)}ms`)
      console.log(`    Run checkType tests:    ${testTime.toFixed(2)}ms`)
      console.log(`    Total:                  ${totalTime.toFixed(2)}ms`)
      console.log(
        `    Status:                 ✓ Transpiled checkType/typeToString work correctly`
      )
    })
    it('should produce identical checkType results vs native', () => {
      const inferencePath = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang/inference.ts'
      )
      const inferenceSource = fs.readFileSync(inferencePath, 'utf-8')
      const inferenceResult = fromTS(inferenceSource)
      const strippedCode = inferenceResult.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const bootstrappedInference = new Function(`
        ${strippedCode}
        return { checkType, typeToString };
      `)()

      const nativeInference = require('../lang/inference')

      const testCases = [
        ['hello', { kind: 'string' }, true],
        [42, { kind: 'string' }, false],
        [42, { kind: 'number' }, true],
        [true, { kind: 'boolean' }, true],
        [null, { kind: 'null' }, true],
        [null, { kind: 'string', nullable: true }, true],
        [[1, 2, 3], { kind: 'array', items: { kind: 'number' } }, true],
        [{ x: 1 }, { kind: 'object', shape: { x: { kind: 'number' } } }, true],
        [
          'a',
          { kind: 'union', members: [{ kind: 'string' }, { kind: 'number' }] },
          true,
        ],
      ]
      for (const [value, type, expected] of testCases) {
        const nativeResult = nativeInference.checkType(value, type)
        const bootstrappedResult = bootstrappedInference.checkType(value, type)
        expect(bootstrappedResult).toBe(nativeResult)
        expect(bootstrappedResult).toBe(expected)
      }

      const types = [
        { kind: 'string' },
        { kind: 'number' },
        { kind: 'boolean' },
        { kind: 'null' },
        { kind: 'any' },
        { kind: 'array', items: { kind: 'string' } },
        { kind: 'string', nullable: true },
        { kind: 'object', shape: { name: { kind: 'string' } } },
      ]
      for (const type of types) {
        const nativeStr = nativeInference.typeToString(type)
        const bootstrappedStr = bootstrappedInference.typeToString(type)
        expect(bootstrappedStr).toBe(nativeStr)
      }
      console.log(`\n  Bootstrapped vs Native comparison:`)
      console.log(`    checkType:    ${testCases.length} test cases ✓`)
      console.log(`    typeToString: ${types.length} test cases ✓`)
      console.log(`    All results match native implementation`)
    })
    it('the module list covers every local import of the bundled modules', () => {
      const EXCLUDED = {
        'types.ts':
          'error classes and type-only declarations; the transpiled bundle never ' +
          'constructs them on the paths under test',
        'inference.ts':
          'acorn-backed engine module — out of scope for a parser-only bundle',
        'predicate.ts':
          'acorn-backed engine module; its one needed function, emitVerifiedPredicate, ' +
          'is injected natively above',
        'switch-transform.ts':
          "acorn-loose-backed, and reachable only from `parse`'s repair path (#43 " +
          'item 4). This bundle exercises `preprocess`, which never calls `parse`, so ' +
          'the import is not on any path it runs.',
      }
      const langDir = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang'
      )
      const listed = [
        'parser-types.ts',
        'declared-classes.ts',
        'expression-context.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]
      const missing = []
      for (const file of listed) {
        const src = fs.readFileSync(path.join(langDir, file), 'utf-8')
        for (const m of src.matchAll(
          /^import\s[\s\S]*?from\s+'\.\/([\w-]+)'/gm
        )) {
          const dep = `${m[1]}.ts`
          if (listed.includes(dep) || dep in EXCLUDED) continue
          if (fs.existsSync(path.join(langDir, dep))) {
            missing.push(
              `${file} imports ./${m[1]} — add '${dep}' to the bundle list, or to ` +
                `EXCLUDED with a reason`
            )
          }
        }
      }
      expect([...new Set(missing)]).toEqual([])
    })
    it('should execute transpiled preprocess to transform TJS syntax', () => {
      const start = performance.now()

      const langDir = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang'
      )
      const moduleFiles = [
        'parser-types.ts',
        'declared-classes.ts',
        'expression-context.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]
      const transpileStart = performance.now()
      const combinedCode = flattenModules(moduleFiles, langDir)
      const transpileTime = performance.now() - transpileStart
      expect(combinedCode).toBeTruthy()
      expect(combinedCode.length).toBeGreaterThan(10000)

      const execStart = performance.now()

      const parserModule = new Function(
        'emitVerifiedPredicate',
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${combinedCode}
        return { preprocess };
      `
      )(emitVerifiedPredicate, ...STRIP_COMMENTS_VALUES)
      const execTime = performance.now() - execStart
      expect(typeof parserModule.preprocess).toBe('function')

      const testStart = performance.now()

      const result1 = parserModule.preprocess(`
        function greet(name: 'World'): '' {
          return 'Hello, ' + name + '!'
        }
      `)
      expect(result1.source).toContain("name = 'World'")
      expect(result1.source).not.toContain("name: 'World'")

      const result2 = parserModule.preprocess(`
        function add(a: 0, b: 0): 0 {
          return a + b
        }
      `)
      expect(result2.returnType).toBe('0')
      expect(result2.source).toContain('a = 0')
      expect(result2.source).toContain('b = 0')
      expect(result2.source).not.toContain('-> 0')

      const result3 = parserModule.preprocess(`
        function fetch(url: '') {
          return url
        }
      `)

      expect(result3.requiredParams.has('url')).toBe(true)
      expect(result3.requiredValueOffsets.size).toBeGreaterThan(0)

      const result4 = parserModule.preprocess(`
        function fast(! x: 0) { return x }
        function safe(? y: 0) { return y }
      `)
      expect(result4.unsafeFunctions.has('fast')).toBe(true)
      expect(result4.safeFunctions.has('safe')).toBe(true)

      const result5 = parserModule.preprocess(`
        Type User {
          description: 'a user'
          example: { name: '', age: 0 }
        }
      `)
      expect(result5.source).toContain('const User = Type(')

      const result6 = parserModule.preprocess(`
        Generic Box<T> {
          description: 'boxed value'
          predicate(x, T) { return T(x.value) }
        }
      `)
      expect(result6.source).toContain('const Box = Generic(')

      const result7 = parserModule.preprocess(`
        if (Is(x, y)) { return true }
        if (IsNot(a, b)) { return false }
      `)
      expect(result7.source).toContain('Is(x, y)')
      expect(result7.source).toContain('IsNot(a, b)')
      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start
      console.log(`\n  Transpiled parser (preprocess) test:`)
      console.log(
        `    Transpile parser modules: ${transpileTime.toFixed(2)}ms (${(
          combinedCode.length / 1024
        ).toFixed(1)}KB)`
      )
      console.log(`    Execute module:      ${execTime.toFixed(2)}ms`)
      console.log(`    Run preprocess tests: ${testTime.toFixed(2)}ms`)
      console.log(`    Total:               ${totalTime.toFixed(2)}ms`)
      console.log(
        `    Status:              ✓ Transpiled preprocess transforms TJS correctly`
      )
    }, 60_000)
    it('should produce identical preprocess results vs native', () => {
      const langDir = path.join(
        '/Users/tonioloewald/tjs-lang/src/use-cases',
        '../lang'
      )
      const moduleFiles = [
        'parser-types.ts',
        'declared-classes.ts',
        'expression-context.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]
      const combinedCode = flattenModules(moduleFiles, langDir)
      const bootstrappedParser = new Function(
        'emitVerifiedPredicate',
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${combinedCode}
        return { preprocess };
      `
      )(emitVerifiedPredicate, ...STRIP_COMMENTS_VALUES)

      const nativeParser = require('../lang/parser')

      const testCases = [
        `function f(x: 0) { return x }`,
        `function g(a: '', b = 1): '' { return a }`,
        `function h(! fast: 0) { return fast }`,
        `Type Foo { example: { x: 0 } }`,
        `Generic Bar<T> { predicate(x, T) { return true } }`,
        `if (Is(a, b)) { x = 1 }`,
        `Union Dir 'direction' 'up' | 'down'`,
        `Enum Color 'color' { Red: 'red' }`,
      ]
      let passed = 0
      for (const source of testCases) {
        const nativeResult = nativeParser.preprocess(source)
        const bootstrappedResult = bootstrappedParser.preprocess(source)

        expect(bootstrappedResult.source).toBe(nativeResult.source)
        expect(bootstrappedResult.returnType).toBe(nativeResult.returnType)
        expect([...bootstrappedResult.requiredParams]).toEqual([
          ...nativeResult.requiredParams,
        ])
        expect([...bootstrappedResult.unsafeFunctions]).toEqual([
          ...nativeResult.unsafeFunctions,
        ])
        expect([...bootstrappedResult.safeFunctions]).toEqual([
          ...nativeResult.safeFunctions,
        ])
        passed++
      }
      console.log(`\n  Bootstrapped vs Native preprocess:`)
      console.log(`    ${passed}/${testCases.length} test cases ✓`)
      console.log(`    All outputs match native implementation`)
    }, 60_000)
  })
})
export {}
