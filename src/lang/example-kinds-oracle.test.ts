/**
 * The recursive `Type` checker agrees with an ORACLE on random cyclic, shared graphs.
 *
 * Three designs of the `ref` check each passed their example tests and failed realistic
 * input: the first leaned on stack overflow (hung on cycles, and failed OPEN on deep
 * payloads), the second kept only the current path (exponential on shared structure), the
 * third rolled back too much (quadratic on a discriminant declared after a recursive member).
 * Example tests could not see any of that, because they only contain the shapes someone
 * thought of.
 *
 * So the shipped checker — the EMITTED inline runtime, which is the shipped semantics — is
 * compared here with an obviously-correct one: a path-based coinductive checker (a pair
 * already on the current path is assumed to hold — the greatest fixed point), exponential
 * but exact on small inputs. Random type systems with recursion, unions, nulls and arrays;
 * random graphs with cycles and shared nodes; a seeded generator, so a failure reproduces.
 *
 * The growth tests at the bottom pin the other half: every shape a review measured, at a
 * size where the old designs took seconds or minutes.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

type Spec =
  | { k: 'int' }
  | { k: 'num' }
  | { k: 'str' }
  | { k: 'null' }
  | { k: 'ref'; t: number }
  | { k: 'union'; of: Spec[] }
  | { k: 'arr'; of: Spec }
  | { k: 'obj'; fields: Record<string, Spec> }
/** Each type's EXAMPLE — usually an object shape, sometimes a union of shapes. */
type System = Spec[] & {
  /**
   * A PREDICATE on some object-shaped types — the case two re-reviews found broken while
   * the oracle had none: `deref` reads a field with no guard (it throws if ever run on an
   * ASSUMED non-object), `neg` negates another Type's `.check` (it failed open when that
   * check answered optimistically). `N` is the fixed non-recursive type `neg` targets.
   */
  preds?: Array<{ kind: 'deref' | 'neg' } | undefined>
}

/** mulberry32 — small, seeded, good enough to explore. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSystem(r: () => number): System {
  // Wide on purpose: the counterexample that broke the previous design needed five types
  // and a top-level union of object SHAPES, which a 3-type generator never produced.
  const n = 1 + Math.floor(r() * 6)
  const leaf = (): Spec =>
    [{ k: 'int' }, { k: 'num' }, { k: 'str' }][Math.floor(r() * 3)] as Spec
  const obj = (depth: number): Spec => {
    const fields: Record<string, Spec> = {}
    const count = 1 + Math.floor(r() * 4)
    for (let i = 0; i < count; i++) fields[`f${i}`] = spec(depth + 1)
    return { k: 'obj', fields }
  }
  const spec = (depth: number): Spec => {
    const p = r()
    if (p < 0.25) return leaf()
    if (p < 0.55) return { k: 'ref', t: Math.floor(r() * n) }
    if (p < 0.8 && depth < 3) {
      const width = 2 + Math.floor(r() * 2) // 2- and 3-way unions
      return {
        k: 'union',
        of: Array.from({ length: width }, () =>
          r() < 0.2 ? ({ k: 'null' } as Spec) : spec(depth + 1)
        ),
      }
    }
    if (p < 0.9 && depth < 3) return { k: 'arr', of: spec(depth + 1) }
    if (depth < 2) return obj(depth)
    return leaf()
  }
  const sys: System = Array.from(
    { length: n },
    () => (r() < 0.8 ? obj(0) : { k: 'union', of: [obj(1), obj(1)] as Spec[] }) // a union of SHAPES
  )
  sys.preds = sys.map((t) => {
    if (t.k !== 'obj') return undefined
    const p = r()
    return p < 0.3 ? { kind: 'deref' } : p < 0.5 ? { kind: 'neg' } : undefined
  })
  return sys
}

/** `N`: what a `neg` predicate negates — `{ n0: 0 }`, non-recursive. */
const isN = (w: unknown) =>
  !!w &&
  typeof w === 'object' &&
  !Array.isArray(w) &&
  'n0' in w &&
  Number.isInteger((w as any).n0)

