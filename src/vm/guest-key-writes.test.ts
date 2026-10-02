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
  'runtime.ts › createChildScope › Object.defineProperty':
    "the literal key 'error' on a VM context",
  'runtime.ts › sigTable › out[name]':
    'method names from the VM source (the table literals), onto Object.create(null)',
  'regex.ts › compileRegex › Object.defineProperty':
    "the VM-owned PROGRAM symbol and a literal 'toString', on a regex object the VM built",
  'regex.ts › add › mark[state]':
    'an Int32Array indexed by closure state (VM-internal)',
  'regex.ts › add › stackPc[sp]':
    "the closure stack's own array, indexed by its depth (VM-internal)",
  'regex.ts › add › stackCaps[sp++]':
    "the closure stack's own array, indexed by its depth (VM-internal)",
  'regex.ts › compileRegex › stateBase[pc + 1]':
    'an Int32Array indexed by program counter (VM-internal)',
  'regex.ts › foldsOf › foldTables[k]':
    '`k` is 0 or 1 (the `u` flag), into a module-internal array',
  'regex.ts › add › n[ins.n]':
    "a thread's capture slots, indexed by the compiled program",
  'regex.ts › add › n[g * 2]':
    "a thread's capture slots, indexed by group number",
  'regex.ts › add › n[g * 2 + 1]':
    "a thread's capture slots, indexed by group number",
  'regex.ts › add › n[capSlots + ins.r]':
    "a thread's empty-check registers (VM-internal)",
  'string-methods.ts › matchArray › Object.assign':
    'named groups onto Object.create(null): a group named __proto__ is an ordinary key there',
  'runtime.ts › tagDateWrapper › Object.defineProperty':
    'the VM-owned DATE_WRAPPER symbol on a wrapper the VM built',
  'runtime.ts › withHeapContents › Object.defineProperty':
    'the VM-owned HEAP_CONTENTS symbol on a wrapper the VM built',
  'runtime.ts › inputsResolvedContext › Object.defineProperty':
    "`field` iterates the literal tuple ['error', 'output']",
  'runtime.ts › <module> › Object.assign':
    '`builtins` / `unsupportedBuiltins`: host object literals onto Object.create(null)',
  'admission.ts › admitRunOptions › table[op]':
    '`table` is null-prototype, where __proto__ is an ordinary own key, and frozen after',
}

const SETTING_CALLS = new Set([
  'Reflect.set',
  'Reflect.defineProperty',
  'Reflect.setPrototypeOf',
  'Object.assign',
  'Object.defineProperty',
  'Object.defineProperties',
  'Object.setPrototypeOf',
])

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
    // Calls that set keys or prototypes by other means: the native `Object.assign` invokes
    // the `__proto__` SETTER for an own `__proto__` key in its source (the guest
    // `Object.assign` was exactly this bug), and the rest take a key or prototype as data.
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf)
      if (SETTING_CALLS.has(callee))
        found.push(`${file} › ${enclosingName(node)} › ${callee}`)
    }
    // Destructuring / for-of TARGETS are writes too: `[obj[k]] = xs`, `for (obj[k] of xs)`.
    if (
      ts.isArrayLiteralExpression(node) ||
      ts.isObjectLiteralExpression(node)
    ) {
      const isTarget =
        (ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          node.parent.left === node) ||
        (ts.isForOfStatement(node.parent) && node.parent.initializer === node)
      if (isTarget)
        for (const el of ts.isArrayLiteralExpression(node)
          ? node.elements
          : node.properties.map((p) =>
              ts.isPropertyAssignment(p) ? p.initializer : p
            ))
          if (
            ts.isElementAccessExpression(el as ts.Node) &&
            !ts.isStringLiteral(
              (el as ts.ElementAccessExpression).argumentExpression
            )
          )
            found.push(
              `${file} › ${enclosingName(node)} › destructure ${(
                el as ts.Node
              ).getText(sf)}`
            )
    }
    if (
      ts.isForOfStatement(node) &&
      ts.isElementAccessExpression(node.initializer)
    )
      found.push(
        `${file} › ${enclosingName(node)} › for-of ${node.initializer.getText(
          sf
        )}`
      )
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
