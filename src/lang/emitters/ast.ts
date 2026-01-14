/**
 * ESTree to Agent99 AST Transformer
 *
 * Converts parsed JavaScript into Agent99's JSON AST format.
 */

import type {
  Statement,
  Expression,
  FunctionDeclaration,
  BlockStatement,
  VariableDeclaration,
  ExpressionStatement,
  IfStatement,
  WhileStatement,
  ForOfStatement,
  TryStatement,
  ReturnStatement,
  CallExpression,
  AssignmentExpression,
  BinaryExpression,
  LogicalExpression,
  MemberExpression,
  Identifier,
  Literal,
  TemplateLiteral,
  ArrayExpression,
  ObjectExpression,
} from 'acorn'
import type { BaseNode } from '../../builder'
import type { ExprNode } from '../../runtime'
import type {
  TransformContext,
  TranspileOptions,
  FunctionSignature,
  ParameterDescriptor,
  TypeDescriptor,
  TranspileWarning,
} from '../types'
import { TranspileError, getLocation, createChildContext } from '../types'
import {
  parseParameter,
  inferTypeFromValue,
  parseReturnType,
} from '../inference'
import { extractJSDoc } from '../parser'

/**
 * Convert TypeDescriptor to JSON Schema
 */
function typeToJsonSchema(type: TypeDescriptor): any {
  switch (type.kind) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      // null as a default value means "any type, defaults to null"
      // In JSON Schema, empty object means any type is allowed
      return {}
    case 'undefined':
      return {} // JSON Schema doesn't have undefined, treat as any
    case 'any':
      return {} // No constraints
    case 'array':
      return {
        type: 'array',
        items: type.items ? typeToJsonSchema(type.items) : {},
      }
    case 'object':
      if (type.shape) {
        const properties: Record<string, any> = {}
        for (const [key, propType] of Object.entries(type.shape)) {
          properties[key] = typeToJsonSchema(propType)
        }
        return {
          type: 'object',
          properties,
          additionalProperties: false,
        }
      }
      return { type: 'object' }
    case 'union':
      if (type.members) {
        return { oneOf: type.members.map(typeToJsonSchema) }
      }
      return {}
    default:
      return {}
  }
}

/**
 * Convert function parameters to JSON Schema for input validation
 */
function parametersToJsonSchema(
  parameters: Record<string, ParameterDescriptor>
): any {
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [name, param] of Object.entries(parameters)) {
    properties[name] = typeToJsonSchema(param.type)
    if (param.required) {
      required.push(name)
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  }
}

/**
 * Transform a function declaration into Agent99 AST
 */
export function transformFunction(
  func: FunctionDeclaration,
  source: string,
  returnTypeAnnotation: string | undefined,
  options: TranspileOptions = {},
  requiredParamsFromPreprocess?: Set<string>
): {
  ast: BaseNode
  signature: FunctionSignature
  warnings: TranspileWarning[]
} {
  // Extract JSDoc
  const jsdoc = extractJSDoc(source, func)

  // Parse parameters
  const parameters = new Map<string, ParameterDescriptor>()

  for (const param of func.params) {
    const parsed = parseParameter(param, requiredParamsFromPreprocess)

    // Handle destructured parameters - expand into individual params
    if (
      parsed.name === '__destructured__' &&
      parsed.type.kind === 'object' &&
      parsed.type.destructuredParams
    ) {
      for (const [key, paramDesc] of Object.entries(
        parsed.type.destructuredParams
      )) {
        parameters.set(key, {
          ...(paramDesc as any),
          description: jsdoc.params[key],
        })
      }
    } else {
      parsed.description = jsdoc.params[parsed.name]
      parameters.set(parsed.name, parsed)
    }
  }

  // Parse return type
  let returnType: TypeDescriptor | undefined
  if (returnTypeAnnotation) {
    returnType = parseReturnType(returnTypeAnnotation)
  }

  // Create transform context
  const ctx: TransformContext = {
    depth: 0,
    locals: new Map(),
    parameters,
    atoms: new Set(Object.keys(options.atoms || {})),
    warnings: [],
    source,
    filename: options.filename || '<source>',
    options,
  }

  // Transform function body
  const bodySteps = transformBlock(func.body, ctx)

  // Handle parameters: varsImport for required, varSet with defaults for optional
  const steps: BaseNode[] = []
  const requiredParams: string[] = []
  const optionalParams: Array<{ name: string; defaultValue: any }> = []

  for (const [name, param] of parameters.entries()) {
    if (param.required) {
      requiredParams.push(name)
    } else if (param.default !== undefined) {
      optionalParams.push({ name, defaultValue: param.default })
    } else {
      // Optional without explicit default - still import from args
      requiredParams.push(name)
    }
  }

  // Import required params directly from args
  if (requiredParams.length > 0) {
    steps.push({
      op: 'varsImport',
      keys: requiredParams,
    })
  }

  // For optional params with defaults: import from args, then check and set default if null
  for (const { name, defaultValue } of optionalParams) {
    // Import from args (will be undefined if not provided)
    steps.push({
      op: 'varsImport',
      keys: [name],
    })
    // If null/undefined, set the default
    steps.push({
      op: 'if',
      condition: {
        $expr: 'binary',
        op: '==',
        left: { $expr: 'ident', name },
        right: { $expr: 'literal', value: null },
      },
      then: [
        {
          op: 'varSet',
          key: name,
          value: defaultValue,
        },
      ],
    })
  }

  steps.push(...bodySteps)

  // Build signature
  const signatureParams = Object.fromEntries(parameters)
  const signature: FunctionSignature = {
    name: func.id?.name || 'anonymous',
    description: jsdoc.description,
    parameters: signatureParams,
    returns: returnType,
  }

  // Generate input schema for runtime validation
  const inputSchema = parametersToJsonSchema(signatureParams)

  return {
    ast: { op: 'seq', steps, inputSchema },
    signature,
    warnings: ctx.warnings,
  }
}