function render(sys: System): string {
  const ex = (s: Spec): string => {
    switch (s.k) {
      case 'int':
        return '0'
      case 'num':
        return '0.0'
      case 'str':
        return "''"
      case 'null':
        return 'null'
      case 'ref':
        return `T${s.t}`
      case 'union':
        return s.of.map(ex).join(' | ')
      case 'arr':
        return `[${ex(s.of)}]`
      case 'obj':
        return `{ ${Object.entries(s.fields)
          .map(([k, f]) => `${k}: ${ex(f)}`)
          .join(', ')} }`
    }
  }
  const preds = sys.preds ?? []
  return (
    'Type N { example: { n0: 0 } }\n' +
    sys
      .map((t, i) => {
        const p = preds[i]
        if (!p) return `Type T${i} { example: ${ex(t)} }`
        const body = p.kind === 'deref' ? 'x.f0 !== 3' : '!N.check(x.f0)'
        return `Type T${i} {\n  example: ${ex(
          t
        )}\n  predicate(x) { return ${body} }\n}`
      })
      .join('\n')
  )
}

/** The oracle: path-based coinduction. Exact, exponential, fine for small graphs. */
function oracle(sys: System, x: unknown, t: number): boolean {
  const onPath = new Map<object, Set<number>>()
  const holds = (v: unknown, s: Spec): boolean => {
    switch (s.k) {
      case 'int':
        return typeof v === 'number' && Number.isInteger(v)
      case 'num':
        return typeof v === 'number'
      case 'str':
        return typeof v === 'string'
      case 'null':
        return v === null
      case 'union': {
        // The language's rule, mirrored: an all-literal union of ONE kind is a closed SET
        // of values (`0 | 0.0` is {0}), and so is the literal part of a nullable one with
        // at least two literals (`literalUnionValues` / `markExampleKinds`).
        // Flattened first: the generator nests binary unions, but the rendered source
        // `a | b | c` is one flat union to the language.
        const flat = (u: Spec): Spec[] =>
          u.k === 'union' ? u.of.flatMap(flat) : [u]
        const members = flat(s)
        const lit = (m: Spec) => m.k === 'int' || m.k === 'num' || m.k === 'str'
        const nullish = members.filter((m) => m.k === 'null')
        const rest = members.filter((m) => m.k !== 'null')
        const kinds = new Set(
          rest.map((m) => (m.k === 'str' ? 'string' : 'number'))
        )
        const isSet =
          rest.length > 0 &&
          rest.every(lit) &&
          kinds.size === 1 &&
          (nullish.length === 0 || rest.length > 1)
        if (isSet) {
          const values = rest.map((m) => (m.k === 'str' ? '' : 0))
          return (
            values.includes(v as never) || (nullish.length > 0 && v === null)
          )
        }
        return members.some((m) => holds(v, m))
      }
      case 'arr':
        return Array.isArray(v) && v.every((e) => holds(e, s.of))
      case 'obj':
        return (
          !!v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          Object.entries(s.fields).every(
            ([k, f]) => k in (v as object) && holds((v as any)[k], f)
          )
        )
      case 'ref':
        return isType(v, s.t)
    }
  }
  // Coinduction on (value, type) pairs: a pair already on the current path holds.
  const isType = (v: unknown, ti: number): boolean => {
    const key = v !== null && typeof v === 'object' ? v : null
    if (key) {
      const seen = onPath.get(key)
      if (seen?.has(ti)) return true
    }
    const set = key ? onPath.get(key) ?? new Set<number>() : null
    if (key && set) {
      onPath.set(key, set)
      set.add(ti)
    }
    try {
      if (!holds(v, sys[ti])) return false
      const p = sys.preds?.[ti]
      if (!p) return true
      return p.kind === 'deref' ? (v as any).f0 !== 3 : !isN((v as any).f0)
    } finally {
      if (set) set.delete(ti)
    }
  }
  return isType(x, t)
}

