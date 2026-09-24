/**
 * EVERY producer of an AST stamps the format version.
 *
 * ## The claim this defends
 *
 * `src/vm/ast-version.ts` does not claim unversioned ASTs disappear — ones already persisted
 * have no field and must keep working. It claims something narrower and load-bearing: **the
 * population of unversioned ASTs stops growing.** Everything downstream rests on that. It is
 * why "absent means 1" is a sound rule rather than a guess, and why a future reader can refuse
 * a format it cannot read instead of misinterpreting it.
 *
 * A single producer that omits the field falsifies the claim outright — not partially. The
 * population keeps growing, and every AST that arrives without a field is once again
 * genuinely ambiguous rather than provably old.
 *
 * The 0.14.0 review found exactly that: `emitters/ast.ts` stamped the version and
 * `TypedBuilder.toJSON()` did not, so `Agent.take(…)…toJSON()` minted unversioned ASTs on
 * every call. The builder is not a lesser path — its output goes to `vm.run` and to
 * `storeProcedure` on identical terms, so it is persisted on identical terms.
 *
 * ## Why a general guard and not two assertions
 *
 * The same shape as the boundary gate (`ast-version-boundaries.test.ts`): the defect was never
 * "one producer was missed", it was that **nothing made the set of producers enumerable**, so
 * a third producer would be missed the same way while every existing test stayed green. The
 * scan below is the enumerable point — a new file that constructs a root AST fails HERE.
 *
 * ## `AST_VERSION_KEY in ast`, never `astVersionOf(ast) === AST_VERSION`
 *
 * The obvious assertion is the wrong one. `astVersionOf` returns the LEGACY default for an
 * absent field, and the legacy default is 1, which is the current version — so
 * `astVersionOf(unversioned) === AST_VERSION` passes for precisely the ASTs this file exists
 * to catch. The check has to be presence.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { s } from 'tosijs-schema'
import { Agent } from '../builder'
import { ajs, transpile } from '../lang/core'
import { AST_VERSION, AST_VERSION_KEY, astVersionOf } from './ast-version'

const SRC = join(import.meta.dir, '..')

/** Both assertions every producer owes: the field is PRESENT, and it reads back correctly. */
function expectStamped(label: string, ast: any) {
  expect({
    [`${label} has ${AST_VERSION_KEY}`]: AST_VERSION_KEY in ast,
  }).toEqual({ [`${label} has ${AST_VERSION_KEY}`]: true })
  expect({ [`${label} version`]: astVersionOf(ast) }).toEqual({
    [`${label} version`]: AST_VERSION,
  })
}

describe('behaviour: both producers stamp the version', () => {
  it('the transpiler — `ajs` / `transpile`', () => {
    expectStamped('ajs', ajs(`function f() { return 1 }`))
    expectStamped('transpile', transpile(`function f() { return 1 }`).ast)
  })

  it('the BUILDER — the path that shipped unstamped', () => {
    const built = Agent.take(s.object({ x: s.number }))
      .varSet({ key: 'y', value: 1 })
      .toJSON()
    expectStamped('TypedBuilder.toJSON()', built)
  })

  it('a builder AST still RUNS — apparatus check', async () => {
    // Every assertion above is satisfied by a builder that emits a stamped but broken AST,
    // and the stamp now has to pass through the version gate in `AgentVM.run`.
    const { AgentVM } = await import('./index')
    const ast = Agent.take(s.object({ x: s.number }))
      .varsImport(['x'])
      .varSet({ key: 'y', value: 41 })
      .return(s.object({ y: s.number }))
      .toJSON()
    const result = await new AgentVM().run(ast, { x: 1 })
    expect(result.error).toBeFalsy()
    expect(result.result).toEqual({ y: 41 })
  })

  it('the version is at the ROOT, not on every node', () => {
    // It describes the document. Nested branches splice `.steps` rather than calling
    // `toJSON()`, so an inner `seq` must not carry a field that means nothing there.
    const built: any = Agent.take(s.object({ x: s.number }))
      .varsImport(['x'])
      .if('x > 1', { x: 'x' }, (b: any) => b.varSet({ key: 'y', value: 2 }))
      .toJSON()
    expect(JSON.stringify(built.steps)).not.toContain(AST_VERSION_KEY)
  })
})

describe('structure: the producer set is enumerable, so a third cannot be missed', () => {
  /**
   * Files allowed to construct an `op: 'seq'` root WITHOUT stamping the version, each with the
   * reason it is not a producer of documents.
   */
  const EXEMPT: Record<string, string> = {
    'vm/runtime.ts':
      'synthetic nodes handed straight to `seq.exec` for branch/loop/scope bodies — they ' +
      'never leave the interpreter, are never persisted, and never cross a boundary, so a ' +
      'version on them would describe nothing',
  }

  function tsFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) tsFiles(full, out)
      else if (name.endsWith('.ts') && !name.includes('.test.')) out.push(full)
    }
    return out
  }

  it('every file that builds a seq root either stamps the version or is exempt WITH a reason', () => {
    const files = tsFiles(SRC)
    // Apparatus check: a walk that finds nothing would make this pass vacuously, and the
    // known producers are the proof it is looking in the right place.
    expect(files.length).toBeGreaterThan(50)

    const offenders: string[] = []
    let sawKnownProducer = false

    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      // An object literal being CONSTRUCTED with `op: 'seq'` — not the `op: 'seq'` of a type
      // declaration, which carries no value.
      if (!/(?<!\|\s)\bop:\s*'seq'/.test(src)) continue
      const rel = file.slice(SRC.length + 1)
      if (rel === 'builder.ts' || rel === 'lang/emitters/ast.ts')
        sawKnownProducer = true
      if (EXEMPT[rel]) continue
      // A type-only mention (`op: 'seq'` in an interface) is not a producer.
      const constructs = /\bop:\s*'seq',/.test(src)
      if (!constructs) continue
      // Import lines stripped first: a file that IMPORTS the key and never uses it is exactly
      // the regression this catches, and it is what a half-finished fix looks like.
      const body = src.replace(/^\s*import[\s\S]*?from\s+'[^']*'\n/gm, '')
      if (!body.includes('AST_VERSION_KEY')) offenders.push(rel)
    }

    expect(sawKnownProducer).toBe(true)
    // A new producer lands here by name. Stamp it, or add it to EXEMPT with a reason.
    expect(offenders).toEqual([])
  })
})
