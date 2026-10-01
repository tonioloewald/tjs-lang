/**
 * Every scope state is built by `newScopeState`, which registers it as a heap root.
 *
 * The heap ceiling fails a run only on a TRUE measurement of what is live, walked from the
 * registered roots (`reconcileHeap`). A scope state built any other way is invisible to that
 * walk, so a value held only there would be measured as free memory — an escape through the
 * ceiling. This parses `src/vm/**` and fails on any `state:` property or `.state =` assignment
 * whose value is not a `newScopeState(...)` call.
 *
 * The behavioural twin is in `heap-reconcile.test.ts` ("every scope a program opens is
 * released"), which catches the other direction: a root registered and never released.
 */
import { describe, it, expect } from 'bun:test'
import ts from 'typescript'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const VM_DIR = import.meta.dir

function scopeStateBuilds(file: string): { site: string; ok: boolean }[] {
  const src = readFileSync(join(VM_DIR, file), 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const out: { site: string; ok: boolean }[] = []
  const isRegistered = (e: ts.Expression) =>
    ts.isCallExpression(e) && e.expression.getText(sf) === 'newScopeState'
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sf) === 'state' &&
      ts.isObjectLiteralExpression(node.parent)
    )
      out.push({
        site: `${file}:${
          sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
        } state: ${node.initializer.getText(sf)}`,
        ok: isRegistered(node.initializer),
      })
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'state'
    )
      out.push({
        site: `${file}:${
          sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
        } ${node.getText(sf)}`,
        ok: isRegistered(node.right),
      })
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const files = (readdirSync(VM_DIR, { recursive: true }) as string[]).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
)

describe('scope states are heap roots', () => {
  const all = files.flatMap(scopeStateBuilds)

  it('the scan sees scope construction (apparatus check)', () => {
    // createChildScope, callLocal, both agentRun branches, runCode, and the run's root
    expect(all.length).toBeGreaterThanOrEqual(6)
  })

  it('every scope state is built by newScopeState', () => {
    expect(all.filter((b) => !b.ok).map((b) => b.site)).toEqual([])
  })
})
