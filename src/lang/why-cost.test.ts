/**
 * Explaining a rejection costs a bounded multiple of the check (#3619, rc.10 review). The
 * `__why` explainer (#3597) asked `__match(v, ex)` "does this whole subtree pass?" at every
 * named Type on the way down to the bad leaf, so a rejected recursive value cost
 * subtree × depth: 37× the accept at depth 60, bounded only by the depth cap.
 *
 * Two checks:
 *   - the same MESSAGES as the old explainer (kept as `why-oracle.fixture.ts`), over a corpus
 *     of rejected values across nested objects, lists, references, recursion, unions, numeric
 *     kinds and optional members;
 *   - the work, counted as property reads through a Proxy (not timed), stays within a fixed
 *     multiple of the accept, and does not grow with depth.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { OLD_WHY_SOURCE } from './why-oracle.fixture'
import { WHY_SOURCE } from './emitters/js'

/** Emit `src` and load `name`, with the current explainer or the old one swapped in. */
function load(src: string, name: string, old = false) {
  let code = tjs(src, { runTests: false }).code
  if (old) {
    expect(code.includes(WHY_SOURCE)).toBe(true) // apparatus: the swap must happen
    code = code.replace(WHY_SOURCE, () => OLD_WHY_SOURCE)
  }
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(`${code}\nreturn ${name}`)()
  } finally {
    g.__tjs = prev
  }
}

const TYPES = `Type Product { example: { name: '', kind: '', price: 0.0 } }
Type Tree { example: { v: 0, kids: [Tree] } }
Type Config { example: {
  title: '', products: [Product], limits: { max: 0, min: +0 },
  mode: 'on' | 'off', tag: '' | null, tree: Tree
} }
function take(c: Config):! 0 { return 1 }`

const good = () => ({
  title: 't',
  products: [
    { name: 'a', kind: 'x', price: 1.5 },
    { name: 'b', kind: 'y', price: 2 },
  ],
  limits: { max: 3, min: 0 },
  mode: 'on',
  tag: null,
  tree: {
    v: 1,
    kids: [
      { v: 2, kids: [] },
      { v: 3, kids: [{ v: 4, kids: [] }] },
    ],
  },
})

/** Every leaf path of a value, so each can be broken in turn. */
function leaves(v: any, at: (string | number)[] = []): (string | number)[][] {
  if (v === null || typeof v !== 'object') return [at]
  const out: (string | number)[][] = Array.isArray(v) ? [at] : []
  for (const k of Object.keys(v))
    out.push(...leaves(v[k], [...at, Array.isArray(v) ? +k : k]))
  return out
}

function setAt(v: any, path: (string | number)[], x: unknown): any {
  if (!path.length) return x
  const copy: any = Array.isArray(v) ? [...v] : { ...v }
  copy[path[0]] = setAt(v[path[0]], path.slice(1), x)
  return copy
}

describe('the cheaper explainer says what the old one said', () => {
  const now = load(TYPES, 'take')
  const then = load(TYPES, 'take', true)
  const WRONG: unknown[] = ['x', 7, 1.5, -1, null, true, [], {}, undefined]

  it('for every leaf broken every way', () => {
    let compared = 0
    let explained = 0
    for (const path of leaves(good()))
      for (const bad of WRONG) {
        const value = setAt(good(), path, bad)
        const a = then(value)
        const b = now(value)
        // A replacement can be legal (null where `'' | null` is allowed): both accept.
        expect(b instanceof Error).toBe(a instanceof Error)
        if (!(a instanceof Error)) continue
        compared++
        if (a.message !== b.message)
          expect({ path, bad, message: b.message }).toEqual({
            path,
            bad,
            message: a.message,
          })
        if (/: (expected|missing|no alternative)/.test(a.message)) explained++
      }
    // Apparatus: enough rejections, and the old explainer named a place in most of them.
    expect(compared).toBeGreaterThan(80)
    expect(explained).toBeGreaterThan(compared / 2)
  })
})

describe('explaining costs a bounded multiple of checking', () => {
  const take = load(
    `Type T { example: { v: 0, kids: [T] } }\nfunction take(t: T):! 0 { return 1 }`,
    'take'
  )
  let reads = 0
  const wrap = (o: any): any =>
    new Proxy(o, {
      get(t, k, r) {
        reads++
        return Reflect.get(t, k, r)
      },
    })
  /** A chain of `depth` levels, each with `width` good siblings; a bad leaf at the bottom. */
  const build = (depth: number, width: number, bad: boolean): any => {
    let node = wrap({ v: bad ? 'x' : 1, kids: wrap([]) })
    for (let i = 0; i < depth; i++) {
      const kids: any[] = []
      for (let j = 0; j < width; j++)
        kids.push(wrap({ v: 1, kids: wrap([wrap({ v: 2, kids: wrap([]) })]) }))
      kids.push(node)
      node = wrap({ v: i, kids: wrap(kids) })
    }
    return node
  }
  const ratio = (depth: number, width: number) => {
    const ok = build(depth, width, false)
    reads = 0
    expect(take(ok)).toBe(1)
    const accept = reads
    const bad = build(depth, width, true)
    reads = 0
    const r = take(bad)
    // (The path stops at the depth cap; message equality is the corpus row's business.)
    expect(r instanceof Error).toBe(true)
    return reads / accept
  }

  it('does not grow with depth', () => {
    const shallow = ratio(8, 4)
    const deep = ratio(60, 4)
    // Was 11.6x at depth 8 and 37x at depth 60.
    expect(deep).toBeLessThan(shallow * 1.5)
    expect(deep).toBeLessThan(8)
  })

  it('nor with width', () => {
    expect(ratio(32, 32)).toBeLessThan(8)
  })
})