/**
 * Transform a block statement into a list of steps
 */
export function transformBlock(
  block: BlockStatement,
  ctx: TransformContext
): BaseNode[] {
  const steps: BaseNode[] = []

  for (const stmt of block.body) {
    const transformed = transformStatement(stmt, ctx)
    if (transformed) {
      if (Array.isArray(transformed)) {
        steps.push(...transformed)
      } else {
        steps.push(transformed)
      }
    }
  }

  return steps
}

/**
 * Transform a statement
 */
export function transformStatement(
  stmt: Statement,
  ctx: TransformContext
): BaseNode | BaseNode[] | null {
  switch (stmt.type) {
    case 'VariableDeclaration':
      return transformVariableDeclaration(stmt as VariableDeclaration, ctx)

    case 'ExpressionStatement':
      return transformExpressionStatement(stmt as ExpressionStatement, ctx)

    case 'IfStatement':
      return transformIfStatement(stmt as IfStatement, ctx)

    case 'WhileStatement':
      return transformWhileStatement(stmt as WhileStatement, ctx)

    case 'ForOfStatement':
      return transformForOfStatement(stmt as ForOfStatement, ctx)

    case 'TryStatement':
      return transformTryStatement(stmt as TryStatement, ctx)

    case 'ReturnStatement':
      return transformReturnStatement(stmt as ReturnStatement, ctx)

    case 'ThrowStatement':
      throw new TranspileError(
        `'throw' is not supported in AsyncJS. Use Error('message') to trigger error flow`,
        getLocation(stmt),
        ctx.source,
        ctx.filename
      )

    case 'BlockStatement':
      // Nested block creates a scope
      return {
        op: 'scope',
        steps: transformBlock(stmt as BlockStatement, createChildContext(ctx)),
      }

    case 'EmptyStatement':
      return null

    default:
      throw new TranspileError(
        `Unsupported statement type: ${stmt.type}`,
        getLocation(stmt),
        ctx.source,
        ctx.filename
      )
  }
}

/**
 * Transform variable declaration: let x = value or const x = value
 */
function transformVariableDeclaration(
  decl: VariableDeclaration,
  ctx: TransformContext
): BaseNode[] {
  const steps: BaseNode[] = []
  const isConst = decl.kind === 'const'
  const opName = isConst ? 'constSet' : 'varSet'

  for (const declarator of decl.declarations) {
    if (declarator.id.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple variable names are supported',
        getLocation(declarator),
        ctx.source,
        ctx.filename
      )
    }

    const name = (declarator.id as Identifier).name

    if (declarator.init) {
      // Transform the initializer
      const { step, resultVar } = transformExpressionToStep(
        declarator.init,
        ctx,
        name,
        isConst
      )

      if (step) {
        steps.push(step)
      } else if (resultVar !== name) {
        // Simple value assignment
        steps.push({
          op: opName,
          key: name,
          value: resultVar,
        })
      }

      // Track variable type
      const type = inferTypeFromValue(declarator.init as Expression)
      ctx.locals.set(name, type)
    } else {
      // Uninitialized variable (only valid for let, not const)
      if (isConst) {
        throw new TranspileError(
          'const declarations must be initialized',
          getLocation(declarator),
          ctx.source,
          ctx.filename
        )
      }
      steps.push({
        op: 'varSet',
        key: name,
        value: null,
      })
      ctx.locals.set(name, { kind: 'any', nullable: true })
    }
  }

  return steps
}

/**
 * Transform expression statement (e.g., function call)
 */
function transformExpressionStatement(
  stmt: ExpressionStatement,
  ctx: TransformContext
): BaseNode | null {
  const expr = stmt.expression

  // Assignment expression: x = value
  if (expr.type === 'AssignmentExpression') {
    return transformAssignment(expr as AssignmentExpression, ctx)
  }

  // Function call (side effect)
  if (expr.type === 'CallExpression') {
    const { step, resultVar } = transformExpressionToStep(expr, ctx)
    if (step) {
      return step
    }
    // If no step but we got an expression (e.g., method call on builtin),
    // we still need to evaluate it for side effects (like s.add(x))
    if (resultVar) {
      return {
        op: 'varSet',
        key: '_',
        value: resultVar,
      }
    }
    return null
  }

  // Other expressions (e.g., just a value) - no-op
  ctx.warnings.push({
    message: 'Expression statement has no effect',
    line: getLocation(stmt).line,
    column: getLocation(stmt).column,
  })

  return null
}

/**
 * Transform assignment: x = value
 */
