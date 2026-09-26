/**
 * GUARDRAIL: every budget-shaped option is read through the admission funnel.
 *
 * A budget is compared against a counter, and every comparison with `NaN` is false — so an
 * unvalidated `NaN` budget is not a budget at all (`--fuel < 0` never trips, `bytes > NaN`
 * never refuses). The 0.14.0 cycle blocked on that one shape three re-reviews running:
 * `Eval`'s source cap (re-review 10), `transpile`'s opt-in cap (11), the predicate compiler's
 * fuel (12) — each one directory over from the last fix, each found by a reviewer rather than
 * by a test. The funnel (`src/vm/admission.ts`) already existed; nothing made a new read use it.
 *
 * This test PARSES the source (the TypeScript compiler, not a regex — a regex over
 * `opts.fuel` misses the destructured `{ fuel = 1000 } = options` that `Eval` actually uses)
 * and fails on any read of a budget-named property that does not reach a funnel. A read is
 * accepted when it:
 *
 * 1. is an argument to a funnel call — or to a same-file wrapper that passes that parameter
 *    to one (derived, not listed, so a wrapper cannot drift out of it);
 * 2. is FORWARDED — the value of an object-literal property, so the receiver's own read is
 *    the one that counts (and is checked here too, if it is in this repo);
 * 3. follows, in the same function, `validateRunOptions(<same object>)` or a funnel call on
 *    the same expression (vm.run validates every option up front, then reads them freely);
 * 4. initialises a local (or is destructured into one) that is only forwarded or funneled
 *    until the same function first passes it to a funnel;
 * 5. is on `ctx` — a RuntimeContext. Its budget fields are copied from options `vm.run` has
 *    already validated, and the last block below pins that `vm.run` is the ONLY place a
 *    RuntimeContext is built (every other context spreads an existing one).
 *
 * A read the rules cannot accept goes in ALLOWED with a written reason. It is empty, and an
 * entry that stops matching anything fails, so the list cannot rot into slack.
 */
import { describe, it, expect } from 'bun:test'
import * as ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(import.meta.dir, '..')

const BUDGET_NAMES = new Set([
  'fuel',
  'timeoutMs',
  'maxSourceBytes',
  'argsMaxBytes',
  'membraneMaxBytes',
  'maxHeapBytes',
  'quotas',
  'costOverrides',
  'timeoutOverrides',
])

const FUNNELS = new Set([
  'validateRunOptions',
  'sourceBytesOver',
  'timerMs',
  'checkedCost',
  'budgetOption',
  'guestSourceCap',
])

/** `file:line  text` → why it is acceptable. Must stay empty unless a reason is written. */
const ALLOWED: Record<string, string> = {}

interface Violation {
  key: string
  where: string
}

function calleeName(call: ts.CallExpression): string | undefined {
  const e = call.expression
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e)) return e.name.text
  return undefined
}

function enclosingFunction(n: ts.Node): ts.Node {
  let p: ts.Node | undefined = n.parent
  while (p) {
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return p
    p = p.parent
  }
  return n.getSourceFile()
}

function unwrap(n: ts.Node): ts.Node {
  let p = n.parent
  while (
    p &&
    (ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p))
  )
    p = p.parent
  return p
}

/** Calls inside `scope` whose callee is a funnel (or a derived wrapper). */
function funnelCalls(
  scope: ts.Node,
  funnels: Set<string>
): ts.CallExpression[] {
  const out: ts.CallExpression[] = []
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n)
      if (name && funnels.has(name)) out.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(scope)
  return out
}

