/**
 * Every write of a COMPUTED key in the VM goes through `setGuestKey`, or is listed here with
 * the reason its key cannot be guest-chosen.
 *
 * `obj[k] = v` with `k === '__proto__'` does not add a property: it replaces the object's
 * prototype, hiding the payload from the heap walk (own properties only) while the guest can
 * still read it. The rc.2 review found it at one site (B4); the fix routed three sites through
 * `setGuestKey`; the re-review then found six more (`pick`, `omit`, `varsExport`, `agentRun`,
 * the legacy return projection, `convertExampleToSchema`) holding ~19MB under an 8MB cap. A
 * sibling-site miss that survived two review rounds is a rule, not a defect — so the rule is
 * this test, and a new site fails here instead of in the next review.
 *
 * The scan PARSES (TypeScript's parser): a regex cannot tell `a[k] = v` from `a[k] == v`, a
 * string, or a comment, and a guard blind to its own corpus passes vacuously.
 */
import { describe, it, expect } from 'bun:test'
import ts from 'typescript'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const VM_DIR = import.meta.dir

/** `file › function › target` → why that key is the HOST's, not the guest's. */
const ALLOWED: Record<string, string> = {
  'runtime.ts › setGuestKey › obj[key]': 'the guarded write itself',
  'runtime.ts › setStateVar › target[key]':
    'scope write; `assertSafeProperty(key)` refuses __proto__/constructor/prototype first',
  'runtime.ts › set › (ctx as any)[field]':
    "`field` iterates the literal tuple ['error', 'output']",
  'runtime.ts › exec › local[op]':
    "`op` is this atom's registered name, fixed when the HOST defined it",
  'runtime.ts › exec › ctx.quotaUsed[op]':
    "`op` is this atom's registered name, fixed when the HOST defined it",
  'admission.ts › admitRunOptions › out[name]':
    '`name` iterates RUN_OPTION_KINDS (host), and `out` is null-prototype',
  'admission.ts › admitRunOptions › table[op]':
    '`table` is null-prototype, where __proto__ is an ordinary own key, and frozen after',
}

const ASSIGNMENT_OPS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
])

function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    )
      return n.parent.name.text
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text
    if (
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer))
    )
      return n.name.text
  }
  return '<module>'
}

function computedWrites(file: string): string[] {
  const src = readFileSync(join(VM_DIR, file), 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      ASSIGNMENT_OPS.has(node.operatorToken.kind)
    ) {
      let left: ts.Expression = node.left
      while (ts.isParenthesizedExpression(left)) left = left.expression
      if (
        ts.isElementAccessExpression(left) &&
        !ts.isStringLiteral(left.argumentExpression) &&
        !ts.isNumericLiteral(left.argumentExpression)
      ) {
        const target = `${left.expression.getText(
          sf
        )}[${left.argumentExpression.getText(sf)}]`
        found.push(`${file} › ${enclosingName(node)} › ${target}`)
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === 'Reflect.set'
    )
      found.push(`${file} › ${enclosingName(node)} › Reflect.set`)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

const files = (readdirSync(VM_DIR, { recursive: true }) as string[]).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
)

describe('guest-keyed writes go through setGuestKey', () => {
  const all = files.flatMap(computedWrites)

  it('the scan sees the corpus (apparatus check)', () => {
    expect(files).toContain('runtime.ts')
    // The guarded write itself must be found — a scan that finds nothing passes vacuously.
    expect(all).toContain('runtime.ts › setGuestKey › obj[key]')
  })

  it('no unlisted computed-key write', () => {
    expect(all.filter((w) => !(w in ALLOWED))).toEqual([])
  })

  it('no stale allowlist entry', () => {
    expect(Object.keys(ALLOWED).filter((k) => !all.includes(k))).toEqual([])
  })
})
