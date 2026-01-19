/**
 * Type inference from value patterns
 *
 * Extracts types from example values:
 *   'string' -> { kind: 'string' }
 *   10 -> { kind: 'number' }
 *   ['string'] -> { kind: 'array', items: { kind: 'string' } }
 *   { name: 'string' } -> { kind: 'object', shape: { name: { kind: 'string' } } }
 *   'string' || null -> { kind: 'string', nullable: true }
 *   'string' || 0 -> { kind: 'union', members: [{ kind: 'string' }, { kind: 'number' }] }
 */

import { parseExpressionAt } from 'acorn'
import type { Expression, Pattern } from 'acorn'
import type { TypeDescriptor, ParameterDescriptor } from './types'
import { getLocation, TranspileError } from './types'

/**
 * Infer type from a value expression (example value)
 */
export function inferTypeFromValue(node: Expression): TypeDescriptor {
  switch (node.type) {
    case 'Literal': {
      const value = (node as any).value
      if (value === null) {
        return { kind: 'null' }
      }
      if (typeof value === 'string') {
        return { kind: 'string' }
      }
      if (typeof value === 'number') {
        return { kind: 'number' }
      }
      if (typeof value === 'boolean') {
        return { kind: 'boolean' }
      }
      return { kind: 'any' }
    }

    case 'ArrayExpression': {
      const elements = (node as any).elements as Expression[]
      if (elements.length === 0) {
        return { kind: 'array', items: { kind: 'any' } }
      }
      // Use first element as the item type
      const itemType = inferTypeFromValue(elements[0])
      return { kind: 'array', items: itemType }
    }

    case 'ObjectExpression': {
      const properties = (node as any).properties as any[]
      const shape: Record<string, TypeDescriptor> = {}

      for (const prop of properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier') {
          const key = prop.key.name
          shape[key] = inferTypeFromValue(prop.value)
        }
      }

      return { kind: 'object', shape }
    }

    case 'LogicalExpression': {
      const { operator, left, right } = node as any

      if (operator === '||') {
        const leftType = inferTypeFromValue(left)
        const rightType = inferTypeFromValue(right)

        // type || null means nullable type
        if (rightType.kind === 'null') {
          return { ...leftType, nullable: true }
        }

        // null || type means nullable type (reverse)
        if (leftType.kind === 'null') {
          return { ...rightType, nullable: true }
        }

        // type1 || type2 means union
        return {
          kind: 'union',
          members: [leftType, rightType],
        }
      }

      if (operator === '&&') {
        // null && type means required type (null is just a marker)
        const rightType = inferTypeFromValue(right)
        return rightType
      }

      if (operator === '??') {
        // Nullish coalescing: left ?? right - type is the right side (fallback)
        const rightType = inferTypeFromValue(right)
        return rightType
      }

      return { kind: 'any' }
    }

    case 'Identifier': {
      // Handle undefined as a type
      if ((node as any).name === 'undefined') {
        return { kind: 'undefined' }
      }
      // Other identifiers in type position aren't valid example types
      return { kind: 'any' }
    }

    case 'UnaryExpression': {
      // Handle negative numbers: -1
      if (
        (node as any).operator === '-' &&
        (node as any).argument.type === 'Literal'
      ) {
        const value = (node as any).argument.value
        if (typeof value === 'number') {
          return { kind: 'number' }
        }
      }
      return { kind: 'any' }
    }

    default:
      return { kind: 'any' }
  }
}

/**
 * Parse a parameter and extract its type and default value
 *
 * @param param - The AST node for the parameter
 * @param requiredParams - Optional set of parameter names that are required (from colon syntax)
 */
export function parseParameter(
  param: Pattern,
  requiredParams?: Set<string>
): ParameterDescriptor {
  // Simple identifier: function foo(x) - required, any type
  if (param.type === 'Identifier') {
    return {
      name: (param as any).name,
      type: { kind: 'any' },
      required: true,
    }
  }

  // Assignment pattern: function foo(x = value)
  if (param.type === 'AssignmentPattern') {
    const { left, right } = param as any

    if (left.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple parameter names are supported',
        getLocation(param)
      )
    }

    const name = left.name

    // Check if this parameter was marked as required via colon syntax
    const isRequired = requiredParams?.has(name) ?? false

    // Infer type from the example value
    const type = inferTypeFromValue(right)
    const exampleValue = extractLiteralValue(right)

    return {
      name,
      type,
      required: isRequired,
      default: isRequired ? null : exampleValue,
      example: exampleValue,
      loc: { start: param.start, end: param.end },
    }
  }

  // Destructuring pattern: function foo({ a, b })
  if (param.type === 'ObjectPattern') {
    // For destructuring, we create a synthetic "args" parameter
    // The individual properties become fields with their own defaults
    const properties = (param as any).properties as any[]
    const shape: Record<string, TypeDescriptor> = {}
    // Store full parameter descriptors for destructured properties
    const destructuredParams: Record<string, ParameterDescriptor> = {}

    for (const prop of properties) {
      if (prop.type === 'Property') {
        const key =
          prop.key.type === 'Identifier'
            ? prop.key.name
            : String(prop.key.value)

        if (prop.value.type === 'Identifier') {
          // { name } - required, any type
          shape[key] = { kind: 'any' }
          destructuredParams[key] = {
            name: key,
            type: { kind: 'any' },
            required: true,
          }
        } else if (prop.value.type === 'AssignmentPattern') {
          // { name = default } - check requiredParams to see if this was originally colon syntax
          const innerParam = parseParameter(prop.value, requiredParams)
          const isRequired = requiredParams?.has(key) ?? false
          shape[key] = innerParam.type
          destructuredParams[key] = {
            name: key,
            type: innerParam.type,
            required: isRequired,
            default: isRequired ? null : innerParam.example,
            example: innerParam.example,
          }
        }
      }
    }

    return {
      name: '__destructured__',
      type: { kind: 'object', shape, destructuredParams },
      required: true,
    }
  }

  throw new TranspileError(
    `Unsupported parameter pattern: ${param.type}`,
    getLocation(param)
  )
}

