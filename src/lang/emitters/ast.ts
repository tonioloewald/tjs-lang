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
import { AST_VERSION, AST_VERSION_KEY } from '../../vm/ast-version'
import { GUEST_METHODS } from '../../vm/guest-methods'
import { RegexCompiler, RegexError } from '../../vm/regex'
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
import { extractTDoc } from '../parser'

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
    // NO DECLARED PARAMETERS MEANS UNCONSTRAINED, NOT FORBIDDEN.
    //
    // Closing an EMPTY property set says "this agent accepts no arguments at all",
    // which is a much stronger claim than "none were declared" — and it is wrong for
    // the case that hit it: `Eval` builds an agent whose caller supplies an arbitrary
    // context bag (`{a: 1, b: 2}`), so its schema said "nothing permitted" while its
    // whole job was accepting whatever it was given.
    //
    // That mismatch shipped because tosijs-schema 1.4.0 did not enforce
    // `additionalProperties: false`. So neither the declared check NOR any check was
    // running, and `Eval` validated its context args not at all. 1.5.0 enforces it and
    // the bug surfaced immediately — the upgrade did not break us, it found us.
    //
    // Declared parameters still close the object; that is a real contract the author
    // wrote. This only stops an EMPTY one from asserting something nobody meant.
    additionalProperties:
      Object.keys(properties).length === 0 ? undefined : false,
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
  requiredParamsFromPreprocess?: Set<string>,
  helpers?: Map<string, FunctionDeclaration>,
  requiredValueOffsets?: Set<number>
): {
  ast: BaseNode
  signature: FunctionSignature
  warnings: TranspileWarning[]
} {
  // Extract TDoc (/*# ... */) comments
  const tdoc = extractTDoc(source, func)

  // Read from the marker the parser wrote between each `=` and its value. Module-wide
  // sets collided across functions — by name, and then still by name plus value text,
  // since `factor: 1` and `factor = 1` in one module are the same key.
  const requiredHere = new Set<string>()
  if (requiredValueOffsets?.size) {
    // Walk DESTRUCTURED members too, not only top-level `name = value` params.
    //
    // `function agent({ apiKey: 'sk-example' })` is *the* documented AJS entry shape
    // (DOCS-AJS.md § Input/Output: "functions take a single destructured object
    // parameter"), and it is an ObjectPattern — which this loop skipped entirely. So
    // `requiredHere` came out empty, the name-based fallback below was skipped because the
    // offsets branch had already been taken, and the entry lost its `required` list.
    //
    // The consequence was not a missing warning. `vm.run(ast, {})` returned
    // `{"apiKey":"sk-example"}` — the EXAMPLE VALUE, which for a parameter named `apiKey` is
    // credential-shaped, silently substituted for an input the caller never supplied. And it
    // differed by entry point: `tjs-lang/lang` (via core.ts, which forwards the offsets) was
    // broken while `tjs-lang` (which does not) was correct, so two consumers of the same
    // source got opposite contracts.
    const collect = (p: any): void => {
      if (!p) return
      if (p.type === 'AssignmentPattern' && p.right && p.left?.name) {
        if (requiredValueOffsets.has(p.right.end)) requiredHere.add(p.left.name)
        return
      }
      // `{ a: 1, b = 2 }` — properties whose value is the annotation carrying the marker.
      if (p.type === 'ObjectPattern') {
        for (const prop of p.properties ?? []) {
          if (prop?.type === 'RestElement') continue
          collect(prop.value)
          // A shorthand-with-default (`{ a = 1 }`) parses as a Property whose value IS the
          // AssignmentPattern, handled above. A non-shorthand (`{ a: b = 1 }`) binds `b`,
          // which `collect` also reaches through `prop.value`.
        }
        return
      }
      if (p.type === 'ArrayPattern') {
        for (const el of p.elements ?? []) collect(el)
      }
    }
    for (const param of func.params ?? []) collect(param)
  }
  // Fall back whenever the offsets produced NOTHING — an empty result means "could not index
  // this shape", not "nothing is required". Previously this was an `else if`, so taking the
  // offsets branch at all suppressed the fallback even when it yielded no names; that is what
  // turned an emitter gap into a dropped contract. A lost `required` converts a checked
  // parameter into an unchecked one, which is strictly worse than an over-broad one.
  if (requiredHere.size === 0 && requiredParamsFromPreprocess) {
    // No source to index into — fall back to the module-wide names rather than dropping
    // every marker, since a lost `required` turns a checked parameter into an unchecked
    // one, which is worse than an over-broad one.
    for (const n of requiredParamsFromPreprocess) requiredHere.add(n)
  }

  // Parse parameters
  const parameters = new Map<string, ParameterDescriptor>()

  for (const param of func.params) {
    const parsed = parseParameter(param, requiredHere)

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
          description: tdoc.params[key],
        })
      }
    } else {
      parsed.description = tdoc.params[parsed.name]
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
    helpers,
    helperSteps: helpers ? new Map() : undefined,
    helperTransforming: helpers ? new Set() : undefined,
    regexCompiler: new RegexCompiler(source.length),
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
      // ASSIGNMENT to the parameter, not a declaration: an `if` body is a block scope in v2,
      // so a `varSet` here declared a block-local and the parameter stayed null.
      then: [
        {
          op: 'varAssign',
          key: name,
          value: defaultValue,
        },
      ],
    })
  }

  steps.push(...hoistedVars(func.body, new Set(parameters.keys())))
  steps.push(...bodySteps)

  // Build signature
  const signatureParams = Object.fromEntries(parameters)
  const signature: FunctionSignature = {
    name: func.id?.name || 'anonymous',
    description: tdoc.description,
    parameters: signatureParams,
    returns: returnType,
  }

  // Generate input schema for runtime validation
  const inputSchema = parametersToJsonSchema(signatureParams)

  // Collect transitively-used helper bodies (transformed once) onto the root
  // node. The VM installs these into ctx.helpers so callLocal can dispatch by
  // name — call sites stay tiny and recursion is a runtime loop.
  const helperBodies =
    ctx.helperSteps && ctx.helperSteps.size > 0
      ? Object.fromEntries(ctx.helperSteps)
      : undefined

  return {
    ast: {
      // Format version FIRST, so it is visible in a truncated dump and in a diff.
      // See src/vm/ast-version.ts: an AST is a persisted artifact (procedureStore holds
      // them), so data written today is read by code written later.
      [AST_VERSION_KEY]: AST_VERSION,
      op: 'seq',
      steps,
      inputSchema,
      ...(helperBodies && { helpers: helperBodies }),
    },
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
        `Unsupported statement type: ${stmt.type}${remedyFor(stmt.type)}`,
        getLocation(stmt),
        ctx.source,
        ctx.filename
      )
  }
}

