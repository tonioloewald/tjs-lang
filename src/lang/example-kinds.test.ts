/**
 * A `Type` example's MEANING survives to runtime — numeric kinds, unions, type names,
 * optional members and references (`markExampleKinds`).
 *
 * TJS narrows numbers by how they are written: `0.0` is a float, `0` an integer, `+0` a
 * non-negative integer. A `Type` example is matched by VALUE at runtime, and `0.0 === 0`,
 * `+0 === 0` — so both kinds were lost:
 *
 *   - `Type Price = 0.0` rejected 9.99 (narrowed to integer). `fromTS` maps every TypeScript
 *     `number` to `0.0`, so every converted interface with a number field rejected every
 *     non-integer the moment validation was on.
 *   - `Type T { example: { count: +0 } }` accepted -1.
 *
 * Inline parameter types were always right — they read the literal's `.raw` from the AST.
 * `markExampleKinds` now does the same for every `Type` emission site, and this file pins
 * each site, the nested positions, `.default`, `.toJSONSchema()`, and both runtime modes
 * (standalone inline stub, and a full runtime installed).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'
import { markExampleKinds } from './parser-transforms'

function load(src: string, names: string[], withRuntime: boolean) {
  const saved = (globalThis as any).__tjs
  if (withRuntime) (globalThis as any).__tjs = createRuntime()
  else delete (globalThis as any).__tjs
  try {
    return new Function(tjs(src).code + `\nreturn [${names.join(',')}]`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

/** [declaration, a value that must PASS, a value that must FAIL] */
const CASES: [string, unknown, unknown][] = [
  // every emission site, with a float example
  ['Type T = 0.0', 9.99, 'x'],
  ["Type T 'a price' = 0.0", 9.99, 'x'],
  ['Type T { example: 0.0 }', 9.99, 'x'],
  ["Type T = 0.0 { description: 'a price' }", 9.99, 'x'],
  [
    'Type T {\n  example: { price: 0.0 }\n  predicate(v) { return v.price >= 0 }\n}',
    { price: 9.99 },
    { price: -1 },
  ],
  // nested positions
  [
    'Type T { example: { price: 0.0, qty: 0 } }',
    { price: 9.99, qty: 2 },
    { price: 9.99, qty: 2.5 },
  ],
  ['Type T { example: [0.0] }', [1.5, 2], [1.5, 'x']],
  [
    'Type T { example: { items: [{ price: 0.0 }] } }',
    { items: [{ price: 1.5 }] },
    { items: [{ price: '1' }] },
  ],
  ['Type T { example: -1.0 }', 0.5, 'x'],
  // non-negative integers, top level and nested
  ['Type T { example: +0 }', 3, -1],
  ['Type T { example: { count: +0 } }', { count: 3 }, { count: -1 }],
  ['Type T { example: { count: +0 } }', { count: 3 }, { count: 1.5 }],
  // integers still narrow — the fix must not widen them
  ['Type T { example: 0 }', 3, 1.5],
  ['Type T { example: { qty: 0 } }', { qty: 3 }, { qty: 1.5 }],
  ['Type T { example: 1e3 }', 3, 1.5], // no `.` in the raw: an integer, as for parameters
  // unions — `|` is a union to the parameter path, and bitwise OR (= 0) to a value
  ["Type T { example: { name: '' | null } }", { name: null }, { name: 3 }],
  ['Type T { example: { n: 0.0 | null } }', { n: 2.5 }, { n: 'x' }],
  ["Type T { example: [0 | '']  }", [1, 'a'], [true]],
  // an all-literal union is a closed SET, exactly as for parameters
  [
    "Type T { example: { mode: 'on' | 'off' } }",
    { mode: 'off' },
    { mode: 'dim' },
  ],
  // optional members — absent is fine, present must match
  [
    "Type T { example: { a: '', b: 0.0 | undefined } }",
    { a: 'x' },
    { a: 'x', b: 'y' },
  ],
  [
    "Type T { example: { a: '', b: 0.0 | undefined } }",
    { a: 'x', b: 1.5 },
    { b: 1.5 },
  ],
  // sound type names, as in a parameter
  [
    'Type T { example: { s: string, n: number, i: int } }',
    { s: 'a', n: 1.5, i: 2 },
    { s: 'a', n: 1.5, i: 2.5 },
  ],
  ['Type T { example: { u: unsigned } }', { u: 0 }, { u: -1 }],
  [
    'Type T { example: { x: any, y: unknown } }',
    { x: null, y: [1] },
    'not an object',
  ],
]

