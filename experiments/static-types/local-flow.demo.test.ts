/**
 * SPIKE: how hard is transpile-time type checking for *variables*?
 *
 * Scoping decision that makes this tractable (user, 2026-08-01): **locals need no runtime
 * checks.** Boundary checks — parameters and returns — already do the real work, and
 * instrumenting every local assignment would be a performance nightmare for little gain.
 * So this is a **lint**, not a type system: best-effort, no soundness obligation, zero
 * runtime cost, and it may stay silent whenever it isn't sure.
 *
 * That reframing is most of the difficulty. A sound checker is tsc. A best-effort local
 * flow analysis that catches the obvious mistakes is a few hundred lines on scaffolding we
 * already have:
 *
 *   - `src/lang/linter.ts` already tracks scopes and declarations (`Scope`, `Declaration`,
 *     `createScope`, `addDeclaration`) — the expensive part, already built.
 *   - `inferTypeFromValue` already turns an initializer expression into a `TypeDescriptor`.
 *   - Function signatures are already available at transpile time, so CALL SITES can be
 *     checked against declared parameter types — the highest-value case, and the one
 *     TypeScript users expect most.
 *
 * This spike implements the core in ~90 lines to establish feasibility and, more usefully,
 * to find where it gets hard. Findings are asserted at the bottom.
 */
import { describe, it, expect } from 'bun:test'
import { parse } from 'acorn'
import { inferTypeFromValue } from '../../src/lang/inference'
import type { TypeDescriptor } from '../../src/lang/types'

type Finding = { name: string; expected: string; actual: string; line: number }

/** Do two descriptors definitely conflict? Silence unless we are SURE. */
function conflicts(a: TypeDescriptor, b: TypeDescriptor): boolean {
  if (!a || !b) return false
  if (a.kind === 'any' || b.kind === 'any') return false
  // Numeric kinds are compatible in the widening direction; a lint must not cry wolf
  // over `let n = 1; n = 1.5`.
  const numeric = new Set(['number', 'integer', 'non-negative-integer'])
  if (numeric.has(a.kind) && numeric.has(b.kind)) return false
  return a.kind !== b.kind
}

/** Best-effort local type flow over one function body. */
function checkLocals(source: string): Finding[] {
  const ast = parse(source, { ecmaVersion: 2022, locations: true }) as any
  const types = new Map<string, TypeDescriptor>()
  const consts = new Set<string>()
  const findings: Finding[] = []

  const walk = (node: any) => {
    if (!node || typeof node.type !== 'string') return

    if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (d.id?.type !== 'Identifier' || !d.init) continue
        const t = inferTypeFromValue(d.init)
        if (t && t.kind !== 'any') {
          types.set(d.id.name, t)
          if (node.kind === 'const') consts.add(d.id.name)
        }
      }
    }

    if (
      node.type === 'AssignmentExpression' &&
      node.operator === '=' &&
      node.left?.type === 'Identifier'
    ) {
      const declared = types.get(node.left.name)
      const assigned = inferTypeFromValue(node.right)
      if (declared && assigned && conflicts(declared, assigned)) {
        findings.push({
          name: node.left.name,
          expected: declared.kind,
          actual: assigned.kind,
          line: node.loc?.start.line ?? 0,
        })
      }
    }

    for (const k of Object.keys(node)) {
      const v = node[k]
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v.type === 'string') walk(v)
    }
  }
  walk(ast)
  return findings
}

describe('SPIKE: transpile-time type checking for locals', () => {
  it('catches a reassignment that changes type', () => {
    const f = checkLocals(
      `function f() {\n let x = 5\n x = 'hello'\n return x\n}`
    )
    expect(f.length).toBe(1)
    expect(f[0]).toMatchObject({
      name: 'x',
      expected: 'integer',
      actual: 'string',
    })
    expect(f[0].line, 'reports the offending line, not the declaration').toBe(3)
  })

  it('stays silent on numeric widening — a lint must not cry wolf', () => {
    // `let n = 1; n = 1.5` is fine in every language anyone is coming from. A checker that
    // flags this gets turned off, and then it catches nothing at all.
    expect(checkLocals(`function f() {\n let n = 1\n n = 1.5\n}`)).toEqual([])
  })

  it('stays silent when it cannot infer — no soundness obligation', () => {
    // The whole freedom of being a lint rather than a type system.
    expect(checkLocals(`function f(q) {\n let x = q\n x = 'str'\n}`)).toEqual(
      []
    )
  })

  it('catches several independent variables in one pass', () => {
    const f = checkLocals(
      `function f() {\n let a = 'x'\n let b = 1\n a = 2\n b = 'y'\n}`
    )
    expect(f.map((x) => x.name).sort()).toEqual(['a', 'b'])
  })

  // ---- where it gets hard, asserted rather than hand-waved ----

  it('LIMIT: no branch merging — a type set in one arm is not tracked', () => {
    // Real flow analysis needs a lattice and a join at merge points. This spike has
    // neither, so a conditional reassignment is invisible. Tractable, but it is the step
    // from "walk the tree" to "actual dataflow" and should be scoped deliberately.
    const f = checkLocals(
      `function f(c) {\n let x = 5\n if (c) { x = 'a' } else { x = 'b' }\n}`
    )
    expect(f.length, 'branches ARE walked, so these are still caught').toBe(2)
    // …but nothing tracks what `x` is AFTER the if, which is where a real checker earns
    // its keep. Documented as the boundary of this approach.
  })

  it('LIMIT: a shadowed type LEAKS OUT of its block (false positive)', () => {
    // Predicted wrong on the first try, which is why this is a spike: sequential shadowing
    // happens to work, because the flat map is last-write-wins and the inner declaration
    // simply replaces the outer. The real defect is the opposite direction — the inner
    // type survives the block and then slanders the outer variable:
    const f = checkLocals(
      `function f() {\n let x = 5\n { let x = 'inner' }\n x = 10\n}`
    )
    expect(
      f.length,
      'a scope chain would report 0 — `x` is an integer again after the block'
    ).toBe(1)
    expect(f[0]).toMatchObject({ expected: 'string', actual: 'integer' })
    // FALSE POSITIVES ARE THE FAILURE MODE THAT MATTERS. A missed error costs one bug; a
    // false positive on correct code gets the whole check switched off. This is exactly
    // why the real implementation must reuse linter.ts's existing scope chain rather than
    // a flat map — the fix is wiring, not new machinery.
  })
})
