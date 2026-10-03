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
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
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

const SRC = join(import.meta.dir, '..')

/** Files that call defineAtom but define no shipped atom. */
const NOT_SHIPPED: Record<string, string> = {
  'vm/date-tz.probe.ts': 'a subprocess probe for a test; defines a test sink',
  'vm/helper-args-heap.probe.ts': 'a subprocess probe for a test',
  'inference.types.ts': 'a type-inference fixture; never registered',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const parsed = (file: string) =>
  ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )

const isDefineAtom = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) &&
  ts.isIdentifier(n.expression) &&
  n.expression.text === 'defineAtom'

/** Every source file that CALLS defineAtom: derived, so a new atom file cannot be missed. */
const SOURCES = walk(SRC).filter((file) => {
  let found = false
  const visit = (n: ts.Node) => {
    if (isDefineAtom(n)) found = true
    else ts.forEachChild(n, visit)
  }
  visit(parsed(file))
  return found && !(relative(SRC, file) in NOT_SHIPPED)
})

/**
 * In a SELF_EGRESS atom, each argument of a call made THROUGH a capability (`ctx.capabilities.…`
 * or the store from `storeOf(ctx)`, aliases included) must be a literal, an `egressValue(...)`
 * call, or a name, property, or template built only from those. Returns the offending calls.
 */
export function liveCapabilityArgs(fn: ts.Node): string[] {
  const decls = new Map<string, ts.Expression>()
  const collect = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer)
      decls.set(n.name.text, n.initializer)
    ts.forEachChild(n, collect)
  }
  collect(fn)

  const rootOf = (e: ts.Expression): ts.Expression => {
    while (
      ts.isPropertyAccessExpression(e) ||
      ts.isElementAccessExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isParenthesizedExpression(e)
    )
      e = e.expression
    return e
  }
  const isCapability = (e: ts.Expression, depth = 0): boolean => {
    if (depth > 8) return false
    const text = e.getText()
    if (text.startsWith('ctx.capabilities')) return true
    const root = rootOf(e)
    if (ts.isCallExpression(root) && root.expression.getText() === 'storeOf')
      return true
    if (ts.isIdentifier(root) && decls.has(root.text))
      return isCapability(decls.get(root.text)!, depth + 1)
    return false
  }
  const isClean = (e: ts.Expression, depth = 0): boolean => {
    if (depth > 8) return false
    if (
      ts.isStringLiteral(e) ||
      ts.isNumericLiteral(e) ||
      ts.isNoSubstitutionTemplateLiteral(e) ||
      e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword ||
      e.kind === ts.SyntaxKind.NullKeyword
    )
      return true
    if (ts.isTemplateExpression(e))
      return e.templateSpans.every((sp) => isClean(sp.expression, depth + 1))
    if (ts.isCallExpression(e) && e.expression.getText() === 'egressValue')
      return true
    if (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e))
      return isClean(e.expression, depth + 1)
    const root = rootOf(e)
    if (root !== e) return isClean(root, depth + 1)
    if (ts.isIdentifier(e) && decls.has(e.text))
      return isClean(decls.get(e.text)!, depth + 1)
    return false
  }

  const bad: string[] = []
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      (ts.isPropertyAccessExpression(n.expression) ||
        ts.isElementAccessExpression(n.expression)) &&
      isCapability(n.expression.expression)
    ) {
      for (const arg of n.arguments)
        if (!isClean(arg)) bad.push(n.getText().slice(0, 80))
    }
    ts.forEachChild(n, visit)
  }
  visit(fn)
  return bad
}

/** op → identifiers called inside its `defineAtom(...)` call (parsed, not grepped). */
const bodies = new Map<string, ts.CallExpression>()

function calledIn(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const file of SOURCES) {
    const visit = (node: ts.Node) => {
      if (
        isDefineAtom(node) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const called = new Set<string>()
        const walkCalls = (n: ts.Node) => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression))
            called.add(n.expression.text)
          ts.forEachChild(n, walkCalls)
        }
        node.arguments.slice(1).forEach(walkCalls)
        out.set(node.arguments[0].text, called)
        bodies.set(node.arguments[0].text, node)
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed(file))
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
        // and at EVERY capability call site, not just somewhere in the body (review 6, M-3)
        expect(liveCapabilityArgs(bodies.get(op)!)).toEqual([])
        return
      }
      expect(
        NO_GUEST_EGRESS[op],
        `'${op}' is an IO atom the VM does not resolve and that does not call egressValue: route what it hands a capability through egressValue, or list it with a reason`
      ).toBeDefined()
    })
  }

  it('the per-call-site check catches a live argument (apparatus)', () => {
    const src = (body: string) =>
      ts.createSourceFile(
        'planted.ts',
        `async (input, ctx) => { ${body} }`,
        ts.ScriptTarget.Latest,
        true
      )
    const live = src(
      `const store = storeOf(ctx); const k = egressValue(ctx, 'op', input.key); await store.set(\`c:\${k}\`, { val: input.result })`
    )
    expect(liveCapabilityArgs(live)).toHaveLength(1)
    const viaCaps = src(`await ctx.capabilities.agent.run(input.id, input.x)`)
    expect(liveCapabilityArgs(viaCaps)).toHaveLength(2)
    const clean = src(
      `const store = storeOf(ctx); const sent = egressValue(ctx, 'op', input); await store.set(\`c:\${sent.k}\`, sent.v); await store.get('lit')`
    )
    expect(liveCapabilityArgs(clean)).toEqual([])
  })

  it('the atom files are derived, and include every file that defines atoms', () => {
    const rel = SOURCES.map((f) => relative(SRC, f)).sort()
    expect(rel).toContain('vm/runtime.ts')
    expect(rel).toContain('vm/atoms/batteries.ts')
    expect(rel).toContain('vm/atoms/browser.ts')
  })

  it('no stale entries', () => {
    for (const op of [...SELF_EGRESS, ...Object.keys(NO_GUEST_EGRESS)]) {
      expect(ioOps).toContain(op)
      expect(atoms[op].resolveInputs).toBeFalsy()
    }
  })
})
