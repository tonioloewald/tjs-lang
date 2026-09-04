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
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Type, Generic }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 30 */
function call(src, expr) {
  const code = tjs(src, { runTests: false }).code
  const v = new Function(`${code}\nreturn ${expr}`)()
  return v && v.name === 'MonadicError' ? `Error(${v.expected})` : v
}
call.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    expr: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:30',
}

const EVEN = `Type EvenNumber {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
function double(n: EvenNumber) { return n * 2 }
`

describe('a declared Type used as an annotation validates', () => {
  it('accepts a value satisfying structure and predicate', () => {
    expect(call(EVEN, 'double(4)')).toBe(8)
  })
  it('rejects a value failing the PREDICATE', () => {
    expect(call(EVEN, 'double(3)')).toBe('Error(EvenNumber)')
  })
  it('rejects a value failing the EXAMPLE-INFERRED STRUCTURE', () => {
    expect(call(EVEN, `double('x')`)).toBe('Error(EvenNumber)')
    expect(call(EVEN, 'double(2.5)')).toBe('Error(EvenNumber)')
  })
  it('names the TYPE in the error, not the mechanism', () => {
    const code = tjs(EVEN, { runTests: false }).code
    expect(code).toContain('EvenNumber')
    expect(code).not.toContain(`'declared'`)
  })
  it('no longer warns that a declared type is unresolvable', () => {
    const r = tjs(EVEN, { runTests: false })
    const noise = (r.warnings ?? []).filter((w) => /EvenNumber/.test(w))
    expect(noise).toEqual([])
  })
  it('gets object-ness right, including null', () => {
    const src = `Type Point {
  description: 'a 2d point'
  example: { x: 0.0, y: 0.0 }
  predicate(p) { return p.x !== p.y }
}
function slope(p: Point) { return p.y / p.x }
`
    expect(call(src, 'slope({x: 2.0, y: 4.0})')).toBe(2)

    expect(call(src, 'slope(null)')).toBe('Error(Point)')
    expect(call(src, `slope('nope')`)).toBe('Error(Point)')
    expect(call(src, 'slope({x: 1.0})')).toBe('Error(Point)')
    expect(call(src, 'slope({x: 3.0, y: 3.0})')).toBe('Error(Point)')
  })
  it('is cheap to satisfy when the predicate is cheap — the NonEmpty pattern', () => {
    const src = `Type NonEmpty {
  description: 'an array with at least one element'
  example: []
  predicate(x) { return x.length > 0 }
}
function first(things: NonEmpty) { return things[0] }
`
    expect(call(src, 'first([7, 8])')).toBe(7)
    expect(call(src, 'first([])')).toBe('Error(NonEmpty)')
    expect(call(src, `first('nope')`)).toBe('Error(NonEmpty)')
  })
  it('leaves a genuinely unknown type unresolved and best-effort', () => {
    const src = `function f(x: SomethingUndeclared) { return x }`
    const r = tjs(src, { runTests: false })
    expect(call(src, 'f(1)')).toBe(1)
    expect((r.warnings ?? []).some((w) => /SomethingUndeclared/.test(w))).toBe(
      true
    )
  })
})

describe(':? validates the return value at runtime', () => {
  it('catches a return that violates its own annotation', () => {
    const src = `function bad(x: 0):? 0 { return 'not a number' }`
    expect(call(src, 'bad(1)')).toBe('Error(integer)')
  })
  it('passes a correct return through untouched', () => {
    const src = `function good(x: 0):? 0 { return x * 2 }`
    expect(call(src, 'good(4)')).toBe(8)
  })
  it('plain `:` does NOT add a runtime return check', () => {
    const src = `function plain(x: 0): 0 { return x }`
    expect(call(src, 'plain(1)')).toBe(1)
  })
  it('lets a MonadicError through rather than re-reporting it', () => {
    const src = [
      `function inner(x: 0) { return x }`,
      `function outer(y: ''):? 0 { return inner(y) }`,
    ].join('\n')
    const v = call(src, `outer('nope')`)

    expect(v).toBe('Error(integer)')
  })
  it('the whole O(1)-in / O(1)-out pattern holds', () => {
    const src = `Type NonEmpty {
  description: 'an array with at least one element'
  example: []
  predicate(x) { return x.length > 0 }
}
function pick(things: NonEmpty):? 0 { return things[0] }
`
    expect(call(src, 'pick([7, 8])')).toBe(7)
    expect(call(src, 'pick([])')).toBe('Error(NonEmpty)')
    expect(call(src, `pick(['str'])`)).toBe('Error(integer)')
  })
  it('keeps the __tjs metadata on the wrapped function', () => {
    const code = tjs(`function f(x: 0):? 0 { return x }`, {
      runTests: false,
    }).code
    const meta = new Function(`${code}\nreturn f.__tjs`)()
    expect(meta?.params?.x).toBeDefined()
    expect(meta?.returns).toBeDefined()
  })
})

