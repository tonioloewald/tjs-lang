/**
 * WASM: __tjs_wasm_w (export: compute_0)
 * (failed: Parse error: Expecting Unicode escape sequence \uXXXX (1:44))
 */
/**
 * WASM: __tjs_wasm_w (export: compute_1)
 * (func (export "compute") (param $a f64) (result f64)
 *   local.get $a
 *   return
 * )
 */
globalThis.__tjs_wasm_pending ??= []
globalThis.__tjs_wasm_ready ??= () => Promise.all(globalThis.__tjs_wasm_pending)
;(() => {
  const __rec = (e) => {
    try {
      globalThis.__tjs?.record?.(e)
    } catch {}
  }
  const __wasmExports = [
    { id: '__tjs_wasm_w', n: 'compute_1', c: ['a: 0'], m: false },
  ]
  const __wasmModuleB64 =
    'AGFzbQEAAAABCwJgAXwBfGABfAF8AwMCAAEHGQIJY29tcHV0ZV8wAAAJY29tcHV0ZV8xAAEKEwILAEQAAAAAAAAAAAsFACAADws='
  const __b64ToBytes = (s) => {
    const b = atob(s),
      a = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
    return a
  }
  const __parseType = (c) => {
    const m = c.match(/^(\w+)\s*:\s*(\w+)$/)
    if (!m) return { n: c, t: 'f64', a: false }
    const [, n, ts] = m
    const at = {
      Float32Array: 'f32',
      Float64Array: 'f64',
      Int32Array: 'i32',
      Uint8Array: 'i32',
    }
    if (at[ts]) return { n, t: 'i32', a: true, at: ts }
    return { n, t: 'f64', a: false }
  }

  const __bind = (__wasmInst) => {
    for (const { id, n, c, m } of __wasmExports) {
      const compute = __wasmInst.exports[n]
      const params = c.map(__parseType)
      const hasArrays = params.some((p) => p.a)
      if (!hasArrays) {
        globalThis[id] = compute
        continue
      }
      let __copied = false
      globalThis[id] = function (...args) {
        const mv = new Uint8Array(__wasmMem.buffer)
        let off = __woff
        const ptrs = []
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) {
              ptrs.push(a.byteOffset)
            } else {
              if (!__copied) {
                __copied = true
                __rec({
                  source: 'wasm',
                  severity: 'notice',
                  message:
                    "'" +
                    id +
                    "' was passed a typed array outside wasm memory — copying in and out on every call. This can be SLOWER than plain JS. Allocate it with wasmBuffer() to pass it zero-copy.",
                  data: { fn: id, param: p.n, bytes: a.byteLength },
                })
              }
              const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
              off = (off + 15) & ~15
              mv.set(ab, off)
              ptrs.push(off)
              off += ab.length
            }
          } else ptrs.push(a)
        }
        const r = compute(...ptrs)
        off = __woff
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) continue
            const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
            off = (off + 15) & ~15
            ab.set(mv.slice(off, off + ab.length))
            off += ab.length
          }
        }
        return r
      }
    }
  }
  const __fail = (e) => {
    try {
      globalThis.__tjs?.record?.({
        source: 'wasm',
        severity: 'warning',
        message:
          'wasm module failed to instantiate — every wasm{} block in this file is running its JS fallback: ' +
          ((e && e.message) || e),
        data: { error: String(e) },
      })
    } catch {}
  }
  try {
    __bind(
      new WebAssembly.Instance(
        new WebAssembly.Module(__b64ToBytes(__wasmModuleB64)),
        {}
      )
    )
    globalThis.__tjs_wasm_pending.push(Promise.resolve())
  } catch (__syncErr) {
    // The async retry needs its OWN guard — it can throw SYNCHRONOUSLY.
    //
    // `WebAssembly.instantiate` normally returns a promise and rejects, so a `.catch` was
    // assumed sufficient. Under memory pressure SpiderMonkey instead throws
    // `no WebAssembly compiler available` synchronously, and that throw was inside the catch
    // block with nothing around it — so it escaped and took down the whole module, in a file
    // whose `wasm{} fallback{}` exists precisely so the program does not need WebAssembly.
    //
    // `fallback` covered "this module failed to validate" but not "this engine has no wasm
    // compiler right now", which is the broader of the two and the one an author cannot code
    // around: intermittent, engine-resource-dependent, ~1 run in 6 on a loaded Firefox.
    // Reported from tosijs-ui's Playwright lane (#36).
    try {
      globalThis.__tjs_wasm_pending.push(
        WebAssembly.instantiate(__b64ToBytes(__wasmModuleB64), {})
          .then((r) => __bind(r.instance))
          .catch(__fail)
      )
    } catch (__asyncErr) {
      __fail(__asyncErr)
      globalThis.__tjs_wasm_pending.push(Promise.resolve())
    }
  }
})()
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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Is, tjsEquals }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import { Eval, SafeFunction } from '/Users/tonioloewald/tjs-lang/src/lang/eval'

