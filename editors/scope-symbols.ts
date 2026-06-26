/**
 * Scope-aware symbol collection for autocomplete.
 *
 * Replaces the regex `const NAME =` scraping (which missed ALL destructuring —
 * and the tosijs examples bind everything via destructuring, so nothing was
 * suggested). This parses the source (acorn, falling back to acorn-loose for
 * mid-edit / not-yet-valid source) and walks binding patterns properly:
 * `const { todoApp } = tosi(...)`, `const { h1, ul } = elements`,
 * `const [a, , b] = xs`, rename, defaults, rest — all yield their bound names.
 *
 * Each symbol also records its **origin** (the initializer expression text, and
 * for object-destructuring the key it came from). That origin is the hook the
 * runtime-introspection layer uses: to introspect `h1` it can evaluate
 * `elements.h1` in the live scope. Names are plumbing; the *types* come from
 * introspecting real values (see the introspection bridge), not from this parse.
 */
import * as acorn from 'acorn'
import * as acornLoose from 'acorn-loose'
import * as walk from 'acorn-walk'

export interface SymbolOrigin {
  /** How the binding was produced. */
  via: 'init' | 'destructure' | 'param' | 'import' | 'function'
  /** Source text of the initializer expression (e.g. `elements`, `tosi({...})`). */
  expr?: string
  /** For object-destructuring: the key on `expr` this name came from (`elements.h1` → `h1`). */
  member?: string
  /** Module specifier, for imports. */
  module?: string
}

export interface ScopeSymbol {
  name: string
  kind: 'variable' | 'function' | 'parameter' | 'import'
  origin?: SymbolOrigin
}

function parse(source: string): any {
  try {
    return acorn.parse(source, { ecmaVersion: 'latest' })
  } catch {
    try {
      // Best-effort AST from incomplete / not-yet-valid source.
      return acornLoose.parse(source, { ecmaVersion: 'latest' })
    } catch {
      return null
    }
  }
}

type NameSink = (name: string, member?: string) => void

/** Walk a binding pattern, emitting each bound name (and, one level deep for
 *  object patterns, the source key it came from). */
function collectPattern(pat: any, onName: NameSink, member?: string): void {
  if (!pat) return
  switch (pat.type) {
    case 'Identifier':
      onName(pat.name, member)
      return
    case 'ObjectPattern':
      for (const p of pat.properties) {
        if (p.type === 'RestElement') {
          collectPattern(p.argument, onName)
        } else {
          const key = p.key && (p.key.name ?? p.key.value)
          collectPattern(
            p.value,
            onName,
            typeof key === 'string' ? key : undefined
          )
        }
      }
      return
    case 'ArrayPattern':
      for (const el of pat.elements) collectPattern(el, onName)
      return
    case 'AssignmentPattern':
      collectPattern(pat.left, onName, member)
      return
    case 'RestElement':
      collectPattern(pat.argument, onName)
      return
  }
}

const inRange = (node: any, position: number) =>
  typeof node.start === 'number' &&
  typeof node.end === 'number' &&
  node.start <= position &&
  position <= node.end

/**
 * Collect the symbols in scope at `position` (defaults to end of source):
 * variable/function/import bindings declared before the cursor, plus the
 * parameters of any function whose body the cursor sits inside. Destructuring
 * is fully handled; results are de-duplicated by name (last declaration wins).
 */
export function collectScopeSymbols(
  source: string,
  position: number = source.length
): ScopeSymbol[] {
  const ast = parse(source)
  if (!ast) return []

  const byName = new Map<string, ScopeSymbol>()
  const add = (s: ScopeSymbol) => byName.set(s.name, s)

  walk.full(ast, (node: any) => {
    switch (node.type) {
      case 'VariableDeclaration': {
        // Only count declarations that appear before the cursor.
        if (node.start >= position) return
        for (const decl of node.declarations) {
          const initText =
            decl.init && typeof decl.init.start === 'number'
              ? source.slice(decl.init.start, decl.init.end)
              : undefined
          collectPattern(decl.id, (name, member) =>
            add({
              name,
              kind: 'variable',
              origin: {
                via: member != null ? 'destructure' : 'init',
                expr: initText,
                member,
              },
            })
          )
        }
        return
      }
      case 'FunctionDeclaration': {
        if (node.id && node.start < position)
          add({
            name: node.id.name,
            kind: 'function',
            origin: { via: 'function' },
          })
        // params only in scope when the cursor is inside the function
        if (inRange(node, position))
          for (const p of node.params)
            collectPattern(p, (name) =>
              add({ name, kind: 'parameter', origin: { via: 'param' } })
            )
        return
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        if (inRange(node, position))
          for (const p of node.params)
            collectPattern(p, (name) =>
              add({ name, kind: 'parameter', origin: { via: 'param' } })
            )
        return
      }
      case 'ImportDeclaration': {
        const module = String(node.source?.value ?? '')
        for (const spec of node.specifiers) {
          // local name is spec.local.name for all specifier kinds
          add({
            name: spec.local.name,
            kind: 'import',
            origin: { via: 'import', module },
          })
        }
        return
      }
    }
  })

  return [...byName.values()]
}
