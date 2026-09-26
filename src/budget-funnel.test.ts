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
 * The PRIMARY control is no longer this test: `RUN_OPTION_KINDS` in admission.ts is keyed by
 * `keyof RunOptions`, so a run option nobody classified fails to COMPILE. Re-review 13 blocked
 * on `quotaUsed` — a counter missing from this file's name list — and a list of names is
 * closed while the set of options is not. This test is the second line, for budgets read
 * OUTSIDE a run (predicate fuel, atom timeouts, the source caps).
 *
 * It PARSES the source (the TypeScript compiler, not a regex — a regex over `opts.fuel`
 * misses the destructured `{ fuel = 1000 } = options` that `Eval` actually uses) and fails on
 * any read of a budget-named property that does not reach a funnel. A read is accepted when:
 *
 * 1. it is the VALIDATED argument of a funnel called by its bare name (`sourceBytesOver`
 *    checks its second argument, not its first), or of a same-file wrapper that hands that
 *    position on;
 * 2. it is FORWARDED into a budget-named key (`{ fuel: o.fuel }`), so the receiver's read is
 *    the one that counts. A rename (`{ limit: o.fuel }`) is not a forward;
 * 3. it is DOMINATED by `validateRunOptions(<same object>)` or a funnel on the same
 *    expression: a funnel STATEMENT preceding it in an enclosing block of the same function
 *    (closures created after it count; a sibling branch, a closure or a `try` does not);
 * 4. it initialises a local (or is destructured into one) whose every use is forwarded,
 *    funneled, a presence check, or dominated by a funnel on it;
 * 5. it is on a `RuntimeContext` — a parameter or variable DECLARED with that type, or an
 *    atom body passed to `defineAtom`. Its budget fields come from options `vm.run` validated,
 *    and the last block pins that `vm.run` is the only place one is built. A derived context
 *    (`{ ...ctx, fuel: … }`) is checked: an overriding budget must come from a context or a
 *    funnel.
 *
 * KNOWN BLIND SPOTS (review 13, F-1) — say them rather than claim more: reassigning the
 * options object after validating it; computed keys (`o[k]`, `Object.entries(o)`); budgets
 * under names not in BUDGET_NAMES; files outside `src/**\/*.ts` (`.tjs`, `bin/`, `scripts/`).
 *
 * A read the rules cannot accept goes in ALLOWED with a written reason, and an entry that
 * stops matching anything fails, so the list cannot rot into slack.
 */
import { describe, it, expect } from 'bun:test'
import * as ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(import.meta.dir, '..')

const BUDGET_NAMES = new Set([
  'fuel',
  'quotaUsed',
  'timeoutMs',
  'maxSourceBytes',
  'argsMaxBytes',
  'membraneMaxBytes',
  'maxHeapBytes',
  'quotas',
  'costOverrides',
  'timeoutOverrides',
])

/** Each funnel, and the argument position it VALIDATES — `sourceBytesOver(code, max)` checks
 * `max`, not `code`. */
const FUNNELS: Record<string, number> = {
  validateRunOptions: 0,
  sourceBytesOver: 1,
  timerMs: 0,
  checkedCost: 0,
  budgetOption: 1,
  guestSourceCap: 0,
}

/** `file:line  text` → why it is acceptable. Must stay empty unless a reason is written. */
const ALLOWED: Record<string, string> = {
  'src/lang/eval.ts  fuel = 1000':
    'Forwarded to vm.run (which validates it) and otherwise only REPORTED as `fuelUsed` on an ' +
    'error result — never compared against a counter. Two sites: Eval and SafeFunction.',
  'src/vm/vm.ts  (atom as any).timeoutMs':
    'defaultRunTimeout re-reads atom timeouts the AgentVM CONSTRUCTOR already passed through ' +
    'budgetOption (a different function, so no dominance the scan can see).',
}

interface Violation {
  key: string
  where: string
}

/** A funnel is called by its BARE name — `cache.timerMs(x)` is somebody else's method. */
function calleeName(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined
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

/**
 * Funnels, and which argument positions each one validates. A same-file wrapper counts only
 * for the positions it hands on (review 13: an over-broad
 * wrapper marked ALL of its arguments as funneled).
 */
type Funnels = Map<string, Set<number>>

function isFunnelArg(call: ts.CallExpression, arg: ts.Node, funnels: Funnels) {
  const name = calleeName(call)
  const which = name ? funnels.get(name) : undefined
  if (!which) return false
  const i = call.arguments.indexOf(arg as ts.Expression)
  return i >= 0 && which.has(i)
}

/** A statement that IS a funnel call: `f(x)`, `const r = f(x)`. Not one nested in a closure,
 * a `try`, a branch or an expression that might not evaluate it. */
function statementFunnel(st: ts.Statement): ts.CallExpression | undefined {
  if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression))
    return st.expression
  if (ts.isVariableStatement(st)) {
    const decls = st.declarationList.declarations
    if (decls.length === 1) {
      let init: ts.Node | undefined = decls[0].initializer
      while (
        init &&
        (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))
      )
        init = (init as any).expression
      if (init && ts.isCallExpression(init)) return init
    }
  }
  return undefined
}