/** Same-file functions that hand one of their parameters straight to a funnel. */
function derivedWrappers(sf: ts.SourceFile): Set<string> {
  const wrappers = new Set<string>()
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      const params = new Set(
        n.parameters
          .map((p) => (ts.isIdentifier(p.name) ? p.name.text : ''))
          .filter(Boolean)
      )
      for (const call of funnelCalls(n.body, FUNNELS))
        if (
          call.arguments.some((a) => ts.isIdentifier(a) && params.has(a.text))
        )
          wrappers.add(n.name.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return wrappers
}

/**
 * Local `id` is safe in `scope`: every use forwards it, feeds a funnel, inspects its `typeof`,
 * or comes AFTER the first funnel call on it. (A funnel call that comes later validates
 * nothing the earlier uses already did.)
 */
function localSafe(
  scope: ts.Node,
  id: string,
  decl: ts.Node,
  funnels: Set<string>
): boolean {
  const checks = funnelCalls(scope, funnels)
    .filter((c) => c.arguments.some((a) => ts.isIdentifier(a) && a.text === id))
    .map((c) => c.getStart())
  const firstCheck = checks.length ? Math.min(...checks) : Infinity
  let ok = true
  const visit = (n: ts.Node) => {
    const isName = // `o.fuel`, `{ fuel: … }`: a property NAME, not a reference to the local
      n.parent &&
      ((ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) ||
        (ts.isPropertyAssignment(n.parent) && n.parent.name === n) ||
        (ts.isBindingElement(n.parent) && n.parent.propertyName === n))
    if (ts.isIdentifier(n) && n.text === id && n !== decl && !isName) {
      const p = unwrap(n)
      const forwarded =
        ts.isShorthandPropertyAssignment(p) ||
        (ts.isPropertyAssignment(p) && p.initializer === n)
      const funneled =
        ts.isCallExpression(p) &&
        p.arguments.includes(n as any) &&
        funnels.has(calleeName(p) ?? '')
      // `typeof x` and `x !== undefined` ask whether it is THERE, not how big it is.
      const inspected =
        ts.isTypeOfExpression(p) ||
        (ts.isBinaryExpression(p) &&
          [
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ].includes(p.operatorToken.kind) &&
          [p.left, p.right].some(
            (side) => ts.isIdentifier(side) && side.text === 'undefined'
          ))
      if (!forwarded && !funneled && !inspected && n.getStart() < firstCheck)
        ok = false
    }
    ts.forEachChild(n, visit)
  }
  visit(scope)
  return ok
}

/** Earlier in the same function: validateRunOptions(obj), or a funnel on this expression. */
function validatedEarlier(
  read: ts.Node,
  objText: string,
  exprText: string,
  funnels: Set<string>
): boolean {
  const fn = enclosingFunction(read)
  return funnelCalls(fn, funnels).some(
    (c) =>
      c.getStart() < read.getStart() &&
      c.arguments.some((a) => {
        const t = a.getText()
        return (
          t === exprText ||
          (calleeName(c) === 'validateRunOptions' && t === objText)
        )
      })
  )
}

export function scan(fileName: string, text: string): Violation[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const funnels = new Set([...FUNNELS, ...derivedWrappers(sf)])
  const out: Violation[] = []
  const report = (n: ts.Node) => {
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
    const snippet = n.getText().replace(/\s+/g, ' ').slice(0, 60)
    out.push({ key: `${fileName}:${line}  ${snippet}`, where: snippet })
  }

  const visit = (n: ts.Node) => {
    // obj.fuel, obj?.fuel, obj['fuel']
    let name: string | undefined
    let obj: ts.Expression | undefined
    if (ts.isPropertyAccessExpression(n)) {
      name = n.name.text
      obj = n.expression
    } else if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteral(n.argumentExpression)
    ) {
      name = n.argumentExpression.text
      obj = n.expression
    }
    if (name && obj && BUDGET_NAMES.has(name)) {
      const p = unwrap(n)
      const isWrite =
        ts.isBinaryExpression(p) &&
        p.left === n &&
        p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        p.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      const onCtx = ts.isIdentifier(obj) && obj.text === 'ctx' // rule 5
      const inTypeof = ts.isTypeOfExpression(p)
      const funneled =
        ts.isCallExpression(p) &&
        p.arguments.includes(n as any) &&
        funnels.has(calleeName(p) ?? '') // rule 1
      const forwarded = ts.isPropertyAssignment(p) && p.initializer === n // rule 2
      const earlier = validatedEarlier(n, obj.getText(), n.getText(), funnels) // rule 3
      const local =
        ts.isVariableDeclaration(p) &&
        ts.isIdentifier(p.name) &&
        localSafe(enclosingFunction(n), p.name.text, p.name, funnels) // rule 4
      if (
        !isWrite &&
        !onCtx &&
        !inTypeof &&
        !funneled &&
        !forwarded &&
        !earlier &&
        !local
      )
        report(n)
    }

    // const { fuel = 1000 } = options  — a destructured read
    if (
      ts.isBindingElement(n) &&
      ts.isObjectBindingPattern(n.parent) &&
      ts.isIdentifier(n.name)
    ) {
      const prop = n.propertyName
        ? n.propertyName.getText()
        : (n.name as ts.Identifier).text
      if (BUDGET_NAMES.has(prop)) {
        const fn = enclosingFunction(n)
        const id = (n.name as ts.Identifier).text
        // Destructuring a function's own PARAMETER list (`function f({ fuel })`) is the same
        // read; so is `const { fuel } = options`. Either way the local must only be forwarded
        // or funneled.
        if (!localSafe(fn, id, n.name, funnels)) report(n)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.d.ts')
    )
      out.push(full)
  }
  return out
}

describe('budget funnel', () => {
  it('APPARATUS: the scanner sees each shape that shipped, and accepts each funneled one', () => {
    // If these stop failing, the scan has gone blind and every result below is vacuous.
    const bad = {
      member: `function f(opts) { const b = opts.fuel ?? 1e6; return b }`,
      optional: `function f(o) { return o?.timeoutMs > 0 }`,
      element: `function f(o) { return o['maxSourceBytes'] }`,
      destructured: `function f(options) { const { fuel = 1000 } = options; return fuel > 0 }`,
      param: `function f({ argsMaxBytes }) { return argsMaxBytes * 2 }`,
      afterWrongCheck: `function f(o) { validateRunOptions(other); return o.fuel }`,
      beforeCheck: `function f(o) { const x = o.fuel; validateRunOptions(o); return x }`,
      comparedBeforeFunnel: `function f(a) { const t = a.fuel; if (t > 0) go(); budgetOption('t', t, 1) }`,
      localUsedBeforeFunnel: `function f(a) { const t = a.timeoutMs; arm(t); budgetOption('t', t, 1) }`,
    }
    for (const [label, src] of Object.entries(bad))
      expect({ label, n: scan(label, src).length }).toEqual({ label, n: 1 })

    const good = {
      funneled: `function f(o) { return budgetOption('fuel', o.fuel, 1) }`,
      forwarded: `function f(o) { return vm.run(x, {}, { fuel: o.fuel }) }`,
      validated: `function f(o) { validateRunOptions(o); return o.fuel ?? 1 }`,
      local: `function f(a) { const raw = a.timeoutMs; return budgetOption('t', raw, 1) }`,
      destructuredForwarded: `function f(options) { const { fuel = 1 } = options; return run({ fuel }) }`,
      wrapper: `function check(c, max) { sourceBytesOver(c, max) }
                function f(options) { const { maxSourceBytes = 8 } = options; check('x', maxSourceBytes) }`,
      sameNameProperty: `function f(o) { const fuel = o.fuel; budgetOption('f', fuel, 1); return fuel }`,
      presenceThenChecked: `function f(o) { const m = o.maxSourceBytes; if (m !== undefined) sourceBytesOver('x', m) }`,
      destructuredThenChecked: `function f(o) { const { timeoutMs = 1 } = o; budgetOption('t', timeoutMs, 1); return () => arm(timeoutMs) }`,
      ctx: `function f(ctx) { return ctx.maxHeapBytes ?? 1 }`,
      write: `function f(o) { o.fuel = 3 }`,
    }
    for (const [label, src] of Object.entries(good))
      expect({ label, found: scan(label, src) }).toEqual({ label, found: [] })
  })

  const files = sourceFiles(join(ROOT, 'src'))

  it('every budget-named option read in src/ reaches the admission funnel', () => {
    expect(files.length).toBeGreaterThan(100) // the walk found the tree
    const violations = files.flatMap((f) =>
      scan(relative(ROOT, f), readFileSync(f, 'utf8'))
    )
    const unexplained = violations.filter((v) => !(v.key in ALLOWED))
    expect(unexplained.map((v) => v.key)).toEqual([])
    // An allowance that no longer matches anything is slack a regression could occupy.
    const live = new Set(violations.map((v) => v.key))
    expect(Object.keys(ALLOWED).filter((k) => !live.has(k))).toEqual([])
  })

  it('a RuntimeContext is built only in vm.run, after validateRunOptions', () => {
    // Rule 5 trusts `ctx.<budget>` because the context is built from validated options. That
    // holds only while vm.run is the one place that builds one — every other site must SPREAD
    // an existing context. A fresh literal carrying `fuel: { current: … }` is a new builder.
    const builders: string[] = []
    for (const f of files) {
      const sf = ts.createSourceFile(
        f,
        readFileSync(f, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      )
      const visit = (n: ts.Node) => {
        if (
          ts.isObjectLiteralExpression(n) &&
          n.properties.some(
            (p) =>
              ts.isPropertyAssignment(p) &&
              p.name.getText() === 'fuel' &&
              ts.isObjectLiteralExpression(p.initializer) &&
              p.initializer.properties.some(
                (q) => q.name?.getText() === 'current'
              )
          ) &&
          !n.properties.some((p) => ts.isSpreadAssignment(p))
        ) {
          const fn = enclosingFunction(n)
          const validated = funnelCalls(fn, FUNNELS).some(
            (c) =>
              calleeName(c) === 'validateRunOptions' &&
              c.getStart() < n.getStart()
          )
          const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
          builders.push(`${relative(ROOT, f)}:${line} validated=${validated}`)
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    expect(builders.length).toBe(1)
    expect(builders[0]).toMatch(/^src\/vm\/vm\.ts:\d+ validated=true$/)
  })
})
