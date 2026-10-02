/**
 * The regex surface is a CLOSED set of doors, pinned two ways: statically by parsing, and
 * behaviourally by running a corpus of guest attacks with the host's regex entry points
 * instrumented (rc.2 eleventh and twelfth re-reviews).
 *
 * What the static half can see: direct calls in OUR source. What it cannot see, and why the
 * behavioural half exists: a library that compiles a pattern internally (tosijs-schema's
 * `pattern`), and routes that are not calls in our source at all. The behavioural half is the
 * claim; the static half keeps the list honest.
 *
 * (Original header follows.)
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
  'vm/runtime.ts › evaluateCallable': {
    args: 4,
    why: "a regex literal evaluated in a run: the run's fuel and heap",
  },
}

/** Every schema validation in the VM, and how its schema is admitted. tosijs-schema compiles a
 * schema's `pattern` on the host's engine, so a guest schema must pass `admitGuestSchema` first. */
const SCHEMA_SITES: Record<string, string> = {
  'vm/vm.ts › run › validate':
    "the AST's inputSchema: admitGuestSchema at admission, before validate",
  'vm/runtime.ts › filter › schemaFilter':
    "the `filter` builtin: its schema argument is typed 'schema', admitted by checkArgs",
  'vm/runtime.ts › vmSchemaMethod › validate':
    'Schema.isValid (VM-implemented): validates the ADMITTED plain copy, validation charged first',
  'vm/runtime.ts › exec › validate':
    "an atom's outputSchema: defined by the HOST with the atom, never by guest code",
  'vm/runtime.ts › ret › schemaFilter':
    "the return step's schema: admitGuestSchema before schemaFilter",
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
      (ts.isVariableDeclaration(n.parent) || ts.isPropertyAssignment(n.parent))
    )
      return n.parent.name.getText()
    // an atom body: `const ret = defineAtom(…, async (…) => {…})`
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isCallExpression(n.parent) &&
      ts.isVariableDeclaration(n.parent.parent)
    )
      return n.parent.parent.name.getText()
  }
  return '<module>'
}

interface Found {
  compiles: Array<{ site: string; args: number }>
  hostRegExp: string[]
  schemaCalls: string[]
}

function scan(): Found {
  const found: Found = { compiles: [], hostRegExp: [], schemaCalls: [] }
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
        if (
          file.startsWith('vm/') &&
          (n.expression.text === 'validate' ||
            n.expression.text === 'schemaFilter')
        )
          found.schemaCalls.push(
            `${file} › ${enclosingName(n)} › ${n.expression.text}`
          )
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

  it('every schema validation in the VM is listed, with how its schema is admitted', () => {
    const listed = new Set(
      Object.keys(SCHEMA_SITES).map((k) => k.replace(/ \(.*\)$/, ''))
    )
    expect(found.schemaCalls.filter((c) => !listed.has(c))).toEqual([])
  })

  it('no host RegExp is constructed in the guest or predicate surface', () => {
    expect(found.hostRegExp).toEqual([])
  })
})