function randomGraph(sys: System, r: () => number): object[] {
  const n = 1 + Math.floor(r() * 12)
  const nodes: any[] = Array.from({ length: n }, () => ({}))
  const pick = () => nodes[Math.floor(r() * n)]
  const value = (s: Spec): unknown => {
    // Mostly conforming, sometimes wrong — both verdicts must be exercised.
    if (r() < 0.12)
      return [1.5, 'x', null, 7, [], pick(), 3, { n0: 1 }][Math.floor(r() * 8)]
    switch (s.k) {
      case 'int':
        return Math.floor(r() * 5)
      case 'num':
        return r() * 5
      case 'str':
        return 's'
      case 'null':
        return null
      case 'ref':
        return pick()
      case 'union':
        return value(s.of[Math.floor(r() * s.of.length)])
      case 'arr':
        return Array.from({ length: Math.floor(r() * 3) }, () => value(s.of))
      case 'obj': {
        const o: any = {}
        for (const [k, f] of Object.entries(s.fields))
          if (r() < 0.95) o[k] = value(f)
        return o
      }
    }
  }
  // Each node takes the shape of a random type (a union picks one member).
  const shapeOf = (s: Spec): Spec =>
    s.k === 'union' ? shapeOf(s.of[Math.floor(r() * s.of.length)]) : s
  for (const node of nodes) {
    const shape = shapeOf(sys[Math.floor(r() * sys.length)])
    if (shape.k !== 'obj') continue
    for (const [k, s] of Object.entries(shape.fields))
      if (r() < 0.95) node[k] = value(s)
  }
  return nodes
}

/** A cyclic graph, printed by node index so a disagreement can be reproduced. */
function describeGraph(nodes: any[]): string {
  const show = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(show).join(',')}]`
      : v && typeof v === 'object'
      ? nodes.includes(v)
        ? `#${nodes.indexOf(v)}`
        : JSON.stringify(v)
      : JSON.stringify(v)
  return nodes
    .map(
      (n, i) =>
        `#${i}{${Object.entries(n)
          .map(([k, v]) => `${k}:${show(v)}`)
          .join(',')}}`
    )
    .join(' ')
}

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

describe('the recursive checker agrees with the oracle', () => {
  it('on 400 random type systems and graphs', () => {
    const r = rng(20260926)
    let checks = 0
    let accepted = 0
    const disagreements: string[] = []
    for (let trial = 0; trial < 400; trial++) {
      const sys = randomSystem(r)
      const src = render(sys)
      const types = load(
        src,
        sys.map((_, i) => `T${i}`),
        trial % 2 === 1
      )
      for (let g = 0; g < 3; g++) {
        const nodes = randomGraph(sys, r)
        for (const node of nodes)
          for (let t = 0; t < sys.length; t++) {
            const want = oracle(sys, node, t)
            const got = types[t].check(node) === true
            checks++
            if (want) accepted++
            if (want !== got && disagreements.length < 5)
              disagreements.push(
                `trial ${trial}: T${t} want ${want} got ${got}\n${src}\nnode ${nodes.indexOf(
                  node
                )} of ${nodes.length}: ${describeGraph(nodes)}`
              )
          }
      }
    }
    expect(disagreements).toEqual([])
    // Apparatus: both verdicts are exercised in volume, or agreement means nothing.
    expect(checks).toBeGreaterThan(2000)
    expect(accepted).toBeGreaterThan(checks / 10)
    expect(checks - accepted).toBeGreaterThan(checks / 10)
  })
})