function transformAssignment(
  expr: AssignmentExpression,
  ctx: TransformContext
): BaseNode {
  if (expr.left.type !== 'Identifier') {
    throw new TranspileError(
      'Only simple variable assignment is supported',
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

  const name = (expr.left as Identifier).name
  const { step, resultVar } = transformExpressionToStep(expr.right, ctx, name)

  if (step) {
    return step
  }

  return {
    op: 'varSet',
    key: name,
    value: resultVar,
  }
}

/**
 * Transform if statement
 */
function transformIfStatement(
  stmt: IfStatement,
  ctx: TransformContext
): BaseNode {
  // Convert condition to ExprNode
  const condition = expressionToExprNode(stmt.test, ctx)

  // Transform then branch
  const thenSteps =
    stmt.consequent.type === 'BlockStatement'
      ? transformBlock(
          stmt.consequent as BlockStatement,
          createChildContext(ctx)
        )
      : ([transformStatement(stmt.consequent, ctx)].filter(
          Boolean
        ) as BaseNode[])

  // Transform else branch if present
  let elseSteps: BaseNode[] | undefined
  if (stmt.alternate) {
    elseSteps =
      stmt.alternate.type === 'BlockStatement'
        ? transformBlock(
            stmt.alternate as BlockStatement,
            createChildContext(ctx)
          )
        : ([transformStatement(stmt.alternate, ctx)].filter(
            Boolean
          ) as BaseNode[])
  }

  return {
    op: 'if',
    condition,
    then: thenSteps,
    ...(elseSteps && { else: elseSteps }),
  }
}

/**
 * Transform while statement
 */
function transformWhileStatement(
  stmt: WhileStatement,
  ctx: TransformContext
): BaseNode {
  const condition = expressionToExprNode(stmt.test, ctx)

  const body =
    stmt.body.type === 'BlockStatement'
      ? transformBlock(stmt.body as BlockStatement, createChildContext(ctx))
      : ([transformStatement(stmt.body, ctx)].filter(Boolean) as BaseNode[])

  return {
    op: 'while',
    condition,
    body,
  }
}

/**
 * Transform for...of statement into map atom
 */
function transformForOfStatement(
  stmt: ForOfStatement,
  ctx: TransformContext
): BaseNode {
  // Get the loop variable name
  let varName: string
  if (stmt.left.type === 'VariableDeclaration') {
    const decl = stmt.left.declarations[0]
    if (decl.id.type !== 'Identifier') {
      throw new TranspileError(
        'Only simple variable names are supported in for...of',
        getLocation(stmt.left),
        ctx.source,
        ctx.filename
      )
    }
    varName = (decl.id as Identifier).name
  } else if (stmt.left.type === 'Identifier') {
    varName = (stmt.left as Identifier).name
  } else {
    throw new TranspileError(
      'Unsupported for...of left-hand side',
      getLocation(stmt.left),
      ctx.source,
      ctx.filename
    )
  }

  // Get the iterable
  const items = expressionToValue(stmt.right, ctx)

  // Create child context with loop variable
  const childCtx = createChildContext(ctx)
  childCtx.locals.set(varName, { kind: 'any' })

  // Transform body
  const steps =
    stmt.body.type === 'BlockStatement'
      ? transformBlock(stmt.body as BlockStatement, childCtx)
      : ([transformStatement(stmt.body, childCtx)].filter(
          Boolean
        ) as BaseNode[])

  return {
    op: 'map',
    items,
    as: varName,
    steps,
  }
}

/**
 * Transform try/catch statement
 */
function transformTryStatement(
  stmt: TryStatement,
  ctx: TransformContext
): BaseNode {
  const trySteps = transformBlock(stmt.block, createChildContext(ctx))

  let catchSteps: BaseNode[] | undefined
  let catchParam: string | undefined
  if (stmt.handler) {
    const catchCtx = createChildContext(ctx)
    // Add error variable to scope if named
    if (stmt.handler.param?.type === 'Identifier') {
      catchParam = (stmt.handler.param as Identifier).name
      catchCtx.locals.set(catchParam, {
        kind: 'any',
      })
    }
    catchSteps = transformBlock(stmt.handler.body, catchCtx)
  }

  return {
    op: 'try',
    try: trySteps,
    ...(catchSteps && { catch: catchSteps }),
    ...(catchParam && { catchParam }),
  }
}

/**
 * Transform return statement
 */
function transformReturnStatement(
  stmt: ReturnStatement,
  ctx: TransformContext
): BaseNode {
  if (!stmt.argument) {
    return { op: 'return', schema: {} }
  }

  // If returning an object literal, we need to handle each property
  if (stmt.argument.type === 'ObjectExpression') {
    const obj = stmt.argument as ObjectExpression
    const steps: BaseNode[] = []
    const schemaProperties: Record<string, any> = {}

    for (const prop of obj.properties) {
      if (prop.type === 'Property') {
        const key =
          prop.key.type === 'Identifier'
            ? (prop.key as Identifier).name
            : String((prop.key as Literal).value)

        schemaProperties[key] = {}

        // Get the value expression
        const valueExpr = prop.value as Expression

        // If it's a shorthand like { city } or simple identifier matching the key
        if (
          prop.shorthand ||
          (valueExpr.type === 'Identifier' &&
            (valueExpr as Identifier).name === key)
        ) {
          // The value is already in state with the same name, nothing to do
          continue
        }

        // For member expressions like weather.condition, or other complex expressions,
        // we need to set the result key in state first
        const value = expressionToValue(valueExpr, ctx)

        // If value is a string (state reference) and not the same as key, copy it
        if (typeof value === 'string' && value !== key) {
          steps.push({
            op: 'varSet',
            key,
            value,
          })
        } else if (typeof value !== 'string') {
          // Literal value or complex object
          steps.push({
            op: 'varSet',
            key,
            value,
          })
        }
      }
    }

    steps.push({
      op: 'return',
      schema: { type: 'object', properties: schemaProperties },
    })

    if (steps.length === 1) {
      return steps[0]
    }
    return { op: 'seq', steps }
  }

  // For non-object returns, set a result variable first
  const _schema = extractReturnSchema(stmt.argument, ctx)
  const { step, resultVar } = transformExpressionToStep(
    stmt.argument,
    ctx,
    '__result__'
  )

  const steps: BaseNode[] = []
  if (step) {
    steps.push(step)
  } else if (resultVar !== '__result__') {
    steps.push({ op: 'varSet', key: '__result__', value: resultVar })
  }

  steps.push({ op: 'return', schema: { __result__: {} } })

  // Wrap in seq if multiple steps
  if (steps.length === 1) {
    return steps[0]
  }

  return { op: 'seq', steps }
}

// Known builtins that should be evaluated as expressions, not atom calls
const BUILTIN_OBJECTS = new Set([
  'Math',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'console',
  'Date', // Date factory with static methods like Date.now()
  'Schema', // tosijs-schema fluent API for building JSON Schemas
])

const BUILTIN_GLOBALS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'Set', // Factory function for set-like objects
  'Date', // Factory function for date-like objects
  'filter', // Schema-based object filtering
])

