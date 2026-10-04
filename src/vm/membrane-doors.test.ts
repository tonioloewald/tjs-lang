/**
 * The capability boundary is a CLOSED set of crossings (cumulative review 9).
 *
 * "A refusal at the capability boundary ends the run" is a rule about the BOUNDARY, and round 34
 * implemented it at SITES: the outbound refusals halted, the inbound one stayed a catchable error,
 * and a guest looped on it. So the rule now lives in the functions that cross, each of which halts
 * on refusal, and this test parses `src/vm/**` for any other caller of the membrane walk. A new
 * crossing fails here until it is listed with how its refusal halts.
 *
 * Parsed with TypeScript's parser: a comment or a string naming `membraneValue` does not count.
 */
import { describe, it, expect } from 'bun:test'
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const VM = import.meta.dir
const WALKS = new Set(['membraneValue', 'membraneValueFrom'])

/** `file › enclosing function` → how a refusal there ends the run. */
const CROSSINGS: Record<string, string> = {
  'runtime.ts › egressValue':
    'OUTBOUND: every refusal goes through `bill`, which throws `haltRun(...)`',
  'runtime.ts › ingressValue':
    'INBOUND: a refused return and an output-schema mismatch both throw `haltRun(...)`',
  'runtime.ts › membraneValueFrom':
    'the walk itself (a wrapper renaming the subject); not a crossing',
  'vm.ts › run':
    'run ARGUMENTS: refused before the run exists, so the run is never started (nothing to halt)',
}

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files(full, out)
    else if (
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.probe.ts')
    )
      out.push(full)
  }
  return out
}

function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name)
      return n.name.getText()
  }
  return '(module)'
}

function crossingSites(): string[] {
  const sites: string[] = []
  for (const file of files(VM)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        WALKS.has(n.expression.text)
      )
        sites.push(`${relative(VM, file)} › ${enclosingName(n)}`)
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return [...new Set(sites)].sort()
}

/**
 * The crossing that is NOT a walk: a value an atom THROWS reaches the guest's `catch` parameter.
 * It is reduced to a capped string by `reduceThrown` (cumulative review 10, B2: `{ message: obj }`
 * handed the guest a live host object). Held here by parsing: every `catch` clause in the VM that
 * builds an `AgentError` from a caught value must call `reduceThrown`.
 */
