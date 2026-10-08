/**
 * Boolean coercion rewriter.
 *
 * Fixes the JS footgun `Boolean(new Boolean(false)) === true` (and friends)
 * by rewriting every truthiness context to call `__tjs.toBool(x)`, which
 * unwraps boxed primitives before coercing.
 *
 * Contexts rewritten:
 *   if (cond)           → if (__tjs.toBool(cond))
 *   while (cond)        → while (__tjs.toBool(cond))
 *   do {} while (cond)  → do {} while (__tjs.toBool(cond))
 *   for (_; cond; _)    → for (_; __tjs.toBool(cond); _)
 *   !x                  → !__tjs.toBool(x)
 *   a && b              → ((__tjs__t)=>__tjs.toBool(__tjs__t)?(b):__tjs__t)(a)
 *   a || b              → ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(b))(a)
 *   a ? b : c           → __tjs.toBool(a)?(b):(c)
 *   Boolean(x)          → __tjs.toBool(x)        (call form, not `new`)
 *
 * `??` (nullish coalescing) is intentionally NOT rewritten — its semantics
 * are about null/undefined specifically, not truthiness, so boxed primitives
 * behave correctly already.
 *
 * `===` / `!==` (identity) are also not touched — that's a separate
 * footgun handled by the `Is` / `Eq` operators under TjsEquals.
 *
 * Always-on under TjsStandard.
 */

import * as acorn from 'acorn'
import type { Program, Node } from 'acorn'

export interface BoolCoercionPatch {
  start: number
  end: number
  newText: string
}

/**
 * Which rewrites to apply. Both default ON (native TJS).
 *
 * `equality` is the `==`/`!=` → `Eq`/`NotEq` rewrite. It lives HERE, on the AST, rather than
 * as a text pass in `preprocess`, because a text pass has to re-derive JavaScript's operator
 * precedence by scanning, and it did not: `await f() == 3` compared the Promise,
 * `(a == b) == (b == c)` emitted garbage, `a == b == c` did not parse, `a & b == c` grouped as
 * `Eq(a & b, c)`. Here acorn has already grouped every operand, and the two rewrites compose
 * through the same partial codegen (`if (a == b)` → `__tjs.toBool(Eq(a, b))`).
 */
export interface RewriteOptions {
  /** Truthiness contexts → `__tjs.toBool` (TjsStandard). */
  bool?: boolean
  /** `==`/`!=` → the given callee names (TjsEquals). Omit to leave equality alone. */
  equality?: { eq: string; notEq: string }
}

/**
 * Walk the AST and emit replacement patches for every truthiness context.
 * Patches are pre-deduped: nested coercions inside an outer patch are
 * folded into the outer patch's newText, so returned patches don't overlap.
 */
