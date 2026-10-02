/**
 * The regex surface is a CLOSED set of doors, pinned by parsing (rc.2 eleventh re-review plan).
 *
 * Four review rounds in a row found one more way to compile or run a pattern outside the meters:
 * a literal, a string pattern to a method, a predicate, transpile time, verify time, a helper
 * context. Patching each door did not converge, so the doors are now a list this test enforces:
 *
 * - `compileRegex` is called only from the sites below, each passing its meters.
 * - Nothing in the guest or predicate surface (`src/vm/**`, `src/lang/predicate*.ts`) constructs a
 *   host `RegExp` (which would compile on the host's unmetered engine).
 *
 * Adding a door means adding it HERE, with the reason it is metered. Parsed with TypeScript's
 * parser, so a call inside a string or comment cannot satisfy or fool it.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import ts from 'typescript'

const SRC = join(import.meta.dir, '..')

/** Every metered caller of `compileRegex`: file, enclosing function, and the arguments it must pass. */
const COMPILE_SITES: Record<string, { args: number; why: string }> = {
  'vm/regex.ts › compile': {
    args: 3,
    why: 'RegexCompiler: the per-source work budget, which also counts every byte allocated',
  },
  'vm/string-methods.ts › prepare': {
    args: 4,
    why: "a string pattern compiled for one operation: the run's fuel and heap",
  },
  'vm/runtime.ts › evaluateExpr': {
    args: 4,
    why: "a regex literal evaluated in a run: the run's fuel and heap",
  },
}

/** The guest and predicate surface: no host RegExp may be constructed here. */
const NO_HOST_REGEXP = (file: string) =>
  file.startsWith('vm/') || /^lang\/predicate[^/]*\.ts$/.test(file)

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* sources(p)
    else if (
      p.endsWith('.ts') &&
      !p.endsWith('.test.ts') &&
      !p.endsWith('.d.ts')
    )
      yield p
  }
}

function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (
      (ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n) ||
        ts.isFunctionExpression(n)) &&
      n.name
    )
      return n.name.getText()
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isVariableDeclaration(n.parent)
    )
      return n.parent.name.getText()
  }
  return '<module>'
}

interface Found {
  compiles: Array<{ site: string; args: number }>
  hostRegExp: string[]
}

function scan(): Found {
  const found: Found = { compiles: [], hostRegExp: [] }
  for (const path of sources(SRC)) {
    const file = relative(SRC, path)
    const sf = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        if (n.expression.text === 'compileRegex')
          found.compiles.push({
            site: `${file} › ${enclosingName(n)}`,
            args: n.arguments.length,
          })
        if (n.expression.text === 'RegExp' && NO_HOST_REGEXP(file))
          found.hostRegExp.push(
            `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
          )
      }
      if (
        ts.isNewExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'RegExp' &&
        NO_HOST_REGEXP(file)
      )
        found.hostRegExp.push(
          `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
        )
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return found
}

describe('the regex doors are closed and listed', () => {
  const found = scan()

  it('apparatus: the scan sees the known sites', () => {
    expect(found.compiles.length).toBeGreaterThanOrEqual(3)
  })

  it('compileRegex is called only from the listed sites, each passing its meters', () => {
    const wrong = found.compiles.filter(
      (c) => !(c.site in COMPILE_SITES) || COMPILE_SITES[c.site].args !== c.args
    )
    expect(wrong).toEqual([])
  })

  it('no listed site is stale', () => {
    const seen = new Set(found.compiles.map((c) => c.site))
    expect(Object.keys(COMPILE_SITES).filter((s) => !seen.has(s))).toEqual([])
  })

  it('no host RegExp is constructed in the guest or predicate surface', () => {
    expect(found.hostRegExp).toEqual([])
  })
})