/** Does `node` contain the IDENTIFIER `name` (not merely the text)? */
function mentions(node: ts.Node, name: string): boolean {
  let found = false
  const walk = (n: ts.Node) => {
    if (ts.isIdentifier(n) && n.text === name) found = true
    else ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

function catchClausesBuildingFromCaught(): string[] {
  const bad: string[] = []
  for (const file of files(VM)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const visit = (n: ts.Node) => {
      if (ts.isCatchClause(n) && n.variableDeclaration) {
        const param = n.variableDeclaration.name.getText()
        let buildsFromCaught = false
        let reduces = false
        const walk = (m: ts.Node) => {
          if (
            ts.isNewExpression(m) &&
            m.expression.getText() === 'AgentError' &&
            m.arguments?.[0] &&
            mentions(m.arguments[0], param)
          )
            buildsFromCaught = true
          if (
            ts.isCallExpression(m) &&
            m.expression.getText() === 'reduceThrown'
          )
            reduces = true
          ts.forEachChild(m, walk)
        }
        walk(n.block)
        if (buildsFromCaught && !reduces)
          bad.push(
            `${relative(VM, file)}:${
              sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
            }`
          )
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return bad
}

describe('a thrown value is reduced before it can reach a guest', () => {
  it('every catch that builds an AgentError from the caught value reduces it first', () => {
    expect(catchClausesBuildingFromCaught()).toEqual([])
  })
})

/**
 * Where an error ENTERS GUEST SCOPE it is reduced (`reduceThrown`/`reduceOp`): round 36 reduced
 * at the producer, and a thrown or forged `AgentError` passed straight through (cumulative review
 * 11). So every read of an ERROR's `message` or `op` in `src/vm/**` must be an argument of a
 * reducer, or listed with the reason its value never reaches a guest.
 */
/** `file › function › expression` → [how many such reads, why they never reach a guest]. */
const ERROR_FIELD_READS_ALLOWED: Record<string, [number, string]> = {
  'vm.ts › run › ctx.error?.message': [
    2,
    'host side, after the run: compared against a fixed string to rename the error the host receives',
  ],
  'vm.ts › run › e.message': [
    3,
    "host side: two test whether a thrown error was the deadline, one re-throws the transpiler's own error to the HOST from vm.run (source input, before any run exists); none is bound into guest scope",
  ],
}

/** Unwrap `x as T`, `x!`, `(x)` to the expression they wrap. */
function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isParenthesizedExpression(e) ||
    ts.isTypeAssertionExpression(e)
  )
    e = e.expression
  return e
}

/** An ERROR-valued receiver, by role: names a reader would recognise as an error or its cause. */
function isErrorish(expr: ts.Expression): boolean {
  const t = unwrap(expr).getText()
  return (
    /(^|[.?])(error|err|e|ex|exc|cause|reason|failure|err\d*)$/i.test(t) ||
    /Error$/.test(t)
  )
}

const FIELDS = new Set(['message', 'op'])

/** Raw reads of an error's `message`/`op` in `source`, outside the reducers. */
export function rawErrorFieldReadsIn(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const reduced = (n: ts.Node) => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (
        ts.isCallExpression(p) &&
        ['reduceThrown', 'reduceOp'].includes(p.expression.getText())
      )
        return true
      if (ts.isFunctionLike(p)) return false
    }
    return false
  }
  const record = (n: ts.Node, text: string) => {
    if (!reduced(n)) out.push(`${file} › ${enclosingName(n)} › ${text}`)
  }
  const visit = (n: ts.Node) => {
    // x.message, x?.message, (x as any).message
    if (
      ts.isPropertyAccessExpression(n) &&
      FIELDS.has(n.name.text) &&
      isErrorish(n.expression)
    )
      record(n, n.getText())
    // x['message']
    if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteral(n.argumentExpression) &&
      FIELDS.has(n.argumentExpression.text) &&
      isErrorish(n.expression)
    )
      record(n, n.getText())
    // const { message } = err
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.initializer &&
      isErrorish(n.initializer) &&
      n.name.elements.some((el) =>
        FIELDS.has((el.propertyName ?? el.name).getText())
      )
    )
      record(n, n.getText())
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

function rawErrorFieldReads(): string[] {
  return files(VM).flatMap((file) =>
    rawErrorFieldReadsIn(relative(VM, file), readFileSync(file, 'utf8'))
  )
}

describe('an error is reduced where it enters guest scope', () => {
  const counts = () => {
    const c: Record<string, number> = {}
    for (const r of rawErrorFieldReads()) c[r] = (c[r] ?? 0) + 1
    return c
  }

  it('the apparatus catches every shape it is meant to (a guard that cannot fail is not a guard)', () => {
    const planted = `function f(err, e2) {
      const a = err.message
      const b = (err as any)?.op
      const c = err['message']
      const { message } = err
      const d = reduceThrown(err)
    }`
    expect(rawErrorFieldReadsIn('planted.ts', planted)).toHaveLength(4)
  })

  it('every read of an error message or op is reduced, or listed with why it never reaches a guest', () => {
    const over = Object.entries(counts()).filter(
      ([k, n]) => n > (ERROR_FIELD_READS_ALLOWED[k]?.[0] ?? 0)
    )
    expect(over).toEqual([])
  })

  it('no stale entries (an allowance with no read behind it is slack a regression can occupy)', () => {
    const c = counts()
    const stale = Object.entries(ERROR_FIELD_READS_ALLOWED).filter(
      ([k, [n]]) => c[k] !== n
    )
    expect(stale).toEqual([])
  })
})

describe('the capability boundary is a closed set of crossings', () => {
  const sites = crossingSites()

  it('the apparatus finds the crossings (a parse that found nothing would pass vacuously)', () => {
    expect(sites).toContain('runtime.ts › egressValue')
    expect(sites).toContain('runtime.ts › ingressValue')
  })

  it('every caller of the membrane walk is a listed crossing', () => {
    expect(sites.filter((s) => !(s in CROSSINGS))).toEqual([])
  })

  it('no stale entries', () => {
    expect(Object.keys(CROSSINGS).filter((k) => !sites.includes(k))).toEqual([])
  })
})
