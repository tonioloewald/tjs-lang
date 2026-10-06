/**
 * A `wasm {}` block means what its `fallback {}` means.
 *
 * The fallback exists so a block can run without WebAssembly, which is only sound if both
 * paths give the SAME answer. The WASM QuickStart's first example broke that silently:
 * `return wasm { a + b } fallback { return a + b }` returned `undefined` from WASM (a bare
 * final expression was compiled and dropped, and the function had no result) and 7 from the
 * fallback. Its WAT comment claimed `(result f64)`. Its "normalize" example never compiled,
 * because two sibling `for (let i …)` loops collided. And `/` on two integers truncated in
 * WASM while JavaScript divides.
 *
 * Each row runs a function both ways (`__tjs_wasm_enabled = false` forces the fallback) and
 * requires identical results, after checking the WASM path really compiled.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const g = globalThis as any

/** Run `fname(...args)` through WASM and through the fallback. */
async function bothPaths(source: string, fname: string, args: unknown[]) {
  const r = tjs(source, { runTests: false })
  expect(r.wasmCompiled?.every((b) => b.success)).toBe(true)
  const fn = new Function(`${r.code}\nreturn ${fname}`)()
  await g.__tjs_wasm_ready?.()
  const wasm = fn(...args)
  g.__tjs_wasm_enabled = false
  try {
    return { wasm, js: fn(...args), result: r }
  } finally {
    delete g.__tjs_wasm_enabled
  }
}

describe('a bare expression in a wasm block is an error, not a silent drop', () => {
  it('the QuickStart shape: `return wasm { a + b }` is refused, naming `return a + b`', () => {
    expect(() =>
      tjs(
        `function add(! a: 0, b: 0):! 0 {
  return wasm {
    a + b
  } fallback {
    return a + b
  }
}`,
        { runTests: false }
      )
    ).toThrow(/return a \+ b/)
  })

  it('a value computed and discarded mid-block is refused too', () => {
    expect(() =>
      tjs(
        `function f(! x: 0.0):! 0.0 {
  return wasm {
    x * 2
    return x
  } fallback { return x }
}`,
        { runTests: false }
      )
    ).toThrow(/return x \* 2/)
  })

  it('a sum of PURE intrinsic calls is a value too (the dot-product shape)', () => {
    // Calls count as effects in general, so this slipped through the first version of the
    // rule; f32x4_* (other than store) and Math.* only compute.
    expect(() =>
      tjs(
        `function d(! v: 0.0):! 0.0 {
  return wasm {
    let acc = f32x4_splat(v)
    f32x4_extract_lane(acc, 0) + f32x4_extract_lane(acc, 1)
  } fallback { return v + v }
}`,
        { runTests: false }
      )
    ).toThrow(/return f32x4_extract_lane/)
  })

  it('statements that DO something are fine (assignments, calls, loops)', () => {
    const r = tjs(
      `function double(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) { arr[i] = arr[i] * 2 }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}`,
      { runTests: false }
    )
    expect(r.wasmCompiled?.[0]?.success).toBe(true)
  })
})

