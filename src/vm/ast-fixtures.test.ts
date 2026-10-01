/**
 * GOLDEN AST FIXTURES — the AJS AST format, frozen (docs/ajs-native-vm.md constraint #4).
 *
 * - `ast-fixtures/v2.json`: for each SOURCE, the exact AST the transpiler emits and the result
 *   it produces. A change to what the emitter writes is a format change; it must show up here
 *   as a reviewed diff, never slip through as "the tests still pass". Regenerate deliberately:
 *   `UPDATE_AST_FIXTURES=1 bun test src/vm/ast-fixtures.test.ts`, then READ the diff.
 * - `ast-fixtures/v1.json`: hand-written v1 ASTs and the results they must keep producing.
 *   ASTs are persisted (`procedureStore`), so v1's meaning is a promise, not a default.
 *
 * Why this exists: the first v2 emitter compiled `m[i]` to `m["undefined"]` and the whole
 * suite (6,228 tests) passed. A frozen corpus of shapes is what catches that class.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { astVersionOf } from './ast-version'

const DIR = join(import.meta.dir, 'ast-fixtures')
const load = (f: string) => JSON.parse(readFileSync(join(DIR, f), 'utf8'))

describe('v2 fixtures: the emitter writes exactly this, and it means exactly this', () => {
  const fixtures = load('v2.json')
  const update = process.env.UPDATE_AST_FIXTURES === '1'
  if (update) {
    for (const f of fixtures) f.ast = transpile(f.source).ast
    writeFileSync(
      join(DIR, 'v2.json'),
      JSON.stringify(fixtures, null, 2) + '\n'
    )
  }
  it('the corpus is non-trivial (apparatus)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(7)
  })
  for (const f of fixtures) {
    it(`${f.name}: emitted AST is unchanged`, () => {
      expect(transpile(f.source).ast).toEqual(f.ast)
      expect(astVersionOf(f.ast)).toBe(2)
    })
    it(`${f.name}: runs to the recorded result`, async () => {
      const r = await new AgentVM().run(f.ast, f.args)
      expect(r.error ? { error: r.error.message } : r.result).toEqual(f.result)
    })
  }
})

describe('v1 fixtures: stored v1 ASTs keep their meaning', () => {
  for (const f of load('v1.json'))
    it(`${f.name}`, async () => {
      expect(astVersionOf(f.ast)).toBe(1)
      const r = await new AgentVM().run(f.ast, f.args)
      expect(r.error ? { error: r.error.message } : r.result).toEqual(f.result)
    })
})
