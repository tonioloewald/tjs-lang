/**
 * Type inference from value patterns
 *
 * Extracts types from example values:
 *   'string' -> { kind: 'string' }
 *   10 -> { kind: 'number' }
 *   ['string'] -> { kind: 'array', items: { kind: 'string' } }
 *   { name: 'string' } -> { kind: 'object', shape: { name: { kind: 'string' } } }
 *   'string' | null -> { kind: 'string', nullable: true }
 *   'string' | 0 -> { kind: 'union', members: [{ kind: 'string' }, { kind: 'number' }] }
 */

import { parseExpressionAt } from 'acorn'
import type { Expression, Pattern } from 'acorn'
import type { TypeDescriptor, ParameterDescriptor } from './types'
import { getLocation, TranspileError } from './types'

/**
 * Infer type from a value expression (example value)
 */
/**
 * Sound TypeScript type names, honoured as real runtime types.
 *
 * TJS's design line: **implement the parts of TypeScript that aren't Turing-complete
 * damage; best-effort the rest.** These are the sound, decidable primitives — they map
 * cleanly onto a runtime check, so writing `s: string` gets you an actual string check,
 * exactly as `s: ''` does.
 *
 * What is deliberately NOT here (falls through to `any`, best-effort by design):
 * conditional types, mapped types, recursive templates, `infer` — the type-level
 * metaprogramming that is undecidable, unreadable, and erased at runtime. TJS's answer to
 * those is a **predicate function**: a real function you can read, test and run, which
 * survives to runtime instead of evaporating. That substitution is the point of the
 * project, not a limitation of it.
 */
const TS_TYPE_NAMES: Record<string, TypeDescriptor> = {
  string: { kind: 'string' },
  number: { kind: 'number' },
  // --- TJS extensions: the numeric types TypeScript never had -------------------
  // TS has one numeric type, so "this is a count/index/id" is inexpressible and
  // ends up policed by comments or runtime asserts. These name the distinction
  // directly, and they EXTEND rather than narrow TS: `number` keeps meaning number,
  // so pasted TypeScript is unaffected.
  //
  // The example forms are shorthand for exactly these, and carry a worked value too:
  //   n: int       ==  n: 5     (integer)
  //   n: unsigned  ==  n: +5    (non-negative integer)
  //   n: number    ==  n: 5.0   (float)
  int: { kind: 'integer' },
  unsigned: { kind: 'non-negative-integer' },
  uint: { kind: 'non-negative-integer' },
  float: { kind: 'number' },
  boolean: { kind: 'boolean' },
  bigint: { kind: 'bigint' },
  object: { kind: 'object' },
  // `any`/`unknown` are honest about being unconstrained — they mean what they say.
  any: { kind: 'any' },
  unknown: { kind: 'any' },
  // `void`/`never` only appear in return position; treat as unconstrained rather than
  // inventing a runtime check that would reject every real value.
  void: { kind: 'any' },
  never: { kind: 'any' },
  null: { kind: 'null' },
  undefined: { kind: 'undefined' },
}

/**
 * Is this annotation a bare TYPE NAME rather than an example VALUE?
 *
 * Matters because the colon shorthand rewrites `x: ann` to `x = ann`, which is right when
 * `ann` is an example (`n?: 0` → `n = 0`) and produces a dangling identifier when it is a
 * type (`n?: number` → `n = number`, a ReferenceError waiting to happen).
 *
 * `undefined`/`NaN`/`Infinity` are bare identifiers that ARE values, so they are excluded.
 */
export function isTypeNameAnnotation(text: string): boolean {
  const t = text.trim()
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t)) return false
  if (t === 'undefined' || t === 'NaN' || t === 'Infinity') return false
  // A known TS/TJS type name, or any other bare identifier — an unresolved user type like
  // `MyThing` is equally not a value.
  return true
}

