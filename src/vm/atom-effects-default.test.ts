/**
 * `defineAtom` defaults to `effects: 'io'` — the fail-SAFE direction (#38, 0.14.0).
 *
 * Through 0.13.x it defaulted to `'pure'`, and `'pure'` skips the capability membrane
 * entirely: `membraneValue` has exactly one call site, inside `if (atom.effects === 'io')`.
 * So an embedder atom that did not opt in was not merely missing the 2026-08-03 accessor
 * hardening — the whole choke point was off the path, and a host object landed in guest
 * scope by reference with its getters intact and `methodCall` standing right there.
 *
 * One default was serving two populations with opposite needs. Core atoms operate on data
 * already inside the VM; atoms defined through the public API exist to bring host data *in*,
 * which is exactly what the membrane is for. The default served the first and silently
 * disabled the boundary for the second — the one whose authors are outside our audit
 * surface.
 *
 * **It failed quietly**, which is the part that makes a test necessary rather than a note.
 * Nothing warned, nothing broke, the atom worked and the hardening was absent. snowfox-app
 * upgraded *specifically* for the prototype-strip and later found all four of its custom
 * atoms untagged. When the people who read the release note and acted on it still don't get
 * the protection, documentation is not a control.
 *
 * These tests assert the default's CONSEQUENCE, not just its value. A test that only checked
 * `effects === 'io'` would pass against a build where the membrane no longer reads the tag.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { defineAtom, coreAtoms, EFFECTFUL_CORE_OPS } from './runtime'
import { Agent } from '../builder'
import { s } from 'tosijs-schema'

/** Run a single custom atom and hand back whatever reached guest scope. */
async function runAtom(atom: any, op: string) {
  const vm = new AgentVM({ [op]: atom })
  const ast = Agent.custom({ ...(vm as any)['atoms'] })
    .step({ op })
    .as('out')
    .return(s.object({ out: s.any }))
    .toJSON()
  return vm.run(ast, {}, { capabilities: {} })
}

describe('defineAtom defaults to io', () => {
  it('an atom defined with no options is io', () => {
    const atom = defineAtom('probe', s.object({}), s.any, async () => 1)
    expect(atom.effects).toBe('io')
  })

  it('…including the string-shorthand form, which takes the docs path', () => {
    // `defineAtom(op, in, out, fn, 'some docs')` destructures a DIFFERENT object literal.
    // Two defaults, one rule — and the shorthand is the easy one to miss.
    const atom = defineAtom(
      'probe2',
      s.object({}),
      s.any,
      async () => 1,
      'docs'
    )
    expect(atom.effects).toBe('io')
  })

  it('`effects: pure` is still an explicit opt-out', () => {
    // The change is a default, not a removal. An atom that genuinely touches nothing can
    // still say so and stay out of the membrane (and stay callable from a predicate).
    const atom = defineAtom('probe3', s.object({}), s.any, async () => 1, {
      effects: 'pure',
    })
    expect(atom.effects).toBe('pure')
  })
})

describe('the default has its CONSEQUENCE at the boundary', () => {
  it('an untagged atom returning an accessor is REJECTED', async () => {
    // The shape from the issue: an SDK response wrapped without naming each field. A getter
    // is host code, so the membrane refuses rather than running it while inspecting.
    const atom = defineAtom('sdkCall', s.object({}), s.any, async () => ({
      ok: true,
      get status() {
        return 200
      },
    }))
    const result = await runAtom(atom, 'sdkCall')
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Capability boundary rejected')
  })

  it('an untagged atom cannot hand the guest a LIVE host reference', async () => {
    const host = { rows: [{ id: 1 }] }
    const atom = defineAtom('query', s.object({}), s.any, async () => host)
    const result = await runAtom(atom, 'query')
    expect(result.error).toBeUndefined()
    // Structurally equal, but a different object: the guest holds a copy.
    expect(result.result.out).toEqual(host)
    expect(result.result.out).not.toBe(host)
    expect(result.result.out.rows).not.toBe(host.rows)
  })

  it('and an atom that opts OUT is not membraned — the tag is what decides', async () => {
    // The control, and the reason the two tests above prove something. Same return, same
    // path, opposite tag: identity survives. If this ever starts cloning too, the membrane
    // has stopped reading `effects` and the assertions above would pass vacuously.
    const host = { rows: [{ id: 1 }] }
    const atom = defineAtom(
      'localCalc',
      s.object({}),
      s.any,
      async () => host,
      { effects: 'pure' }
    )
    const result = await runAtom(atom, 'localCalc')
    expect(result.error).toBeUndefined()
    expect(result.result.out).toBe(host)
  })
})

describe('core atoms are classified explicitly, not by the default', () => {
  it('every core atom carries a tag', () => {
    // Both directions are swept, so a core atom's class never depends on which default
    // happens to be in force. That coupling is what made the old arrangement fragile.
    const untagged = Object.entries(coreAtoms as Record<string, any>)
      .filter(([, a]) => a.effects !== 'pure' && a.effects !== 'io')
      .map(([op]) => op)
    expect(untagged).toEqual([])
  })

  it('the effectful list is exactly the set of io core atoms', () => {
    const io = Object.entries(coreAtoms as Record<string, any>)
      .filter(([, a]) => a.effects === 'io')
      .map(([op]) => op)
      .sort()
    expect(io).toEqual([...EFFECTFUL_CORE_OPS].sort())
  })

  it('data-shaping atoms stayed pure', () => {
    // They operate on data already inside the VM. Membraning them would deep-clone values
    // that never left, which is the cost the inverted default must NOT impose here.
    for (const op of ['len', 'jsonStringify', 'map', 'filter']) {
      expect((coreAtoms as Record<string, any>)[op]?.effects, op).toBe('pure')
    }
  })
})
