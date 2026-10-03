/**
 * Every IO atom reaches a capability through the outbound membrane (cumulative review 5, M-1).
 *
 * Round 30 claimed "one choke point covers every IO atom" while `agentRun` and `cache` handed
 * host capabilities live guest objects: the claim was a docstring, not a control. This is the
 * control. Each core and battery atom tagged `effects: 'io'` must either:
 *   - have its inputs resolved by the VM (`resolveInputs`), so `egressInput` copies and checks
 *     them before the body runs; or
 *   - call `egressValue` in its own body (atoms that take steps or an inline AST, whose inputs
 *     the VM must not resolve); or
 *   - be listed in NO_GUEST_EGRESS with the reason nothing guest-shaped reaches a capability.
 *
 * The body check PARSES (TypeScript's parser) the `defineAtom` call for each op, so a comment or
 * a string naming `egressValue` does not count. Stale list entries fail.
 */
import { describe, it, expect } from 'bun:test'
import ts from 'typescript'
import { readFileSync } from 'fs'
import { join } from 'path'
import { coreAtoms, type AtomDef } from './runtime'
import { batteryAtoms } from './atoms'

/** op → the atom body's own calls to `egressValue`. */
const SELF_EGRESS = new Set(['agentRun', 'cache'])

/** op → why nothing the guest chose reaches a capability as an object. */
const NO_GUEST_EGRESS: Record<string, string> = {
  runCode:
    'hands the code capability only `admitSource(...)`, a string the VM has already admitted; its `args` go to a CHILD run inside the VM, never to the host',
  memoize:
    'its cache is `ctx.memo`, a Map inside the VM; it calls no capability',
  random: 'calls no capability; reads the host RNG with numbers it validates',
  uuid: 'takes no input and calls no capability',
  clearExpiredProcedures: 'takes no input; clears a VM-owned map',
}

const SOURCES = [
  join(import.meta.dir, 'runtime.ts'),
  join(import.meta.dir, 'atoms', 'batteries.ts'),
]

/** op → identifiers called inside its `defineAtom(...)` call (parsed, not grepped). */
function calledIn(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const file of SOURCES) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'defineAtom' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const called = new Set<string>()
        const walk = (n: ts.Node) => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression))
            called.add(n.expression.text)
          ts.forEachChild(n, walk)
        }
        node.arguments.slice(1).forEach(walk)
        out.set(node.arguments[0].text, called)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

const atoms: Record<string, AtomDef> = {
  ...(coreAtoms as Record<string, AtomDef>),
  ...(batteryAtoms as Record<string, AtomDef>),
}
const ioOps = Object.entries(atoms)
  .filter(([, a]) => a.effects === 'io')
  .map(([op]) => op)

describe('every IO atom is on the egress path', () => {
  const calls = calledIn()

  it('the apparatus sees the atoms (a parse that found nothing would pass vacuously)', () => {
    expect(ioOps.length).toBeGreaterThan(20)
    for (const op of ioOps) expect(calls.has(op)).toBe(true)
    expect(calls.get('agentRun')!.has('egressValue')).toBe(true)
  })

  for (const op of ioOps) {
    it(op, () => {
      const atom = atoms[op]
      if (atom.resolveInputs) {
        expect(SELF_EGRESS.has(op) || op in NO_GUEST_EGRESS).toBe(false)
        return
      }
      if (SELF_EGRESS.has(op)) {
        expect(calls.get(op)!.has('egressValue')).toBe(true)
        return
      }
      expect(
        NO_GUEST_EGRESS[op],
        `'${op}' is an IO atom the VM does not resolve and that does not call egressValue: route what it hands a capability through egressValue, or list it with a reason`
      ).toBeDefined()
    })
  }

  it('no stale entries', () => {
    for (const op of [...SELF_EGRESS, ...Object.keys(NO_GUEST_EGRESS)]) {
      expect(ioOps).toContain(op)
      expect(atoms[op].resolveInputs).toBeFalsy()
    }
  })
})
