/**
 * TypeScript to TJS Transpiler
 *
 * Converts TypeScript source to TJS (or directly to JS + metadata).
 *
 * Two modes:
 * 1. TS → TJS (for inspection/migration)
 * 2. TS → JS + __tjs metadata (for production)
 *
 * @example
 * ```typescript
 * // Input TypeScript:
 * function greet(name: string, age?: number): string {
 *   return `Hello, ${name}!`
 * }
 *
 * // Output TJS:
 * function greet(name: '', age = 0) -> '' {
 *   return `Hello, ${name}!`
 * }
 *
 * // Output JS + metadata:
 * function greet(name, age) {
 *   return `Hello, ${name}!`
 * }
 * greet.__tjs = {
 *   params: { name: { type: 'string', required: true }, age: { type: 'number', required: false } },
 *   returns: { type: 'string' }
 * }
 * ```
 */

import ts from 'typescript'
import { emitClassWrapper } from '../runtime'

export interface FromTSOptions {
  /** Emit TJS intermediate instead of JS + metadata */
  emitTJS?: boolean
  /** Include sourcemap */
  sourceMap?: boolean
  /** Filename for error messages */
  filename?: string
}

export interface FromTSResult {
  /** The transpiled code (TJS or JS depending on options) */
  code: string
  /** Function type metadata (only when emitting JS) */
  types?: Record<string, FunctionTypeInfo>
  /** Class type metadata (only when emitting JS) */
  classes?: Record<string, ClassTypeInfo>
  /** Any warnings during transpilation */
  warnings?: string[]
}

export interface TypeParamInfo {
  /** Constraint schema (from `extends`) - example-based */
  constraint?: string | Record<string, any>
  /** Default schema (from `= Type`) - example-based */
  default?: string | Record<string, any>
}

export interface FunctionTypeInfo {
  name: string
  params: Record<string, ParamTypeInfo>
  returns?: TypeInfo
  description?: string
  /** Generic type parameters with constraints/defaults */
  typeParams?: Record<string, TypeParamInfo>
}

export interface ClassTypeInfo {
  name: string
  /** Constructor parameters - also serves as the type shape */
  constructor?: {
    params: Record<string, ParamTypeInfo>
  }
  /** Instance methods */
  methods: Record<string, FunctionTypeInfo>
  /** Static methods */
  staticMethods: Record<string, FunctionTypeInfo>
  /** Generic type parameters */
  typeParams?: Record<string, TypeParamInfo>
}

export interface ParamTypeInfo {
  type: TypeInfo
  required: boolean
  default?: any
  description?: string
}

export interface TypeInfo {
  kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'undefined'
    | 'array'
    | 'tuple'
    | 'object'
    | 'union'
    | 'any'
  items?: TypeInfo
  /** For tuples: element types in order */
  elements?: TypeInfo[]
  shape?: Record<string, TypeInfo>
  members?: TypeInfo[]
  nullable?: boolean
}

/** Context for type resolution */
interface TypeResolutionContext {
  typeAliases?: Map<string, ts.TypeNode>
  interfaces?: Map<string, ts.InterfaceDeclaration>
  sourceFile?: ts.SourceFile
  warnings?: string[]
  /** Track visited types to prevent infinite recursion */
  visited?: Set<string>
}

/**
 * Convert a TypeScript type node to a TJS example value string
 *
 * @param warnings - Optional array to collect warnings about generic types
 */