describe('the oracle agrees when ONE validation covers many nodes', () => {
  // Memoized state lives for one outermost validation, so a wrong memo only shows when the
  // same validation meets a node again — which the per-node queries above never do. Here
  // every node goes through one `{ items: [...] }` check, against each type and against a
  // union of two types (so a failed alternative's work is REUSED by the next one).
  it('on 400 random systems, each checked as one batch', () => {
    const r = rng(9_2026)
    let batches = 0
    let accepted = 0
    const disagreements: string[] = []
    for (let trial = 0; trial < 400; trial++) {
      const sys = randomSystem(r)
      const n = sys.length
      const wrappers: string[] = []
      const queries: Array<{ name: string; ok: (node: unknown) => boolean }> =
        []
      for (let t = 0; t < n; t++) {
        wrappers.push(`Type W${t} { example: { items: [T${t}] } }`)
        queries.push({ name: `W${t}`, ok: (node) => oracle(sys, node, t) })
        // 3-way: a failed alternative's work must not leak into the next one.
        const u = (t + 1) % n
        const w = (t + 2) % n
        wrappers.push(
          `Type U${t} { example: { items: [T${t} | T${u} | T${w}] } }`
        )
        queries.push({
          name: `U${t}`,
          ok: (node) =>
            oracle(sys, node, t) ||
            oracle(sys, node, u) ||
            oracle(sys, node, w),
        })
      }
      const types = load(
        render(sys) + '\n' + wrappers.join('\n'),
        queries.map((q) => q.name),
        trial % 2 === 1
      )
      for (let g = 0; g < 3; g++) {
        const nodes = randomGraph(sys, r)
        queries.forEach((q, qi) => {
          const want = nodes.every(q.ok)
          const got = types[qi].check({ items: nodes }) === true
          batches++
          if (want) accepted++
          if (want !== got && disagreements.length < 5)
            disagreements.push(
              `trial ${trial}: ${q.name} want ${want} got ${got}\n${render(
                sys
              )}\n${describeGraph(nodes)}`
            )
        })
      }
    }
    expect(disagreements).toEqual([])
    expect(batches).toBeGreaterThan(2000)
    // A whole batch is valid less often than one node, so the floor is absolute.
    expect(accepted).toBeGreaterThan(150)
    expect(batches - accepted).toBeGreaterThan(batches / 20)
  })
})

describe('a success that leaned on a REFUTED assumption is not kept', () => {
  // The case random generation rarely builds, pinned by hand: y is proven T0 only by
  // assuming x is T0; x then FAILS T0 (but passes T1, so the batch goes on); y must not be
  // remembered as T0. Finalizing a tentative success early — keeping it — accepts this.
  it('y is re-checked, and rejected', () => {
    const [U] = load(
      "Type T0 { example: { a: T0, b: 0 } }\nType T1 { example: { c: '' } }\n" +
        'Type U { example: { items: [T0 | T1] } }',
      ['U'],
      false
    )
    const x: any = { b: 'not a number', c: 'passes T1' }
    const y: any = { a: x, b: 1 } // no `c`: fails T1; T0 only if x is T0, which it is not
    x.a = y
    expect(U.check({ items: [x, y] })).toBe(false)
    expect(U.check({ items: [x] })).toBe(true) // control: x alone passes as T1
  })
})