export function rewriteBoolCoercion(
  ast: Program,
  source: string,
  opts: RewriteOptions = { bool: true }
): BoolCoercionPatch[] {
  const candidates: BoolCoercionPatch[] = []
  const bool = opts.bool !== false

  function emitTestWrap(test: Node): void {
    candidates.push({
      start: test.start,
      end: test.end,
      newText: `__tjs.toBool(${rewriteExpr(test, source, opts)})`,
    })
  }

  function visit(node: Node): void {
    if (!node || typeof node !== 'object' || !('type' in node)) return

    if (
      opts.equality &&
      (node as any).type === 'BinaryExpression' &&
      ((node as any).operator === '==' || (node as any).operator === '!=')
    ) {
      candidates.push({
        start: (node as any).start,
        end: (node as any).end,
        newText: rewriteExpr(node, source, opts),
      })
      return
    }
    if (!bool) {
      walkChildren(node, visit)
      return
    }

    switch ((node as any).type) {
      case 'IfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        const n = node as any
        emitTestWrap(n.test)
        // Visit the body / consequent / alternate normally
        if (n.consequent) visit(n.consequent)
        if (n.alternate) visit(n.alternate)
        if (n.body) visit(n.body)
        return
      }
      case 'ForStatement': {
        const n = node as any
        if (n.init) visit(n.init)
        if (n.test) emitTestWrap(n.test)
        if (n.update) visit(n.update)
        if (n.body) visit(n.body)
        return
      }
      case 'ConditionalExpression': {
        const n = node as any
        candidates.push({
          start: n.start,
          end: n.end,
          newText:
            `__tjs.toBool(${rewriteExpr(n.test, source, opts)})` +
            `?(${rewriteExpr(n.consequent, source, opts)})` +
            `:(${rewriteExpr(n.alternate, source, opts)})`,
        })
        return
      }
      case 'LogicalExpression': {
        const n = node as any
        if (n.operator === '&&' || n.operator === '||') {
          candidates.push({
            start: n.start,
            end: n.end,
            newText: rewriteExpr(node, source, opts),
          })
          return
        }
        // ?? unchanged — descend in case nested coercions live in the operands
        break
      }
      case 'UnaryExpression': {
        const n = node as any
        if (n.operator === '!') {
          candidates.push({
            start: n.start,
            end: n.end,
            newText: `!__tjs.toBool(${rewriteExpr(n.argument, source, opts)})`,
          })
          return
        }
        break
      }
      case 'CallExpression': {
        const n = node as any
        if (
          n.callee &&
          n.callee.type === 'Identifier' &&
          n.callee.name === 'Boolean' &&
          n.arguments.length === 1 &&
          n.arguments[0].type !== 'SpreadElement'
        ) {
          // Boolean(x) → __tjs.toBool(x). Rare in practice but eliminates
          // the inconsistency with the rewritten `if (x)` cases.
          candidates.push({
            start: n.start,
            end: n.end,
            newText: `__tjs.toBool(${rewriteExpr(
              n.arguments[0],
              source,
              opts
            )})`,
          })
          return
        }
        break
      }
    }

    // Default: walk children
    walkChildren(node, visit)
  }

  visit(ast)

  return dedupeNested(candidates)
}

/**
 * Recursive partial codegen: returns the rewritten source for an expression
 * subtree. For uninteresting nodes, returns the original source slice with
 * any nested coercions rewritten in place.
 */
function rewriteExpr(
  node: Node | null | undefined,
  source: string,
  opts: RewriteOptions
): string {
  if (!node) return ''
  const n0 = node as any
  if (
    opts.equality &&
    n0.type === 'BinaryExpression' &&
    (n0.operator === '==' || n0.operator === '!=')
  ) {
    const callee = n0.operator === '==' ? opts.equality.eq : opts.equality.notEq
    return `${callee}(${rewriteExpr(n0.left, source, opts)}, ${rewriteExpr(
      n0.right,
      source,
      opts
    )})`
  }
  if (opts.bool === false) return rewriteOther(node, source, opts)
  switch ((node as any).type) {
    case 'LogicalExpression': {
      const n = node as any
      const left = rewriteExpr(n.left, source, opts)
      const right = rewriteExpr(n.right, source, opts)
      if (n.operator === '&&') {
        return `((__tjs__t)=>__tjs.toBool(__tjs__t)?(${right}):__tjs__t)(${left})`
      }
      if (n.operator === '||') {
        return `((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(${right}))(${left})`
      }
      // ??
      return `(${left})??(${right})`
    }
    case 'ConditionalExpression': {
      const n = node as any
      return (
        `__tjs.toBool(${rewriteExpr(n.test, source, opts)})` +
        `?(${rewriteExpr(n.consequent, source, opts)})` +
        `:(${rewriteExpr(n.alternate, source, opts)})`
      )
    }
    case 'UnaryExpression': {
      const n = node as any
      if (n.operator === '!') {
        return `!__tjs.toBool(${rewriteExpr(n.argument, source, opts)})`
      }
      return rewriteOther(node, source, opts)
    }
    case 'CallExpression': {
      const n = node as any
      if (
        n.callee &&
        n.callee.type === 'Identifier' &&
        n.callee.name === 'Boolean' &&
        n.arguments.length === 1 &&
        n.arguments[0].type !== 'SpreadElement'
      ) {
        return `__tjs.toBool(${rewriteExpr(n.arguments[0], source, opts)})`
      }
      return rewriteOther(node, source, opts)
    }
  }
  return rewriteOther(node, source, opts)
}