function typeToExample(
  type: ts.TypeNode | undefined,
  checker?: ts.TypeChecker,
  warnings?: string[],
  ctx?: TypeResolutionContext
): string {
  if (!type) return 'undefined'

  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "''"
    case ts.SyntaxKind.NumberKeyword:
      return '0'
    case ts.SyntaxKind.BooleanKeyword:
      return 'true'
    case ts.SyntaxKind.NullKeyword:
      return 'null'
    case ts.SyntaxKind.UndefinedKeyword:
      return 'undefined'
    case ts.SyntaxKind.VoidKeyword:
      return 'undefined'
    case ts.SyntaxKind.AnyKeyword:
      return 'undefined'
    case ts.SyntaxKind.UnknownKeyword:
      return 'undefined'

    case ts.SyntaxKind.ArrayType: {
      const arrayType = type as ts.ArrayTypeNode
      const itemExample = typeToExample(arrayType.elementType, checker)
      return `[${itemExample}]`
    }

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode
      const typeName = typeRef.typeName.getText()

      // Handle common generic types
      if (typeName === 'Array' && typeRef.typeArguments?.length) {
        const itemExample = typeToExample(
          typeRef.typeArguments[0],
          checker,
          warnings,
          ctx
        )
        return `[${itemExample}]`
      }
      if (typeName === 'Promise') {
        // Unwrap Promise type
        if (typeRef.typeArguments?.length) {
          return typeToExample(typeRef.typeArguments[0], checker, warnings, ctx)
        }
        return 'undefined'
      }
      if (typeName === 'Record') {
        return '{}'
      }
      if (typeName === 'Map') {
        return 'new Map()'
      }
      if (typeName === 'Set') {
        return 'new Set()'
      }

      // Resolve type aliases
      if (ctx?.typeAliases?.has(typeName)) {
        // Prevent infinite recursion
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          warnings?.push(`Circular type reference '${typeName}' - using 'any'`)
          return 'any'
        }
        visited.add(typeName)
        const resolvedType = ctx.typeAliases.get(typeName)!
        return typeToExample(resolvedType, checker, warnings, {
          ...ctx,
          visited,
        })
      }

      // Resolve interfaces
      if (ctx?.interfaces?.has(typeName)) {
        // Prevent infinite recursion
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          warnings?.push(`Circular type reference '${typeName}' - using 'any'`)
          return 'any'
        }
        visited.add(typeName)
        const iface = ctx.interfaces.get(typeName)!
        // Build example object from interface members
        const props: string[] = []
        for (const member of iface.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(ctx.sourceFile)
            const propExample = typeToExample(member.type, checker, warnings, {
              ...ctx,
              visited,
            })
            const isOptional = !!member.questionToken
            if (isOptional) {
              props.push(`${propName} = ${propExample}`)
            } else {
              props.push(`${propName}: ${propExample}`)
            }
          }
        }
        return `{ ${props.join(', ')} }`
      }

      // Type parameters (generics like T, K, V) - treat as any
      // Single uppercase letter or common generic names
      if (
        /^[A-Z]$/.test(typeName) ||
        ['T', 'K', 'V', 'U', 'TKey', 'TValue', 'TItem', 'TResult'].includes(
          typeName
        )
      ) {
        warnings?.push(
          `Generic type parameter '${typeName}' converted to 'any' - consider specializing`
        )
        return 'any'
      }
      // Unknown type reference - treat as any
      warnings?.push(
        `Unknown type '${typeName}' converted to 'any' - may need manual review`
      )
      return 'any'
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode
      const props: string[] = []
      for (const member of typeLiteral.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText()
          const propType = typeToExample(member.type, checker)
          const isOptional = !!member.questionToken
          if (isOptional) {
            props.push(`${propName} = ${propType}`)
          } else {
            props.push(`${propName}: ${propType}`)
          }
        }
      }
      return `{ ${props.join(', ')} }`
    }

    case ts.SyntaxKind.UnionType: {
      const unionType = type as ts.UnionTypeNode

      // Helper to check if a type is null or undefined
      const isNullType = (t: ts.TypeNode) =>
        t.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isLiteralTypeNode(t) &&
          t.literal.kind === ts.SyntaxKind.NullKeyword)
      const isUndefinedType = (t: ts.TypeNode) =>
        t.kind === ts.SyntaxKind.UndefinedKeyword ||
        (ts.isLiteralTypeNode(t) &&
          t.literal.kind === ts.SyntaxKind.UndefinedKeyword)

      // Check for nullable: T | null or T | undefined
      const nonNullTypes = unionType.types.filter(
        (t) => !isNullType(t) && !isUndefinedType(t)
      )
      const hasNull = unionType.types.some(isNullType)
      const hasUndefined = unionType.types.some(isUndefinedType)

      if (nonNullTypes.length === 1 && (hasNull || hasUndefined)) {
        // Nullable type: T | null -> T || null
        const baseExample = typeToExample(nonNullTypes[0], checker)
        if (hasNull) return `${baseExample} || null`
        if (hasUndefined) return `${baseExample} || undefined`
      }

      // General union: use first type as example
      if (unionType.types.length > 0) {
        return typeToExample(unionType.types[0], checker)
      }
      return 'undefined'
    }

    case ts.SyntaxKind.LiteralType: {
      const literalType = type as ts.LiteralTypeNode
      if (ts.isStringLiteral(literalType.literal)) {
        return `'${literalType.literal.text}'`
      }
      if (ts.isNumericLiteral(literalType.literal)) {
        return literalType.literal.text
      }
      if (literalType.literal.kind === ts.SyntaxKind.TrueKeyword) {
        return 'true'
      }
      if (literalType.literal.kind === ts.SyntaxKind.FalseKeyword) {
        return 'false'
      }
      if (literalType.literal.kind === ts.SyntaxKind.NullKeyword) {
        return 'null'
      }
      return 'undefined'
    }

    case ts.SyntaxKind.ParenthesizedType: {
      const parenType = type as ts.ParenthesizedTypeNode
      return typeToExample(parenType.type, checker)
    }

    case ts.SyntaxKind.FunctionType:
      // Functions become undefined (can't really express as example)
      return 'undefined'

    case ts.SyntaxKind.TupleType: {
      const tupleType = type as ts.TupleTypeNode
      const elements = tupleType.elements.map((e) => {
        if (ts.isNamedTupleMember(e)) {
          return typeToExample(e.type, checker)
        }
        return typeToExample(e as ts.TypeNode, checker)
      })
      return `[${elements.join(', ')}]`
    }

    default:
      return 'undefined'
  }
}

