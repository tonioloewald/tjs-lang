/**
 * Every example in the Safe Eval chapter RUNS, and prints what the chapter says it prints.
 *
 * The 0.14.0 docs review found every snippet in the chapter wrong about the real API: options
 * that do not exist (`inputs`, `output`), the bare value where `Eval` returns `{ result,
 * fuelUsed, error? }`, a global `fetch` the sandbox has never had, and `await` where AJS has
 * none. The text had been MOVED, not written — the README and `guides/tjs.md` had carried the
 * same examples for a while — and nothing executed it, so nothing noticed.
 *
 * So the chapter is executable documentation: each ` ```js ` fence runs, in order, in one scope
 * (later examples use `safeFetch` from earlier ones); every `console.log(x) // → expected` is
 * captured and compared. The network is a stub serving one fixture, so the capability path is
 * exercised end to end without leaving the machine.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Eval, SafeFunction } from './lang/eval'

const CHAPTER = join(import.meta.dir, '..', 'guides', 'safe-eval.md')
const text = readFileSync(CHAPTER, 'utf8')
const fences = [...text.matchAll(/^```js\n([\s\S]*?)^```$/gm)].map((m) => m[1])

/** `console.log(x) // → expected`, in order, across every fence. */
const expected = fences.flatMap((f) =>
  [...f.matchAll(/console\.log\(.*\)\s*\/\/ → (.*)$/gm)].map((m) => m[1].trim())
)

const fixture = [
  { name: 'widget', price: 40 },
  { name: 'gadget', price: 250 },
]
const stubFetch = async (url: string) => {
  if (new URL(url).host !== 'api.example.com')
    throw new Error(`unexpected fetch ${url}`)
  return new Response(JSON.stringify(fixture), {
    headers: { 'content-type': 'application/json' },
  })
}

describe('the Safe Eval chapter is executable', () => {
  it('apparatus check: it has examples, and they make claims', () => {
    // Every assertion below passes vacuously on a chapter with no fences or no expectations.
    expect(fences.length).toBeGreaterThanOrEqual(4)
    expect(expected.length).toBeGreaterThanOrEqual(6)
  })

  it('every example runs and prints exactly what the chapter says', async () => {
    const printed: string[] = []
    const console = {
      log: (v: unknown) =>
        printed.push(typeof v === 'string' ? v : JSON.stringify(v)),
    }
    const body = fences.join('\n').replace(/^import .*$/gm, '') // the injected parameters stand in for the import
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
    await new AsyncFunction('Eval', 'SafeFunction', 'fetch', 'console', body)(
      Eval,
      SafeFunction,
      stubFetch,
      console
    )
    expect(printed).toEqual(expected)
  })

  it("the README's Safe Eval example runs too — it carried the same broken API", async () => {
    const readme = readFileSync(
      join(import.meta.dir, '..', 'README.md'),
      'utf8'
    )
    const section = readme.slice(
      readme.indexOf('## Safe Eval'),
      readme.indexOf('## Quick Start')
    )
    const fence = /^```js\n([\s\S]*?)^```$/m.exec(section)?.[1] ?? ''
    const want = [...fence.matchAll(/console\.log\(.*\)\s*\/\/ → (.*)$/gm)].map(
      (m) => m[1].trim()
    )
    expect(want.length).toBeGreaterThan(0)
    const printed: string[] = []
    const console = {
      log: (v: unknown) =>
        printed.push(typeof v === 'string' ? v : JSON.stringify(v)),
    }
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
    await new AsyncFunction(
      'Eval',
      'console',
      fence.replace(/^import .*$/gm, '')
    )(Eval, console)
    expect(printed).toEqual(want)
  })
})

describe('Eval context is visible to atoms, not only to expressions', () => {
  // Found by the README example: `Eval` wrapped code as `function __eval() { … }` with NO
  // parameters, so context values reached plain expressions (`items.length`) through a fallback
  // but not ATOMS — `items.filter(…)` failed with "filter: items is not an array". `SafeFunction`
  // declares its params and never had the problem. Every documented example happened to use
  // arithmetic or an atom's own result, so none hit it.
  const ctx = { items: [{ price: 40 }, { price: 250 }], budget: 100 }

  it('an array method on a context value works', async () => {
    const r = await Eval({
      code: 'items.filter(x => x.price < budget)',
      context: ctx,
    })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual([{ price: 40 }])
  })

  it('with an explicit return, too', async () => {
    const r = await Eval({
      code: 'let cheap = items.filter(x => x.price < budget)\nreturn cheap.length',
      context: ctx,
    })
    expect(r.result).toBe(1)
  })

  it('plain expressions still work — apparatus check', async () => {
    expect(
      (await Eval({ code: 'items.length + budget', context: ctx })).result
    ).toBe(102)
  })

  it('a context key that is not an identifier does not break the call', async () => {
    const r = await Eval({
      code: 'a + 1',
      context: { a: 1, 'not-an-identifier': 2 },
    })
    expect(r.result).toBe(2)
  })

  it('a forbidden key is not declared as a variable', async () => {
    const r = await Eval({
      code: 'a + 1',
      context: { a: 1, constructor: 5 } as any,
    })
    expect(r.result).toBe(2)
  })
})

