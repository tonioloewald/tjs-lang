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
function Eq(a, b) {
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  Eq,
  Is,
  tjsEquals,
  IsNot,
}
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  Eq,
  Is,
  IsNot,
  toBool,
  registerProjection,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

class Timestamp {
  constructor(seconds, nanos) {
    this.seconds = seconds
    this.nanos = nanos
  }
}

class Result {
  constructor(ok) {
    this.ok = ok
  }
}

class Unprojected {
  constructor(v) {
    this.v = v
  }
}

registerProjection('Timestamp', function () {
  return this.seconds * 1000 + this.nanos / 1e6
})

registerProjection('Result', function () {
  return this.ok
})

describe('the shared runtime honours a projection', () => {
  it('two distinct objects are equal when they project equally', () => {
    expect(Eq(new Timestamp(100, 0), new Timestamp(100, 0))).toBe(true)
    expect(Eq(new Timestamp(100, 0), new Timestamp(101, 0))).toBe(false)
  })
  it('composes into the deep walk — a nested projected value just works', () => {
    const a = { when: new Timestamp(5, 0), tag: 'x' }
    const b = { when: new Timestamp(5, 0), tag: 'x' }
    expect(Is(a, b)).toBe(true)
    expect(IsNot(a, { when: new Timestamp(6, 0), tag: 'x' })).toBe(true)
  })
  it('feeds toBool, so a type can be FALSY', () => {
    expect(toBool(new Result(false))).toBe(false)
    expect(toBool(new Result(true))).toBe(true)
  })
  it('leaves unprojected values exactly as they were', () => {
    expect(Eq({ a: 1 }, { a: 1 })).toBe(false)
    expect(Eq(new Unprojected(1), new Unprojected(1))).toBe(false)
    expect(toBool(new Unprojected(0))).toBe(true)
    expect(Eq(1, 1)).toBe(true)
    expect(Eq('5', 5)).toBe(false)
  })
})

describe("the type's OWN asCompared() method (#33)", () => {
  /**
   * The layer beneath the registry, and the only one a Proxy can reach.
   *
   * The registry is keyed by `constructor.name`, and a Proxy reports its TARGET's — so the
   * tosijs boxed scalar below keys as `'Number'`, and registering it would claim that key
   * for every boxed Number in the process. There is no distinct key to register. A `get`
   * trap can serve a method, which is why this layer exists.
   */
  const live = { n: 42, flag: false }
  const boxed = (key) =>
    new Proxy(new Number(0), {
      get(t, k) {
        if (k === 'valueOf' || k === Symbol.toPrimitive) return () => live[key]
        if (k === 'asCompared') return () => live[key]
        return Reflect.get(t, k)
      },
    })
  it('the shipped repro: a Proxy over a boxed primitive', () => {
    const count = boxed('n')

    expect(count.constructor.name).toBe('Number')
    expect(() => Number.prototype.valueOf.call(count)).toThrow()
    expect(Eq(count, 42)).toBe(true)
    expect(Eq(count, 41)).toBe(false)
  })
  it('toBool honours it — the half with the widest blast radius', () => {
    expect(toBool(boxed('flag'))).toBe(false)
    live.flag = true
    expect(toBool(boxed('flag'))).toBe(true)
    live.flag = false
  })
  it('an ordinary class can declare it directly', () => {
    class Money {
      cents
      constructor(cents) {
        this.cents = cents
      }
      asCompared() {
        return this.cents
      }
    }
    expect(Eq(new Money(500), new Money(500))).toBe(true)
    expect(Eq(new Money(500), new Money(501))).toBe(false)
    expect(Is({ p: new Money(1) }, { p: new Money(1) })).toBe(true)
    expect(toBool(new Money(0))).toBe(false)
  })
  it('a registered projection OVERRIDES the type’s own method', () => {
    class Owned {
      asCompared() {
        return 'mine'
      }
    }
    expect(Eq(new Owned(), 'mine')).toBe(true)
    registerProjection('Owned', () => 'theirs')
    expect(Eq(new Owned(), 'theirs')).toBe(true)
    expect(Eq(new Owned(), 'mine')).toBe(false)
  })
  it('a hostile probe or method cannot throw out of a comparison', () => {
    const throwsOnProbe = new Proxy(
      {},
      {
        get(_t, k) {
          if (k === 'asCompared') throw new Error('hostile probe')
          return undefined
        },
      }
    )
    const throwsOnCall = {
      asCompared() {
        throw new Error('hostile call')
      },
    }
    for (const v of [throwsOnProbe, throwsOnCall]) {
      expect(() => Eq(v, 1)).not.toThrow()
      expect(() => toBool(v)).not.toThrow()
      expect(Eq(v, v)).toBe(true)
      expect(toBool(v)).toBe(true)
    }
  })
  it('a non-conforming method is ignored, like a registered one', () => {
    const obj = {
      asCompared() {
        return { still: 'an object' }
      },
    }
    expect(Eq(obj, obj)).toBe(true)
    expect(
      Eq(obj, {
        asCompared() {
          return { still: 'an object' }
        },
      })
    ).toBe(false)
  })
  it('objects WITHOUT the method are untouched', () => {
    expect(Eq({ a: 1 }, { a: 1 })).toBe(false)
    expect(toBool({})).toBe(true)
    expect(toBool(new (class {})())).toBe(true)

    expect(Eq({ asCompared: 42 }, 42)).toBe(false)
  })
})

