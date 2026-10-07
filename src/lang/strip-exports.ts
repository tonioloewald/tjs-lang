/**
 * Make an ES module's code runnable as a SCRIPT BODY: drop `export`, keep what it declared.
 *
 * tosijs-ui runs a live example's JavaScript as the body of an async function, where `export`
 * is a syntax error, so every example written as a module ("a library you would publish")
 * failed with "Unexpected token 'export'". The old playground ran them because it removed the
 * keyword; tjs-lang's test runner does too (`stripModuleSyntax`), by regex over lines.
 *
 * This one PARSES. A regex anchored at line starts also rewrites a line of a template literal
 * that happens to begin with `export ` — the literal-blindness class this repo pins in
 * `src/lang/literal-blindness.test.ts`. Imports are not touched: by the time a dialect's
 * transform runs, tosijs-ui has already rewritten them against the example's context.
 */
import { parse } from 'acorn'

const PARSE = {
  ecmaVersion: 'latest' as const,
  sourceType: 'module' as const,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
}

type Edit = [start: number, end: number, text: string]

/** The edits that drop `export` while keeping what it declared. */
function exportEdits(program: any): Edit[] {
  const edits: Edit[] = []
  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) edits.push([node.start, node.declaration.start, ''])
      else edits.push([node.start, node.end, '']) // `export { a, b }` / re-exports
    } else if (node.type === 'ExportAllDeclaration') {
      edits.push([node.start, node.end, ''])
    } else if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      const named =
        (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') &&
        d.id
      // A named declaration keeps its name; anything else becomes a binding, so an anonymous
      // `export default function () {}` stays a valid statement.
      edits.push([
        node.start,
        d.start,
        named ? '' : 'const __default_export = ',
      ])
    }
  }
  return edits
}

function applyEdits(code: string, edits: Edit[]): string {
  let out = code
  for (const [start, end, text] of [...edits].sort((a, b) => b[0] - a[0]))
    out = out.slice(0, start) + text + out.slice(end)
  return out
}

export function stripExports(code: string): string {
  let program: any
  try {
    program = parse(code, PARSE)
  } catch {
    // Not parseable as a module: leave it, and let the run report the real error.
    return code
  }
  return applyEdits(code, exportEdits(program))
}

/** Does `node` contain an `await` that is not inside a nested function? */
function hasTopLevelAwait(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(hasTopLevelAwait)
  if (node.type === 'AwaitExpression') return true
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
    return false
  return Object.keys(node).some(
    (k) => typeof node[k] === 'object' && hasTopLevelAwait(node[k])
  )
}

/**
 * A module's code as a SYNCHRONOUS script body, for running its tests with `new Function`:
 * imports removed, `export` dropped (as `stripExports`), and a top-level statement that
 * `await`s replaced by a comment, as the line-regex version did. Line count is preserved.
 *
 * Returns `null` when the code does not parse as a module; the caller then falls back to the
 * old line regexes. Those matched only at column 0, so an indented `export` survived and every
 * inline test of an indented source went silently inconclusive (pre-tag review M1); they also
 * rewrote a template-literal line beginning with `export ` (m4).
 */
export function stripModuleSyntaxParsed(code: string): string | null {
  let program: any
  try {
    program = parse(code, PARSE)
  } catch {
    return null
  }
  const keepLines = (start: number, end: number, text: string): Edit => [
    start,
    end,
    text + '\n'.repeat(code.slice(start, end).split('\n').length - 1),
  ]
  const edits: Edit[] = exportEdits(program)
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration')
      edits.push(keepLines(node.start, node.end, ''))
    else {
      const stmt =
        (node.type === 'ExportNamedDeclaration' ||
          node.type === 'ExportDefaultDeclaration') &&
        node.declaration
          ? node.declaration
          : node
      if (
        (stmt.type === 'ExpressionStatement' ||
          stmt.type === 'VariableDeclaration') &&
        hasTopLevelAwait(stmt)
      )
        edits.push(
          keepLines(
            node.start,
            node.end,
            '/* top-level await removed for test execution */'
          )
        )
    }
  }
  // An await statement under `export` gets two edits; the whole-statement one wins.
  const byStart = edits.filter(
    (e) =>
      !edits.some(
        (o) =>
          o !== e &&
          o[0] <= e[0] &&
          o[1] >= e[1] &&
          (o[0] < e[0] || o[1] > e[1])
      )
  )
  return applyEdits(code, byStart)
}