/**
 * Convert TypeScript type to TypeInfo for metadata
 */
function typeToInfo(
  type: ts.TypeNode | undefined,
  ctx?: TypeResolutionContext
): TypeInfo {
  if (!type) return { kind: 'any' }

  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'boolean' }
    case ts.SyntaxKind.NullKeyword:
      return { kind: 'null' }
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.VoidKeyword:
      return { kind: 'undefined' }

    case ts.SyntaxKind.ArrayType: {
      const arrayType = type as ts.ArrayTypeNode
      return { kind: 'array', items: typeToInfo(arrayType.elementType, ctx) }
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode
      const shape: Record<string, TypeInfo> = {}
      for (const member of typeLiteral.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText()
          shape[propName] = typeToInfo(member.type, ctx)
        }
      }
      return { kind: 'object', shape }
    }

    case ts.SyntaxKind.UnionType: {
      const unionType = type as ts.UnionTypeNode
      const nonNullTypes = unionType.types.filter(
        (t) =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      )
      const hasNull = unionType.types.some(
        (t) => t.kind === ts.SyntaxKind.NullKeyword
      )

      if (nonNullTypes.length === 1 && hasNull) {
        return { ...typeToInfo(nonNullTypes[0], ctx), nullable: true }
      }

      return {
        kind: 'union',
        members: unionType.types.map((t) => typeToInfo(t, ctx)),
      }
    }

    case ts.SyntaxKind.IntersectionType: {
      const intersectionType = type as ts.IntersectionTypeNode
      // Flatten intersection into merged object shape
      const mergedShape: Record<string, TypeInfo> = {}
      for (const member of intersectionType.types) {
        const memberInfo = typeToInfo(member, ctx)
        if (memberInfo.kind === 'object' && memberInfo.shape) {
          Object.assign(mergedShape, memberInfo.shape)
        }
      }
      if (Object.keys(mergedShape).length > 0) {
        return { kind: 'object', shape: mergedShape }
      }
      // If no object shapes found, treat as any
      return { kind: 'any' }
    }

    case ts.SyntaxKind.TupleType: {
      const tupleType = type as ts.TupleTypeNode
      const elements: TypeInfo[] = []
      for (const element of tupleType.elements) {
        // Handle named tuple members: [x: number, y: string]
        if (ts.isNamedTupleMember(element)) {
          elements.push(typeToInfo(element.type, ctx))
        } else {
          elements.push(typeToInfo(element as ts.TypeNode, ctx))
        }
      }
      return { kind: 'tuple', elements }
    }

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode
      const typeName = typeRef.typeName.getText()
      if (typeName === 'Array' && typeRef.typeArguments?.length) {
        return {
          kind: 'array',
          items: typeToInfo(typeRef.typeArguments[0], ctx),
        }
      }
      if (typeName === 'Promise' && typeRef.typeArguments?.length) {
        return typeToInfo(typeRef.typeArguments[0], ctx)
      }

      // Handle utility types
      if (typeRef.typeArguments?.length) {
        const innerType = typeToInfo(typeRef.typeArguments[0], ctx)

        // Partial<T> - all properties become optional (we just return the shape)
        if (typeName === 'Partial') {
          return innerType
        }

        // Required<T> - all properties become required (we just return the shape)
        if (typeName === 'Required') {
          return innerType
        }

        // Readonly<T> - same shape, readonly is a compile-time concept
        if (typeName === 'Readonly') {
          return innerType
        }

        // Record<K, V> - object with string keys and V values
        if (typeName === 'Record' && typeRef.typeArguments.length >= 2) {
          const valueType = typeToInfo(typeRef.typeArguments[1], ctx)
          // Record is essentially an object with dynamic keys
          return { kind: 'object', shape: { '[key]': valueType } }
        }

        // Pick<T, K> and Omit<T, K> - just return the base type for now
        // Full implementation would need to filter properties
        if (typeName === 'Pick' || typeName === 'Omit') {
          return innerType
        }

        // NonNullable<T> - remove null/undefined
        if (typeName === 'NonNullable') {
          if (innerType.nullable) {
            return { ...innerType, nullable: false }
          }
          return innerType
        }

        // ReturnType<T>, Parameters<T>, etc. - complex, return any
        if (
          ['ReturnType', 'Parameters', 'ConstructorParameters'].includes(
            typeName
          )
        ) {
          return { kind: 'any' }
        }
      }

      // Resolve type aliases
      if (ctx?.typeAliases?.has(typeName)) {
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          return { kind: 'any' } // Circular reference
        }
        visited.add(typeName)
        const resolvedType = ctx.typeAliases.get(typeName)!
        return typeToInfo(resolvedType, { ...ctx, visited })
      }

      // Resolve interfaces
      if (ctx?.interfaces?.has(typeName)) {
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          return { kind: 'any' } // Circular reference
        }
        visited.add(typeName)
        const iface = ctx.interfaces.get(typeName)!
        const shape: Record<string, TypeInfo> = {}

        // Handle extends clauses - merge in base interface properties
        if (iface.heritageClauses) {
          for (const clause of iface.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              for (const baseType of clause.types) {
                const baseName = baseType.expression.getText(ctx.sourceFile)
                // Look up the base interface and recursively resolve it
                if (ctx.interfaces?.has(baseName) && !visited.has(baseName)) {
                  // Create a synthetic type reference node to look up the base
                  const syntheticRef = {
                    kind: ts.SyntaxKind.TypeReference,
                    typeName: { getText: () => baseName },
                  } as unknown as ts.TypeReferenceNode
                  const baseInfo = typeToInfo(syntheticRef, { ...ctx, visited })
                  if (baseInfo.kind === 'object' && baseInfo.shape) {
                    Object.assign(shape, baseInfo.shape)
                  }
                }
              }
            }
          }
        }

        // Add own members (may override base)
        for (const member of iface.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(ctx.sourceFile)
            shape[propName] = typeToInfo(member.type, { ...ctx, visited })
          }
        }
        return { kind: 'object', shape }
      }

      // Generics and unknown types become 'any'
      return { kind: 'any' }
    }

    default:
      return { kind: 'any' }
  }
}