describe('a projection must yield a primitive, or nothing', () => {
  const roundTrip = (name, projected) => {
    class T {}
    Object.defineProperty(T, 'name', { value: name })
    registerProjection(name, function () {
      return projected
    })
    return new T()
  }
  it('accepts number, string, boolean, null and undefined', () => {
    expect(Eq(roundTrip('PNum', 42), 42)).toBe(true)
    expect(Eq(roundTrip('PStr', 'x'), 'x')).toBe(true)
    expect(Eq(roundTrip('PBool', false), false)).toBe(true)
    expect(Eq(roundTrip('PNull', null), null)).toBe(true)

    expect(Eq(roundTrip('PUndef', undefined), null)).toBe(true)
  })
  it('IGNORES a non-conforming projection rather than throwing', () => {
    const objProj = roundTrip('PObj', { nested: true })
    expect(() => Eq(objProj, objProj)).not.toThrow()
    expect(Eq(objProj, objProj)).toBe(true)
    const bigProj = roundTrip('PBig', 1n)
    expect(Eq(bigProj, 1)).toBe(false)
  })
  it('a THROWING projection does not throw out of `==`', () => {
    const t = roundTrip('PThrow', undefined)
    registerProjection('PThrow', function () {
      throw new Error('hostile')
    })
    expect(() => Eq(t, t)).not.toThrow()
    expect(() => toBool(t)).not.toThrow()
  })
})

describe('STANDALONE emitted code honours a projection', () => {
  const run = (src, name) =>
    new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()
  it('`==` uses the file-local projection', () => {
    const eq = run(
      `extend Stamp { asCompared() { return this.s } }\n` +
        `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    class Stamp {
      s
      constructor(s) {
        this.s = s
      }
    }
    expect(eq(new Stamp(1), new Stamp(1))).toBe(true)
    expect(eq(new Stamp(1), new Stamp(2))).toBe(false)
  })
  it('truthiness uses it too', () => {
    const check = run(
      `extend Res { asCompared() { return this.ok } }\n` +
        `export function check(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'check'
    )
    class Res {
      ok
      constructor(ok) {
        this.ok = ok
      }
    }
    expect(check(new Res(false))).toBe(0)
    expect(check(new Res(true))).toBe(1)
  })
  it('a file with no `extend` is unaffected', () => {
    const eq = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    expect(eq({ a: 1 }, { a: 1 })).toBe(false)
    const same = { a: 1 }
    expect(eq(same, same)).toBe(true)
  })
  it('truthiness is file-local too, WITH a shared runtime installed', async () => {
    const { installRuntime } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/runtime'
    )
    installRuntime()
    class Res {
      ok
      constructor(ok) {
        this.ok = ok
      }
    }
    const declaring = run(
      `extend Res { asCompared() { return this.ok } }\n` +
        `export function check(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'check'
    )

    expect(declaring(new Res(false))).toBe(0)
    const unrelated = run(
      `export function truthy(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'truthy'
    )

    expect(unrelated(new Res(false))).toBe(1)
  })
  it('an attacker-controlled `constructor.name` cannot reach Object.prototype', () => {
    const eq = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    for (const name of [
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'toLocaleString',
    ]) {
      const h1 = JSON.parse(JSON.stringify({ constructor: { name }, x: 1 }))
      const h2 = JSON.parse(JSON.stringify({ constructor: { name }, x: 2 }))
      expect(eq(h1, h2), `constructor.name = ${name}`).toBe(false)
    }
  })
  it('a type’s own asCompared() reaches emitted `==` and `if` (#33)', () => {
    const f = run(
      `export function probe(v: {}):! 0 { return (v == 42 ? 1 : 0) + (v ? 10 : 0) }\n`,
      'probe'
    )
    const live = { n: 42, flag: false }
    const boxed = (key) =>
      new Proxy(new Number(0), {
        get(t, k) {
          if (k === 'asCompared') return () => live[key]
          return Reflect.get(t, k)
        },
      })
    expect(f(boxed('n'))).toBe(11)
    live.n = 1
    live.flag = false
    expect(f(boxed('flag'))).toBe(0)
  })
  it('a literal union agrees with `==` about the same value', () => {
    const f = run(
      `export function pick(mode: 'a' | 'b'): 0 { return mode == 'b' ? 1 : 0 }\n`,
      'pick'
    )
    class Mode {
      m
      constructor(m) {
        this.m = m
      }
      asCompared() {
        return this.m
      }
    }
    expect(f(new Mode('b'))).toBe(1)
    expect(f(new Mode('a'))).toBe(0)
    expect(isMonadicError(f(new Mode('z')))).toBe(true)
  })
  it('a file-local `extend` still overrides the type’s own method', () => {
    const body = `export function probe(v: {}):! 0 { return v ? 1 : 0 }\n`
    const overridden = run(
      `extend Owned { asCompared() { return 1 } }\n` + body,
      'probe'
    )
    const plain = run(body, 'probe')
    class Owned {
      asCompared() {
        return 0
      }
    }

    expect(overridden(new Owned())).toBe(1)
    expect(plain(new Owned())).toBe(0)
  })
  it('the projection table is FILE-LOCAL — one module cannot reach another', () => {
    const withProj = run(
      `extend Local { asCompared() { return 1 } }\n` +
        `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    const withoutProj = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    class Local {}
    expect(withProj(new Local(), new Local())).toBe(true)
    expect(withoutProj(new Local(), new Local())).toBe(false)
  })
})