/**
 * Worked corrections for the constructs AJS deliberately lacks.
 *
 * Measured, not guessed: an A/B over diagnostic text
 * (`experiments/agent-legibility/error-message-ab.ts`) found our accurate-but-bare
 * messages produced a **0%** repair rate — statistically identical to telling the model
 * nothing at all. Prose advice ("rewrite it as a while loop") reached 50%; the same
 * remedy **shown as code** reached 80%. On the `for`-loop case specifically, prose scored
 * 0/5 and the worked example 5/5.
 *
 * So these are examples, not sentences, and that is the whole point. A diagnostic that
 * names the defect correctly and leaves the reader to invent the fix is accurate and
 * useless — to a model, and to a human meeting the language for the first time.
 *
 * Guarded by `src/lang/diagnostic-remedy.test.ts`: every construct listed here must keep
 * a remedy containing actual code.
 */
export const CONSTRUCT_REMEDIES: Record<string, string> = {
  ForStatement: `AJS has no \`for\` loops. Use \`while\` with a counter:
  let i = 0
  while (i < items.length) {
    // ...
    i = i + 1
  }`,
  ForInStatement: `AJS has no \`for...in\`. Get the keys and walk them with \`while\`:
  let ks = keys({ obj: data })
  let i = 0
  while (i < ks.length) {
    let k = ks[i]
    i = i + 1
  }`,
  SwitchStatement: `AJS has no \`switch\`. Use \`if\`/\`else if\`:
  if (kind == 'a') {
    // ...
  } else if (kind == 'b') {
    // ...
  }`,
  DoWhileStatement: `AJS has no \`do...while\`. Use \`while\`, running the body check first:
  let i = 0
  while (i < n) {
    // ...
    i = i + 1
  }`,
}

/** Append a worked correction when we have one for this construct. */
function remedyFor(type: string): string {
  const remedy = CONSTRUCT_REMEDIES[type]
  return remedy ? `. ${remedy}` : ''
}

/**
 * Transform variable declaration: let x = value or const x = value
 */
/**
 * A regex literal becomes a `regex` node: the VM builds the RegExp itself, after its ReDoS screen.
 * It was a `literal` holding a host RegExp the TRANSPILER built from guest source — unscreened,
 * so `s.replace(/(a+)+$/, '')` ran unchecked; and not data, so a serialized AST got `{}`.
 */
/**
 * A regex literal, as a node the VM compiles with its own engine. Compiled HERE too, unmetered
 * (the engine caps its own compile work), so a pattern the VM would refuse — a backreference, a
 * lookahead, a count over the cap — is a TranspileError at its source location rather than a
 * failure deep inside a run.
 */
function regexNode(lit: Literal, ctx: TransformContext): any {
  const rx = (lit as any).regex as
    | { pattern: string; flags: string }
    | undefined
  if (!rx) return undefined
  try {
    // every literal in this source shares one budget, proportional to the source (M2)
    ctx.regexCompiler.compile(rx.pattern, rx.flags)
  } catch (e: any) {
    if (!(e instanceof RegexError)) throw e
    throw new TranspileError(
      e.message,
      getLocation(lit),
      ctx.source,
      ctx.filename
    )
  }
  return { $expr: 'regex', pattern: rx.pattern, flags: rx.flags }
}

