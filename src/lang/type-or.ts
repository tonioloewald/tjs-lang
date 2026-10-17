/**
 * `||` in a TYPE is an error: a union is spelled `|` (#3148).
 *
 * Three docs taught `x: '' || null` as "string or null". It never meant that: an example's
 * `||` is JavaScript's OR, so inference read the left side, the type was `string`, and the
 * function REJECTED null, the one value the annotation was written to allow. The decision
 * (Tonio, 2026-10-10) was one spelling, not an alias: a type position holding `||` fails at
 * compile time and names `|`.
 *
 * Type positions are where TJS reads an example as a type (TJS-SYNTAX.md): the annotation
 * itself, object member values, array elements and union members. Anywhere else an `||` is
 * a value (a real default, `x = a || b`, stays JavaScript), so the walk stops at anything
 * that is not one of those shapes.
 */
import type { Node } from 'acorn'

/** The first `||` in a type position of `node`, or undefined. */
export function orInType(node: Node | null | undefined): Node | undefined {
  const n = node as any
  if (!n) return undefined
  switch (n.type) {
    case 'LogicalExpression':
      return n.operator === '||' ? n : undefined
    case 'BinaryExpression':
      return n.operator === '|'
        ? orInType(n.left) ?? orInType(n.right)
        : undefined
    case 'ObjectExpression':
      for (const p of n.properties)
        if (p.type === 'Property') {
          const hit = orInType(p.value)
          if (hit) return hit
        }
      return undefined
    case 'ArrayExpression':
      for (const e of n.elements) {
        const hit = orInType(e)
        if (hit) return hit
      }
      return undefined
    case 'ParenthesizedExpression':
      return orInType(n.expression)
  }
  return undefined
}

/** The message, naming the corrected spelling of the offending text. */
export function orInTypeMessage(text: string): string {
  const fixed = text.replace(/\s*\|\|\s*/g, ' | ')
  return (
    `\`||\` is not a union in a type: \`${text}\` reads as JavaScript OR, so its type is ` +
    `only the left side. Write \`${fixed}\` (one bar).`
  )
}

/**
 * The source text of a type example, printed from its node.
 *
 * For a caller whose node offsets are into a REWRITTEN source (the AJS emitter receives the
 * original, while acorn parsed `x = ''` where the author wrote `x: ''`), slicing quoted the
 * wrong characters (`' || null)`). Type examples are a small grammar, so printing is exact.
 */
export function typeText(node: Node | null | undefined): string {
  const n = node as any
  if (!n) return ''
  switch (n.type) {
    case 'Literal':
      return n.raw ?? JSON.stringify(n.value)
    case 'Identifier':
      return n.name
    case 'LogicalExpression':
    case 'BinaryExpression':
      return `${typeText(n.left)} ${n.operator} ${typeText(n.right)}`
    case 'UnaryExpression':
      return `${n.operator}${typeText(n.argument)}`
    case 'ParenthesizedExpression':
      return `(${typeText(n.expression)})`
    case 'ArrayExpression':
      return `[${n.elements.map((e: any) => typeText(e)).join(', ')}]`
    case 'ObjectExpression':
      return `{ ${n.properties
        .map((p: any) =>
          p.type === 'Property'
            ? `${
                p.key.type === 'Identifier' ? p.key.name : typeText(p.key)
              }: ${typeText(p.value)}`
            : '…'
        )
        .join(', ')} }`
  }
  return '…'
}
