/**
 * Evaluate a TJS example value by PARSING it, never by executing it.
 *
 * TJS example values are data — `0`, `''`, `{ a: 0, b = 1 }`, `[null]`. The emitters needed
 * them as runtime values and reached for the shortest way to get one:
 *
 *     const parsed = new Function(`return ${transformed}`)()
 *
 * which executes the annotation with full ambient authority, at transpile time, on the main
 * `tjs()` path. Eight sites did this. A `.tjs` file only has to carry a return type containing
 * `=`:
 *
 *     function f(a: 0): { x = (globalThis.PWNED = 1) } { return { x: a } }
 *
 * `tjs check` on that file runs it. So did `tjs emit`, the bun `.tjs` plugin, the module
 * loader and the playground — anything that transpiles source it did not write. Found by the
 * 0.13.8 re-review, and distinct from the `test`-block escape fixed in 0.13.7: that one was
 * reachable from the VM path and is gated on `vmTarget`; this one is the ordinary TJS path
 * and the gate does not touch it.
 *
 * ## The rule
 *
 * An example is a LITERAL. Anything that can compute is not an example, and the difference is
 * decidable by looking at the AST — acorn is already a dependency of both emitters that
 * needed this. No allowlist of dangerous names, no sanitising of the source text: the node
 * types below are the entire accepted grammar, and everything else is rejected without being
 * evaluated.
 *
 * Returns `{ ok: false }` rather than throwing, because every caller already had a `catch`
 * that skipped the value — an example we cannot read is not a reason to fail a transpile, and
 * making it one would turn a hardening change into a breaking one.
 */
import { parseExpressionAt } from 'acorn'

export type LiteralResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string }

/** Bare identifiers that denote values rather than bindings. */
const VALUE_IDENTIFIERS: Record<string, unknown> = {
  undefined: undefined,
  NaN: NaN,
  Infinity: Infinity,
}

function evaluateNode(
  node: any
): { ok: true; value: unknown } | { ok: false; reason: string } {
  switch (node?.type) {
    case 'Literal':
      // Covers strings, numbers, booleans, null — and regex, which acorn gives a `regex`
      // property. A RegExp is a legitimate TJS example (`s: /^\d+$/`), and constructing one
      // from an already-parsed pattern executes nothing.
      if (node.regex) {
        try {
          return {
            ok: true,
            value: new RegExp(node.regex.pattern, node.regex.flags),
          }
        } catch {
          return { ok: false, reason: 'invalid regex literal' }
        }
      }
      return { ok: true, value: node.value }

    case 'Identifier': {
      if (node.name in VALUE_IDENTIFIERS)
        return { ok: true, value: VALUE_IDENTIFIERS[node.name] }
      return {
        ok: false,
        reason: `identifier \`${node.name}\` is not a literal`,
      }
    }

    case 'UnaryExpression': {
      // `-1`, `+0` — the numeric-narrowing spellings TJS relies on. `!`, `typeof`, `void`
      // and `delete` are deliberately absent: they are operations, not notation.
      if (node.operator !== '-' && node.operator !== '+')
        return {
          ok: false,
          reason: `unary \`${node.operator}\` is not a literal`,
        }
      const inner = evaluateNode(node.argument)
      if (!inner.ok) return inner
      if (typeof inner.value !== 'number')
        return { ok: false, reason: 'unary sign on a non-number' }
      return {
        ok: true,
        value: node.operator === '-' ? -inner.value : inner.value,
      }
    }

    case 'ArrayExpression': {
      const out: unknown[] = []
      for (const el of node.elements) {
        if (el === null) {
          out.push(undefined) // a hole
          continue
        }
        const r = evaluateNode(el)
        if (!r.ok) return r
        out.push(r.value)
      }
      return { ok: true, value: out }
    }

    case 'ObjectExpression': {
      const out: Record<string, unknown> = {}
      for (const prop of node.properties) {
        // No spread, no getters, no computed keys, no shorthand methods — each is either a
        // read of something outside the literal or a place to hide a call.
        if (prop.type !== 'Property' || prop.kind !== 'init' || prop.computed)
          return { ok: false, reason: 'only plain properties are allowed' }
        if (
          prop.value?.type === 'FunctionExpression' ||
          prop.value?.type === 'ArrowFunctionExpression'
        )
          return { ok: false, reason: 'a function is not a literal' }
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : String(prop.key.value)
        const r = evaluateNode(prop.value)
        if (!r.ok) return r
        out[key] = r.value
      }
      return { ok: true, value: out }
    }

    case 'TemplateLiteral': {
      // Only a template with no interpolations — `${…}` is an expression.
      if (node.expressions.length > 0)
        return { ok: false, reason: 'template interpolation is not a literal' }
      return {
        ok: true,
        value: node.quasis.map((q: any) => q.value.cooked).join(''),
      }
    }

    default:
      return {
        ok: false,
        reason: `\`${node?.type ?? 'unknown'}\` is not a literal`,
      }
  }
}

/**
 * Parse `text` as a TJS example value.
 *
 * Never executes the input. A value that is not expressible as a literal is refused, which is
 * the same outcome the callers' existing `catch` blocks already handled.
 */
export function parseLiteralValue(text: string): LiteralResult {
  let node: any
  try {
    node = parseExpressionAt(text.trim(), 0, {
      ecmaVersion: 2022,
      sourceType: 'module',
    })
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'parse failed' }
  }
  return evaluateNode(node)
}
