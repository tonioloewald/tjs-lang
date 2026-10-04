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
