/**
 * Bare type names (`x: string`, `n: number`) work on the AJS path.
 *
 * ## Why this file exists
 *
 * CLAUDE.md calls treating `x: string` as a TypeScript annotation "the single most common
 * LLM mistake" with TJS, and it is: the colon value is an **example**, so the natural
 * reading is wrong. The language answered that by accepting the type NAME too — `string`
 * and `number` resolve through `TYPE_NAMES` (`src/lang/inference.ts`) — which turns the
 * most common mistake into a spelling that simply works.
 *
 * That fix was never pinned on the AJS path, and the only place the knowledge lived was
 * `src/use-cases/ajs-grokkability.test.ts`, as two regex REPAIRS that silently rewrote
 * `: string` -> `: ''` before measuring. So the grokkability rate was computed on repaired
 * output, and the repairs had been dead for however long — the harness was fixing
 * something the language already handled, which is precisely why the improvement never
 * appeared in the number meant to show it.
 *
 * The repairs are deleted. This is what replaces them: a deterministic, fast-lane pin that
 * fails if the support regresses, rather than a silent rewrite that hides whether it exists.
 *
 * Asserting on BEHAVIOUR (the validator rejects the wrong type) rather than on the parse
 * succeeding: a parse that accepts the annotation and then infers `any` would pass a
 * parses-without-throwing test while silently validating nothing, which is the failure mode
 * that actually costs a user something.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { transpile } from './core'
import { AgentVM } from '../vm/ast'
import { createRuntime, isMonadicError } from './runtime'

/** Transpile as native TJS and return the named export. */
function run(source: string, name: string): any {
  const saved = (globalThis as any).__tjs
  try {
    ;(globalThis as any).__tjs = createRuntime()
    const { code } = tjs(source, { filename: 'a.tjs', runTests: false })
    return new Function(`${code}\nreturn ${name}`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

describe('TJS accepts the type NAME, and validates against it', () => {
  const CASES: Array<[string, string, unknown, unknown]> = [
    // label, annotation, a value that satisfies it, a value that does not
    ['string', 'string', 'ok', 42],
    ['number', 'number', 3.5, 'nope'],
    ['boolean', 'boolean', true, 'nope'],
  ]

  for (const [label, annotation, good, bad] of CASES) {
    it(`\`x: ${annotation}\` accepts a ${label} and rejects the rest`, () => {
      const f = run(`function f(x: ${annotation}) { return x }`, 'f')
      expect({ [label]: f(good) }).toEqual({ [label]: good })
      // The load-bearing half: it must actually CHECK, not infer `any` and wave it through.
      expect({ [label]: isMonadicError(f(bad)) }).toEqual({ [label]: true })
    })
  }
})

describe('AJS accepts them too — the path grokkability measures', () => {
  // These are the exact two spellings the grokkability harness used to rewrite before
  // measuring. If either regresses, the harness would have quietly papered over it again.
  const SPELLINGS: [string, string, unknown, unknown][] = [
    [
      'string',
      `function agent({ city: string }) { return { out: city } }`,
      'Oslo',
      4,
    ],
    ['number', `function agent({ n: number }) { return { out: n } }`, 2.5, 'x'],
    [
      'boolean',
      `function agent({ b: boolean }) { return { out: b } }`,
      true,
      'yes',
    ],
  ]

  for (const [label, source, good, bad] of SPELLINGS) {
    it(`transpiles \`: ${label}\` without repair`, () => {
      expect(() => transpile(source)).not.toThrow()
    })
    // It only ever TRANSPILED: the member was read as a JavaScript rename (to a variable named
    // `string`), never imported, and read undefined (#4002 found it). It must RUN, checked.
    it(`\`: ${label}\` is a typed input that runs`, async () => {
      const { ast } = transpile(source)
      const key = Object.keys(transpile(source).signature.parameters)[0]!
      const vm = new AgentVM()
      expect((await vm.run(ast, { [key]: good }, { fuel: 50 })).result).toEqual(
        {
          out: good,
        }
      )
      expect(
        (await vm.run(ast, { [key]: bad }, { fuel: 50 })).error
      ).toBeDefined()
    })
  }
})