/** Funnels that RETURN a refusal instead of throwing one. */
const RETURNS_REASON = new Set(['validateRunOptions'])

/**
 * A throwing funnel acts by being called. One that RETURNS its refusal acts only if the result
 * is kept and a following statement leaves on it: `const bad = validateRunOptions(o)` then
 * `if (bad) return …` / `throw …`. A bare `validateRunOptions(o)` validates nothing.
 */
function acted(
  st: ts.Statement,
  call: ts.CallExpression,
  after: readonly ts.Statement[]
): boolean {
  if (!RETURNS_REASON.has(calleeName(call) ?? '')) return true
  if (!ts.isVariableStatement(st)) return false
  const d = st.declarationList.declarations[0]
  if (!ts.isIdentifier(d.name)) return false
  const name = d.name.text
  const leaves = (n: ts.Node): boolean =>
    ts.isReturnStatement(n) ||
    ts.isThrowStatement(n) ||
    (!ts.isFunctionLike(n) &&
      !!ts.forEachChild(n, (c) => leaves(c) || undefined))
  return after.some(
    (a) =>
      ts.isIfStatement(a) &&
      ts.isIdentifier(a.expression) &&
      a.expression.text === name &&
      leaves(a.thenStatement)
  )
}

/**
 * Is `node` DOMINATED by a funnel call satisfying `matches` — a funnel statement that runs,
 * unconditionally, before it in the same function? Walks up the enclosing blocks, looking at
 * the statements BEFORE the one containing `node`. A call in a sibling branch, a dead closure
 * or a swallowing `try` is not a preceding statement of an enclosing block, so it does not
 * count (review 13: rule 3 used to compare text positions).
 */
function dominated(
  node: ts.Node,
  matches: (call: ts.CallExpression) => boolean
): boolean {
  let child: ts.Node = node
  let p: ts.Node | undefined = node.parent
  // A closure (arrow or function EXPRESSION) created at a dominated point runs after the
  // funnel too, so the walk continues out through it. A declaration or method is hoisted or
  // callable from elsewhere, so the walk stops there.
  while (
    p &&
    (!ts.isFunctionLike(p) ||
      ts.isArrowFunction(p) ||
      ts.isFunctionExpression(p))
  ) {
    if (ts.isBlock(p) || ts.isSourceFile(p)) {
      const stmts = p.statements
      const upto = stmts.indexOf(child as ts.Statement)
      for (let i = 0; i < (upto < 0 ? stmts.length : upto); i++) {
        const call = statementFunnel(stmts[i])
        if (
          call &&
          matches(call) &&
          acted(stmts[i], call, stmts.slice(i + 1, upto))
        )
          return true
      }
    }
    child = p
    p = p.parent
  }
  return false
}

/** Same-file functions that hand a parameter straight to a funnel, and which positions. */
function derivedWrappers(sf: ts.SourceFile): Funnels {
  const funnels: Funnels = new Map(
    Object.entries(FUNNELS).map(([f, i]) => [f, new Set([i])])
  )
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      const positions = new Set<number>()
      n.parameters.forEach((param, i) => {
        if (!ts.isIdentifier(param.name)) return
        const id = param.name.text
        for (const st of n.body!.statements) {
          const call = statementFunnel(st)
          if (
            call &&
            call.arguments.some(
              (a) =>
                ts.isIdentifier(a) &&
                a.text === id &&
                isFunnelArg(call, a, funnels)
            )
          )
            positions.add(i)
        }
      })
      if (positions.size) funnels.set(n.name.text, positions)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return funnels
}

/** A property NAME (`o.fuel`, `{ fuel: … }`), not a reference to a local called `fuel`. */
function isPropertyName(n: ts.Node): boolean {
  const p = n.parent
  return (
    !!p &&
    ((ts.isPropertyAccessExpression(p) && p.name === n) ||
      (ts.isPropertyAssignment(p) && p.name === n) ||
      (ts.isBindingElement(p) && p.propertyName === n))
  )
}

/** Forwarded: the value of a property with a BUDGET name, so the receiver's read is the one
 * that counts. `{ limit: o.fuel }` is a rename, not a forward (review 13). */
function isForward(n: ts.Node): boolean {
  const p = unwrap(n)
  if (ts.isShorthandPropertyAssignment(p)) return BUDGET_NAMES.has(p.name.text)
  return (
    ts.isPropertyAssignment(p) &&
    p.initializer === n &&
    BUDGET_NAMES.has(p.name.getText())
  )
}

