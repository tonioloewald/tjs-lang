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
function TypeOf(v) {
  return v === null ? 'null' : typeof v
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
function __ex2js(v) {
  if (v === null) return { type: 'null' }
  if (v === undefined) return {}
  const t = typeof v
  if (t === 'string') return { type: 'string' }
  if (t === 'number')
    return Number.isInteger(v) ? { type: 'integer' } : { type: 'number' }
  if (t === 'boolean') return { type: 'boolean' }
  if (Array.isArray(v))
    return v.length
      ? { type: 'array', items: __ex2js(v[0]) }
      : { type: 'array' }
  if (t === 'object') {
    const p = {},
      r = []
    for (const k of Object.keys(v)) {
      p[k] = __ex2js(v[k])
      r.push(k)
    }
    return {
      type: 'object',
      properties: p,
      required: r,
      additionalProperties: false,
    }
  }
  return {}
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  TypeOf,
  Is,
  tjsEquals,
  IsNot,
}
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { parse } from 'acorn'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

const FEATURES = [
  {
    name: 'Eq',
    src: `export function a(x: 1):! 0 { return x == 1 ? 1 : 0 }`,
    fn: 'a',
    args: [1],
  },
  {
    name: 'NotEq',
    src: `export function b(x: 1):! 0 { return x != 1 ? 1 : 0 }`,
    fn: 'b',
    args: [1],
  },
  {
    name: 'Is',
    src: `export function c(x: 1):! 0 { return Is(x, 1) ? 1 : 0 }`,
    fn: 'c',
    args: [1],
  },
  {
    name: 'IsNot',
    src: `export function d(x: 1):! 0 { return IsNot(x, 1) ? 1 : 0 }`,
    fn: 'd',
    args: [1],
  },
  {
    name: 'IsNot-infix',
    src: `export function d2(x: 1, y: 2):! 0 { return (IsNot(x, y)) ? 1 : 0 }`,
    fn: 'd2',
    args: [1, 2],
  },
  {
    name: 'oneOf',
    src: `export function e(m: 'a' | 'b'):! '' { return m }`,
    fn: 'e',
    args: ['a'],
  },
  {
    name: 'Type',
    src: `Type Point {\n  example: { x: 0, y: 0 }\n}\nexport function f(p: Point):! 0 { return p.x }`,
    fn: 'f',
    args: [{ x: 1, y: 2 }],
  },
  {
    name: 'Enum',
    src: `Enum Color 'a colour' {\n  Red = 'red'\n  Green = 'green'\n}\nexport function g():! '' { return Color.Red }`,
    fn: 'g',
    args: [],
  },
  {
    name: 'TypeOf',
    src: `export function h(x: 1):! '' { return TypeOf(x) }`,
    fn: 'h',
    args: [1],
  },
  {
    name: 'bang',
    src: `export function i(o: { a: 1 }):! 0 { return o!.a }`,
    fn: 'i',
    args: [{ a: 1 }],
  },
  {
    name: 'toBool',
    src: `export function j(x: 1):! 0 { return x ? 1 : 0 }`,
    fn: 'j',
    args: [1],
  },
  {
    name: 'schema',
    src: `Type P {\n  example: { x: 0 }\n}\nexport function k():! 0 {\n  const s = P.toJSONSchema()\n  return 0\n}`,
    fn: 'k',
    args: [],
  },
]

/* line 114 */
function moduleError(code) {
  try {
    parse(code, { ecmaVersion: 2022, sourceType: 'module' })
    return null
  } catch (e) {
    return e.message
  }
}
moduleError.__tjs = {
  params: {
    code: {
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
      nullable: true,
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:114',
}

/* line 139 */
function runError(code, fn, args) {
  try {
    const f = new Function(code.replace(/^export /gm, '') + `\nreturn ${fn}`)()
    if (typeof f !== 'function') return `'${fn}' is not a function`
    f(...args)
    return null
  } catch (e) {
    return e.message
  }
}
runError.__tjs = {
  params: {
    code: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    fn: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'null',
        },
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
      nullable: true,
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:139',
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'tjs-emit-mod-'))

afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }))

let seq = 0

/* line 161 */
async function nodeLoads(code, fn, args) {
  const file = join(tmpRoot, `m${seq++}.mjs`)
  writeFileSync(
    file,
    `${code}\nconst __r = ${fn}(${args
      .map((a) => JSON.stringify(a))
      .join(', ')})\n` +
      `if (__r && __r.name === 'MonadicError') { console.error('MonadicError: ' + __r.message); process.exit(2) }\n`
  )
  const proc = Bun.spawn(['node', file], { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return (await proc.exited) === 0 ? null : (err || out).trim().split('\n')[0]
}
nodeLoads.__tjs = {
  params: {
    code: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    fn: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'null',
        },
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
      nullable: true,
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:161',
}

describe('emitted output loads as an ES module', () => {
  it('the check really catches a duplicate top-level declaration (apparatus check)', () => {
    expect(
      moduleError('function z(){}\nfunction z(){}\nexport const q=1')
    ).toContain('already been declared')
    expect(moduleError('export const q=1')).toBeNull()
  })
  for (const f of FEATURES) {
    it(`${f.name} alone parses as a module`, () => {
      expect(moduleError(tjs(f.src).code)).toBeNull()
    })
    it(`${f.name} alone LOADS and RUNS`, async () => {
      expect(await runError(tjs(f.src).code, f.fn, f.args)).toBeNull()
    })
  }

  it('Eq + Is loads in a real Node process (the duplicate `__ub` case)', async () => {
    const eq = FEATURES.find((f) => f.name === 'Eq')
    const is = FEATURES.find((f) => f.name === 'Is')
    const code = tjs(`${eq.src}\n${is.src}\n`).code
    expect(await nodeLoads(code, eq.fn, eq.args)).toBeNull()
  })
  it('IsNot runs in a real Node process (the missing-`Is` case)', async () => {
    const f = FEATURES.find((x) => x.name === 'IsNot')
    expect(await nodeLoads(tjs(f.src).code, f.fn, f.args)).toBeNull()
  })

  for (let i = 0; i < FEATURES.length; i++) {
    for (let j = i + 1; j < FEATURES.length; j++) {
      const a = FEATURES[i]
      const b = FEATURES[j]
      it(`${a.name} + ${b.name} together`, async () => {
        const code = tjs(`${a.src}\n${b.src}\n`).code
        expect(moduleError(code)).toBeNull()

        expect(await runError(code, a.fn, a.args)).toBeNull()
        expect(await runError(code, b.fn, b.args)).toBeNull()
      })
    }
  }
})
