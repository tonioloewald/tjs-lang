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
import type { BaseNode } from '../builder'
import type { ExprNode } from '../runtime'
import type {
  TransformContext,
  TranspileOptions,
  FunctionSignature,
  ParameterDescriptor,
  TypeDescriptor,
  TranspileWarning,
} from './types'
import { TranspileError, getLocation, createChildContext } from './types'
import {
  parseParameter,
  inferTypeFromValue,
  parseReturnType,
} from './type-system/inference'
import { extractJSDoc } from './parser'

/**
 * Transform a function declaration into Agent99 AST
 */
export function transformFunction(
  func: FunctionDeclaration,
  source: string,
  returnTypeAnnotation: string | undefined,
  options: TranspileOptions = {}
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
    const parsed = parseParameter(param)

    // Handle destructured parameters - expand into individual params
    if (
      parsed.name === '__destructured__' &&
      parsed.type.kind === 'object' &&
      parsed.type.shape
    ) {
      for (const [key, type] of Object.entries(parsed.type.shape)) {
        parameters.set(key, {
          name: key,
          type,
          required: true, // Destructured params are required by default
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
      condition: `${name} == null`,
      vars: { [name]: name },
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
  const signature: FunctionSignature = {
    name: func.id?.name || 'anonymous',
    description: jsdoc.description,
    parameters: Object.fromEntries(parameters),
    returns: returnType,
  }

  return {
    ast: { op: 'seq', steps },
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
 * Transform variable declaration: let x = value
 */
function transformVariableDeclaration(
  decl: VariableDeclaration,
  ctx: TransformContext
): BaseNode[] {
  const steps: BaseNode[] = []

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
        name
      )

      if (step) {
        steps.push(step)
      } else if (resultVar !== name) {
        // Simple value assignment
        steps.push({
          op: 'varSet',
          key: name,
          value: resultVar,
        })
      }

      // Track variable type
      const type = inferTypeFromValue(declarator.init as Expression)
      ctx.locals.set(name, type)
    } else {
      // Uninitialized variable
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
    const { step } = transformExpressionToStep(expr, ctx)
    return step
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
  if (stmt.handler) {
    const catchCtx = createChildContext(ctx)
    // Add error variable to scope if named
    if (stmt.handler.param?.type === 'Identifier') {
      catchCtx.locals.set((stmt.handler.param as Identifier).name, {
        kind: 'any',
      })
    }
    catchSteps = transformBlock(stmt.handler.body, catchCtx)
  }

  return {
    op: 'try',
    try: trySteps,
    ...(catchSteps && { catch: catchSteps }),
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

/**
 * Transform an expression, potentially into a step with a result variable
 */
function transformExpressionToStep(
  expr: Expression,
  ctx: TransformContext,
  resultVar?: string
): { step: BaseNode | null; resultVar: any } {
  // Function call -> atom invocation
  if (expr.type === 'CallExpression') {
    return transformCallExpression(expr as CallExpression, ctx, resultVar)
  }

  // Template literal -> template atom
  if (expr.type === 'TemplateLiteral') {
    return transformTemplateLiteral(expr as TemplateLiteral, ctx, resultVar)
  }

  // Binary/logical/unary expression - convert to ExprNode
  if (
    expr.type === 'BinaryExpression' ||
    expr.type === 'LogicalExpression' ||
    expr.type === 'UnaryExpression'
  ) {
    const exprNode = expressionToExprNode(expr, ctx)

    // If we need to store the result, emit a varSet with the expression node as value
    if (resultVar) {
      return {
        step: {
          op: 'varSet',
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
  resultVar?: string
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
      resultVar
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
  resultVar?: string
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
          },
          resultVar,
        }
      }
      break

    case 'filter':
      // TODO: Implement filter
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
  resultVar?: string
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
      }
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
        op: log.operator as '&&' | '||',
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
      // This shouldn't happen for conditions, but handle it
      throw new TranspileError(
        'Function calls in expressions should be lifted to statements',
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }

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
      const objValue = expressionToValue(mem.object as Expression, ctx)

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
      // For template literals as values, we'd need to evaluate them
      // For now, return a placeholder
      return '__template__'

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