/**
 * Extract type parameter info (generics) from a function
 */
function extractTypeParams(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  warnings?: string[]
): Record<string, TypeParamInfo> | undefined {
  if (!node.typeParameters || node.typeParameters.length === 0) {
    return undefined
  }

  const typeParams: Record<string, TypeParamInfo> = {}

  for (const param of node.typeParameters) {
    const name = param.name.getText()
    const info: TypeParamInfo = {}

    // Extract constraint: T extends Foo
    if (param.constraint) {
      const constraintExample = typeToExample(
        param.constraint,
        undefined,
        warnings
      )
      // Try to parse as object/value for richer schema
      if (constraintExample.startsWith('{')) {
        try {
          // This is a rough parse - in production we'd use proper AST
          info.constraint = constraintExample
        } catch {
          info.constraint = constraintExample
        }
      } else {
        info.constraint = constraintExample
      }
    }

    // Extract default: T = Foo
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      info.default = defaultExample
    }

    typeParams[name] = info
  }

  return Object.keys(typeParams).length > 0 ? typeParams : undefined
}

/**
 * Transform a TypeScript function to TJS syntax
 */
/**
 * Transform a TypeScript interface to TJS Type declaration
 *
 * interface User { name: string; age: number }
 * ->
 * Type User { example: { name: '', age: 0 } }
 */
function transformInterfaceToType(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string | null {
  const typeName = node.name.getText(sourceFile)

  // Check for generics
  if (node.typeParameters && node.typeParameters.length > 0) {
    return transformGenericInterfaceToGeneric(node, sourceFile, warnings)
  }

  // Build example object from members
  const props: string[] = []
  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const propName = member.name.getText(sourceFile)
      const propExample = typeToExample(member.type, undefined, warnings)
      props.push(`${propName}: ${propExample}`)
    }
  }

  if (props.length === 0) {
    return `Type ${typeName} {}`
  }

  return `Type ${typeName} {
  example: { ${props.join(', ')} }
}`
}

/**
 * Transform a generic TypeScript interface to TJS Generic declaration
 *
 * interface Box<T> { value: T }
 * ->
 * Generic Box<T> {
 *   description: 'Box'
 *   predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) }
 * }
 */