/** `typeof x` and `x !== undefined` ask whether it is THERE, not how big it is. */
function isPresenceCheck(n: ts.Node): boolean {
  const p = unwrap(n)
  return (
    ts.isTypeOfExpression(p) ||
    (ts.isBinaryExpression(p) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(p.operatorToken.kind) &&
      [p.left, p.right].some(
        (side) => ts.isIdentifier(side) && side.text === 'undefined'
      ))
  )
}

/** Local `id` is safe: every use forwards it, feeds a funnel, checks its presence, or is
 * dominated by a funnel statement on it. */
function localSafe(
  scope: ts.Node,
  id: string,
  decl: ts.Node,
  funnels: Funnels
): boolean {
  let ok = true
  const visit = (n: ts.Node) => {
    if (
      ts.isIdentifier(n) &&
      n.text === id &&
      n !== decl &&
      !isPropertyName(n)
    ) {
      const p = unwrap(n)
      const funneled = ts.isCallExpression(p) && isFunnelArg(p, n, funnels)
      const checked = dominated(n, (c) =>
        c.arguments.some(
          (a) =>
            ts.isIdentifier(a) && a.text === id && isFunnelArg(c, a, funnels)
        )
      )
      if (!isForward(n) && !funneled && !isPresenceCheck(n) && !checked)
        ok = false
    }
    ts.forEachChild(n, visit)
  }
  visit(scope)
  return ok
}

/**
 * Rule 5: `ctx` is trusted only when it is a RuntimeContext — a parameter or variable
 * DECLARED with that type, found by walking out through the enclosing functions. Any other
 * identifier spelled `ctx` is just a name (review 13).
 */
function isRuntimeContext(id: ts.Identifier): boolean {
  const typed = (t: ts.TypeNode | undefined) =>
    !!t && /\bRuntimeContext\b/.test(t.getText())
  let child: ts.Node = id
  let p: ts.Node | undefined = id.parent
  while (p) {
    if (ts.isFunctionLike(p)) {
      const param = p.parameters.find(
        (q) => ts.isIdentifier(q.name) && q.name.text === id.text
      )
      if (param) {
        if (typed(param.type)) return true
        // An atom body passed to `defineAtom(…)` is contextually typed by its signature:
        // `(input, ctx: RuntimeContext) => Promise<O>`.
        const call = p.parent
        return (
          !param.type &&
          !!call &&
          ts.isCallExpression(call) &&
          calleeName(call) === 'defineAtom' &&
          call.arguments.includes(p as any)
        )
      }
    }
    if (ts.isBlock(p) || ts.isSourceFile(p))
      for (const st of p.statements) {
        if (st === child) break
        if (ts.isVariableStatement(st))
          for (const d of st.declarationList.declarations)
            if (ts.isIdentifier(d.name) && d.name.text === id.text)
              return typed(d.type)
      }
    child = p
    p = p.parent
  }
  return false
}