describe('the recursive checker does bounded work', () => {
  const within = (ms: number, fn: () => unknown) => {
    const t = performance.now()
    const r = fn()
    expect(performance.now() - t).toBeLessThan(ms)
    return r
  }

  it('a 5000-node Text|Num list with the discriminant declared LAST', () => {
    const [Node] = load(
      "Type Text { example: { next: Node | null, kind: 'text' } }\n" +
        "Type Num { example: { next: Node | null, kind: 'num', n: 0 } }\n" +
        'Type Node { example: Text | Num }',
      ['Node'],
      false
    )
    let v: any = null
    for (let i = 0; i < 5000; i++)
      v = i % 2 ? { next: v, kind: 'text' } : { next: v, kind: 'num', n: i }
    expect(within(500, () => Node.check(v))).toBe(true)
  })

  it('a 2000-node discriminated AST, tag declared last', () => {
    const [Expr] = load(
      "Type Add { example: { l: Expr, r: Expr, op: 'add' } }\n" +
        "Type Mul { example: { l: Expr, r: Expr, op: 'mul' } }\n" +
        "Type Num { example: { n: 0, op: 'num' } }\n" +
        'Type Expr { example: Add | Mul | Num }',
      ['Expr'],
      false
    )
    let e: any = { n: 1, op: 'num' }
    for (let i = 0; i < 2000; i++)
      e = { l: e, r: { n: i, op: 'num' }, op: i % 2 ? 'add' : 'mul' }
    expect(within(500, () => Expr.check(e))).toBe(true)
  })

  it('a star of 8000 children with parent pointers', () => {
    const [TN] = load(
      'Type TN { example: { parent: TN | null, children: [TN] } }',
      ['TN'],
      false
    )
    const root: any = { parent: null, children: [] }
    for (let i = 0; i < 8000; i++)
      root.children.push({ parent: root, children: [] })
    expect(within(500, () => TN.check(root))).toBe(true)
  })

  it('a ~1MB array payload of recursive items, validated as one value', () => {
    const [Batch] = load(
      "Type Item { example: { id: 0, tags: [''], next: Item | null } }\n" +
        'Type Batch { example: { items: [Item] } }',
      ['Batch'],
      false
    )
    const items = Array.from({ length: 12000 }, (_, i) => ({
      id: i,
      tags: ['alpha', 'beta', 'gamma'],
      next: { id: i + 1, tags: ['x'], next: null },
    }))
    const body = JSON.parse(JSON.stringify({ items }))
    expect(JSON.stringify(body).length).toBeGreaterThan(900_000)
    expect(within(1000, () => Batch.check(body))).toBe(true)
  })

  it('growth is linear, not quadratic, on the star', () => {
    const [TN] = load(
      'Type TN { example: { parent: TN | null, children: [TN] } }',
      ['TN'],
      false
    )
    const time = (n: number) => {
      const root: any = { parent: null, children: [] }
      for (let i = 0; i < n; i++)
        root.children.push({ parent: root, children: [] })
      const t = performance.now()
      TN.check(root)
      return performance.now() - t
    }
    time(2000) // warm
    const small = time(4000)
    const big = time(16000)
    // 4× the input: linear is ~4×, quadratic ~16×. Generous for noise.
    expect(big / Math.max(small, 0.5)).toBeLessThan(9)
  })
})

