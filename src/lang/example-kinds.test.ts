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
import { fromTS } from './emitters/from-ts'

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

  it('an undeclared name degrades to unchecked — and SAYS so, and the key stays required', () => {
    // It used to be a ReferenceError at load — a legal JS file that would not import. Open
    // is the TJS ⊇ JS direction, but a typo (`Rolle` for `Role`) must not silently disable
    // validation: it is recorded, once per site, in the flight recorder.
    const saved = (globalThis as any).__tjs
    const rt = createRuntime()
    ;(globalThis as any).__tjs = rt
    try {
      const code = tjs(
        'Type T { example: { x: NotDeclaredAnywhere } }\nfunction f(t: T):! 0 { return 1 }'
      ).code
      const f = new Function(code + '\nreturn f')()
      expect(f({ x: 42 })).toBe(1)
      expect(
        rt
          .records({ severity: 'warning' })
          .some((r: any) => r.message.includes('NotDeclaredAnywhere'))
      ).toBe(true)
      // An unreadable reference does not ALSO make its member optional.
      expect(isMonadicError(f({}))).toBe(true)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
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

describe('a recursive Type terminates, and never fails OPEN', () => {
  // A `ref` check used to rely on stack overflow: exponential on a cycle, and a deep payload
  // whose innermost leaf was invalid PASSED, because the deepest frame caught the RangeError
  // and answered yes. It is coinductive now, and an overflow fails closed.
  const Tree =
    'Type Node { example: { v: 0, left: Node | null, right: Node | null } }'

  it('a two-branch self-cycle is accepted, quickly', () => {
    const [Node] = load(Tree, ['Node'], false)
    const n: any = { v: 1 }
    n.left = n
    n.right = n
    const t = performance.now()
    expect(Node.check(n)).toBe(true)
    expect(performance.now() - t).toBeLessThan(50)
  })

  it('a cycle with an INVALID member is rejected', () => {
    const [Node] = load(Tree, ['Node'], false)
    const n: any = { v: 1 }
    n.left = n
    n.right = { v: 'x', left: null, right: null }
    expect(Node.check(n)).toBe(false)
  })

  it('a deep acyclic JSON payload with an invalid leaf is REJECTED', () => {
    const [D] = load(
      'Type D { example: { id: 0, child: D | undefined } }',
      ['D'],
      false
    )
    let deep: any = { id: 'NOT A NUMBER' }
    for (let i = 0; i < 20000; i++) deep = { id: i, child: deep }
    expect(D.check(JSON.parse(JSON.stringify(deep)))).toBe(false)
  })

  it('a converted TS parent-pointer tree under TjsStrict terminates', () => {
    const t = fromTS(
      '/* @tjs TjsStrict */\ninterface TreeNode { parent: TreeNode | null; children: TreeNode[] }\nexport function size(n: TreeNode): number { return n.children.length }',
      { emitTJS: true }
    ).code
    const [size] = load(t.replace(/^export /gm, ''), ['size'], false)
    const root: any = { parent: null, children: [] }
    root.children.push(
      { parent: root, children: [] },
      { parent: root, children: [] }
    )
    const s = performance.now()
    expect(size(root)).toBe(2)
    expect(performance.now() - s).toBeLessThan(50)
  })
})

describe('the schema path agrees with the matcher', () => {
  // `toJSONSchema` and a Type with a predicate (which validates through `infer`) used to
  // map a literal set and an `undefined` member to `{}` — an unconstrained schema — so
  // adding `predicate(x) { return true }` made a type ACCEPT what the example rejected.
  it('every CASES row: the predicate route gives the same verdict as the example route', () => {
    let compared = 0
    for (const [decl, good, bad] of CASES) {
      const m = decl.match(/^Type T (?:\{ example: ([\s\S]*) \}|= ([\s\S]*))$/)
      const example = m && (m[1] ?? m[2])
      if (!example || decl.includes('predicate')) continue
      // Both modes: standalone is the DEFAULT emission, and it is where the predicate route
      // failed open for an unmarked example (re-review 2, M-3).
      for (const withRuntime of [false, true]) {
        const [P] = load(
          `Type T {\n  example: ${example}\n  predicate(x) { return true }\n}`,
          ['T'],
          withRuntime
        )
        expect({ decl, withRuntime, good: P.check(good) }).toEqual({
          decl,
          withRuntime,
          good: true,
        })
        expect({ decl, withRuntime, bad: P.check(bad) }).toEqual({
          decl,
          withRuntime,
          bad: false,
        })
      }
      compared++
    }
    // Apparatus: the regex above must actually select rows.
    expect(compared).toBeGreaterThan(8)
  })

  it('.toJSONSchema() states sets, optional members and floats', () => {
    const [T] = load(
      "Type T { example: { mode: 'on' | 'off', b: '' | undefined, m: 'a' | 'b' | undefined, p: 0.0 } }\nconst s = () => T.toJSONSchema()",
      ['T'],
      false
    )
    const s = T.toJSONSchema()
    expect(s.properties).toEqual({
      mode: { enum: ['on', 'off'] },
      b: { type: 'string' },
      m: { enum: ['a', 'b'] },
      p: { type: 'number' },
    })
    expect(s.required).toEqual(['mode', 'p'])
  })

  it('an OPTIONAL literal union stays a closed set', () => {
    const [T] = load(
      "Type T { example: { m: 'a' | 'b' | undefined } }",
      ['T'],
      false
    )
    expect(T.check({ m: 'a' })).toBe(true)
    expect(T.check({})).toBe(true)
    expect(T.check({ m: 'c' })).toBe(false)
  })

  it('a bigint set transpiles and checks (it threw "cannot serialize BigInt")', () => {
    const [T] = load('Type T { example: { n: 1n | 2n } }', ['T'], false)
    expect(T.check({ n: 2n })).toBe(true)
    expect(T.check({ n: 3n })).toBe(false)
  })
})

describe('Generic call arguments are left alone', () => {
  // Marking the arguments of a declared Generic's calls was tried and removed (review B-1):
  // it was a regex over call sites with no scope analysis, and it broke a NAMED predicate —
  // `Box(isEven)` rejected every value. Parameter DEFAULTS, which are declaration sites,
  // are still read as types.
  const BOX =
    "Generic Box<T> {\n  description: 'box'\n  predicate(o, T) { return T(o.value) }\n}\n"

  it('a named predicate argument works', () => {
    const [B] = load(
      BOX + 'function isEven(v) { return v % 2 === 0 }\nconst B = Box(isEven)',
      ['B'],
      false
    )
    expect(B.check({ value: 2 })).toBe(true)
    expect(B.check({ value: 3 })).toBe(false)
  })

  it('a bigint union as a parameter DEFAULT loads (zod: `<T = number | bigint>`)', () => {
    const src =
      "Generic G<T = 0.0 | 0n> {\n  description: 'g'\n  predicate(o, T) { return T(o) }\n}\nconst x = 1"
    expect(() => new Function(tjs(src).code)()).not.toThrow()
  })
})

describe('recursive Types do bounded work (re-review B-1)', () => {
  // The first coinductive `ref` kept only the current PATH, so its cost grew with the
  // number of paths, not nodes: a 364-node parent-pointer tree hung, and a 500-byte hostile
  // JSON body took minutes. Every shape the re-review measured is pinned here with a bound.
  const within = (ms: number, fn: () => unknown) => {
    const t = performance.now()
    const r = fn()
    expect(performance.now() - t).toBeLessThan(ms)
    return r
  }

  it('a 400-node parent-pointer tree', () => {
    const [TN] = load(
      'Type TN { example: { parent: TN | null, children: [TN] } }',
      ['TN'],
      false
    )
    const root: any = { parent: null, children: [] }
    const q = [root]
    for (let n = 1; n < 400; ) {
      const p = q.shift()
      for (let i = 0; i < 3 && n < 400; i++, n++) {
        const c = { parent: p, children: [] }
        p.children.push(c)
        q.push(c)
      }
    }
    expect(within(200, () => TN.check(root))).toBe(true)
  })

  it('the same tree through fromTS + TjsStrict', () => {
    const t = fromTS(
      '/* @tjs TjsStrict */\ninterface TreeNode { parent: TreeNode | null; children: TreeNode[] }\nexport function size(n: TreeNode): number { return n.children.length }',
      { emitTJS: true }
    ).code
    const [size] = load(t.replace(/^export /gm, ''), ['size'], false)
    const root: any = { parent: null, children: [] }
    for (let i = 0; i < 400; i++)
      root.children.push({ parent: root, children: [] })
    expect(within(200, () => size(root))).toBe(400)
  })

  it('a 1000-node doubly-linked list, checked from its midpoint', () => {
    const [L] = load(
      'Type L { example: { v: 0, prev: L | null, next: L | null } }',
      ['L'],
      false
    )
    const nodes: any[] = []
    for (let i = 0; i < 1000; i++) nodes.push({ v: i, prev: null, next: null })
    for (let i = 0; i < 999; i++) {
      nodes[i].next = nodes[i + 1]
      nodes[i + 1].prev = nodes[i]
    }
    expect(within(200, () => L.check(nodes[500]))).toBe(true)
  })

  it('hostile JSON: overlapping recursive alternatives, depth 30, bad leaf', () => {
    const [A] = load(
      'Type A { example: { a: 0, next: A | B | null } }\nType B { example: { a: 0, next: B | A | null } }',
      ['A'],
      false
    )
    let v: any = { a: 'BAD', next: null }
    for (let i = 0; i < 30; i++) v = { a: i, next: v }
    expect(within(200, () => A.check(JSON.parse(JSON.stringify(v))))).toBe(
      false
    )
  })

  it('a diamond DAG of depth 30 (shared substructure)', () => {
    const [D] = load(
      'Type D { example: { l: D | null, r: D | null } }',
      ['D'],
      false
    )
    let d: any = null
    for (let i = 0; i < 30; i++) d = { l: d, r: d }
    expect(within(200, () => D.check(d))).toBe(true)
  })

  it('a complete graph of 12 nodes', () => {
    const [G] = load('Type G { example: { v: 0, out: [G] } }', ['G'], false)
    const ns: any[] = Array.from({ length: 12 }, (_, v) => ({ v, out: [] }))
    for (const a of ns) for (const b of ns) if (a !== b) a.out.push(b)
    expect(within(200, () => G.check(ns[0]))).toBe(true)
  })
})

describe('recursive Types with a predicate, runtime installed (re-review B-2)', () => {
  // With a runtime installed, a Type carrying a predicate gated on an INFERRED schema, which
  // cannot express a `ref` — so a recursive member was `{}` and `{ next: 5 }` passed. A
  // predicate that narrows nothing must never widen the type.
  const SHAPES: Array<[string, unknown, unknown[]]> = [
    [
      'Type T { example: { v: 0, next: T | null }#P }',
      { v: 1, next: { v: 2, next: null } },
      [
        { v: 1, next: { v: 'bad', next: null } },
        { v: 1, next: 5 },
      ],
    ],
    [
      'Type T { example: { v: 0, kids: [T] }#P }',
      { v: 1, kids: [{ v: 2, kids: [] }] },
      [
        { v: 1, kids: [{ v: 'bad', kids: [] }] },
        { v: 1, kids: [5] },
      ],
    ],
    [
      'Type U { example: { u: 0, t: T | null } }\nType T { example: { v: 0, u: U | null }#P }',
      { v: 1, u: { u: 2, t: null } },
      [
        { v: 1, u: { u: 'bad', t: null } },
        { v: 1, u: 5 },
      ],
    ],
  ]
  for (const [shape, good, bads] of SHAPES)
    for (const pred of ['', '\n  predicate(x) { return true }\n'])
      for (const withRuntime of [false, true])
        it(`${pred ? 'with' : 'without'} a predicate, ${
          withRuntime ? 'runtime' : 'standalone'
        }: ${shape.split('\n').pop()!.replace('#P', '')}`, () => {
          const [T] = load(shape.replace('#P', pred), ['T'], withRuntime)
          expect(T.check(good)).toBe(true)
          for (const bad of bads)
            expect({ bad, ok: T.check(bad) }).toEqual({ bad, ok: false })
        })
})

describe('what the recursion records', () => {
  const withRecords = (fn: (rt: any) => void) => {
    const saved = (globalThis as any).__tjs
    const rt = createRuntime()
    ;(globalThis as any).__tjs = rt
    try {
      fn(rt)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  it('a clean load of a recursive Type records nothing (no false "not defined")', () => {
    withRecords((rt) => {
      new Function(
        tjs('Type Node { example: { v: 0, next: Node | null } }').code +
          '\nreturn Node'
      )()
      expect(rt.records({ severity: 'warning' })).toEqual([])
    })
  })

  it('a 20,000-deep payload: valid is ACCEPTED, a bad leaf is REJECTED, nothing throws', () => {
    // It used to overflow and fail closed — rejecting VALID deep data. The checker no longer
    // recurses into the data at all (see example-kinds-oracle.test.ts).
    withRecords((rt) => {
      const code = tjs(
        'Type D { example: { id: 0, child: D | undefined } }\nfunction f(d: D):! 0 { return 1 }'
      ).code
      const f = new Function(code + '\nreturn f')()
      let deep: any = { id: 0 }
      for (let i = 0; i < 20000; i++) deep = { id: i, child: deep }
      expect(f(deep)).toBe(1)
      let bad: any = { id: 'NOT A NUMBER' }
      for (let i = 0; i < 20000; i++) bad = { id: i, child: bad }
      expect(isMonadicError(f(bad))).toBe(true) // RETURNED, not thrown
      expect(rt.records({ severity: 'warning' })).toEqual([])
    })
  })
})

describe('optional members, and schemas that serialise', () => {
  it('a NAMED optional Type keeps its member optional, like the inline union', () => {
    const [T] = load(
      "Type Opt = '' | undefined\nType T { example: { o: Opt, n: 0 } }",
      ['T'],
      false
    )
    expect(T.check({ n: 1 })).toBe(true)
    expect(T.check({ n: 1, o: 'x' })).toBe(true)
    expect(T.check({ n: 1, o: 5 })).toBe(false)
  })

  it('a bigint set has a schema JSON can hold', () => {
    const [T] = load(
      'Type T { example: { n: 1n | 2n } }\nconst s = () => T.toJSONSchema()',
      ['T'],
      false
    )
    expect(() => JSON.stringify(T.toJSONSchema())).not.toThrow()
  })
})

describe('a file that only MENTIONS the marker syntax', () => {
  it('loads — the helpers are exported only where they are defined', () => {
    // `needsKind` is a substring test over the emitted code, strings included.
    // `==` forces the inline runtime block, whose export list is where the defect lived.
    const js = tjs(
      "const s = \"__tjs_rt.__k('float', 0)\"\nexport const n = s == 'x'"
    ).code
    expect(() => new Function(js.replace(/^export /gm, ''))()).not.toThrow()
  })
})

describe('`Type X = …` reads the whole default expression', () => {
  // It was a one-token regex: `Type Opt = '' | undefined` emitted `Type(…, '') | undefined`
  // (bitwise OR — `Opt` was the NUMBER 0), and an object default stopped at its first `}`.
  it('a union default is a union, not bitwise OR', () => {
    const [Opt] = load("Type Opt = '' | undefined", ['Opt'], false)
    expect(typeof Opt.check).toBe('function')
    expect(Opt.check('x')).toBe(true)
    expect(Opt.check(undefined)).toBe(true)
    expect(Opt.check(5)).toBe(false)
  })
  it('a nested object default and a negative default', () => {
    const [N, M] = load(
      'Type N = { a: { b: 0.0 } }\nType M = -1.5',
      ['N', 'M'],
      false
    )
    expect(N.check({ a: { b: 1.5 } })).toBe(true)
    expect(N.check({ a: { b: 'x' } })).toBe(false)
    expect(M.check(2.5)).toBe(true)
    expect(M.default).toBe(-1.5)
  })
})

describe('the block form reads the same expressions as `=`', () => {
  it("`example: A | B`, `example: 0 | ''`, `example: N`", () => {
    const [T, U, V] = load(
      "Type N { example: { n: 0 } }\nType M { example: { m: '' } }\n" +
        'Type T { example: N | M }\n' +
        "Type U { example: 0 | '' }\n" +
        'Type V { example: N }',
      ['T', 'U', 'V'],
      false
    )
    expect(T.check({ m: 'x' })).toBe(true)
    expect(T.check({ q: 1 })).toBe(false)
    expect(U.check('x')).toBe(true)
    expect(U.check(true)).toBe(false)
    expect(V.check({ n: 1 })).toBe(true)
    expect(V.check(5)).toBe(false)
  })

  it('a description holding `example:` is not the member', () => {
    const [T] = load(
      "Type T {\n  description: 'see example: nothing'\n  example: 0.0\n}",
      ['T'],
      false
    )
    expect(T.check(1.5)).toBe(true)
  })
})

describe('a Type defined only in terms of itself is an error', () => {
  // Under coinduction `Type T = T` holds for every object — never what was meant.
  for (const src of [
    'Type T = T',
    'Type T { example: T | null }',
    'Type A = B\nType B = A',
  ])
    it(JSON.stringify(src), () => {
      expect(() => tjs(src)).toThrow(/defined only in terms of itself/)
    })
  it('real recursion and a plain alias are fine (controls)', () => {
    expect(() => tjs('Type N { example: { next: N | null } }')).not.toThrow()
    expect(() => tjs('Type A = B\nType B { example: { v: 0 } }')).not.toThrow()
  })
})

describe('a type expression may span lines (re-review 3, M-1)', () => {
  // A top-level newline used to END the member unconditionally, so a multi-line union was
  // silently truncated to its first line — and `Type X = 'a' |\n 0` became the NUMBER 0.
  const ROWS: Array<[string, unknown[], unknown[]]> = [
    ["Type X {\n  example: 'a'\n  | 0\n}", ['x', 0], [true]],
    ["Type X = 'a' |\n  0", ['x', 0], [true]],
    ["Type X =\n  | 'a'\n  | 'b'", ['a', 'b'], ['c']],
    [
      "Type X {\n  example: { a: 0 }\n    | { b: '' }\n}",
      [{ b: 'x' }, { a: 1 }],
      [5],
    ],
    ["Type X = { a: 0 } |\n  { b: '' }", [{ b: 'x' }], [5]],
  ]
  for (const [src, good, bad] of ROWS)
    it(JSON.stringify(src), () => {
      const [X] = load(src, ['X'], false)
      for (const v of good)
        expect({ v, ok: X.check(v) }).toEqual({ v, ok: true })
      for (const v of bad)
        expect({ v, ok: X.check(v) }).toEqual({ v, ok: false })
    })

  it('a member on the next line still ENDS the example (control)', () => {
    const [X] = load(
      "Type X {\n  example: 'a'\n  predicate(x) { return x.length > 0 }\n}",
      ['X'],
      false
    )
    expect(X.check('x')).toBe(true)
    expect(X.check('')).toBe(false)
  })

  it('the Generic reader (a sibling site) spans lines too', () => {
    expect(() =>
      tjs(
        "Generic Box<T> {\n  description: 'box'\n  example: { value: 0 }\n    | null\n  predicate(o, T) { return o === null || T(o.value) }\n}"
      )
    ).not.toThrow()
  })

  it('an unreadable `=` default is an error, not a fallthrough', () => {
    expect(() => tjs('Type X = 1 +* 2')).toThrow(/could not be read/)
  })
})

describe('the Union and legacy readers share the extent rule (siblings of M-1)', () => {
  it('an inline Union spanning lines keeps every member', () => {
    const [U] = load("Union U 'u' 'a'\n  | 'b'", ['U'], false)
    expect(U.check('b')).toBe(true)
    expect(U.check('c')).toBe(false)
  })
  it('the legacy `Type Foo <value>` form reads the whole expression', () => {
    const [Foo] = load("Type Foo 'a' + 'b'", ['Foo'], false)
    expect(Foo.default).toBe('ab')
    expect(Foo.check('x')).toBe(true)
  })
})

describe('the solver is emitted only where an example can recurse (0.14.0 final review, M-3)', () => {
  // Any kind marker used to inline the whole recursive-Type solver: a two-field TS interface
  // with `number` fields emitted 8,180 bytes against 1,884 for `string` fields.
  const emitted = (src: string) => tjs(src).code
  it('a non-recursive marker gets the marker helpers, not the solver', () => {
    const code = emitted(
      'Type Point { example: { x: 0.0, y: 0.0 } }\nfunction d(p: Point):! 0 { return 1 }'
    )
    expect(code).toContain('function __k(')
    expect(code).not.toContain('__kSolve')
    expect(code).not.toContain('__kjs')
    // 10,400 bytes with the solver; 5,797 without (4,115 for the same Type with `''` fields).
    expect(code.length).toBeLessThan(7000)
  })
  it('a named reference brings the solver, and it still works', () => {
    const src = 'Type T { example: { next: T | null, n: 0.0 } }'
    expect(emitted(src)).toContain('__kSolve')
    const T = new Function(emitted(src) + '\nreturn T')()
    expect(T.check({ n: 1.5, next: { n: 2, next: null } })).toBe(true)
    expect(T.check({ n: 1.5, next: { n: 'x', next: null } })).toBe(false)
  })
  it('the non-solver path still enforces the markers', () => {
    const P = new Function(
      emitted(
        "Type P { example: { x: 0.0, k: +0, u: 'a' | 'b', o: 0 | undefined } }"
      ) + '\nreturn P'
    )()
    expect(P.check({ x: 1.5, k: 2, u: 'a' })).toBe(true)
    expect(P.check({ x: 1.5, k: -2, u: 'a' })).toBe(false)
    expect(P.check({ x: 1.5, k: 2, u: 'c' })).toBe(false)
    expect(P.check({ x: 1.5, k: 2, u: 'a', o: 'no' })).toBe(false)
  })
})