describe('Type X<T> subsumes Generic X<T>', () => {
  const BODY = `{\n  predicate(x, T) { return typeof x === 'object' && x !== null && T(x.value) }\n}`
  it('accepts the Type spelling', () => {
    const code = tjs(`Type Box<T> ${BODY}`, { runTests: false }).code
    expect(code).toContain('const Box = Generic(')
  })
  it('still accepts the deprecated Generic spelling', () => {
    const code = tjs(`Generic Box<T> ${BODY}`, { runTests: false }).code
    expect(code).toContain('const Box = Generic(')
  })
  it('emits identical code for both spellings', () => {
    const a = tjs(`Type Box<T> ${BODY}`, { runTests: false }).code
    const b = tjs(`Generic Box<T> ${BODY}`, { runTests: false }).code
    expect(a).toBe(b)
  })
  it('does not disturb the scalar Type form', () => {
    const code = tjs(
      `Type Even {\n  example: 2\n  predicate(x) { return x % 2 === 0 }\n}`,
      { runTests: false }
    ).code
    expect(code).toContain('const Even = Type(')
    expect(code).not.toContain('const Even = Generic(')
  })
  it('registers a parameterized type name for annotation resolution', () => {
    const src = `Type Box<T> ${BODY}\nfunction unbox(b: Box) { return b.value }`
    const r = tjs(src, { runTests: false })
    expect((r.warnings ?? []).filter((w) => /Box/.test(w))).toEqual([])
  })
})

describe('emitted code with a declared type works standalone', () => {
  const SRC = `Type Even {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
function double(n: Even) { return n * 2 }
`
  /** Run `expr` against the emitted code with NO global runtime installed. */
  function standalone(expr) {
    const code = tjs(SRC, { runTests: false }).code
    const saved = globalThis.__tjs
    try {
      globalThis.__tjs = undefined
      const v = new Function(`${code}\nreturn ${expr}`)()
      return v && v.name === 'MonadicError' ? `Error(${v.expected})` : v
    } finally {
      globalThis.__tjs = saved
    }
  }
  it('accepts a VALID value with no runtime installed', () => {
    expect(standalone('double(4)')).toBe(8)
  })
  it('still runs the predicate with no runtime installed', () => {
    expect(standalone('double(3)')).toBe('Error(Even)')
  })
  it('agrees with the full-runtime result on valid input', () => {
    const code = tjs(SRC, { runTests: false }).code
    const withRuntime = new Function(`${code}\nreturn double(4)`)()
    expect(standalone('double(4)')).toBe(withRuntime)
  })
})