function transformGenericInterfaceToGeneric(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string {
  const typeName = node.name.getText(sourceFile)
  const typeParams: string[] = []

  // Extract type parameters with constraints/defaults
  for (const param of node.typeParameters || []) {
    const paramName = param.name.getText(sourceFile)
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      typeParams.push(`${paramName} = ${defaultExample}`)
    } else {
      typeParams.push(paramName)
    }
  }

  // Build predicate checks for each property that uses a type parameter
  const typeParamNames = (node.typeParameters || []).map((p) =>
    p.name.getText(sourceFile)
  )
  const checks: string[] = ["typeof x === 'object'", 'x !== null']

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const propName = member.name.getText(sourceFile)
      checks.push(`'${propName}' in x`)

      // If property type is a type parameter, add check
      if (member.type && ts.isTypeReferenceNode(member.type)) {
        const refName = member.type.typeName.getText(sourceFile)
        if (typeParamNames.includes(refName)) {
          checks.push(`${refName}(x.${propName})`)
        }
      }
    }
  }

  const predicateParams = ['x', ...typeParamNames].join(', ')

  return `Generic ${typeName}<${typeParams.join(', ')}> {
  description: '${typeName}'
  predicate(${predicateParams}) { return ${checks.join(' && ')} }
}`
}

/**
 * Check if a TypeScript union type is a literal union (e.g., 'up' | 'down' | 'left')
 * Returns the literal values if it is, null otherwise
 */
function extractLiteralUnionValues(
  type: ts.TypeNode,
  sourceFile: ts.SourceFile
): string[] | null {
  if (!ts.isUnionTypeNode(type)) return null

  const values: string[] = []
  for (const member of type.types) {
    if (ts.isLiteralTypeNode(member)) {
      if (ts.isStringLiteral(member.literal)) {
        values.push(`'${member.literal.text}'`)
      } else if (ts.isNumericLiteral(member.literal)) {
        values.push(member.literal.text)
      } else if (member.literal.kind === ts.SyntaxKind.TrueKeyword) {
        values.push('true')
      } else if (member.literal.kind === ts.SyntaxKind.FalseKeyword) {
        values.push('false')
      } else if (member.literal.kind === ts.SyntaxKind.NullKeyword) {
        values.push('null')
      } else {
        // Not a literal we can handle
        return null
      }
    } else if (member.kind === ts.SyntaxKind.NullKeyword) {
      values.push('null')
    } else if (member.kind === ts.SyntaxKind.UndefinedKeyword) {
      values.push('undefined')
    } else {
      // Not a literal union (has complex types)
      return null
    }
  }

  return values.length > 0 ? values : null
}

/**
 * Transform a TypeScript enum to TJS Enum declaration
 *
 * enum Status { Pending, Active, Done }
 * ->
 * Enum Status 'Status' {
 *   Pending
 *   Active
 *   Done
 * }
 *
 * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
 * ->
 * Enum Color 'Color' {
 *   Red = 'red'
 *   Green = 'green'
 *   Blue = 'blue'
 * }
 */