describe('context keys are bounded by the code, not by the caller (0.14.0 final review B-1, m-1)', () => {
  // Declaring EVERY key spliced caller-controlled text into the transpiled source, and
  // `maxSourceBytes` measured only `code`: 80k keys with a one-line body took 7–22s to
  // transpile, before fuel or timeout applied. Hosted endpoints pass request args as context.
  it('80k keys with a tiny body return promptly — only the named key is declared', async () => {
    const context: Record<string, unknown> = { a: 2 }
    for (let i = 0; i < 80000; i++) context[`k${i}_${'x'.repeat(20)}`] = i
    const t = performance.now()
    const r = await Eval({ code: 'a + 1', context })
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(3)
  })

  it('a body naming every one of 80k keys is refused by the size cap, not transpiled', async () => {
    const context: Record<string, unknown> = {}
    const names: string[] = []
    for (let i = 0; i < 80000; i++) names.push(`k${i}`)
    for (const n of names) context[n] = 1
    const t = performance.now()
    const r = await Eval({ code: names.join(' + '), context })
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.error?.message).toContain('byte limit')
  })

  it('code may declare a local that shares a context key’s name, and shadows it', async () => {
    const r = await Eval({
      code: 'let y = 2\nreturn y + x',
      context: { x: 1, y: 5 },
    })
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(3)
  })

  it('a key named after a builtin or global value does not rebind it', async () => {
    const r = await Eval({
      code: 'Math.max(1, 2) + (NaN === NaN ? 1 : 0)',
      context: { Math: { max: () => 99 }, NaN: 5, undefined: 1 },
    })
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(2)
  })

  it("'return' inside a string does not make an expression a statement block", async () => {
    const r = await Eval({ code: "'no return here'", context: {} })
    expect(r.result).toBe('no return here')
  })

  it('a key mentioned only inside a string is not declared', async () => {
    const r = await Eval({ code: "'secret'", context: { secret: 1 } })
    expect(r.result).toBe('secret')
  })

  it('a trailing line comment does not swallow the wrapper', async () => {
    expect((await Eval({ code: '1 + 1 // two' })).result).toBe(2)
    expect((await Eval({ code: 'return 3 // three' })).result).toBe(3)
  })
})

describe('Eval remediation, re-review (0.14.0 final re-review B-1, M-1, M-2)', () => {
  it('B-1: an oversized payload is refused BEFORE any scan — cheaply', async () => {
    const code = "'a',".repeat(2_500_000) // 10MB, literal-heavy
    const t = performance.now()
    const r = await Eval({ code, context: { a: 1 } })
    expect(performance.now() - t).toBeLessThan(200)
    expect(r.error?.message).toContain('byte limit')
  })

  it('B-1: a non-string `code` is an error result, never a throw', async () => {
    const r = await Eval({ code: 42 as any })
    expect(r.error?.message).toMatch(/string/)
  })

  it('M-1: code may declare a CONST that shares a context key’s name', async () => {
    const r = await Eval({
      code: 'const total = 9\nreturn total',
      context: { total: 'X' },
    })
    expect(r.error).toBeUndefined()
    expect(r.result).toBe(9)
  })

  it('M-2: a key used only inside a template interpolation is visible', async () => {
    expect(
      (await Eval({ code: '`hi ${name}`', context: { name: 'bob' } })).result
    ).toBe('hi bob')
    expect(
      (await Eval({ code: 'return `hi ${name}`', context: { name: 'bob' } }))
        .result
    ).toBe('hi bob')
  })

  it('an EXPRESSION containing an arrow with `return` stays an expression', async () => {
    const r = await Eval({
      code: '[1, 2].map(v => { return v * k })',
      context: { k: 3 },
    })
    expect(r.result).toEqual([3, 6])
  })
})