export function inferTypeFromValue(node: Expression): TypeDescriptor {
  // `LegacyDefault(x)` is a WRAPPER, not a value: it asks for the plain-JS atomic default
  // semantics instead of TJS's per-member merge. It says nothing about the type, so infer
  // through it.
  //
  // Treating it as an opaque call made the wrapped param `any` — WEAKER than the plain-JS
  // equivalent it exists to reproduce, which reports the full object shape. The generated
  // .d.ts said `any` where `dialect: 'js'` said `{ x: number }`. The caller asked for
  // atomic default semantics; they did not ask for the type to disappear.
  if (
    node.type === 'CallExpression' &&
    (node as any).callee?.type === 'Identifier' &&
    (node as any).callee.name === 'LegacyDefault' &&
    (node as any).arguments?.length === 1
  ) {
    return inferTypeFromValue((node as any).arguments[0])
  }

  switch (node.type) {
    case 'Literal': {
      const value = (node as any).value
      // NOTE: a bare regexp literal is NOT treated as a pattern-constrained string.
      // A regexp is a legitimate *value*, so under the example rule `s: /^\d+$/`
      // denotes a RegExp exactly as `s: 5` denotes a number. The pattern-as-string
      // meaning needs an explicit spelling — `/…/ as string` — which requires a
      // parser-level pre-transform (see TODO "regexp string types"). Until then this
      // degrades to best-effort rather than quietly meaning something else.
      if (value === null) {
        return { kind: 'null' }
      }
      if (typeof value === 'string') {
        return { kind: 'string' }
      }
      if (typeof value === 'number') {
        // Distinguish float vs integer by checking if source contains '.'
        // 2.0 -> number (float), 42 -> integer
        const raw = (node as any).raw as string | undefined
        if (raw && raw.includes('.')) {
          return { kind: 'number' }
        }
        return { kind: 'integer' }
      }
      if (typeof value === 'bigint') {
        // `0n` — the example form of `bigint`. `fromTS` emits exactly this for a TS
        // `bigint` annotation, so without it the converter produced TJS its own parser
        // rejected, and the two spellings of the same type disagreed.
        return { kind: 'bigint' }
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
      // Infer type from all elements — if homogeneous, use that type;
      // if heterogeneous, produce a union of distinct kinds
      const itemTypes = elements
        .filter((el) => el != null)
        .map((el) => inferTypeFromValue(el))
      if (itemTypes.length === 0) {
        return { kind: 'array', items: { kind: 'any' } }
      }
      // Deduplicate by structure
      const seen = new Map<string, TypeDescriptor>()
      for (const t of itemTypes) {
        const key = JSON.stringify(t)
        if (!seen.has(key)) seen.set(key, t)
      }
      const unique = [...seen.values()]
      const items =
        unique.length === 1
          ? unique[0]
          : { kind: 'union' as const, members: unique }
      return { kind: 'array', items }
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
        // || is JavaScript logical OR — infer type from left operand
        return inferTypeFromValue(left)
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

    case 'BinaryExpression': {
      const { operator, left, right } = node as any
      // | means union type (e.g., 0 | null, '' | undefined)
      if (operator === '|') {
        const leftType = inferTypeFromValue(left)
        const rightType = inferTypeFromValue(right)

        if (rightType.kind === 'null') {
          return { ...leftType, nullable: true }
        }
        if (leftType.kind === 'null') {
          return { ...rightType, nullable: true }
        }
        return {
          kind: 'union',
          members: [leftType, rightType],
        }
      }
      return { kind: 'any' }
    }

    case 'Identifier': {
      // Handle undefined as a type
      if ((node as any).name === 'undefined') {
        return { kind: 'undefined' }
      }
      // A bare TS type NAME in type position is honoured as that type.
      //
      // TJS's stated goal is to implement the parts of TypeScript that aren't
      // Turing-complete damage and best-effort only the rest. `string` is the most
      // basic sound type there is, and it used to land here and degrade to `any` —
      // so `function f(s: string)` transpiled cleanly, looked typed, and validated
      // NOTHING. That is the worst possible outcome in a language whose pitch is
      // "types that survive to runtime", and it hit the annotation newcomers and
      // models reach for first (measured: ASSUMPTIONS.md A7).
      //
      // Only genuinely unsound/undecidable constructs should fall through to `any`.
      const tsType = TS_TYPE_NAMES[(node as any).name]
      if (tsType) return { ...tsType }
      // Unknown identifier: a user-defined type we can't resolve statically.
      // Best-effort by design — but MARK it, so the transpiler can tell the user what
      // it dropped and how to get the safety back, instead of silently erasing a type.
      return { kind: 'any', unresolved: (node as any).name }
    }

    case 'TSArrayType' as any: {
      // `string[]` — array of a sound element type.
      const el = (node as any).elementType
      return {
        kind: 'array',
        items: el ? inferTypeFromValue(el) : { kind: 'any' },
      }
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression': {
      // Function example value (e.g. `fn = (x) => x` or `cb = function() {}`).
      // Capture parameter names + types and (for concise arrow bodies)
      // infer the return type from the body expression.
      const fn = node as any
      const params: Array<{ name: string; type: TypeDescriptor }> =
        fn.params.map((p: any) => paramShape(p))

      // Concise arrow body: body IS the return expression, so we can
      // infer its type. Block bodies (function expressions, multi-line
      // arrows) stay `any` — scanning return statements is a separate
      // can of worms.
      let returns: TypeDescriptor = { kind: 'any' }
      if (
        fn.type === 'ArrowFunctionExpression' &&
        fn.body &&
        fn.body.type !== 'BlockStatement'
      ) {
        returns = inferTypeFromValue(fn.body)
      }

      return { kind: 'function', params, returns }
    }

    case 'UnaryExpression': {
      const op = (node as any).operator
      const arg = (node as any).argument

      // +N means non-negative integer (e.g., +1, +3)
      if (op === '+' && arg.type === 'Literal') {
        const value = arg.value
        if (typeof value === 'number') {
          return { kind: 'non-negative-integer' }
        }
      }

      // -N means integer or float depending on source
      if (op === '-' && arg.type === 'Literal') {
        const value = arg.value
        if (typeof value === 'number') {
          const raw = arg.raw as string | undefined
          if (raw && raw.includes('.')) {
            return { kind: 'number' }
          }
          return { kind: 'integer' }
        }
      }
      return { kind: 'any' }
    }

    default:
      return { kind: 'any' }
  }
}

/**
 * Extract a function-parameter shape from a Pattern AST node. Used when
 * we encounter a function/arrow EXAMPLE value and want to record what
 * its declared parameters look like for documentation and .d.ts emit.
 *
 * Plain identifier (`x`)              → { name: 'x', type: any }
 * Default value (`x = 0`)             → { name: 'x', type: integer }
 * Rest (`...args`)                    → { name: '...args', type: array }
 * Destructuring (`{a}`, `[x]`)        → name: '?', type: any (we'd need
 *                                       to mirror parseParameter to do
 *                                       this properly; not worth the
 *                                       complexity for example values)
 */
function paramShape(p: any): { name: string; type: TypeDescriptor } {
  if (p.type === 'Identifier') {
    return { name: p.name, type: { kind: 'any' } }
  }
  if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') {
    return { name: p.left.name, type: inferTypeFromValue(p.right) }
  }
  if (p.type === 'RestElement' && p.argument?.type === 'Identifier') {
    return {
      name: `...${p.argument.name}`,
      type: { kind: 'array', items: { kind: 'any' } },
    }
  }
  return { name: '?', type: { kind: 'any' } }
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
      if ((node as any).operator === '+') {
        const arg = extractLiteralValue((node as any).argument)
        return typeof arg === 'number' ? +arg : undefined
      }
      return undefined

    case 'BinaryExpression': {
      const { operator, left } = node as any
      // | is union type — extract the left (primary) example value
      if (operator === '|') {
        return extractLiteralValue(left)
      }
      return undefined
    }

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
    case 'integer':
      return type.nullable ? 'integer | null' : 'integer'
    case 'non-negative-integer':
      return type.nullable
        ? 'non-negative integer | null'
        : 'non-negative integer'
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
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'non-negative-integer':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0
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