function transformEnumToTJS(
  node: ts.EnumDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string | null {
  const enumName = node.name.getText(sourceFile)
  const members: string[] = []

  let currentValue = 0
  for (const member of node.members) {
    const memberName = member.name.getText(sourceFile)

    if (member.initializer) {
      // Has explicit value
      if (ts.isStringLiteral(member.initializer)) {
        members.push(`  ${memberName} = '${member.initializer.text}'`)
      } else if (ts.isNumericLiteral(member.initializer)) {
        const numValue = parseInt(member.initializer.text, 10)
        members.push(`  ${memberName} = ${numValue}`)
        currentValue = numValue + 1
      } else if (
        ts.isPrefixUnaryExpression(member.initializer) &&
        member.initializer.operator === ts.SyntaxKind.MinusToken
      ) {
        // Negative number
        const operand = member.initializer.operand
        if (ts.isNumericLiteral(operand)) {
          const numValue = -parseInt(operand.text, 10)
          members.push(`  ${memberName} = ${numValue}`)
          currentValue = numValue + 1
        }
      } else {
        // Expression or other complex initializer - use the text directly
        members.push(
          `  ${memberName} = ${member.initializer.getText(sourceFile)}`
        )
      }
    } else {
      // Auto-increment numeric value
      members.push(`  ${memberName}`)
      currentValue++
    }
  }

  return `Enum ${enumName} '${enumName}' {
${members.join('\n')}
}`
}

/**
 * Transform a TypeScript type alias to TJS Type declaration
 *
 * type User = { name: string; age: number }
 * ->
 * Type User { example: { name: '', age: 0 } }
 *
 * type Direction = 'up' | 'down' | 'left' | 'right'
 * ->
 * Union Direction 'Direction' 'up' | 'down' | 'left' | 'right'
 */
function transformTypeAliasToType(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string | null {
  const typeName = node.name.getText(sourceFile)

  // Check for generics
  if (node.typeParameters && node.typeParameters.length > 0) {
    return transformGenericTypeAliasToGeneric(node, sourceFile, warnings)
  }

  // Check for literal union type → emit Union syntax
  const literalValues = extractLiteralUnionValues(node.type, sourceFile)
  if (literalValues) {
    return `Union ${typeName} '${typeName}' ${literalValues.join(' | ')}`
  }

  const example = typeToExample(node.type, undefined, warnings)

  // For simple primitive types, use short form
  if (
    example === "''" ||
    example === '0' ||
    example === 'true' ||
    example === 'null'
  ) {
    return `Type ${typeName} ${example}`
  }

  return `Type ${typeName} {
  example: ${example}
}`
}

/**
 * Transform a generic type alias to TJS Generic declaration
 */
function transformGenericTypeAliasToGeneric(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string {
  const typeName = node.name.getText(sourceFile)
  const typeParams: string[] = []

  // Extract type parameters
  for (const param of node.typeParameters || []) {
    const paramName = param.name.getText(sourceFile)
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      typeParams.push(`${paramName} = ${defaultExample}`)
    } else {
      typeParams.push(paramName)
    }
  }

  const typeParamNames = (node.typeParameters || []).map((p) =>
    p.name.getText(sourceFile)
  )
  const predicateParams = ['x', ...typeParamNames].join(', ')

  // Simple fallback - more sophisticated analysis could be added
  return `Generic ${typeName}<${typeParams.join(', ')}> {
  description: '${typeName}'
  predicate(${predicateParams}) { return true }
}`
}

function transformFunctionToTJS(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  explicitName?: string,
  warnings?: string[]
): string {
  const params: string[] = []

  for (const param of node.parameters) {
    const name = param.name.getText(sourceFile)
    const isOptional = !!param.questionToken || !!param.initializer
    const typeExample = typeToExample(param.type, undefined, warnings)

    if (param.initializer) {
      // Has default value - use it directly
      const defaultText = param.initializer.getText(sourceFile)
      params.push(`${name} = ${defaultText}`)
    } else if (typeExample === 'any' || typeExample === 'undefined') {
      // Unknown type - just use the name without annotation
      params.push(name)
    } else if (isOptional) {
      // Optional without default - use = for optional
      params.push(`${name} = ${typeExample}`)
    } else {
      // Required - use : for required
      params.push(`${name}: ${typeExample}`)
    }
  }

  const funcName =
    explicitName ||
    (ts.isFunctionDeclaration(node) && node.name
      ? node.name.getText(sourceFile)
      : '')
  const returnExample = node.type
    ? typeToExample(node.type, undefined, warnings)
    : ''
  const returnAnnotation =
    returnExample && returnExample !== 'undefined' && returnExample !== 'any'
      ? ` -> ${returnExample}`
      : ''

  // Get function body
  let body = ''
  if (node.body) {
    if (ts.isBlock(node.body)) {
      body = node.body.getText(sourceFile)
    } else {
      // Arrow function with expression body
      body = `{ return ${node.body.getText(sourceFile)} }`
    }
  } else {
    body = '{ }'
  }

  return `function ${funcName}(${params.join(', ')})${returnAnnotation} ${body}`
}

/**
 * Extract type metadata from a TypeScript function
 */
function extractFunctionMetadata(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  ctx?: TypeResolutionContext
): FunctionTypeInfo {
  const name =
    ts.isFunctionDeclaration(node) && node.name
      ? node.name.getText(sourceFile)
      : 'anonymous'
  const params: Record<string, ParamTypeInfo> = {}

  for (const param of node.parameters) {
    const paramName = param.name.getText(sourceFile)
    const isOptional = !!param.questionToken || !!param.initializer

    let defaultValue: any = undefined
    if (param.initializer) {
      // Try to extract literal default value
      const initText = param.initializer.getText(sourceFile)
      try {
        defaultValue = JSON.parse(initText)
      } catch {
        defaultValue = initText
      }
    }

    params[paramName] = {
      type: typeToInfo(param.type, ctx),
      required: !isOptional,
      default: defaultValue,
    }
  }

  const result: FunctionTypeInfo = {
    name,
    params,
    returns: node.type ? typeToInfo(node.type, ctx) : undefined,
  }

  // Extract generic type parameters
  const typeParams = extractTypeParams(node, warnings)
  if (typeParams) {
    result.typeParams = typeParams
  }

  return result
}

/**
 * Extract type metadata from a TypeScript class
 */
function extractClassMetadata(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  ctx?: TypeResolutionContext
): ClassTypeInfo {
  const name = node.name?.getText(sourceFile) || 'anonymous'
  const methods: Record<string, FunctionTypeInfo> = {}
  const staticMethods: Record<string, FunctionTypeInfo> = {}
  let constructorInfo: { params: Record<string, ParamTypeInfo> } | undefined

  for (const member of node.members) {
    // Constructor
    if (ts.isConstructorDeclaration(member)) {
      const params: Record<string, ParamTypeInfo> = {}
      for (const param of member.parameters) {
        const paramName = param.name.getText(sourceFile)
        const isOptional = !!param.questionToken || !!param.initializer

        let defaultValue: any = undefined
        if (param.initializer) {
          const initText = param.initializer.getText(sourceFile)
          try {
            defaultValue = JSON.parse(initText)
          } catch {
            defaultValue = initText
          }
        }

        params[paramName] = {
          type: typeToInfo(param.type, ctx),
          required: !isOptional,
          default: defaultValue,
        }
      }
      constructorInfo = { params }
    }

    // Methods (instance and static)
    if (ts.isMethodDeclaration(member) && member.name) {
      const methodName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )

      const params: Record<string, ParamTypeInfo> = {}
      for (const param of member.parameters) {
        const paramName = param.name.getText(sourceFile)
        const isOptional = !!param.questionToken || !!param.initializer

        let defaultValue: any = undefined
        if (param.initializer) {
          const initText = param.initializer.getText(sourceFile)
          try {
            defaultValue = JSON.parse(initText)
          } catch {
            defaultValue = initText
          }
        }

        params[paramName] = {
          type: typeToInfo(param.type, ctx),
          required: !isOptional,
          default: defaultValue,
        }
      }

      const methodInfo: FunctionTypeInfo = {
        name: methodName,
        params,
        returns: member.type ? typeToInfo(member.type, ctx) : undefined,
      }

      if (isStatic) {
        staticMethods[methodName] = methodInfo
      } else {
        methods[methodName] = methodInfo
      }
    }
  }

  const result: ClassTypeInfo = {
    name,
    methods,
    staticMethods,
  }

  if (constructorInfo) {
    result.constructor = constructorInfo
  }

  // Extract class-level generic type parameters
  if (node.typeParameters && node.typeParameters.length > 0) {
    const typeParams: Record<string, TypeParamInfo> = {}
    for (const param of node.typeParameters) {
      const paramName = param.name.getText(sourceFile)
      const info: TypeParamInfo = {}
      if (param.constraint) {
        info.constraint = typeToExample(
          param.constraint,
          undefined,
          warnings,
          ctx
        )
      }
      if (param.default) {
        info.default = typeToExample(param.default, undefined, warnings, ctx)
      }
      typeParams[paramName] = info
    }
    result.typeParams = typeParams
  }

  return result
}

/**
 * Transpile TypeScript source to TJS or JS + metadata
 */
export function fromTS(
  source: string,
  options: FromTSOptions = {}
): FromTSResult {
  const { emitTJS = false, filename = 'input.ts' } = options
  const warnings: string[] = []

  // Parse TypeScript
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true
  )

  const tjsFunctions: string[] = []
  const metadata: Record<string, FunctionTypeInfo> = {}
  const classMetadata: Record<string, ClassTypeInfo> = {}

  // Build type alias and interface maps first (first pass)
  const typeAliases = new Map<string, ts.TypeNode>()
  const interfaces = new Map<string, ts.InterfaceDeclaration>()

  function collectTypes(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node)) {
      typeAliases.set(node.name.getText(sourceFile), node.type)
    }
    if (ts.isInterfaceDeclaration(node)) {
      interfaces.set(node.name.getText(sourceFile), node)
    }
    ts.forEachChild(node, collectTypes)
  }
  collectTypes(sourceFile)

  // Create resolution context
  const resolutionCtx: TypeResolutionContext = {
    typeAliases,
    interfaces,
    sourceFile,
    warnings,
  }

  // Walk the AST
  function visit(node: ts.Node) {
    // Handle: function foo() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      const funcName = node.name.getText(sourceFile)

      if (emitTJS) {
        tjsFunctions.push(
          transformFunctionToTJS(node, sourceFile, undefined, warnings)
        )
      } else {
        metadata[funcName] = extractFunctionMetadata(
          node,
          sourceFile,
          warnings,
          resolutionCtx
        )
      }
    }

    // Handle: const foo = () => {} or const foo = function() {}
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          const funcName = decl.name.getText(sourceFile)
          const funcNode = decl.initializer

          if (emitTJS) {
            tjsFunctions.push(
              transformFunctionToTJS(funcNode, sourceFile, funcName, warnings)
            )
          } else {
            const info = extractFunctionMetadata(
              funcNode,
              sourceFile,
              warnings,
              resolutionCtx
            )
            info.name = funcName
            metadata[funcName] = info
          }
        }
      }
    }

    // Handle: interface Foo { ... }
    if (ts.isInterfaceDeclaration(node) && emitTJS) {
      const typeName = node.name.getText(sourceFile)
      const typeDecl = transformInterfaceToType(node, sourceFile, warnings)
      if (typeDecl) {
        tjsFunctions.push(typeDecl)
      }
    }

    // Handle: type Foo = { ... }
    if (ts.isTypeAliasDeclaration(node) && emitTJS) {
      const typeName = node.name.getText(sourceFile)
      const typeDecl = transformTypeAliasToType(node, sourceFile, warnings)
      if (typeDecl) {
        tjsFunctions.push(typeDecl)
      }
    }

    // Handle: enum Status { Pending, Active, Done }
    if (ts.isEnumDeclaration(node) && emitTJS) {
      const enumDecl = transformEnumToTJS(node, sourceFile, warnings)
      if (enumDecl) {
        tjsFunctions.push(enumDecl)
      }
    }

    // Handle: class Foo { ... }
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.getText(sourceFile)
      if (!emitTJS) {
        classMetadata[className] = extractClassMetadata(
          node,
          sourceFile,
          warnings,
          resolutionCtx
        )
      }
      // TODO: emitTJS mode for classes
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (emitTJS) {
    return {
      code: tjsFunctions.join('\n\n'),
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // For JS output, strip types and add metadata
  const jsOutput = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
    },
  })

  // Append __tjs metadata for each function
  let code = jsOutput.outputText
  for (const [funcName, info] of Object.entries(metadata)) {
    const metadataObj: Record<string, any> = {
      params: Object.fromEntries(
        Object.entries(info.params).map(([k, v]) => [
          k,
          { type: v.type.kind, required: v.required, default: v.default },
        ])
      ),
      returns: info.returns ? { type: info.returns.kind } : undefined,
    }

    // Include type parameters (generics) if present
    if (info.typeParams) {
      metadataObj.typeParams = info.typeParams
    }

    const metadataStr = JSON.stringify(metadataObj, null, 2)
    code += `\n${funcName}.__tjs = ${metadataStr};\n`
  }

  // Append __tjs metadata for each class
  for (const [className, info] of Object.entries(classMetadata)) {
    const metadataObj: Record<string, any> = {
      constructor: info.constructor
        ? {
            params: Object.fromEntries(
              Object.entries(info.constructor.params ?? {}).map(([k, v]) => [
                k,
                { type: v.type.kind, required: v.required, default: v.default },
              ])
            ),
          }
        : undefined,
      methods: Object.fromEntries(
        Object.entries(info.methods ?? {}).map(([name, m]) => [
          name,
          {
            params: Object.fromEntries(
              Object.entries(m.params ?? {}).map(([k, v]) => [
                k,
                { type: v.type.kind, required: v.required },
              ])
            ),
            returns: m.returns ? { type: m.returns.kind } : undefined,
          },
        ])
      ),
      staticMethods: Object.fromEntries(
        Object.entries(info.staticMethods ?? {}).map(([name, m]) => [
          name,
          {
            params: Object.fromEntries(
              Object.entries(m.params ?? {}).map(([k, v]) => [
                k,
                { type: v.type.kind, required: v.required },
              ])
            ),
            returns: m.returns ? { type: m.returns.kind } : undefined,
          },
        ])
      ),
    }

    if (info.typeParams) {
      metadataObj.typeParams = info.typeParams
    }

    const metadataStr = JSON.stringify(metadataObj, null, 2)
    code += `\n${className}.__tjs = ${metadataStr};\n`

    // Wrap class to make it callable without `new`
    code += `\n${emitClassWrapper(className)}\n`
  }

  return {
    code,
    types: metadata,
    classes: Object.keys(classMetadata).length > 0 ? classMetadata : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