/**
 * Generic structural recursion: walk all child nodes in source order, splice
 * rewritten children into the original source between gaps. This preserves
 * arbitrary syntax (template literals, destructuring, JSX, etc.) without
 * needing a full code generator — we only customize the nodes we actually
 * rewrite.
 */
function rewriteOther(
  node: Node,
  source: string,
  opts: RewriteOptions
): string {
  const start = (node as any).start
  const end = (node as any).end
  if (typeof start !== 'number' || typeof end !== 'number') return ''

  const children = collectChildren(node)
  if (children.length === 0) return source.slice(start, end)

  // Sort by start position (defensive — should already be in order)
  children.sort((a, b) => a.start - b.start)

  let out = ''
  let cursor = start
  for (const child of children) {
    if (child.start < cursor) continue // overlapping; skip
    if (child.start > cursor) out += source.slice(cursor, child.start)
    out += rewriteExpr(child, source, opts)
    cursor = child.end
  }
  if (cursor < end) out += source.slice(cursor, end)
  return out
}

/** Iterate the children of `cb` for any node, generic shape. */
function walkChildren(node: Node, cb: (n: Node) => void): void {
  for (const child of collectChildren(node)) cb(child)
}

function collectChildren(node: Node): Node[] {
  const out: Node[] = []
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
      continue
    }
    const v = (node as any)[key]
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object' && typeof item.type === 'string') {
          out.push(item)
        }
      }
    } else if (v && typeof v === 'object' && typeof v.type === 'string') {
      out.push(v)
    }
  }
  return out
}

/**
 * Drop patches whose range is fully contained in another patch's range.
 * The outer patch's newText already includes the inner rewrites via the
 * recursive partial codegen, so the inner patch is redundant.
 *
 * Equal-range patches: keep the first one encountered (insertion order
 * mirrors AST traversal order, where the parent is visited first).
 */
function dedupeNested(patches: BoolCoercionPatch[]): BoolCoercionPatch[] {
  // Sort by start asc, end desc (outermost first for equal starts)
  const sorted = [...patches].sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: BoolCoercionPatch[] = []
  let lastEnd = -1
  for (const p of sorted) {
    if (p.start >= lastEnd) {
      kept.push(p)
      lastEnd = p.end
    }
    // else: contained inside the last kept patch — drop
  }
  return kept
}

/**
 * Source-text wrapper: parse, rewrite, re-emit. Used for code that's
 * extracted before the main parse (test/mock bodies) but still needs the
 * coercion rewrite to behave consistently with the rest of the module.
 *
 * Wraps the body in a function so top-level statements like `expect(...)`
 * parse as a Program. Returns the original source unchanged if parsing
 * fails (rather than throwing — a bad test body would already have been
 * caught by the main parse).
 */
export function rewriteBoolCoercionInSource(
  source: string,
  opts: RewriteOptions = { bool: true }
): string {
  // ASYNC, so a body that awaits parses (a sync wrapper rejected it and the body was returned
  // UNREWRITTEN: no truthiness rewrite, and now that `==` is rewritten here, no `Eq` either). The closing brace on its own line, so a body
  // ending in a `//` comment cannot swallow it.
  const prefix = 'async function __wrap__(){'
  const suffix = '\n}'
  const wrapped = `${prefix}${source}${suffix}`
  let ast: Program
  try {
    ast = acorn.parse(wrapped, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: false,
    }) as Program
  } catch {
    return source
  }
  const patches = rewriteBoolCoercion(ast, wrapped, opts)
  if (patches.length === 0) return source

  // Apply patches right-to-left
  patches.sort((a, b) => b.start - a.start)
  let out = wrapped
  for (const p of patches) {
    out = out.slice(0, p.start) + p.newText + out.slice(p.end)
  }
  return out.slice(prefix.length, out.length - suffix.length)
}