describe('depth is not bounded by the JS stack — in NODE, whose stack is ~8x smaller', () => {
  // A recursive checker overflows at a data depth set by the engine: Bun allows ~80k plain
  // frames, Node ~9k, and a ref level costs ~20. Failing closed there rejected a VALID
  // list a few hundred deep on Node. The checker now never recurses into the data (iterative
  // refinement over a worklist). Run in a real `node`, because Bun's stack would hide a
  // regression.
  it('accepts a 50,000-deep valid list and rejects a bad leaf at that depth', async () => {
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'tjs-deep-'))
    try {
      writeFileSync(
        join(dir, 'm.mjs'),
        tjs(
          "Type Text { example: { next: Node | null, kind: 'text' } }\n" +
            "Type Num { example: { next: Node | null, kind: 'num', n: 0 } }\n" +
            'Type Node { example: Text | Num }\n' +
            'export const check = (v) => Node.check(v)'
        ).code
      )
      writeFileSync(
        join(dir, 'run.mjs'),
        `import { check } from './m.mjs'
const mk = (n, bad) => { let v = bad ? { next: 5, kind: 'num', n: 1 } : null
  for (let i = 0; i < n; i++) v = i % 2 ? { next: v, kind: 'text' } : { next: v, kind: 'num', n: i }
  return v }
console.log(JSON.stringify([check(mk(50000)), check(mk(50000, true)), check(mk(300))]))`
      )
      const out = Bun.spawnSync(['node', join(dir, 'run.mjs')])
      expect(new TextDecoder().decode(out.stderr)).toBe('')
      expect(JSON.parse(new TextDecoder().decode(out.stdout))).toEqual([
        true,
        false,
        true,
      ])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('re-review 3 repros', () => {
  it('B-1: a failure is not hidden by a sibling that reused its stack slot (no wrong true)', () => {
    const [Elem, U] = load(
      'Type R { example: { a: A, b: B, bad: 0 } }\n' +
        'Type A { example: { r: R, e: E } }\n' +
        'Type E { example: { a: A } }\n' +
        'Type B { example: { e: E } }\n' +
        "Type K { example: { bad: '' } }\n" +
        'Type Elem { example: { p: R } | { q: B } }\n' +
        'Type U { example: { items: [R | K | B] } }',
      ['Elem', 'U'],
      false
    )
    const rv: any = { bad: 'x' }
    const av: any = { r: rv }
    const ev: any = { a: av }
    av.e = ev
    const bv: any = { e: ev }
    rv.a = av
    rv.b = bv
    // B holds only if E does, E only if A does, A only if R does — and R fails (`bad`).
    expect(Elem.check({ p: rv, q: bv })).toBe(false)
    expect(U.check({ items: [rv, bv] })).toBe(false)
  })

  /**
   * Time for two sizes 4x apart; linear is ~4x, quadratic ~16x. BEST of three at each size:
   * a single sample is GC-noisy enough that 2x the input once measured FASTER.
   */
  const ratio = (run: (n: number) => void, small: number) => {
    const best = (n: number) => {
      let min = Infinity
      for (let i = 0; i < 3; i++) {
        const t = performance.now()
        run(n)
        min = Math.min(min, performance.now() - t)
      }
      return min
    }
    run(small) // warm
    return best(small * 4) / Math.max(best(small), 0.5)
  }

  it('B-2(a): a 128-deep spine with many first-alternative failures stays linear', () => {
    const [T] = load(
      "Type T { example: { v: 0, kids: [T | { x: '' }] } }",
      ['T'],
      false
    )
    const build = (k: number) => {
      let spine: any = { v: 0, kids: [] }
      const bottom = spine
      for (let i = 0; i < 129; i++) spine = { v: i, kids: [spine] }
      for (let i = 0; i < k; i++) bottom.kids.push({ x: 'valid via alt' })
      return spine
    }
    expect(T.check(build(8000))).toBe(true) // it used to REJECT this, valid, after ~12s
    expect(ratio((k) => T.check(build(k)), 2000)).toBeLessThan(9)
  })

  it('B-2(b): many deep chains valid only via the second alternative are ACCEPTED', () => {
    const [Arr] = load(
      'Type C { example: { next: C | null, k: 0 } }\n' +
        'Type Arr { example: { items: [C | { alt: 0 }] } }',
      ['Arr'],
      false
    )
    const chain = () => {
      let c: any = { next: null, k: 'BAD', alt: 1 }
      for (let i = 0; i < 200; i++) c = { next: c, k: i, alt: 1 }
      return c
    }
    const build = (m: number) => ({ items: Array.from({ length: m }, chain) })
    expect(Arr.check(build(400))).toBe(true) // ~1.2MB; it used to be rejected
    expect(ratio((m) => Arr.check(build(m)), 50)).toBeLessThan(9)
  })

  it('B-2(c): lists valid as B, 160 of them 129+ deep, accepted in linear time', () => {
    const [L] = load(
      "Type A { example: { next: T | null, a: '' } }\n" +
        'Type B { example: { next: T | null, b: 0 } }\n' +
        'Type T { example: A | B }\n' +
        'Type L { example: { lists: [T] } }',
      ['L'],
      false
    )
    const list = () => {
      let v: any = null
      for (let i = 0; i < 140; i++) v = { next: v, b: i }
      return v
    }
    const build = (k: number) => ({ lists: Array.from({ length: k }, list) })
    expect(L.check(build(160))).toBe(true)
    expect(ratio((k) => L.check(build(k)), 40)).toBeLessThan(9)
  })
})