describe('the WAT comment describes what was compiled', () => {
  const watOf = (src: string) => {
    const code = tjs(src, { runTests: false }).code
    return code.match(/\(func[^\n]*/)?.[0] ?? ''
  }

  it('a block that returns says `(result f64)`', () => {
    expect(
      watOf(
        `function f(! a: 0.0) { return wasm { return a } fallback { return a } }`
      )
    ).toContain('(result f64)')
  })

  it('a block that returns nothing claims no result', () => {
    expect(
      watOf(`function f(! arr: Float32Array, n: 0) {
  wasm { for (let i = 0; i < n; i++) { arr[i] = 0.0 } } fallback { }
}`)
    ).not.toContain('(result')
  })
})

describe('both paths give the same answer', () => {
  it('the QuickStart add, written with `return`', async () => {
    const { wasm, js } = await bothPaths(
      `function add(! a: 0, b: 0):! 0 { return wasm { return a + b } fallback { return a + b } }`,
      'add',
      [3, 4]
    )
    expect([wasm, js]).toEqual([7, 7])
  })

  it('integers beyond 32 bits: no wrapping (2e9 + 2e9 is 4e9 on both paths)', async () => {
    const { wasm, js } = await bothPaths(
      `function add(! a: 0, b: 0):! 0 { return wasm { return a + b } fallback { return a + b } }`,
      'add',
      [2_000_000_000, 2_000_000_000]
    )
    expect([wasm, js]).toEqual([4_000_000_000, 4_000_000_000])
  })

  it('`/` divides as JavaScript does, even with two integer operands', async () => {
    const SRC = `function halves(! n: 0):! 0.0 {
  return wasm {
    let s = 0.0
    for (let i = 0; i < n; i++) { s = s + i / 2 }
    return s
  } fallback {
    let s = 0.0
    for (let i = 0; i < n; i++) { s = s + i / 2 }
    return s
  }
}`
    const { wasm, js } = await bothPaths(SRC, 'halves', [4])
    expect([wasm, js]).toEqual([3, 3]) // 0 + 0.5 + 1 + 1.5; truncating gave 2
  })

  it('sibling `for (let i …)` loops compile (block-scoped), and agree', async () => {
    const SRC = `function sums(! n: 0):! 0.0 {
  return wasm {
    let s = 0.0
    for (let i = 0; i < n; i++) { let off = i * 2
      s = s + off }
    for (let i = 0; i < n; i++) { let off = i * 3
      s = s + off }
    return s
  } fallback {
    let s = 0.0
    for (let i = 0; i < n; i++) s += i * 2
    for (let i = 0; i < n; i++) s += i * 3
    return s
  }
}`
    const { wasm, js, result } = await bothPaths(SRC, 'sums', [4])
    expect(result.warnings ?? []).not.toContainEqual(
      expect.stringMatching(/Duplicate local/)
    )
    expect([wasm, js]).toEqual([30, 30])
  })
})

describe('the "could not be resolved to a runtime type" warning', () => {
  const unresolved = (src: string) =>
    (tjs(src, { runTests: false }).warnings ?? []).filter((w) =>
      /could not be resolved to a runtime type/.test(w)
    )

  it('is not raised on an unsafe (`!`) function, which asks for no checks at all', () => {
    // Every WASM example declares `(! arr: Float32Array, …)` and printed this warning,
    // telling the reader a parameter was unchecked when they had asked for exactly that.
    expect(
      unresolved(`function f(! arr: Float32Array, n: 0) { return n }`)
    ).toEqual([])
  })

  it('is still raised on a checked function, where it is a real gap', () => {
    expect(
      unresolved(`function f(arr: Float32Array, n: 0) { return n }`)
    ).toHaveLength(1)
  })
})

describe('the WASM QuickStart compiles to WASM, not to its fallbacks', () => {
  // doc-snippets runs each example's test, but a block that fails to compile runs its
  // fallback and gives the RIGHT answer, so a passing test cannot see it. The page itself
  // warns readers about exactly that; this holds the page to it.
  const { readFileSync } = require('fs')
  const { join } = require('path')
  const page = readFileSync(
    join(import.meta.dir, '../../docs/WASM-QUICKSTART.md'),
    'utf8'
  )
  const blocks = [...page.matchAll(/```tjs:static\n([\s\S]*?)```/g)].map(
    (m: RegExpMatchArray) => m[1]
  )

  it('finds the examples (apparatus)', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6)
  })

  for (const src of blocks) {
    const name = src.match(/function (\w+)/)?.[1] ?? '?'
    it(`${name}: every wasm block compiles, with no warnings`, () => {
      const r = tjs(src, { runTests: false })
      expect(r.wasmCompiled?.length).toBeGreaterThan(0)
      expect(r.wasmCompiled!.every((b) => b.success)).toBe(true)
      expect(r.warnings ?? []).toEqual([])
    })
  }
})