describe('numeric example kinds survive to runtime', () => {
  for (const withRuntime of [false, true])
    for (const [decl, good, bad] of CASES)
      it(`${withRuntime ? 'runtime' : 'standalone'}: ${decl.replace(
        /\s+/g,
        ' '
      )}`, () => {
        const [f] = load(
          `${decl}\nfunction f(x: T):! 0 { return 1 }`,
          ['f'],
          withRuntime
        )
        expect(f(good)).toBe(1)
        expect(isMonadicError(f(bad))).toBe(true)
      })

  it('agrees with the INLINE parameter type — the path that was always right', () => {
    const [f, g] = load(
      `Type T { example: { price: 0.0, n: +0 } }\n` +
        `function f(x: T):! 0 { return 1 }\n` +
        `function g(x: { price: 0.0, n: +0 }):! 0 { return 1 }`,
      ['f', 'g'],
      false
    )
    for (const v of [
      { price: 9.99, n: 1 },
      { price: 1, n: -1 },
      { price: 'x', n: 1 },
    ])
      expect(isMonadicError(f(v))).toBe(isMonadicError(g(v)))
  })

  it('.default is the plain value the author wrote, not a marker', () => {
    const [A, B, C] = load(
      'Type A = 0.0\nType B { example: { price: 0.0, tags: [1.0] } }\nType C { example: +5 }',
      ['A', 'B', 'C'],
      false
    )
    expect(A.default).toBe(0)
    expect(B.default).toEqual({ price: 0, tags: [1] })
    expect(C.default).toBe(5)
  })

  it('.toJSONSchema() states the kind', () => {
    const [T] = load(
      'Type T { example: { price: 0.0, qty: 0, n: +0 } }\nconst s = T.toJSONSchema()',
      ['T'],
      false
    )
    expect(T.toJSONSchema().properties).toEqual({
      price: { type: 'number' },
      qty: { type: 'integer' },
      n: { type: 'integer', minimum: 0 },
    })
  })
})

it('a `default:` member inside a block is an error, not a silently ignored line', () => {
  // It was never read: `Type T { default: 0.0 }` compiled to `Type('T')`, accepting everything.
  expect(() => tjs('Type T { default: 0.0 }')).toThrow(/does not read/)
  expect(() => tjs('Type T { example: 0, default: 5 }')).toThrow(
    /does not read/
  )
  // A key NAMED default inside an example value is data, not a member.
  expect(() => tjs("Type T { example: { default: '' } }")).not.toThrow()
})

describe('references to other types', () => {
  it('a FORWARD reference works (it is read when checked, not when declared)', () => {
    const [f] = load(
      'Type Order { example: { items: [Item] } }\nType Item { example: { price: 0.0 } }\nfunction f(o: Order):! 0 { return 1 }',
      ['f'],
      false
    )
    expect(f({ items: [{ price: 1.5 }] })).toBe(1)
    expect(isMonadicError(f({ items: [{ price: 'x' }] }))).toBe(true)
  })

  it('a type may name ITSELF — recursion works on finite data', () => {
    const [f] = load(
      'Type Node { example: { value: 0, next: Node | null } }\nfunction f(n: Node):! 0 { return 1 }',
      ['f'],
      false
    )
    expect(f({ value: 1, next: { value: 2, next: null } })).toBe(1)
    expect(
      isMonadicError(f({ value: 1, next: { value: 'x', next: null } }))
    ).toBe(true)
  })

  it('cyclic data against a recursive type terminates (degrades open, never overflows)', () => {
    const [f, Node] = load(
      'Type Node { example: { value: 0, next: Node | null } }\nfunction f(n: Node):! 0 { return 1 }\nconst s = () => Node.toJSONSchema()',
      ['f', 'Node'],
      false
    )
    const a: any = { value: 1 }
    a.next = a
    expect(() => f(a)).not.toThrow()
    // and a recursive type can still describe itself
    expect(() => Node.toJSONSchema()).not.toThrow()
  })

  it('an undeclared name degrades to unchecked instead of crashing the module', () => {
    // It used to be a ReferenceError at load — a legal JS file that would not import.
    const [f] = load(
      'Type T { example: { x: NotDeclaredAnywhere } }\nfunction f(t: T):! 0 { return 1 }',
      ['f'],
      false
    )
    expect(f({ x: 42 })).toBe(1)
  })

  it('an initialised reference means exactly what it did before', () => {
    const [f] = load(
      'Type Item { example: { price: 0.0 } }\nType Order { example: { items: [Item] } }\nfunction f(o: Order):! 0 { return 1 }',
      ['f'],
      false
    )
    expect(isMonadicError(f({ items: [{ price: 'x' }] }))).toBe(true)
  })

  it('.default of a self-referencing type does not throw', () => {
    const [Node] = load(
      'Type Node { example: { value: 0, next: Node | null } }',
      ['Node'],
      false
    )
    // The union's first member is `Node` itself, which does not exist yet when its default
    // is taken — so that member's default is honestly `undefined`, not a crash.
    expect(Node.default).toEqual({ value: 0, next: undefined })
  })
})

describe('markExampleKinds only touches what is lossy, and only in type positions', () => {
  it('an example with nothing lossy comes back byte-identical', () => {
    for (const ex of [
      "{ name: '', age: 0 }",
      '3.14',
      '[1, 2]',
      "'x'",
      '{ a: { b: 0 } }',
    ])
      expect(markExampleKinds(ex)).toBe(ex)
  })

  it('a literal inside a call or a computed key is a value, not a type', () => {
    expect(markExampleKinds('{ at: f(1.0), [k(+0)]: 0 }')).toBe(
      '{ at: f(1.0), [k(+0)]: 0 }'
    )
  })

  it('unparseable text is left alone', () => {
    expect(markExampleKinds('{ not valid')).toBe('{ not valid')
  })

  it('files without a lossy literal emit exactly what they did before', () => {
    // No marker, so no helpers and no unwrapping `Type` — nothing else pays for this.
    const code = tjs(`Type T { example: { name: '', age: 0 } }`).code
    expect(code).not.toContain('__tjs_rt.__k(')
    expect(code).not.toContain('__unk')
  })
})