const UNSUPPORTED_BUILTINS = new Set([
  'RegExp',
  'Promise',
  'Map',
  'WeakSet',
  'WeakMap',
  'Symbol',
  'Proxy',
  'Reflect',
  'Function',
  'eval',
  'setTimeout',
  'setInterval',
  'fetch',
  'require',
  'import',
  'process',
  'window',
  'document',
  'global',
  'globalThis',
])

// Instance methods that should be evaluated as expressions, not atom calls
// These are methods on values (strings, arrays, etc.) that have native implementations
const INSTANCE_METHODS = new Set([
  // String methods
  'toUpperCase',
  'toLowerCase',
  'trim',
  'trimStart',
  'trimEnd',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'concat',
  'includes',
  'indexOf',
  'lastIndexOf',
  'startsWith',
  'endsWith',
  'slice',
  'substring',
  'substr',
  'replace',
  'replaceAll',
  'match',
  'search',
  'padStart',
  'padEnd',
  'repeat',
  'normalize',
  'localeCompare',
  'toString',
  'valueOf',
  'at',
  // Array methods (that don't need special atom handling)
  'reverse',
  'sort',
  'fill',
  'copyWithin',
  'flat',
  'flatMap',
  'every',
  'some',
  'forEach',
  // Note: map, filter, find, reduce are handled specially as atoms for lambda support
  // Set methods (from Set() builtin)
  'add',
  'remove',
  'has',
  'clear',
  'toArray',
  'union',
  'intersection',
  'diff',
  // Date methods (from Date() builtin)
  'format',
  'isBefore',
  'isAfter',
  // Note: Date.add and Date.diff are method calls that return new values
])

/**
 * Check if a CallExpression is a builtin call (Math.floor, JSON.parse, etc.)
 * or an instance method call (str.toUpperCase(), arr.includes(), etc.)
 */
function isBuiltinCall(expr: CallExpression): boolean {
  // Check for global functions like parseInt()
  if (expr.callee.type === 'Identifier') {
    const name = (expr.callee as Identifier).name
    return BUILTIN_GLOBALS.has(name) || UNSUPPORTED_BUILTINS.has(name)
  }

  // Check for method calls
  if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee as MemberExpression

    // Check for method calls on builtin objects like Math.floor()
    if (member.object.type === 'Identifier') {
      const objName = (member.object as Identifier).name
      if (BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName)) {
        return true
      }
    }

    // Check for instance method calls like str.toUpperCase()
    if (member.property.type === 'Identifier') {
      const methodName = (member.property as Identifier).name
      if (INSTANCE_METHODS.has(methodName)) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if a MemberExpression is accessing a builtin object (Math.PI, Number.MAX_VALUE, etc.)
 */
function isBuiltinMemberAccess(expr: MemberExpression): boolean {
  if (expr.object.type === 'Identifier') {
    const objName = (expr.object as Identifier).name
    return BUILTIN_OBJECTS.has(objName) || UNSUPPORTED_BUILTINS.has(objName)
  }
  return false
}

// Error messages for unsupported builtins
const UNSUPPORTED_BUILTIN_MESSAGES: Record<string, string> = {
  RegExp: 'RegExp is not available. Use string methods or the regexMatch atom.',
  Promise: 'Promise is not needed. All operations are implicitly async.',
  Map: 'Map is not available. Use plain objects instead.',
  WeakSet: 'WeakSet is not available.',
  WeakMap: 'WeakMap is not available.',
  Symbol: 'Symbol is not available.',
  Proxy: 'Proxy is not available.',
  Reflect: 'Reflect is not available.',
  Function: 'Function constructor is not available. Define functions normally.',
  eval: 'eval is not available. Code is compiled, not evaluated.',
  setTimeout: 'setTimeout is not available. Use the delay atom.',
  setInterval: 'setInterval is not available. Use while loops with delay.',
  fetch: 'fetch is not available. Use the httpFetch atom.',
  require: 'require is not available. Atoms must be registered with the VM.',
  import: 'import is not available. Atoms must be registered with the VM.',
  process: 'process is not available. AsyncJS runs in a sandboxed environment.',
  window: 'window is not available. AsyncJS runs in a sandboxed environment.',
  document:
    'document is not available. AsyncJS runs in a sandboxed environment.',
  global: 'global is not available. AsyncJS runs in a sandboxed environment.',
  globalThis: 'globalThis is not available. Use builtins directly.',
}

/**
 * Check if expression uses an unsupported builtin and return error message if so
 */
function getUnsupportedBuiltinError(expr: CallExpression): string | null {
  if (expr.callee.type === 'Identifier') {
    const name = (expr.callee as Identifier).name
    if (UNSUPPORTED_BUILTINS.has(name)) {
      return (
        UNSUPPORTED_BUILTIN_MESSAGES[name] ||
        `${name} is not available in AsyncJS.`
      )
    }
  }

  if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee as MemberExpression
    if (member.object.type === 'Identifier') {
      const objName = (member.object as Identifier).name
      if (UNSUPPORTED_BUILTINS.has(objName)) {
        return (
          UNSUPPORTED_BUILTIN_MESSAGES[objName] ||
          `${objName} is not available in AsyncJS.`
        )
      }
    }
  }

  return null
}

