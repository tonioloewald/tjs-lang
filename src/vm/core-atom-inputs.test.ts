/**
 * `CORE_ATOM_INPUTS` (what the transpiler checks an atom call against) equals the contracts the core
 * atoms actually declare. Two copies of one fact, kept honest by deriving one from the other here:
 * a new atom, a renamed input or a newly required one fails until the table is regenerated with
 * `UPDATE_CORE_ATOM_INPUTS=1 bun test src/vm/core-atom-inputs.test.ts`.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { coreAtoms } from './runtime'
import { CORE_ATOM_INPUTS } from './core-atom-inputs'

function derive() {
  const out: Record<string, { keys: string[]; required: string[] }> = {}
  for (const [op, atom] of Object.entries(coreAtoms as Record<string, any>)) {
    const sc = atom.inputSchema?.schema ?? atom.inputSchema
    const props = sc?.properties
    if (!props || typeof props !== 'object') continue
    out[op] = { keys: Object.keys(props), required: sc.required ?? [] }
  }
  return out
}

describe('the core atom contract table is the core atoms’ own', () => {
  it('every core atom with a property contract declares it closed', () => {
    for (const [op, atom] of Object.entries(coreAtoms as Record<string, any>)) {
      const sc = atom.inputSchema?.schema ?? atom.inputSchema
      if (sc?.properties)
        expect([op, sc.additionalProperties]).toEqual([op, false])
    }
  })

  it('matches a fresh derivation', () => {
    const derived = derive()
    if (process.env.UPDATE_CORE_ATOM_INPUTS === '1') {
      const p = join(import.meta.dir, 'core-atom-inputs.ts')
      const src = readFileSync(p, 'utf8')
      const head = src.slice(0, src.indexOf('export const CORE_ATOM_INPUTS'))
      const body = Object.keys(derived)
        .sort()
        .map(
          (op) =>
            `  ${JSON.stringify(op)}: { keys: ${JSON.stringify(
              derived[op].keys
            )}, required: ${JSON.stringify(derived[op].required)} },`
        )
        .join('\n')
      writeFileSync(
        p,
        `${head}export const CORE_ATOM_INPUTS: Readonly<Record<string, AtomInputs>> = {\n${body}\n}\n`
      )
      return
    }
    expect(JSON.parse(JSON.stringify(CORE_ATOM_INPUTS))).toEqual(derived)
  })
})
