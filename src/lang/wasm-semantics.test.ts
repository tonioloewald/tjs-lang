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

describe('an operator with no instruction for its operand types is a hard error', () => {
  // `%` (and the bitwise operators) on f64 operands emitted an `i32` instruction on f64
  // values: an invalid module that failed to instantiate, so EVERY block in the file silently
  // ran its fallback while each reported success. The compiler now refuses the operator,
  // naming it, and (since 2026-10-07) a block that cannot compile stops the build. Every
  // emitted module is also validated, so a future codegen bug of this kind becomes a hard
  // error ("a compiler bug") rather than a module that fails at load time; that guard was
  // mutation-checked against this exact bug before the operator fix landed.
  it('`%` on f64 operands', () => {
    expect(() =>
      tjs(
        `function rem(! a: 0.0, b: 0.0) { return wasm { return a % b } fallback { return a % b } }`,
        { runTests: false }
      )
    ).toThrow(/`%` needs integer \(i32\) operands/)
  })

  it('a bitwise operator on f64 operands', () => {
    expect(() =>
      tjs(
        `function f(! a: 0.0, b: 0.0) { return wasm { return (a + b) | 0 } fallback { return (a + b) | 0 } }`,
        { runTests: false }
      )
    ).toThrow(/`\|` needs integer \(i32\) operands/)
  })

  it('`%` on i32 operands still compiles, and the module is valid WebAssembly', () => {
    const r = tjs(
      `function f(! n: 0) { return wasm { let s = 0
    for (let i = 0; i < n; i++) { s = s + (i % 3) }
    return s } fallback { let s = 0; for (let i = 0; i < n; i++) s += i % 3; return s } }`,
      { runTests: false }
    )
    const b64 = r.code.match(/__wasmModuleB64\s*=\s*['"]([^'"]+)/)?.[1] ?? ''
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    expect(WebAssembly.validate(bytes)).toBe(true)
  })
})

describe('i32 in a wasm function has WebAssembly semantics (the DOCS-WASM table)', () => {
  const SRC = `wasm function addi(a: i32, b: i32): f64 { return a + b }
wasm function divi(a: i32, b: i32): f64 { return a / b }
wasm function remi(a: i32, b: i32): f64 { return a % b }`

  async function load() {
    const r = tjs(SRC, { runTests: false })
    expect(r.wasmCompiled?.every((b) => b.success)).toBe(true)
    const fns = new Function(`${r.code}\nreturn [addi, divi, remi]`)()
    await g.__tjs_wasm_ready?.()
    return fns as ((a: number, b: number) => number)[]
  }

  it('arguments are truncated and wrapped at the call', async () => {
    const [addi] = await load()
    expect(addi(2.5, 1)).toBe(3)
    expect(addi(3e9, 0)).toBe(-1294967296)
  })

  it('+ wraps at 32 bits', async () => {
    const [addi] = await load()
    expect(addi(2e9, 2e9)).toBe(-294967296)
  })

  it('/ is JavaScript division; % takes the sign of the dividend; % 0 throws', async () => {
    const [, divi, remi] = await load()
    expect(divi(7, 2)).toBe(3.5)
    expect(remi(-7, 2)).toBe(-1)
    expect(() => remi(1, 0)).toThrow()
  })
})

describe('a wasm block that cannot compile is a hard error, not a silent fallback', () => {
  // `wasm { }` is a request for WASM. A block outside the supported subset used to compile to
  // its JavaScript fallback with a warning, so a "fast path" could quietly ship as JS. The
  // fallback is for a RUNTIME that cannot run WASM, not for code the compiler cannot compile.
  it('an unsupported construct is refused with the reason and the line', () => {
    const src = `// header

function f(! a: 0.0, b: 0.0) {
  return wasm {
    return (a + b) | 0
  } fallback {
    return (a + b) | 0
  }
}`
    let message = ''
    try {
      tjs(src, { runTests: false })
    } catch (e: any) {
      message = String(e.message)
    }
    expect(message).toMatch(/did not compile/)
    expect(message).toMatch(/\|/) // the reason names the operator
    expect(message).toMatch(/:5:/) // the line of the block's body
  })

  it('a wasm function that cannot compile is refused too', () => {
    expect(() =>
      tjs(`wasm function f(a: f64, b: f64): f64 { return a % b }`, {
        runTests: false,
      })
    ).toThrow(/did not compile/)
  })
})

describe('SIMD loads and stores need a typed-array parameter', () => {
  // `f32x4_load(arr, …)` on a PLAIN array compiled "successfully" and then threw a WASM
  // RuntimeError (out-of-bounds truncation) on the first call: the wrapper cannot pass a JS
  // array as a pointer. `arr[i]` already refused it; the intrinsics now do too.
  it('f32x4_load / f32x4_store on a plain array are refused at compile time', () => {
    expect(() =>
      tjs(
        `function scale(! arr: [0.0], len: 0, factor: 0.0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(arr, off, f32x4_mul(f32x4_load(arr, off), f32x4_splat(factor)))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= factor
  }
}`,
        { runTests: false }
      )
    ).toThrow(/arr is not a typed array parameter/)
  })
})