/**
 * Get helpful suggestion for 'new' expression alternatives
 */
function getNewExpressionSuggestion(constructorName: string): string {
  const suggestions: Record<string, string> = {
    Date: " Use Date() or Date('2024-01-15') instead - no 'new' needed.",
    Set: " Use Set([items]) instead - no 'new' needed.",
    Map: ' Use plain objects instead of Map.',
    Array: ' Use array literals like [1, 2, 3] instead.',
    Object: ' Use object literals like { key: value } instead.',
    Error: " Return an error object like { error: 'message' } instead.",
    RegExp: ' Use string methods or the regexMatch atom.',
    Promise: ' Not needed - all operations are implicitly async.',
    WeakSet: ' WeakSet is not available.',
    WeakMap: ' WeakMap is not available.',
  }
  return (
    suggestions[constructorName] ||
    ' Use factory functions or object literals instead.'
  )
}

/**
 * Transform an expression, potentially into a step with a result variable
 */
function transformExpressionToStep(
  expr: Expression,
  ctx: TransformContext,
  resultVar?: string,
  isConst?: boolean
): { step: BaseNode | null; resultVar: any } {
  const varOp = isConst ? 'constSet' : 'varSet'

  // Unwrap ChainExpression (optional chaining wrapper)
  if (expr.type === 'ChainExpression') {
    const chain = expr as any
    // The inner expression has optional: true on the relevant nodes
    // Just recurse with the unwrapped expression
    return transformExpressionToStep(
      chain.expression as Expression,
      ctx,
      resultVar,
      isConst
    )
  }

  // Check for 'new' keyword - not supported in AsyncJS
  if (expr.type === 'NewExpression') {
    const newExpr = expr as any
    let constructorName = 'constructor'
    if (newExpr.callee.type === 'Identifier') {
      constructorName = newExpr.callee.name
    }
    const suggestion = getNewExpressionSuggestion(constructorName)
    throw new TranspileError(
      `The 'new' keyword is not supported in AsyncJS.${suggestion}`,
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

  // Check for unsupported builtins first and give helpful error
  if (expr.type === 'CallExpression') {
    const unsupportedError = getUnsupportedBuiltinError(expr as CallExpression)
    if (unsupportedError) {
      throw new TranspileError(
        unsupportedError,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
  }

  // Check if this is a builtin call (Math.floor, JSON.parse, parseInt, etc.)
  // Builtins are evaluated as expressions, not atom calls
  if (expr.type === 'CallExpression' && isBuiltinCall(expr as CallExpression)) {
    const exprNode = expressionToExprNode(expr, ctx)

    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }

    return { step: null, resultVar: exprNode as any }
  }

  // Check if this is a builtin member access (Math.PI, Number.MAX_SAFE_INTEGER, etc.)
  if (
    expr.type === 'MemberExpression' &&
    isBuiltinMemberAccess(expr as MemberExpression)
  ) {
    const exprNode = expressionToExprNode(expr, ctx)

    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }

    return { step: null, resultVar: exprNode as any }
  }

  // Function call -> atom invocation
  if (expr.type === 'CallExpression') {
    return transformCallExpression(
      expr as CallExpression,
      ctx,
      resultVar,
      isConst
    )
  }

  // Template literal -> template atom
  if (expr.type === 'TemplateLiteral') {
    return transformTemplateLiteral(
      expr as TemplateLiteral,
      ctx,
      resultVar,
      isConst
    )
  }

  // Binary/logical/unary expression - convert to ExprNode
  if (
    expr.type === 'BinaryExpression' ||
    expr.type === 'LogicalExpression' ||
    expr.type === 'UnaryExpression'
  ) {
    const exprNode = expressionToExprNode(expr, ctx)

    // If we need to store the result, emit a varSet/constSet with the expression node as value
    if (resultVar) {
      return {
        step: {
          op: varOp,
          key: resultVar,
          value: exprNode,
        },
        resultVar,
      }
    }

    // No storage needed, just return the expression node as the result
    return { step: null, resultVar: exprNode as any }
  }

  // Simple value - no step needed
  const value = expressionToValue(expr, ctx)
  return { step: null, resultVar: value }
}

/**
 * Transform a function call expression
 */
function transformCallExpression(
  expr: CallExpression,
  ctx: TransformContext,
  resultVar?: string,
  isConst?: boolean
): { step: BaseNode; resultVar: string | undefined } {
  // Get the function name
  let funcName: string
  let isMethodCall = false
  let receiver: any

  if (expr.callee.type === 'Identifier') {
    funcName = (expr.callee as Identifier).name
  } else if (expr.callee.type === 'MemberExpression') {
    const member = expr.callee as MemberExpression
    if (member.property.type === 'Identifier') {
      funcName = (member.property as Identifier).name
      isMethodCall = true
      receiver = expressionToValue(member.object as Expression, ctx)
    } else {
      throw new TranspileError(
        'Computed method names are not supported',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
  } else {
    throw new TranspileError(
      'Only named function calls are supported',
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

  // Handle built-in method calls
  if (isMethodCall) {
    return transformMethodCall(
      funcName,
      receiver,
      expr.arguments as Expression[],
      ctx,
      resultVar,
      isConst
    )
  }

  // Handle console.log specially
  if (funcName === 'console' && expr.callee.type === 'MemberExpression') {
    // This would be caught above, but just in case
  }

  // Check if it's a known atom
  // For now, we assume any function call is an atom call
  // The VM will validate at runtime

  // Extract arguments
  const args = extractCallArguments(expr, ctx)

  return {
    step: {
      op: funcName,
      ...args,
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}

/**
 * Handle method calls like arr.map(), str.slice(), etc.
 */
function transformMethodCall(
  method: string,
  receiver: any,
  args: Expression[],
  ctx: TransformContext,
  resultVar?: string,
  isConst?: boolean
): { step: BaseNode; resultVar: string | undefined } {
  switch (method) {
    case 'map':
      // arr.map(x => ...) -> map atom
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0] as any
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'

        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })

        let steps: BaseNode[]
        if (callback.body.type === 'BlockStatement') {
          steps = transformBlock(callback.body, childCtx)
        } else {
          // Expression body: x => x * 2
          const { step, resultVar: exprResult } = transformExpressionToStep(
            callback.body,
            childCtx,
            'result'
          )
          steps = step
            ? [step]
            : [{ op: 'varSet', key: 'result', value: exprResult }]
        }

        return {
          step: {
            op: 'map',
            items: receiver,
            as: paramName,
            steps,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break

    case 'filter':
      // arr.filter(x => condition) -> filter atom
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0] as any
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'

        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })

        // For filter, the callback should return a boolean expression
        // Convert the body to an ExprNode
        let condition: any
        if (callback.body.type === 'BlockStatement') {
          // Block body - look for return statement
          throw new TranspileError(
            'filter callback must be an expression, not a block',
            getLocation(args[0]),
            ctx.source,
            ctx.filename
          )
        } else {
          // Expression body: x => x > 5
          condition = expressionToExprNode(callback.body, childCtx)
        }

        return {
          step: {
            op: 'filter',
            items: receiver,
            as: paramName,
            condition,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break

    case 'find':
      // arr.find(x => condition) -> find atom
      if (
        args.length > 0 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0] as any
        const param = callback.params[0]
        const paramName = param?.type === 'Identifier' ? param.name : 'item'

        const childCtx = createChildContext(ctx)
        childCtx.locals.set(paramName, { kind: 'any' })

        let condition: any
        if (callback.body.type === 'BlockStatement') {
          throw new TranspileError(
            'find callback must be an expression, not a block',
            getLocation(args[0]),
            ctx.source,
            ctx.filename
          )
        } else {
          condition = expressionToExprNode(callback.body, childCtx)
        }

        return {
          step: {
            op: 'find',
            items: receiver,
            as: paramName,
            condition,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break

    case 'reduce':
      // arr.reduce((acc, x) => expr, initial) -> reduce atom
      if (
        args.length >= 2 &&
        (args[0].type === 'ArrowFunctionExpression' ||
          args[0].type === 'FunctionExpression')
      ) {
        const callback = args[0] as any
        const accParam = callback.params[0]
        const itemParam = callback.params[1]
        const accName = accParam?.type === 'Identifier' ? accParam.name : 'acc'
        const itemName =
          itemParam?.type === 'Identifier' ? itemParam.name : 'item'

        const childCtx = createChildContext(ctx)
        childCtx.locals.set(accName, { kind: 'any' })
        childCtx.locals.set(itemName, { kind: 'any' })

        let steps: BaseNode[]
        if (callback.body.type === 'BlockStatement') {
          steps = transformBlock(callback.body, childCtx)
        } else {
          // Expression body: (acc, x) => acc + x
          const { step, resultVar: exprResult } = transformExpressionToStep(
            callback.body,
            childCtx,
            'result'
          )
          steps = step
            ? [step]
            : [{ op: 'varSet', key: 'result', value: exprResult }]
        }

        const initial = expressionToValue(args[1], ctx)

        return {
          step: {
            op: 'reduce',
            items: receiver,
            as: itemName,
            accumulator: accName,
            initial,
            steps,
            ...(resultVar && { result: resultVar }),
            ...(resultVar && isConst && { resultConst: true }),
          },
          resultVar,
        }
      }
      break

    case 'slice':
      // TODO: Could map to a slice atom
      break

    case 'push':
      return {
        step: {
          op: 'push',
          list: receiver,
          item: expressionToValue(args[0], ctx),
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }

    case 'join':
      return {
        step: {
          op: 'join',
          list: receiver,
          sep: args.length > 0 ? expressionToValue(args[0], ctx) : '',
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }

    case 'split':
      return {
        step: {
          op: 'split',
          str: receiver,
          sep: args.length > 0 ? expressionToValue(args[0], ctx) : '',
          ...(resultVar && { result: resultVar }),
          ...(resultVar && isConst && { resultConst: true }),
        },
        resultVar,
      }
  }

  // Unknown method - emit warning and try as generic call
  ctx.warnings.push({
    message: `Unknown method '${method}' - treating as atom call`,
    line: 0,
    column: 0,
  })

  return {
    step: {
      op: method,
      receiver,
      args: args.map((a) => expressionToValue(a, ctx)),
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}

/**
 * Transform template literal
 */
function transformTemplateLiteral(
  expr: TemplateLiteral,
  ctx: TransformContext,
  resultVar?: string,
  isConst?: boolean
): { step: BaseNode; resultVar: string | undefined } {
  // Build template string with {{var}} placeholders
  let tmpl = ''
  const vars: Record<string, any> = {}

  for (let i = 0; i < expr.quasis.length; i++) {
    tmpl += expr.quasis[i].value.cooked || expr.quasis[i].value.raw

    if (i < expr.expressions.length) {
      const exprNode = expr.expressions[i]
      const varName = `_${i}`
      vars[varName] = expressionToValue(exprNode as Expression, ctx)
      tmpl += `{{${varName}}}`
    }
  }

  return {
    step: {
      op: 'template',
      tmpl,
      vars,
      ...(resultVar && { result: resultVar }),
      ...(resultVar && isConst && { resultConst: true }),
    },
    resultVar,
  }
}

/**
 * Convert an Acorn expression to an ExprNode for direct VM evaluation.
 * This replaces the string-based condition system.
 */
function expressionToExprNode(
  expr: Expression,
  ctx: TransformContext
): ExprNode {
  switch (expr.type) {
    case 'Literal': {
      const lit = expr as Literal
      return { $expr: 'literal', value: lit.value }
    }

    case 'Identifier': {
      const id = expr as Identifier
      return { $expr: 'ident', name: id.name }
    }

    case 'MemberExpression': {
      const mem = expr as MemberExpression
      const obj = expressionToExprNode(mem.object as Expression, ctx)
      const isOptional = (mem as any).optional === true

      if (mem.computed) {
        // arr[0] or obj[key] - computed access
        // For now, only support literal indices
        const prop = mem.property as Expression
        if (prop.type === 'Literal') {
          return {
            $expr: 'member',
            object: obj,
            property: String((prop as Literal).value),
            computed: true,
            ...(isOptional && { optional: true }),
          }
        }
        // For computed with variable, we'd need more complex handling
        throw new TranspileError(
          'Computed member access with variables not yet supported',
          getLocation(expr),
          ctx.source,
          ctx.filename
        )
      }

      const propName = (mem.property as Identifier).name
      return {
        $expr: 'member',
        object: obj,
        property: propName,
        ...(isOptional && { optional: true }),
      }
    }

    case 'ChainExpression': {
      // ChainExpression wraps optional chaining (?.)
      // Just unwrap to the inner expression which will have optional: true
      const chain = expr as any
      return expressionToExprNode(chain.expression as Expression, ctx)
    }

    case 'BinaryExpression': {
      const bin = expr as BinaryExpression
      return {
        $expr: 'binary',
        op: bin.operator,
        left: expressionToExprNode(bin.left as Expression, ctx),
        right: expressionToExprNode(bin.right as Expression, ctx),
      }
    }

    case 'LogicalExpression': {
      const log = expr as LogicalExpression
      return {
        $expr: 'logical',
        op: log.operator as '&&' | '||' | '??',
        left: expressionToExprNode(log.left as Expression, ctx),
        right: expressionToExprNode(log.right as Expression, ctx),
      }
    }

    case 'UnaryExpression': {
      const un = expr as any
      return {
        $expr: 'unary',
        op: un.operator,
        argument: expressionToExprNode(un.argument as Expression, ctx),
      }
    }

    case 'ConditionalExpression': {
      const cond = expr as any
      return {
        $expr: 'conditional',
        test: expressionToExprNode(cond.test as Expression, ctx),
        consequent: expressionToExprNode(cond.consequent as Expression, ctx),
        alternate: expressionToExprNode(cond.alternate as Expression, ctx),
      }
    }

    case 'ArrayExpression': {
      const arr = expr as ArrayExpression
      return {
        $expr: 'array',
        elements: arr.elements
          .filter((el): el is Expression => el !== null)
          .map((el) => expressionToExprNode(el, ctx)),
      }
    }

    case 'ObjectExpression': {
      const obj = expr as ObjectExpression
      const properties: { key: string; value: ExprNode }[] = []

      for (const prop of obj.properties) {
        if (prop.type === 'Property') {
          const key =
            prop.key.type === 'Identifier'
              ? (prop.key as Identifier).name
              : String((prop.key as Literal).value)
          properties.push({
            key,
            value: expressionToExprNode(prop.value as Expression, ctx),
          })
        }
      }

      return { $expr: 'object', properties }
    }

    case 'CallExpression': {
      const call = expr as CallExpression

      // Handle method calls (e.g., Math.floor(x), str.toUpperCase(), arr.push(x))
      if (call.callee.type === 'MemberExpression') {
        const member = call.callee as MemberExpression
        const method =
          member.property.type === 'Identifier'
            ? (member.property as Identifier).name
            : String((member.property as Literal).value)

        // Check for optional chaining: obj?.method() or obj.method?.()
        const isOptional =
          (member as any).optional === true || (call as any).optional === true

        return {
          $expr: 'methodCall',
          object: expressionToExprNode(member.object as Expression, ctx),
          method,
          arguments: call.arguments.map((arg) =>
            expressionToExprNode(arg as Expression, ctx)
          ),
          ...(isOptional && { optional: true }),
        }
      }

      // Handle global function calls (e.g., parseInt(x), parseFloat(x))
      if (call.callee.type === 'Identifier') {
        const funcName = (call.callee as Identifier).name
        return {
          $expr: 'call',
          callee: funcName,
          arguments: call.arguments.map((arg) =>
            expressionToExprNode(arg as Expression, ctx)
          ),
        }
      }

      // Other call types not supported in expressions
      throw new TranspileError(
        'Complex function calls in expressions should be lifted to statements',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }

    case 'NewExpression': {
      const newExpr = expr as any
      let constructorName = 'constructor'
      if (newExpr.callee.type === 'Identifier') {
        constructorName = newExpr.callee.name
      }
      const suggestion = getNewExpressionSuggestion(constructorName)
      throw new TranspileError(
        `The 'new' keyword is not supported in AsyncJS.${suggestion}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }

    case 'TemplateLiteral':
      throw new TranspileError(
        'Template literals inside expressions are not supported. ' +
          'Assign to a variable first: const msg = `hello ${name}`; then use msg',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )

    default:
      throw new TranspileError(
        `Unsupported expression type in condition: ${expr.type}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
  }
}

// Note: extractCondition, expressionToConditionString, and extractVariablesFromExpression
// have been removed. Use expressionToExprNode instead - it converts Acorn AST directly
// to ExprNode format, eliminating the need for JSEP string parsing at runtime.

/**
 * Convert an expression to a runtime value (for varSet, etc.)
 */
function expressionToValue(expr: Expression, ctx: TransformContext): any {
  switch (expr.type) {
    case 'Literal':
      return (expr as Literal).value

    case 'Identifier': {
      const name = (expr as Identifier).name
      // Parameters are imported into state via varsImport at function start,
      // so we reference them as state variables (just the name string)
      // No need for $kind: 'arg' since args are copied to state
      return name
    }

    case 'MemberExpression': {
      const mem = expr as MemberExpression
      const isOptional = (mem as any).optional === true

      // If optional chaining, we need an ExprNode for proper runtime handling
      if (isOptional) {
        return expressionToExprNode(expr, ctx)
      }

      const objValue = expressionToValue(mem.object as Expression, ctx)

      // If the object resolved to an ExprNode (e.g., from nested optional chaining),
      // we need to build an ExprNode for this access too
      if (objValue && typeof objValue === 'object' && objValue.$expr) {
        const prop = mem.computed
          ? String((mem.property as Literal).value)
          : (mem.property as Identifier).name
        return {
          $expr: 'member',
          object: objValue,
          property: prop,
          ...(mem.computed && { computed: true }),
        }
      }

      if (mem.computed) {
        // arr[0] - would need runtime evaluation
        return `${objValue}[${expressionToValue(
          mem.property as Expression,
          ctx
        )}]`
      }

      const prop = (mem.property as Identifier).name

      // If objValue is a string path, extend it
      if (typeof objValue === 'string') {
        return `${objValue}.${prop}`
      }

      // If objValue is an arg ref, extend the path
      if (objValue && objValue.$kind === 'arg') {
        return { $kind: 'arg', path: `${objValue.path}.${prop}` }
      }

      return `${objValue}.${prop}`
    }

    case 'ChainExpression': {
      // Unwrap ChainExpression and process the inner expression
      const chain = expr as any
      return expressionToValue(chain.expression as Expression, ctx)
    }

    case 'ArrayExpression':
      return (expr as ArrayExpression).elements.map((el) =>
        el ? expressionToValue(el as Expression, ctx) : null
      )

    case 'ObjectExpression': {
      const result: Record<string, any> = {}
      for (const prop of (expr as ObjectExpression).properties) {
        if (prop.type === 'Property') {
          const key =
            prop.key.type === 'Identifier'
              ? (prop.key as Identifier).name
              : String((prop.key as Literal).value)
          result[key] = expressionToValue(prop.value as Expression, ctx)
        }
      }
      return result
    }

    case 'TemplateLiteral':
      // Template literals need runtime evaluation - convert to ExprNode
      // This will throw a helpful error explaining the limitation
      return expressionToExprNode(expr, ctx)

    case 'CallExpression':
      // Method calls like s.toArray() used as values need to be ExprNodes
      return expressionToExprNode(expr, ctx)

    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'UnaryExpression':
    case 'ConditionalExpression':
      // Complex expressions need to be ExprNodes for runtime evaluation
      return expressionToExprNode(expr, ctx)

    default:
      return null
  }
}

/**
 * Extract call arguments from a call expression
 */
function extractCallArguments(
  expr: CallExpression,
  ctx: TransformContext
): Record<string, any> {
  // If single object argument, spread it
  if (
    expr.arguments.length === 1 &&
    expr.arguments[0].type === 'ObjectExpression'
  ) {
    const obj = expr.arguments[0] as ObjectExpression
    const result: Record<string, any> = {}

    for (const prop of obj.properties) {
      if (prop.type === 'Property') {
        const key =
          prop.key.type === 'Identifier'
            ? (prop.key as Identifier).name
            : String((prop.key as Literal).value)
        result[key] = expressionToValue(prop.value as Expression, ctx)
      }
    }

    return result
  }

  // Otherwise, use positional args
  return {
    args: expr.arguments.map((arg) =>
      expressionToValue(arg as Expression, ctx)
    ),
  }
}

/**
 * Extract return schema from expression
 */
function extractReturnSchema(
  expr: Expression,
  _ctx: TransformContext
): Record<string, any> {
  if (expr.type === 'ObjectExpression') {
    const schema: Record<string, any> = { type: 'object', properties: {} }

    for (const prop of (expr as ObjectExpression).properties) {
      if (prop.type === 'Property' && prop.key.type === 'Identifier') {
        schema.properties[(prop.key as Identifier).name] = {}
      }
    }

    return schema
  }

  // For other expressions, infer from type
  const type = inferTypeFromValue(expr)
  return { type: type.kind }
}