import { transpile } from '/Users/tonioloewald/tjs-lang/src/lang/core'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

import { maskLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

import * as acornLoose from 'acorn-loose'

const SENTINELS = ['__TJS_PWNED__', '__TJS_PWNED_2__', '__TJS_PWNED_3__']

afterEach(() => {
  for (const s of SENTINELS) delete globalThis[s]
})

describe('a VM-target transpile executes nothing', () => {
  it('Eval does not run a test block, and does not charge it as work', async () => {
    const result = await Eval({
      code: ` return 1`,
      fuel: 10,
      timeoutMs: 1,
    })
    expect(globalThis[SENTINELS[0]]).toBeUndefined()

    expect(result.error).toBeDefined()
    expect(result.result).toBeUndefined()
  })
  it('SafeFunction does not run a test block', () => {
    expect(() =>
      SafeFunction({
        body: ` return 1`,
      })
    ).toThrow()
    expect(globalThis[SENTINELS[1]]).toBeUndefined()
  })
  it('the raw VM transpile does not run a test block', () => {
    expect(() => transpile(`function __eval() {  return 1 }`)).toThrow()
    expect(globalThis[SENTINELS[2]]).toBeUndefined()
  })
  it('ordinary Eval still works', () => {
    return Eval({ code: 'return 1 + 2', fuel: 100 }).then((r) => {
      expect(r.result).toBe(3)
      expect(r.error).toBeUndefined()
    })
  })
})

describe('TJS keeps its inline tests', () => {
  it('a .tjs transpile still runs and reports test blocks', () => {
    const r = tjs(`function add(a: 0, b: 0): 0 { return a + b }\n` + ``)
    expect((r.testResults ?? []).length).toBeGreaterThan(0)
    expect(r.testResults?.every((t) => t.passed)).toBe(true)
  })
})

describe('the AJS path runs AJS and nothing else', () => {
  const constructs = [
    ['test block', `function f() {  return 1 }`, '__TJS_X1__'],
    [
      'wasm function',
      `function w(a) { return globalThis.__tjs_wasm_w(a) }\nfunction f() { return 1 }`,
      '__TJS_X2__',
    ],
    [
      'Type block predicate',
      `Type T { description: 't'\n predicate(x) { globalThis.SENT = 1\n return true } }\nfunction f() { return 1 }`,
      '__TJS_X3__',
    ],
    [
      'extend block',
      `extend Array { last() { globalThis.SENT = 1\n return this[0] } }\nfunction f() { return 1 }`,
      '__TJS_X4__',
    ],
  ]
  for (const [label, template, sentinel] of constructs) {
    it(`${label}: nothing executes during a vmTarget transpile`, () => {
      const src = template.replace(/SENT/g, sentinel)
      delete globalThis[sentinel]
      try {
        transpile(src)
      } catch {}
      expect(globalThis[sentinel]).toBeUndefined()
      delete globalThis[sentinel]
    })
  }
  it('every dynamic-execution site in the transpile path is accounted for', () => {
    const files = [
      'parser.ts',
      'parser-agent.ts',
      'parser-transforms.ts',
      'parser-params.ts',
      'core.ts',
      'predicate.ts',
      'literal-value.ts',
      'emitters/js.ts',
      'emitters/js-tests.ts',
    ]
    const sites = []
    for (const f of files) {
      const src = readFileSync(
        join('/Users/tonioloewald/tjs-lang/src/lang', f),
        'utf8'
      )

      for (const line of maskLiterals(src).split('\n')) {
        if (/(^|[^.\w])(new Function\s*\(|eval\s*\()/.test(line))
          sites.push(`${f}: ${line.trim().slice(0, 60)}`)
      }
    }

    expect(sites.sort()).toEqual(
      [
        'parser-transforms.ts: const testFn = new Function(body)',
        'predicate.ts: const factory = new Function(',
        'emitters/js-tests.ts: const fn = new Function(',
      ].sort()
    )
  })
  it('a removed `vmTarget` is REFUSED, never silently ignored', async () => {
    const { parse, preprocess } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/parser'
    )
    const sentinel = '__TJS_VMTARGET__'

    const payload = `function main(n) {  return n }`
    delete globalThis[sentinel]
    for (const call of [
      () => parse(payload, { vmTarget: true }),
      () => parse(payload, { vmTarget: true, colonShorthand: false }),
      () => preprocess(payload, { vmTarget: true }),
      () => parse(payload, { ...{ vmTarget: false } }),
    ]) {
      expect(call).toThrow(/vmTarget/)
    }

    expect(globalThis[sentinel]).toBeUndefined()
    delete globalThis[sentinel]
  })
  it('the AJS parse pipeline is exactly the steps AJS has', () => {
    const src = readFileSync(
      join('/Users/tonioloewald/tjs-lang/src/lang', 'parser-agent.ts'),
      'utf8'
    )
    const ast = acornLoose.parse(src.replace(/^import type[^\n]*\n/gm, ''), {
      ecmaVersion: 2022,
      sourceType: 'module',
    })
    const imported = new Set()
    for (const node of ast.body) {
      if (node.type !== 'ImportDeclaration') continue
      const from = node.source.value
      if (!node.specifiers.length) imported.add(`${from}:<side-effect>`)
      for (const s of node.specifiers) {
        if (s.type === 'ImportNamespaceSpecifier')
          imported.add(`${from}:* as ${s.local.name}`)
        else if (s.type === 'ImportDefaultSpecifier')
          imported.add(`${from}:default`)
        else imported.add(`${from}:${s.imported.name}`)
      }
    }
    expect([...imported].sort()).toEqual(
      [
        'acorn:* as acorn',
        './types:SyntaxError',

        '../strip-comments:hashbangOf',

        '../strip-comments:stripLineComments',

        './parser-params:transformParenExpressions',
        './parser-params:extractParamMarkers',
      ].sort()
    )
  })
})
export {}

describe('TJS constructs the AJS path does not accept (ratchet)', () => {
  const KNOWN_LEAKS = []
  const CONSTRUCTS = [
    ['const!', 'function f() { const! x = 1\n return x }'],
    ['bang access', 'function f(o) { return o!.a }'],
    ['Is operator', 'function f(a, b) { return Is(a, b) }'],
    ['try without catch', 'function f() { try { return 1 } return 2 }'],
    [
      'inline wasm fn',
      'function w(a) { return globalThis.__tjs_wasm_w(a) }\nfunction f() { return 1 }',
    ],
    ['Type block', 'Type T { example: { a: 0 } }\nfunction f() { return 1 }'],
    [
      'Generic block',
      "Generic G<A> { description: 'g'\n predicate(x, A) { return true } }\nfunction f() { return 1 }",
    ],
    ['Union', 'Union U { a: 0 }\nfunction f() { return 1 }'],
    ['Enum', 'Enum E { A, B }\nfunction f() { return 1 }'],
    [
      'extend',
      'extend Array { last() { return this[0] } }\nfunction f() { return 1 }',
    ],
    [
      'FunctionPredicate',
      "FunctionPredicate P { description: 'p'\n predicate(x) { return true } }\nfunction f() { return 1 }",
    ],
    ['test block', 'function f() {  return 1 }'],
    ['given', "function f(x) { given x { 'a' { return 1 } } return 0 }"],
    ['class', 'class C { m() { return 1 } }\nfunction f() { return 1 }'],
  ]
  it('accepts exactly the known leaks, and nothing more', () => {
    const accepted = []
    for (const [label, src] of CONSTRUCTS) {
      try {
        transpile(src)
        accepted.push(label)
      } catch {
        /* rejected — the correct outcome for a construct AJS does not have */
      }
    }

    expect(accepted.sort()).toEqual([...KNOWN_LEAKS].sort())
  })
  it('AJS itself still transpiles', () => {
    expect(() => transpile('function f(n: 0) { return n * 2 }')).not.toThrow()
  })
})

describe('a TJS example value is parsed, never executed', () => {
  const payloads = [
    [
      'return-type default',
      'function f(a: 0): { x = (globalThis.SENT = 42) } { return { x: a } }',
    ],
    [
      'nested in an object example',
      'function f(a: 0): { o = { k: (globalThis.SENT = 42) } } { return { o: {} } }',
    ],
    [
      'array example',
      'function f(a: 0): { xs = [(globalThis.SENT = 42)] } { return { xs: [] } }',
    ],
  ]
  for (const [label, template] of payloads) {
    it(`${label}: does not execute`, () => {
      const sentinel = '__TJS_ANN__'
      const src = template.replace(/SENT/g, sentinel)
      delete globalThis[sentinel]
      try {
        tjs(src, { runTests: false })
      } catch {
        /* refusing the file is a fine outcome; executing it is not */
      }
      expect(globalThis[sentinel]).toBeUndefined()
      delete globalThis[sentinel]
    })
  }
  it('ordinary return defaults still work', () => {
    const r = tjs(
      "function g(a: 0): { value: 0, error = '' } { return { value: a } }",
      {
        runTests: false,
      }
    )
    expect(r.code).toContain('error')
  })
})
