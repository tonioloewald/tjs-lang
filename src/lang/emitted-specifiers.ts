/**
 * Relative `.tjs` specifiers in EMITTED files (tosijs-native finding 5, #2749).
 *
 * `tjs emit` writes `x.js` beside `x.d.ts` for every `x.tjs`, but left the imports pointing
 * at `./x.tjs`, so the emitted JavaScript loaded only where a `.tjs` loader was installed,
 * and the `.d.ts` named files TypeScript cannot resolve. The emitted files name each other
 * by what was emitted: `./x.js`, which TypeScript also maps to `x.d.ts`, and an explicit
 * extension is what `moduleResolution: nodenext` requires.
 *
 * Only RELATIVE specifiers change (a package name is not ours to rename), and they are found
 * by parsing, so a specifier-shaped string or comment is never touched. The library's
 * `tjs()` does not do this: its output runs where `.tjs` sources do (the Bun plugin).
 */
import { parse } from 'acorn'
import * as walk from 'acorn-walk'

/** `./x.tjs` -> `./x.js`; anything else unchanged. */
export function emittedSpecifier(spec: string): string {
  return /^\.{1,2}\//.test(spec) ? spec.replace(/\.tjs$/, '.js') : spec
}

/** `code` with every relative `.tjs` import, re-export and `import('…')` naming `.js`. */
export function rewriteTjsSpecifiers(code: string): string {
  let ast: any
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
  } catch {
    return code // not a module we can read: leave it exactly as it was
  }
  const edits: Array<{ start: number; end: number; text: string }> = []
  const visit = (lit: any) => {
    if (!lit || lit.type !== 'Literal' || typeof lit.value !== 'string') return
    const next = emittedSpecifier(lit.value)
    if (next === lit.value) return
    const quote = code[lit.start]
    edits.push({
      start: lit.start,
      end: lit.end,
      text: `${quote}${next}${quote}`,
    })
  }
  walk.full(ast, (node: any) => {
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
    )
      visit(node.source)
    else if (node.type === 'ImportExpression') visit(node.source)
  })
  edits.sort((a, b) => b.start - a.start)
  let out = code
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}
