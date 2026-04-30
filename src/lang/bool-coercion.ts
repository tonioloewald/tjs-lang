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

import type { Program, Node } from 'acorn'

export interface BoolCoercionPatch {
  start: number
  end: number
  newText: string
}

/**
 * Walk the AST and emit replacement patches for every truthiness context.
 * Patches are pre-deduped: nested coercions inside an outer patch are
 * folded into the outer patch's newText, so returned patches don't overlap.
 */
export function rewriteBoolCoercion(
  ast: Program,
  source: string
): BoolCoercionPatch[] {
  const candidates: BoolCoercionPatch[] = []

  function emitTestWrap(test: Node): void {
    candidates.push({
      start: test.start,
      end: test.end,
      newText: `__tjs.toBool(${rewriteExpr(test, source)})`,
    })
  }

  function visit(node: Node): void {
    if (!node || typeof node !== 'object' || !('type' in node)) return

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
            `__tjs.toBool(${rewriteExpr(n.test, source)})` +
            `?(${rewriteExpr(n.consequent, source)})` +
            `:(${rewriteExpr(n.alternate, source)})`,
        })
        return
      }
      case 'LogicalExpression': {
        const n = node as any
        if (n.operator === '&&' || n.operator === '||') {
          candidates.push({
            start: n.start,
            end: n.end,
            newText: rewriteExpr(node, source),
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
            newText: `!__tjs.toBool(${rewriteExpr(n.argument, source)})`,
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
            newText: `__tjs.toBool(${rewriteExpr(n.arguments[0], source)})`,
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
function rewriteExpr(node: Node | null | undefined, source: string): string {
  if (!node) return ''
  switch ((node as any).type) {
    case 'LogicalExpression': {
      const n = node as any
      const left = rewriteExpr(n.left, source)
      const right = rewriteExpr(n.right, source)
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
        `__tjs.toBool(${rewriteExpr(n.test, source)})` +
        `?(${rewriteExpr(n.consequent, source)})` +
        `:(${rewriteExpr(n.alternate, source)})`
      )
    }
    case 'UnaryExpression': {
      const n = node as any
      if (n.operator === '!') {
        return `!__tjs.toBool(${rewriteExpr(n.argument, source)})`
      }
      return rewriteOther(node, source)
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
        return `__tjs.toBool(${rewriteExpr(n.arguments[0], source)})`
      }
      return rewriteOther(node, source)
    }
  }
  return rewriteOther(node, source)
}

/**
 * Generic structural recursion: walk all child nodes in source order, splice
 * rewritten children into the original source between gaps. This preserves
 * arbitrary syntax (template literals, destructuring, JSX, etc.) without
 * needing a full code generator — we only customize the nodes we actually
 * rewrite.
 */
function rewriteOther(node: Node, source: string): string {
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
    out += rewriteExpr(child, source)
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