describe('an empty example does not close the shape', () => {
  const PREFIX = `Type PrefixTyped {
  description: 'an object whose property NAMES declare their types'
  example: {}
  predicate(o) {
    return Object.entries(o).every(([k, v]) =>
      k.startsWith('is')    ? typeof v === 'boolean'
    : k.startsWith('int')   ? Number.isInteger(v)
    : k.startsWith('count') ? Number.isInteger(v) && v >= 0
    : true
    )
  }
}
function render(props: PrefixTyped) { return Object.keys(props).length }
`
  it('accepts an object whose names and values agree', () => {
    expect(
      call(PREFIX, 'render({ isOpen: true, intWidth: 40, countItems: 3 })')
    ).toBe(3)
  })
  it('rejects each prefix violation', () => {
    expect(call(PREFIX, `render({ isOpen: 'yes' })`)).toBe('Error(PrefixTyped)')
    expect(call(PREFIX, 'render({ intWidth: 4.5 })')).toBe('Error(PrefixTyped)')
    expect(call(PREFIX, 'render({ countItems: -1 })')).toBe(
      'Error(PrefixTyped)'
    )
  })
  it('leaves unprefixed keys unconstrained', () => {
    expect(call(PREFIX, `render({ label: 'anything' })`)).toBe(1)
  })
  it('the predicate is VERIFIED, so the check is fuel-bounded', () => {
    const r = tjs(PREFIX, { runTests: false })
    const p = (r.predicates ?? []).find((x) => x.name === 'PrefixTyped')
    expect(p?.verified).toBe(true)
  })
  it('a NON-empty example does not close the object either', () => {
    const src = `Type Point {
  example: { x: 0, y: 0 }
  predicate(p) { return true }
}
function f(p: Point) { return p.x }
`
    expect(call(src, 'f({ x: 1, y: 2 })')).toBe(1)
    expect(call(src, 'f({ x: 1, y: 2, z: 3 })')).toBe(1)

    expect(call(src, 'f({ x: 1 })')).toBe('Error(Point)')
    expect(call(src, `f({ x: 'a', y: 2 })`)).toBe('Error(Point)')
  })
})

describe('a Type block must declare something checkable', () => {
  const rejects = (src) => {
    try {
      tjs(src, { filename: 'tb.tjs', runTests: false })
      return 'ACCEPTED'
    } catch (e) {
      return String(e.message)
    }
  }
  it('rejects the interface spelling, and names the fix as code', () => {
    const msg = rejects(`Type User {
  name: ''
  age: 0
}
function greet(u: User) { return u.name }
`)
    expect(msg).toContain('accept EVERY value')

    expect(msg).toContain('example: {')
    expect(msg).toContain("name: ''")
  })
  it('ALLOWS the forms that discard nothing', () => {
    expect(rejects(`Type Empty {}`)).toBe('ACCEPTED')
    expect(
      rejects(`Type Degraded {\n  // TS: Record<string, unknown> & {a: 1}\n}`)
    ).toBe('ACCEPTED')
    expect(rejects(`Type Thing {\n  description: 'a thing'\n}`)).toBe(
      'ACCEPTED'
    )
  })
  it('the message never misdiagnoses a TJS key as a member', () => {
    const msg = rejects(`Type U {\n  description: 'u'\n  name: ''\n}`)
    expect(msg).toContain("TypeScript's spelling")
    expect(msg).toContain("name: ''")
    expect(msg).not.toContain("description: 'u'")
  })
  it('still accepts every form that DOES declare something', () => {
    expect(rejects(`Type A { example: { x: 0 } }`)).toBe('ACCEPTED')
    expect(rejects(`Type B { predicate(v) { return v > 0 } }`)).toBe('ACCEPTED')
    expect(rejects(`Type C { description: 'c'\n  example: 0 }`)).toBe(
      'ACCEPTED'
    )
    expect(rejects(`Type D 'Alice'`)).toBe('ACCEPTED')
  })
})

describe('the declared-Type schema is derived once', () => {
  it('infer runs once across many checks', () => {
    const saved = globalThis.__tjs
    const real = createRuntime()
    let inferCalls = 0
    globalThis.__tjs = {
      ...real,
      infer: (v) => {
        inferCalls++
        return real.infer(v)
      },
      inferOpen: (v) => {
        inferCalls++
        return (real.inferOpen ?? real.infer)(v)
      },
    }
    try {
      const src = `Type Age {\n  example: 0\n  predicate(v) { return v >= 0 }\n}\nfunction f(a: Age) { return a }`
      const f = new Function(
        `${tjs(src, { filename: 'p.tjs' }).code}\nreturn f`
      )()
      for (let i = 0; i < 50; i++) f(5)
      expect(inferCalls).toBe(1)

      expect(inferCalls).toBeGreaterThan(0)

      expect(String(f(-1))).toContain('MonadicError')
    } finally {
      globalThis.__tjs = saved
    }
  })
})
