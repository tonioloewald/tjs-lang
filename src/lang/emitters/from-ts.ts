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
  /** Type metadata (only when emitting JS) */
  types?: Record<string, FunctionTypeInfo>
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
    | 'object'
    | 'union'
    | 'any'
  items?: TypeInfo
  shape?: Record<string, TypeInfo>
  members?: TypeInfo[]
  nullable?: boolean
}

/**
 * Convert a TypeScript type node to a TJS example value string
 *
 * @param warnings - Optional array to collect warnings about generic types
 */
function typeToExample(
  type: ts.TypeNode | undefined,
  checker?: ts.TypeChecker,
  warnings?: string[]
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
        const itemExample = typeToExample(typeRef.typeArguments[0], checker)
        return `[${itemExample}]`
      }
      if (typeName === 'Promise') {
        // Unwrap Promise type
        if (typeRef.typeArguments?.length) {
          return typeToExample(typeRef.typeArguments[0], checker)
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
function typeToInfo(type: ts.TypeNode | undefined): TypeInfo {
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
      return { kind: 'array', items: typeToInfo(arrayType.elementType) }
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode
      const shape: Record<string, TypeInfo> = {}
      for (const member of typeLiteral.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText()
          shape[propName] = typeToInfo(member.type)
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
        return { ...typeToInfo(nonNullTypes[0]), nullable: true }
      }

      return {
        kind: 'union',
        members: unionType.types.map((t) => typeToInfo(t)),
      }
    }

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode
      const typeName = typeRef.typeName.getText()
      if (typeName === 'Array' && typeRef.typeArguments?.length) {
        return { kind: 'array', items: typeToInfo(typeRef.typeArguments[0]) }
      }
      if (typeName === 'Promise' && typeRef.typeArguments?.length) {
        return typeToInfo(typeRef.typeArguments[0])
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
    returnExample && returnExample !== 'undefined' ? ` -> ${returnExample}` : ''

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
  warnings?: string[]
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
      type: typeToInfo(param.type),
      required: !isOptional,
      default: defaultValue,
    }
  }

  const result: FunctionTypeInfo = {
    name,
    params,
    returns: node.type ? typeToInfo(node.type) : undefined,
  }

  // Extract generic type parameters
  const typeParams = extractTypeParams(node, warnings)
  if (typeParams) {
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
        metadata[funcName] = extractFunctionMetadata(node, sourceFile, warnings)
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
            const info = extractFunctionMetadata(funcNode, sourceFile, warnings)
            info.name = funcName
            metadata[funcName] = info
          }
        }
      }
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

  return {
    code,
    types: metadata,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