/**
 * Extract a literal value from an expression for default values
 */
export function extractLiteralValue(node: Expression): any {
  switch (node.type) {
    case 'Literal':
      return (node as any).value

    case 'ArrayExpression':
      return (node as any).elements.map((el: Expression) =>
        el ? extractLiteralValue(el) : null
      )

    case 'ObjectExpression': {
      const result: Record<string, any> = {}
      for (const prop of (node as any).properties) {
        if (prop.type === 'Property' && prop.key.type === 'Identifier') {
          result[prop.key.name] = extractLiteralValue(prop.value)
        }
      }
      return result
    }

    case 'UnaryExpression':
      if ((node as any).operator === '-') {
        const arg = extractLiteralValue((node as any).argument)
        return typeof arg === 'number' ? -arg : undefined
      }
      return undefined

    case 'LogicalExpression': {
      const { operator, left, right } = node as any
      if (operator === '&&') {
        // null && type evaluates to null (falsy short-circuit)
        if (left.type === 'Literal' && left.value === null) {
          return null
        }
      }
      if (operator === '||') {
        // value || fallback - return left if truthy
        const leftVal = extractLiteralValue(left)
        return leftVal ?? extractLiteralValue(right)
      }
      if (operator === '??') {
        // value ?? fallback - return left if not null/undefined
        const leftVal = extractLiteralValue(left)
        return leftVal ?? extractLiteralValue(right)
      }
      return undefined
    }

    default:
      return undefined
  }
}

/**
 * Parse return type from a type annotation expression
 */
export function parseReturnType(typeExpr: string): TypeDescriptor {
  // Simple approach: parse as expression and infer type
  try {
    const ast = parseExpressionAt(typeExpr, 0, {
      ecmaVersion: 2022,
    })
    return inferTypeFromValue(ast)
  } catch {
    return { kind: 'any' }
  }
}

/**
 * Convert TypeDescriptor to a human-readable string
 */
export function typeToString(type: TypeDescriptor): string {
  switch (type.kind) {
    case 'string':
      return type.nullable ? 'string | null' : 'string'
    case 'number':
      return type.nullable ? 'number | null' : 'number'
    case 'boolean':
      return type.nullable ? 'boolean | null' : 'boolean'
    case 'null':
      return 'null'
    case 'any':
      return 'any'
    case 'array': {
      const items = type.items ? typeToString(type.items) : 'any'
      return type.nullable ? `${items}[] | null` : `${items}[]`
    }
    case 'object': {
      if (!type.shape || Object.keys(type.shape).length === 0) {
        return type.nullable ? 'object | null' : 'object'
      }
      const props = Object.entries(type.shape)
        .map(([k, v]) => `${k}: ${typeToString(v)}`)
        .join(', ')
      return type.nullable ? `{ ${props} } | null` : `{ ${props} }`
    }
    case 'union':
      return type.members?.map(typeToString).join(' | ') || 'any'
    default:
      return 'any'
  }
}

/**
 * Check if a value matches a type descriptor
 */
export function checkType(value: any, type: TypeDescriptor): boolean {
  // Handle null
  if (value === null || value === undefined) {
    return type.nullable || type.kind === 'null' || type.kind === 'any'
  }

  switch (type.kind) {
    case 'any':
      return true
    case 'null':
      return value === null
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      if (!Array.isArray(value)) return false
      if (!type.items) return true
      return value.every((item) => checkType(item, type.items!))
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
      }
      if (!type.shape) return true
      // Check that all required shape properties exist and match
      for (const [key, propType] of Object.entries(type.shape)) {
        if (!checkType(value[key], propType)) {
          return false
        }
      }
      return true
    case 'union':
      if (!type.members) return true
      return type.members.some((member) => checkType(value, member))
    default:
      return true
  }
}