export function scan(fileName: string, text: string): Violation[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const funnels = derivedWrappers(sf)
  const out: Violation[] = []
  const report = (n: ts.Node) => {
    const snippet = n.getText().replace(/\s+/g, ' ').slice(0, 60)
    // No line number: a key that moves with every unrelated edit is an allowlist nobody reads.
    out.push({ key: `${fileName}  ${snippet}`, where: snippet })
  }

  const visit = (n: ts.Node) => {
    // obj.fuel, obj?.fuel, obj['fuel'], obj[`fuel`]
    let name: string | undefined
    let obj: ts.Expression | undefined
    if (ts.isPropertyAccessExpression(n)) {
      name = n.name.text
      obj = n.expression
    } else if (
      ts.isElementAccessExpression(n) &&
      (ts.isStringLiteral(n.argumentExpression) ||
        ts.isNoSubstitutionTemplateLiteral(n.argumentExpression))
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
      const onCtx = ts.isIdentifier(obj) && isRuntimeContext(obj) // rule 5
      const funneled = ts.isCallExpression(p) && isFunnelArg(p, n, funnels) // rule 1
      const objText = obj.getText()
      const exprText = n.getText()
      const earlier = dominated(n, (c) =>
        c.arguments.some(
          (a) =>
            (a.getText() === exprText && isFunnelArg(c, a, funnels)) ||
            (calleeName(c) === 'validateRunOptions' && a.getText() === objText)
        )
      ) // rule 3
      const local =
        ts.isVariableDeclaration(p) &&
        ts.isIdentifier(p.name) &&
        localSafe(enclosingFunction(n), p.name.text, p.name, funnels) // rule 4
      if (
        !isWrite &&
        !onCtx &&
        !isPresenceCheck(n) &&
        !funneled &&
        !isForward(n) && // rule 2
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
        if (!localSafe(fn, id, n.name, funnels)) report(n)
      }
    }

    // { ...ctx, fuel: { current: o.fuel } } — a derived context carrying a budget that did not
    // come from a validated one. Every other `{ ...ctx }` inherits validated fields.
    if (
      ts.isObjectLiteralExpression(n) &&
      n.properties.some((q) => ts.isSpreadAssignment(q))
    )
      for (const q of n.properties)
        if (
          ts.isPropertyAssignment(q) &&
          BUDGET_NAMES.has(q.name.getText()) &&
          !budgetFromValidated(q.initializer, funnels)
        )
          report(q)

    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** A budget override in a spread context is fine only if it is read from a RuntimeContext or
 * produced by a funnel. */
function budgetFromValidated(e: ts.Expression, funnels: Funnels): boolean {
  let ok = true
  let sawSource = false
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAccessExpression(n) && BUDGET_NAMES.has(n.name.text)) {
      sawSource = true
      if (!(ts.isIdentifier(n.expression) && isRuntimeContext(n.expression)))
        ok = false
      return
    }
    if (ts.isCallExpression(n) && funnels.has(calleeName(n) ?? '')) {
      sawSource = true
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(e)
  return (
    ok &&
    (sawSource || ts.isLiteralExpression(e) || ts.isObjectLiteralExpression(e))
  )
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
      ignoredReason: `function f(o) { validateRunOptions(o); return o.fuel > 1 }`,
      keptButUnused: `function f(o) { const bad = validateRunOptions(o); return o.fuel > 1 }`,
      untypedCtx: `function f(ctx) { return ctx.maxHeapBytes > 0 }`,
      spreadCtx: `function f(ctx: RuntimeContext, o) { return run({ ...ctx, fuel: { current: o.fuel } }) }`,
      renamedForward: `function f(o) { return g({ limit: o.fuel }) }`,
      siblingBranch: `function f(o, a) { if (a) validateRunOptions(o); else return o.fuel > 1 }`,
      deadClosure: `function f(o) { const c = () => validateRunOptions(o); return o.fuel > 1 }`,
      swallowed: `function f(o) { try { validateRunOptions(o) } catch {} return o.fuel > 1 }`,
      methodNamedLikeFunnel: `function f(o) { return cache.timerMs(o.fuel) }`,
      wrapperWrongArg: `function w(a, max) { sourceBytesOver(a, max) }
                        function f(o) { w(o.fuel, 1) }`,
      templateKey: 'function f(o) { return o[`fuel`] > 0 }',
      localUsedBeforeFunnel: `function f(a) { const t = a.timeoutMs; arm(t); budgetOption('t', t, 1) }`,
    }
    for (const [label, src] of Object.entries(bad))
      expect({ label, seen: scan(label, src).length > 0 }).toEqual({
        label,
        seen: true,
      })

    const good = {
      funneled: `function f(o) { return budgetOption('fuel', o.fuel, 1) }`,
      forwarded: `function f(o) { return vm.run(x, {}, { fuel: o.fuel }) }`,
      validated: `function f(o) { const bad = validateRunOptions(o); if (bad) throw new Error(bad); return o.fuel ?? 1 }`,
      local: `function f(a) { const raw = a.timeoutMs; return budgetOption('t', raw, 1) }`,
      destructuredForwarded: `function f(options) { const { fuel = 1 } = options; return run({ fuel }) }`,
      wrapper: `function check(c, max) { sourceBytesOver(c, max) }
                function f(options) { const { maxSourceBytes = 8 } = options; check('x', maxSourceBytes) }`,
      sameNameProperty: `function f(o) { const fuel = o.fuel; budgetOption('f', fuel, 1); return fuel }`,
      presenceThenChecked: `function f(o) { const m = o.maxSourceBytes; if (m !== undefined) sourceBytesOver('x', m) }`,
      destructuredThenChecked: `function f(o) { const { timeoutMs = 1 } = o; budgetOption('t', timeoutMs, 1); return () => arm(timeoutMs) }`,
      ctx: `function f(ctx: RuntimeContext) { return ctx.maxHeapBytes ?? 1 }`,
      atomBody: `defineAtom('x', s, o, async (step, ctx) => ctx.fuel.current)`,
      derivedCtx: `function f(ctx: RuntimeContext) { return run({ ...ctx, fuel: ctx.fuel }) }`,
      closureAfterCheck: `function f(o) { budgetOption('fuel', o.fuel, 1); return () => o.fuel * 2 }`,
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
          // DOMINATED by the validation, not merely after it in the text.
          const validated = dominated(
            n,
            (c) => calleeName(c) === 'validateRunOptions'
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