/**
 * `var` is FUNCTION-scoped: every `var` in a body is declared once, at entry (as `undefined`,
 * here `null`, as an uninitialised `let` already is), and each `var x = v` is an ASSIGNMENT to
 * it. v2 blocks are scopes, and lowering `var` like `let` declared it in the innermost block, so
 * `if (c) { var q = 5 } return { q }` silently lost `q` — legal JavaScript, wrong answer (rc.2
 * fourth re-review M2). Parameters are already bound and are not re-declared. Nested functions
 * have their own scope and are not entered.
 */
function hoistedVars(body: any, exclude: Set<string>): BaseNode[] {
  const names = new Set<string>()
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    )
      return
    if (node.type === 'VariableDeclaration' && node.kind === 'var')
      for (const d of node.declarations)
        if (d.id?.type === 'Identifier' && !exclude.has(d.id.name))
          names.add(d.id.name)
    for (const key of Object.keys(node))
      if (key !== 'loc' && key !== 'range') walk(node[key])
  }
  walk(body)
  return [...names].map((key) => ({ op: 'varSet', key, value: null }))
}

function transformVariableDeclaration(
  decl: VariableDeclaration,
  ctx: TransformContext
): BaseNode[] {
  if (decl.kind === 'var') return transformVarAsAssignment(decl, ctx)
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

/** `var x = v` — an assignment to the binding `hoistedVars` declared at function entry. */
function transformVarAsAssignment(
  decl: VariableDeclaration,
  ctx: TransformContext
): BaseNode[] {
  const steps: BaseNode[] = []
  for (const declarator of decl.declarations) {
    if (declarator.id.type !== 'Identifier')
      throw new TranspileError(
        'Only simple variable names are supported',
        getLocation(declarator),
        ctx.source,
        ctx.filename
      )
    // `var x` with no initialiser keeps the value it has: nothing to emit.
    if (!declarator.init) continue
    const name = (declarator.id as Identifier).name
    steps.push(
      ...[
        transformAssignment(
          {
            type: 'AssignmentExpression',
            operator: '=',
            left: declarator.id,
            right: declarator.init,
            start: (declarator as any).start,
            end: (declarator as any).end,
            loc: (declarator as any).loc,
          } as any,
          ctx
        ),
      ].flat()
    )
    ctx.locals.set(name, inferTypeFromValue(declarator.init as Expression))
  }
  return steps
}

/**
 * Transform expression statement (e.g., function call)
 */
function transformExpressionStatement(
  stmt: ExpressionStatement,
  ctx: TransformContext
): BaseNode | BaseNode[] | null {
  const expr = stmt.expression

  // Assignment expression: x = value (and every compound form)
  if (expr.type === 'AssignmentExpression') {
    return transformAssignment(expr as AssignmentExpression, ctx)
  }

  // `i++` / `--i` as a STATEMENT is `i = i ± 1`. It used to fall through to "expression
  // statement has no effect" below — dropped, with only a warning (tjs-lang#59). As a value
  // (`j = i++`) it is refused where it appears; prefix and postfix differ there, and a
  // silent guess would be the same class of bug.
  if (expr.type === 'UpdateExpression') {
    const up = expr as any
    if (up.argument.type !== 'Identifier')
      throw new TranspileError(
        `'${up.operator}' is supported only on a simple variable`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    return transformAssignment(
      {
        ...up,
        type: 'AssignmentExpression',
        operator: up.operator === '++' ? '+=' : '-=',
        left: up.argument,
        right: { ...up.argument, type: 'Literal', value: 1, raw: '1' },
      } as AssignmentExpression,
      ctx
    )
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
      // evaluated for its effects, bound to nothing (it was `varSet _`, which clobbered — or,
      // with `const _`, refused — a guest's own `_`)
      return { op: 'evaluate', value: resultVar }
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
 * Transform assignment: `x = value`, and every compound form.
 *
 * Compiles to `varAssign`, which writes to the scope that OWNS `x`. Compiling it to `varSet`
 * (declaration: current scope) lost every assignment to an outer variable made inside a
 * `for…of` body, and the operator was never read at all, so `x -= 2` stored `2`
 * (tjs-lang#59). `x op= y` is lowered to `x = x op y`; for `||=`, `&&=` and `??=` the
 * result is the same value as JavaScript's short-circuit form for a plain variable.
 */
function transformAssignment(
  expr: AssignmentExpression,
  ctx: TransformContext
): BaseNode | BaseNode[] {
  if (expr.left.type !== 'Identifier') {
    throw new TranspileError(
      'Only simple variable assignment is supported',
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

  const name = (expr.left as Identifier).name
  let right = expr.right as Expression
  if (expr.operator !== '=') {
    const op = expr.operator.slice(0, -1)
    const logical = op === '||' || op === '&&' || op === '??'
    right = {
      ...(expr as any),
      type: logical ? 'LogicalExpression' : 'BinaryExpression',
      operator: op,
      left: expr.left,
      right: expr.right,
    } as Expression
  }

  // `transformExpressionToStep` binds the value to `name` itself. Turn its declaration into
  // an assignment, never via a temporary: a temporary held a SECOND copy of every value
  // assigned, so `s = s + …` in a loop counted twice against the heap ceiling.
  const { step, resultVar } = transformExpressionToStep(right, ctx, name)

  if (step) {
    const st = step as any
    // A pure expression: `varSet name <expr>` → `varAssign name <expr>`.
    if (st.op === 'varSet' && st.key === name)
      return { op: 'varAssign', key: name, value: st.value }
    // An atom call binding its result to `name`: the binding itself assigns.
    if (st.result === name) return { ...st, resultAssign: true }
    throw new TranspileError(
      `Internal: cannot compile this assignment to '${name}' (step '${st.op}')`,
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

  return {
    op: 'varAssign',
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
  // The loop variable is bound in the LOOP's scope, so only a declaration scoped to the loop can
  // mean what JavaScript means: `for (var x of xs)` and `for (x of xs)` assign an OUTER `x`,
  // which then holds the last item — here it was left untouched (or null), silently (rc.2
  // fifth re-review M1). Refused rather than mistranslated.
  if (
    stmt.left.type !== 'VariableDeclaration' ||
    (stmt.left as VariableDeclaration).kind === 'var'
  )
    throw new TranspileError(
      'for...of in AsyncJS needs `const` or `let`: `for (const x of items)`',
      getLocation(stmt.left),
      ctx.source,
      ctx.filename
    )
  const decl = (stmt.left as VariableDeclaration).declarations[0]
  if (decl.id.type !== 'Identifier') {
    throw new TranspileError(
      'Only simple variable names are supported in for...of',
      getLocation(stmt.left),
      ctx.source,
      ctx.filename
    )
  }
  const varName = (decl.id as Identifier).name

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

  // `loop: true`: a for...of BODY is not a callback. `map` runs both, and gave a loop body
  // callback semantics, so a `return` inside the loop returned from an imagined callback and
  // the agent carried on (0.14.0 final re-review 2, M-1). With the flag, a `return` ends the
  // loop AND the agent, as in JavaScript.
  return {
    op: 'map',
    items,
    as: varName,
    steps,
    loop: true,
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
 * An object literal's key — refusing `__proto__`, which in an object literal sets the
 * PROTOTYPE rather than a property: it would hide its value from the VM's heap accounting
 * (rc.2 review B4), and assigned here it would set the prototype of the very object the
 * emitter is building. The VM refuses it at run time too (`setGuestKey`).
 */
function propertyKeyName(prop: any, ctx: TransformContext): string {
  const key =
    prop.key.type === 'Identifier'
      ? (prop.key as Identifier).name
      : String((prop.key as Literal).value)
  if (key === '__proto__')
    throw new TranspileError(
      "'__proto__' is not allowed as an object key in AsyncJS",
      getLocation(prop),
      ctx.source,
      ctx.filename
    )
  return key
}

/**
 * Transform return statement
 */
function transformReturnStatement(
  stmt: ReturnStatement,
  ctx: TransformContext
): BaseNode | BaseNode[] {
  if (!stmt.argument) {
    return { op: 'return', value: {} }
  }

  // Check if the return expression requires a preceding step (e.g., atom call)
  const { step, resultVar } = transformExpressionToStep(
    stmt.argument,
    ctx,
    '__returnVal__'
  )

  // If there's a step (atom call), emit it first, then return the result variable
  if (step) {
    // The step bound its result to `__returnVal__`; return it by explicit reference (AST v2 —
    // a bare name string is a literal).
    return [
      step,
      {
        op: 'return',
        value:
          typeof resultVar === 'string'
            ? { $expr: 'ident', name: resultVar }
            : resultVar,
      },
    ]
  }

  // Otherwise, convert expression directly to a value for return
  const value = expressionToValue(stmt.argument, ctx)
  return { op: 'return', value }
}

// Known builtins that should be evaluated as expressions, not atom calls
export const BUILTIN_OBJECTS = new Set([
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

export const BUILTIN_GLOBALS = new Set([
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
// Method calls the VM evaluates as EXPRESSIONS: exactly its method table (src/vm/guest-methods.ts).
// This list used to be the emitter's own, missing `push`/`join`/`split`, which therefore became
// atoms with their own (ungated) implementations.
const INSTANCE_METHODS = GUEST_METHODS

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
      isConst,
      getLocation(expr)
    )
  }

  // Handle console.log specially
  if (funcName === 'console' && expr.callee.type === 'MemberExpression') {
    // This would be caught above, but just in case
  }

  // Helper call? Emit callLocal referencing the helper by name. The body is
  // transformed once and stored in ctx.helperSteps (collected onto the seq
  // node), so call sites stay tiny and recursion is just a runtime loop.
  if (ctx.helpers?.has(funcName)) {
    const paramNames = ensureHelperTransformed(funcName, ctx, expr)
    const argExprs = expr.arguments.map((arg) =>
      expressionToValue(arg as Expression, ctx)
    )
    if (argExprs.length !== paramNames.length) {
      throw new TranspileError(
        `Helper '${funcName}' expects ${paramNames.length} argument(s), got ${argExprs.length}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
    return {
      step: {
        op: 'callLocal',
        name: funcName,
        args: argExprs,
        ...(resultVar && { result: resultVar }),
        ...(resultVar && isConst && { resultConst: true }),
      },
      resultVar,
    }
  }

  // Check if it's a known atom
  // For now, we assume any function call is an atom call
  // The VM will validate at runtime

  // Extract arguments
  const args = extractCallArguments(expr, ctx)

  // An ATOM takes named arguments, always: `storeSet({ key, value })` (Tonio, 2026-10-03).
  // Positional-ness exists only in the SOURCE: the AST encodes `foo(a, b)` as an input named
  // `args`, which is indistinguishable from `foo({ args: [a, b] })`. So this is decided here, on
  // the syntax, and nowhere else. Four review rounds (rc.2 eighteenth to twenty-first) tried to
  // decide it in the VM from each atom's schema, and each broke a call that worked. Helpers
  // (above) and the builtins listed here are functions, and keep positional arguments.
  const named =
    expr.arguments.length === 0 ||
    (expr.arguments.length === 1 &&
      expr.arguments[0].type === 'ObjectExpression')
  if (!named && !POSITIONAL_BUILTINS.has(funcName)) {
    throw new TranspileError(
      `'${funcName}' takes named arguments: write ${funcName}({ name: value, … }), not ${funcName}(a, b). ` +
        `Positional arguments are for local functions.`,
      getLocation(expr),
      ctx.source,
      ctx.filename
    )
  }

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
 * Ensure a helper's body has been transformed once into `ctx.helperSteps`,
 * returning its parameter names (for arity checking at the call site).
 *
 * Bodies are stored by name and called by reference at runtime, so recursion
 * is fine: when a helper references itself (or a mutually-recursive sibling)
 * the call site only needs the param names — the steps are filled in when the
 * in-progress transform completes. The `helperTransforming` set just prevents
 * re-entering a transform that's already underway.
 */
function ensureHelperTransformed(
  name: string,
  ctx: TransformContext,
  callSite: CallExpression
): string[] {
  const fn = ctx.helpers!.get(name)!
  // Accept plain identifiers (`x`) and example/default params (`x: 0` → `x = 0`
  // after colon-shorthand desugaring). Destructuring isn't supported in v1.
  // Helpers are arity-checked and called with explicit args, so the example/
  // default is never applied — we only need the parameter name and position.
  const paramNames: string[] = []
  for (const param of fn.params) {
    let id: Identifier | undefined
    if (param.type === 'Identifier') {
      id = param as Identifier
    } else if (
      param.type === 'AssignmentPattern' &&
      (param as any).left?.type === 'Identifier'
    ) {
      id = (param as any).left as Identifier
    }
    if (!id) {
      throw new TranspileError(
        `Helper '${name}' parameters must be plain identifiers (optionally with an example value); destructuring is not supported`,
        param.loc?.start ?? getLocation(callSite),
        ctx.source,
        ctx.filename
      )
    }
    paramNames.push(id.name)
  }

  // Already transformed, or transform already underway (recursive reference):
  // the call site only needs paramNames; the body is/will be in helperSteps.
  if (ctx.helperSteps!.has(name) || ctx.helperTransforming!.has(name)) {
    return paramNames
  }

  ctx.helperTransforming!.add(name)
  try {
    // Transform the helper body in a fresh inner context — isolated locals,
    // params as the only known identifiers; helpers map is shared so it can
    // call (and recurse into) other helpers.
    const helperCtx: TransformContext = {
      depth: 0,
      locals: new Map(),
      parameters: new Map(
        paramNames.map((p) => [
          p,
          {
            name: p,
            type: { kind: 'any' as const },
            required: true,
          } as ParameterDescriptor,
        ])
      ),
      atoms: ctx.atoms,
      warnings: ctx.warnings,
      regexCompiler: ctx.regexCompiler,
      source: ctx.source,
      filename: ctx.filename,
      options: ctx.options,
      helpers: ctx.helpers,
      helperSteps: ctx.helperSteps,
      helperTransforming: ctx.helperTransforming,
    }
    const bodySteps = [
      ...hoistedVars(fn.body, new Set(paramNames)),
      ...transformBlock(fn.body, helperCtx),
    ]
    ctx.helperSteps!.set(name, { steps: bodySteps, paramNames })
  } finally {
    ctx.helperTransforming!.delete(name)
  }
  return paramNames
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
  isConst?: boolean,
  location: { line: number; column: number } = { line: 0, column: 0 }
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
          // A callback is a FUNCTION boundary: its `var`s are its own (rc.2 fifth re-review
          // M1 — they were assigned to the caller's bindings of the same name).
          steps = [
            ...hoistedVars(
              callback.body,
              new Set(
                callback.params
                  .filter((p: any) => p.type === 'Identifier')
                  .map((p: any) => p.name)
              )
            ),
            ...transformBlock(callback.body, childCtx),
          ]
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
          // A callback is a FUNCTION boundary: its `var`s are its own (rc.2 fifth re-review
          // M1 — they were assigned to the caller's bindings of the same name).
          steps = [
            ...hoistedVars(
              callback.body,
              new Set(
                callback.params
                  .filter((p: any) => p.type === 'Identifier')
                  .map((p: any) => p.name)
              )
            ),
            ...transformBlock(callback.body, childCtx),
          ]
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
  }

  // Not a method the VM can call. It used to become an ATOM call named after the method
  // (`a.unshift(x)` → "Unknown Atom: unshift" at run time); refused here, where it can be fixed.
  throw new TranspileError(
    `Method '${method}' is not available in AsyncJS` +
      ([
        'forEach',
        'some',
        'every',
        'flatMap',
        'findIndex',
        'reduceRight',
      ].includes(method)
        ? ' — use for...of, or map/filter/find/reduce with an arrow function'
        : ''),
    location,
    ctx.source,
    ctx.filename
  )
}

/**
 * Convert an Acorn expression to an ExprNode for direct VM evaluation.
 * This replaces the string-based condition system.
 */
/**
 * Refuse a construct the emitter cannot compile, instead of skipping it.
 *
 * Spread was matched by no branch in the object and array literal handlers, so it was
 * silently dropped and the literal was built from whatever else was recognised (#52):
 *
 *     return { ...doc, rev: 1 }   ->   { rev: 1 }        every original field gone
 *     return [...a]               ->   [null]            length 1, the hole reads as a value
 *
 * Nothing downstream could tell — both results have the right SHAPE, so structural checks,
 * `typeof` and length checks all pass. An embedder persisting the first one has lost the
 * document and has a plausible payload to show for it.
 *
 * Supporting spread properly needs a runtime op and is a feature. Refusing it is not: an
 * emitter that cannot compile a construct must say so, because the alternative is not "less
 * functionality", it is wrong answers. This is the same rule the predicate verifier states —
 * over-refusing costs a feature; miscompiling costs your data.
 */

/**
 * Rewrite spread into the call it means, then let the ordinary emitter handle it.
 *
 *     { ...d, c: 3 }   ->   Object.assign({}, d, { c: 3 })
 *     [ ...a, 3 ]      ->   [].concat(a, [3])
 *
 * Spread matched no branch in the literal handlers and was silently DROPPED (#52) — the
 * object was built from whatever else was recognised, so `{ ...doc, rev: 1 }` returned
 * `{ rev: 1 }` and lost the document, with no error. `DOCS-AJS.md` documents spread under
 * "What's Allowed", so refusing it would have made the doc wrong; the honest fix is to make
 * the documented thing work.
 *
 * Desugaring rather than adding a runtime op, because the targets already exist and already
 * pass: `Object.assign({}, d, { c: 3 })` and `a.concat(b)` both evaluate correctly in the VM
 * today. Building the equivalent acorn node and recursing means the whole path — member
 * access, method dispatch, fuel — is the one that is already tested, and there is no second
 * implementation to drift.
 *
 * SOURCE ORDER IS PRESERVED, which is the whole semantics: `{ a: 1, ...d }` must let `d`
 * override, and `{ ...d, a: 1 }` must not. Consecutive non-spread properties are grouped into
 * one literal so the argument list stays short.
 */
function desugarSpread(expr: ObjectExpression | ArrayExpression): Expression {
  const loc = { start: (expr as any).start, end: (expr as any).end }
  const id = (name: string): any => ({ type: 'Identifier', name, ...loc })
  const args: any[] = []
  let group: any[] = []

  const isObject = expr.type === 'ObjectExpression'
  const flush = () => {
    if (!group.length) return
    args.push(
      isObject
        ? { type: 'ObjectExpression', properties: group, ...loc }
        : { type: 'ArrayExpression', elements: group, ...loc }
    )
    group = []
  }

  const items: any[] = isObject
    ? (expr as ObjectExpression).properties
    : (expr as ArrayExpression).elements
  for (const item of items) {
    if (item && item.type === 'SpreadElement') {
      flush()
      args.push(item.argument)
    } else {
      group.push(item)
    }
  }
  flush()

  // `Object.assign({}, …)` / `[].concat(…)` — the empty first receiver keeps both
  // non-mutating, so a spread source is never written through.
  const receiver: any = isObject
    ? { type: 'ObjectExpression', properties: [], ...loc }
    : { type: 'ArrayExpression', elements: [], ...loc }
  const callee: any = isObject
    ? {
        type: 'MemberExpression',
        object: id('Object'),
        property: id('assign'),
        computed: false,
        optional: false,
        ...loc,
      }
    : {
        type: 'MemberExpression',
        object: receiver,
        property: id('concat'),
        computed: false,
        optional: false,
        ...loc,
      }

  return {
    type: 'CallExpression',
    callee,
    arguments: isObject ? [receiver, ...args] : args,
    optional: false,
    ...loc,
  } as unknown as Expression
}

/** Does this literal contain a spread that has to be desugared? */
function hasSpread(expr: ObjectExpression | ArrayExpression): boolean {
  const items: any[] =
    expr.type === 'ObjectExpression'
      ? (expr as ObjectExpression).properties
      : (expr as ArrayExpression).elements
  return items.some((i) => i && i.type === 'SpreadElement')
}

function rejectSpread(node: { type: string }): never {
  throw new Error(
    node.type === 'SpreadElement'
      ? 'Spread (`...`) is not supported in AJS yet, and was silently DROPPED before ' +
        '0.13.13 (#52) — `{ ...doc, rev: 1 }` became `{ rev: 1 }`, losing every original ' +
        'field with no error. Use `Object.assign({}, a, b)` for objects, or `a.concat(b)` ' +
        'for arrays.'
      : `\`${node.type}\` is not supported in an AJS object or array literal. It was ` +
        `previously ignored, which produced a literal missing the part you wrote.`
  )
}

function expressionToExprNode(
  expr: Expression,
  ctx: TransformContext
): ExprNode {
  switch (expr.type) {
    case 'Literal': {
      const lit = expr as Literal
      const rx = regexNode(lit, ctx)
      if (rx) return rx
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
        // Computed with expression (e.g. arr[i]) — emit as member with expr property
        return {
          $expr: 'member',
          object: obj,
          property: expressionToExprNode(prop, ctx),
          computed: true,
          ...(isOptional && { optional: true }),
        }
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
      if (hasSpread(obj)) return expressionToExprNode(desugarSpread(obj), ctx)
      const properties: { key: string; value: ExprNode }[] = []

      for (const prop of obj.properties) {
        // REFUSE what we cannot compile. This used to be `if (Property)` with no else, so a
        // `SpreadElement` matched nothing and fell off — the object was built from the
        // properties that happened to be recognised, with no error (#52).
        if (prop.type !== 'Property') rejectSpread(prop)
        if (prop.type === 'Property') {
          const key = propertyKeyName(prop, ctx)
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

        // Helper calls cannot be nested inside expressions — like template
        // literals and complex calls, they must live at statement level so the
        // expression sandbox stays call-free. Lift to a temp first.
        if (ctx.helpers?.has(funcName)) {
          throw new TranspileError(
            `Helper '${funcName}' cannot be called inside an expression. ` +
              `Assign its result to a variable first: ` +
              `const result = ${funcName}(...); then use result.`,
            getLocation(expr),
            ctx.source,
            ctx.filename
          )
        }

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

    case 'TemplateLiteral': {
      // `a${x}b` is `'a' + x + 'b'`: one string concatenation, through the VM's gated `+`
      // (it was a `template` atom, a second implementation with its own budget — and it printed
      // `null` as '' where JavaScript prints 'null').
      const t = expr as TemplateLiteral
      let node: any = {
        $expr: 'literal',
        value: t.quasis[0].value.cooked ?? '',
      }
      for (let i = 0; i < t.expressions.length; i++) {
        node = {
          $expr: 'binary',
          op: '+',
          left: node,
          right: expressionToExprNode(t.expressions[i] as Expression, ctx),
        }
        const tail = t.quasis[i + 1].value.cooked ?? ''
        if (tail)
          node = {
            $expr: 'binary',
            op: '+',
            left: node,
            right: { $expr: 'literal', value: tail },
          }
      }
      return node
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
      return regexNode(expr as Literal, ctx) ?? (expr as Literal).value

    case 'Identifier': {
      // An EXPLICIT reference (AST v2). A bare name string was a reference only if a variable
      // by that name happened to be in scope, and a literal otherwise — so the same string
      // meant two things (board #1860). In v2 a bare string is always a literal.
      return { $expr: 'ident', name: (expr as Identifier).name }
    }

    case 'MemberExpression': {
      const mem = expr as MemberExpression
      const isOptional = (mem as any).optional === true

      // If optional chaining, we need an ExprNode for proper runtime handling
      if (isOptional) {
        return expressionToExprNode(expr, ctx)
      }

      // Computed access (`arr[i]`, `obj[k]`, `arr[0]`) is ALWAYS a node, decided before the
      // object is looked at: the index must be evaluated, never stringified. Checked after
      // the object used to be enough, because a plain identifier object came back as a
      // string; in AST v2 it comes back as an ident NODE and took the branch below, which
      // assumes a LITERAL index — so `m[i]` compiled to `m["undefined"]`.
      if (mem.computed) return expressionToExprNode(expr, ctx)

      const objValue = expressionToValue(mem.object as Expression, ctx)

      // If the object resolved to an ExprNode (e.g., from nested optional chaining),
      // we need to build an ExprNode for this access too
      if (objValue && typeof objValue === 'object' && objValue.$expr) {
        return {
          $expr: 'member',
          object: objValue,
          property: (mem.property as Identifier).name,
        }
      }

      const prop = (mem.property as Identifier).name

      // An arg ref extends as a path — the BUILDER surface, untouched.
      //
      // `{ $kind: 'arg', path: 'a.b' }` is a first-class hand-authored form (35 uses), and
      // `resolveValue` keeps understanding it. Only what the EMITTER produces changes below.
      if (objValue && objValue.$kind === 'arg') {
        return { $kind: 'arg', path: `${objValue.path}.${prop}` }
      }

      // A string path is kept ONLY when the root is provably in VM state.
      //
      // The dot-path form is a deliberate optimisation with a test to its name ("should use
      // string path optimization for regular member access"), and it is CORRECT whenever the
      // root is a local or a parameter: those land in `ctx.state`, where `resolveValue`'s
      // traversal looks. It is silently WRONG when the root came from `context`/args, because
      // the traversal never checks there and the string falls through to "return the literal"
      // (#52). The emitter can tell the two apart — `TransformContext` carries `locals` and
      // `parameters` up a scope chain — so it now asks instead of assuming.

      // Everything else emits a member NODE, not a dot-path string.
      //
      // This used to `return \`${objValue}.${prop}\``, and the computed branch a few lines
      // above already says why that is wrong — "always emit as $expr node so the runtime
      // evaluates the index rather than treating it as a string path". The same reasoning
      // applies here and simply had not been applied, so `return data.a` compiled to the
      // STRING "data.a" while `return data["a"]` compiled correctly (#52).
      //
      // What the string then did: `resolveValue` tried it as a path against `ctx.state`,
      // found no root (the value came from `context`, i.e. args), and fell through to
      // "key doesn't exist in state — return the literal string". So the caller got back the
      // source text they had written, as data, with no error. Every asymmetry in the report
      // follows from this one line: `typeof data.a`, `data.a * 2` and `data.a.valueOf()` were
      // all correct because they build real nodes, and only the bare return substituted.
      //
      // Deliberately NOT changing `resolveValue`'s tolerance of dot-path strings: hand-built
      // ASTs and the builder API depend on it. Emitting and accepting are separate surfaces.
      return expressionToExprNode(expr, ctx)
    }

    case 'ChainExpression': {
      // Unwrap ChainExpression and process the inner expression
      const chain = expr as any
      return expressionToValue(chain.expression as Expression, ctx)
    }

    case 'ArrayExpression':
      if (hasSpread(expr as ArrayExpression))
        return expressionToExprNode(desugarSpread(expr as ArrayExpression), ctx)
      return (expr as ArrayExpression).elements.map((el) => {
        // A SpreadElement is truthy, so it used to reach `expressionToValue` and come back
        // `null` — `[...a]` was `[null]`, length 1, the hole presenting as a value (#52).
        if (el && el.type === 'SpreadElement') rejectSpread(el)
        return el ? expressionToValue(el as Expression, ctx) : null
      })

    case 'ObjectExpression': {
      // A literal whose keys include the VM's own markers would be read as code, not data:
      // `{ $expr: 'ident', name: 'x' }` written as DATA must not read x. Build it as an object
      // node, whose keys are never interpreted.
      if (
        (expr as ObjectExpression).properties.some(
          (p: any) =>
            p.type === 'Property' &&
            ['$expr', '$kind'].includes(
              p.key.type === 'Identifier' ? p.key.name : String(p.key.value)
            )
        )
      )
        return expressionToExprNode(expr, ctx)
      if (hasSpread(expr as ObjectExpression))
        return expressionToExprNode(
          desugarSpread(expr as ObjectExpression),
          ctx
        )
      const result: Record<string, any> = {}
      for (const prop of (expr as ObjectExpression).properties) {
        if (prop.type !== 'Property') rejectSpread(prop)
        if (prop.type === 'Property') {
          const key = propertyKeyName(prop, ctx)
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

    default: {
      // Never `null`: an expression this function did not recognise used to become `null`
      // silently, so `let j = i++` set j to null and the run reported success (tjs-lang#59
      // follow-up). Unsupported syntax in AJS fails loudly everywhere else; so does this.
      const hint =
        expr.type === 'UpdateExpression'
          ? ` — use \`${
              (expr as any).operator
            }\` as its own statement, or \`x = x + 1\``
          : expr.type === 'AssignmentExpression'
          ? ' — assign in its own statement, then use the variable'
          : ''
      throw new TranspileError(
        `Unsupported expression in AsyncJS: ${expr.type}${hint}`,
        getLocation(expr),
        ctx.source,
        ctx.filename
      )
    }
  }
}

/**
 * Extract call arguments from a call expression
 */
/** Builtins called positionally that the generic atom path emits (`Error('message')`). */
const POSITIONAL_BUILTINS: ReadonlySet<string> = new Set(['Error'])

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
        const key = propertyKeyName(prop, ctx)
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
