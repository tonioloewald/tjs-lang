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

export function stripExports(code: string): string {
  let program: any
  try {
    program = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    })
  } catch {
    // Not parseable as a module: leave it, and let the run report the real error.
    return code
  }
  const edits: Array<[start: number, end: number, text: string]> = []
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
  let out = code
  for (const [start, end, text] of edits.reverse())
    out = out.slice(0, start) + text + out.slice(end)
  return out
}
