import { s, validate } from 'tosijs-schema'

// --- Types ---

export type OpCode = string

export interface Capabilities {
  fetch?: (url: string, init?: any) => Promise<any>
  store?: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    query?: (query: any) => Promise<any[]>
    vectorSearch?: (
      collection: string,
      vector: number[],
      k?: number,
      filter?: any
    ) => Promise<any[]>
  }
  llm?: {
    predict: (prompt: string, options?: any) => Promise<string>
    embed?: (text: string) => Promise<number[]>
  }
  agent?: {
    run: (agentId: string, input: any) => Promise<any>
  }
  xml?: {
    parse: (xml: string) => Promise<any>
  }
  [key: string]: any
}

export interface TraceEvent {
  op: string
  input: any
  stateDiff: Record<string, any>
  result?: any
  error?: string
  fuelBefore: number
  fuelAfter: number
  timestamp: string
}

export interface RuntimeContext {
  fuel: { current: number }
  args: Record<string, any>
  state: Record<string, any> // Current scope state
  capabilities: Capabilities
  resolver: (op: string) => Atom<any, any> | undefined
  output?: any
  memo?: Map<string, any>
  trace?: TraceEvent[]
}

export type AtomExec = (step: any, ctx: RuntimeContext) => Promise<void>

export interface AtomDef {
  op: OpCode
  inputSchema: any
  outputSchema?: any
  exec: AtomExec
  docs?: string
  timeoutMs?: number
  cost?: number | ((input: any, ctx: RuntimeContext) => number)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Atom<I, O> extends AtomDef {
  create(input: I): I & { op: string }
}

export interface AtomOptions {
  docs?: string
  timeoutMs?: number
  cost?: number | ((input: any, ctx: RuntimeContext) => number)
}

export interface RunResult {
  result: any
  fuelUsed: number
  trace?: TraceEvent[]
}

// --- Helpers ---

/**
 * Creates a child scope for the context.
 * Uses prototype inheritance so reads fall through to parent, but writes stay local.
 */
function createChildScope(ctx: RuntimeContext): RuntimeContext {
  return {
    ...ctx,
    state: Object.create(ctx.state),
  }
}

/**
 * Computes a shallow diff between two objects, returning the changes.
 */
function diffObjects(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, any> {
  const diff: Record<string, any> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeVal = before[key]
    const afterVal = after[key]

    if (afterVal !== beforeVal) {
      // For simplicity in tracing, we'll just show the new value.
      // A more complex diff could show { before: ..., after: ... }.
      diff[key] = afterVal
    }
  }
  return diff
}

export function resolveValue(val: any, ctx: RuntimeContext): any {
  if (val && typeof val === 'object' && val.$kind === 'arg') {
    return ctx.args[val.path]
  }
  // Expression nodes - evaluate directly
  if (val && typeof val === 'object' && val.$expr) {
    return evaluateExpr(val, ctx)
  }
  if (typeof val === 'string') {
    if (val.startsWith('args.')) {
      return ctx.args[val.replace('args.', '')]
    }
    // Dot notation support
    if (val.includes('.')) {
      const parts = val.split('.')
      let current = ctx.state[parts[0]]
      // If root variable exists, try to traverse
      if (current !== undefined) {
        for (let i = 1; i < parts.length; i++) {
          current = current?.[parts[i]]
        }
        return current
      }
    }
    // Simple state lookup (not an expression, just key)
    // Check if the key exists in state (even if value is undefined)
    if (val in ctx.state) {
      return ctx.state[val]
    }
    // Key doesn't exist in state - return the literal string
    return val
  }
  return val
}

// --- Expression Node Types ---

export type ExprNode =
  | { $expr: 'literal'; value: any }
  | { $expr: 'ident'; name: string }
  | { $expr: 'member'; object: ExprNode; property: string; computed?: boolean }
  | { $expr: 'binary'; op: string; left: ExprNode; right: ExprNode }
  | { $expr: 'unary'; op: string; argument: ExprNode }
  | { $expr: 'logical'; op: '&&' | '||'; left: ExprNode; right: ExprNode }
  | {
      $expr: 'conditional'
      test: ExprNode
      consequent: ExprNode
      alternate: ExprNode
    }
  | { $expr: 'array'; elements: ExprNode[] }
  | { $expr: 'object'; properties: { key: string; value: ExprNode }[] }
  | { $expr: 'call'; callee: string; arguments: ExprNode[] }

/** Fuel cost per expression node evaluation */
const EXPR_FUEL_COST = 0.01

/**
 * Evaluates an expression node against the runtime context.
 * This replaces JSEP for new code - expressions are already parsed by Acorn.
 * Each node evaluation consumes a small amount of fuel to prevent runaway expressions.
 */
export function evaluateExpr(node: ExprNode, ctx: RuntimeContext): any {
  // Handle non-expression values (literals passed directly)
  if (node === null || node === undefined) {
    return node
  }
  if (typeof node !== 'object' || !('$expr' in node)) {
    // It's a literal value, not an expression node
    return node
  }

  // Consume fuel for each expression node evaluation
  if (ctx.fuel) {
    ctx.fuel.current -= EXPR_FUEL_COST
    if (ctx.fuel.current <= 0) {
      throw new Error('Out of Fuel')
    }
  }

  switch (node.$expr) {
    case 'literal':
      return node.value

    case 'ident': {
      // Look up in state first, then args
      if (node.name in ctx.state) {
        return ctx.state[node.name]
      }
      if (node.name in ctx.args) {
        return ctx.args[node.name]
      }
      return undefined
    }

    case 'member': {
      const obj = evaluateExpr(node.object, ctx)
      const prop = node.property

      // Security: Block prototype access
      if (
        prop === '__proto__' ||
        prop === 'constructor' ||
        prop === 'prototype'
      ) {
        throw new Error(`Security Error: Access to '${prop}' is forbidden`)
      }

      return obj?.[prop]
    }

    case 'binary': {
      const left = evaluateExpr(node.left, ctx)
      const right = evaluateExpr(node.right, ctx)

      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
        case '%':
          return left % right
        case '**':
          return left ** right
        case '>':
          return left > right
        case '<':
          return left < right
        case '>=':
          return left >= right
        case '<=':
          return left <= right
        case '==':
          return left == right
        case '!=':
          return left != right
        case '===':
          return left === right
        case '!==':
          return left !== right
        default:
          throw new Error(`Unknown binary operator: ${node.op}`)
      }
    }

    case 'unary': {
      const arg = evaluateExpr(node.argument, ctx)
      switch (node.op) {
        case '!':
          return !arg
        case '-':
          return -arg
        case '+':
          return +arg
        case 'typeof':
          return typeof arg
        default:
          throw new Error(`Unknown unary operator: ${node.op}`)
      }
    }

    case 'logical': {
      // Short-circuit evaluation
      const left = evaluateExpr(node.left, ctx)
      if (node.op === '&&') {
        return left ? evaluateExpr(node.right, ctx) : left
      } else {
        return left ? left : evaluateExpr(node.right, ctx)
      }
    }

    case 'conditional': {
      const test = evaluateExpr(node.test, ctx)
      return test
        ? evaluateExpr(node.consequent, ctx)
        : evaluateExpr(node.alternate, ctx)
    }

    case 'array':
      return node.elements.map((el) => evaluateExpr(el, ctx))

    case 'object': {
      const result: Record<string, any> = {}
      for (const prop of node.properties) {
        result[prop.key] = evaluateExpr(prop.value, ctx)
      }
      return result
    }

    case 'call': {
      // For atom calls within expressions
      const atom = ctx.resolver(node.callee)
      if (!atom) {
        throw new Error(`Unknown function: ${node.callee}`)
      }
      // This is synchronous evaluation - atom calls need special handling
      // For now, throw - atom calls should be lifted to statements
      throw new Error(
        `Atom calls in expressions not yet supported: ${node.callee}`
      )
    }

    default:
      throw new Error(`Unknown expression type: ${(node as any).$expr}`)
  }
}

// --- Atom Factory ---

export function defineAtom<I extends Record<string, any>, O = any>(
  op: string,
  inputSchema: any, // s.Schema<I>
  outputSchema: any | undefined, // s.Schema<O>
  fn: (input: I, ctx: RuntimeContext) => Promise<O>,
  options: AtomOptions | string = {}
): Atom<I, O> {
  const {
    docs = '',
    timeoutMs = 1000,
    cost = 1,
  } = typeof options === 'string' ? { docs: options } : options

  const exec: AtomExec = async (step: any, ctx: RuntimeContext) => {
    const { op: _op, result: _res, ...inputData } = step

    // 1. Validation
    if (inputSchema && !validate(inputSchema, inputData)) {
      throw new Error(
        `Atom '${op}' validation failed: ${JSON.stringify(inputData)}`
      )
    }

    // --- Tracing Start ---
    const stateBefore = ctx.trace ? { ...ctx.state } : null
    const fuelBefore = ctx.fuel.current
    let result: any
    let error: string | undefined

    try {
      // 2. Deduct Fuel
      const currentCost =
        typeof cost === 'function' ? cost(inputData, ctx) : cost
      if ((ctx.fuel.current -= currentCost) <= 0) throw new Error('Out of Fuel')

      // 3. Execution with Timeout
      let timer: any
      const execute = async () => fn(step as I, ctx)

      result =
        timeoutMs > 0
          ? await Promise.race([
              execute(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error(`Atom '${op}' timed out`)),
                  timeoutMs
                )
              }),
            ]).finally(() => clearTimeout(timer))
          : await execute()

      // 4. Result
      if (step.result && result !== undefined) {
        ctx.state[step.result] = result
      }
    } catch (e: any) {
      error = e.message || String(e)
      // Re-throw the error to be handled by try/catch blocks in the agent logic
      throw e
    } finally {
      // --- Tracing End ---
      if (ctx.trace && stateBefore) {
        const stateDiff = diffObjects(stateBefore, ctx.state)
        ctx.trace.push({
          op,
          input: inputData,
          stateDiff,
          result,
          error,
          fuelBefore,
          fuelAfter: ctx.fuel.current,
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  return {
    op,
    inputSchema,
    outputSchema,
    exec,
    docs,
    timeoutMs,
    cost,
    create: (input: I) => ({ op, ...input }),
  }
}

// --- Core Atoms ---

// 1. Flow (Low cost: 0.1)
export const seq = defineAtom(
  'seq',
  s.object({ steps: s.array(s.any) }),
  undefined,
  async ({ steps }, ctx) => {
    for (const step of steps) {
      if (ctx.output !== undefined) return // Return check
      const atom = ctx.resolver(step.op)
      if (!atom) throw new Error(`Unknown Atom: ${step.op}`)
      await atom.exec(step, ctx)
    }
  },
  { docs: 'Sequence', timeoutMs: 0, cost: 0.1 }
)

export const iff = defineAtom(
  'if',
  s.object({
    condition: s.any, // ExprNode
    then: s.array(s.any),
    else: s.array(s.any).optional,
  }),
  undefined,
  async (step, ctx) => {
    if (evaluateExpr(step.condition, ctx)) {
      await seq.exec({ op: 'seq', steps: step.then } as any, ctx)
    } else if (step.else) {
      await seq.exec({ op: 'seq', steps: step.else } as any, ctx)
    }
  },
  { docs: 'If/Else', timeoutMs: 0, cost: 0.1 }
)

export const whileLoop = defineAtom(
  'while',
  s.object({
    condition: s.any, // ExprNode
    body: s.array(s.any),
  }),
  undefined,
  async (step, ctx) => {
    while (evaluateExpr(step.condition, ctx)) {
      if ((ctx.fuel.current -= 0.1) <= 0) throw new Error('Out of Fuel')
      await seq.exec({ op: 'seq', steps: step.body } as any, ctx)
      if (ctx.output !== undefined) return
    }
  },
  { docs: 'While Loop', timeoutMs: 0, cost: 0.1 }
)

export const ret = defineAtom(
  'return',
  undefined,
  s.any,
  async (step: any, ctx) => {
    const res: any = {}
    // If schema provided, extract subset of state. Else return null/void?
    // Current pattern: schema defines output shape matching state keys
    if (step.schema?.properties) {
      for (const key of Object.keys(step.schema.properties)) {
        res[key] = ctx.state[key]
      }
    }
    ctx.output = res
    return res
  },
  { docs: 'Return', cost: 0.1 }
)

export const tryCatch = defineAtom(
  'try',
  s.object({ try: s.array(s.any), catch: s.array(s.any).optional }),
  undefined,
  async (step, ctx) => {
    try {
      await seq.exec({ op: 'seq', steps: step.try } as any, ctx)
    } catch (e: any) {
      if (step.catch) {
        ctx.state['error'] = e.message || String(e)
        await seq.exec({ op: 'seq', steps: step.catch } as any, ctx)
      }
    }
  },
  { docs: 'Try/Catch', timeoutMs: 0, cost: 0.1 }
)

// 2. State (Low cost: 0.1)
export const varSet = defineAtom(
  'varSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    ctx.state[key] = resolveValue(value, ctx)
  },
  { docs: 'Set Variable', cost: 0.1 }
)

export const varGet = defineAtom(
  'varGet',
  s.object({ key: s.string }),
  s.any,
  async ({ key }, ctx) => {
    return resolveValue(key, ctx)
  },
  { docs: 'Get Variable', cost: 0.1 }
)

export const varsImport = defineAtom(
  'varsImport',
  s.object({
    keys: s.union([s.array(s.string), s.record(s.string)]),
  }),
  undefined,
  async ({ keys }, ctx) => {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        ctx.state[key] = resolveValue({ $kind: 'arg', path: key }, ctx)
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        ctx.state[alias] = resolveValue({ $kind: 'arg', path: path }, ctx)
      }
    }
  },
  {
    docs: 'Import variables from args into the current scope, with optional renaming.',
    cost: 0.2,
  }
)

export const varsLet = defineAtom(
  'varsLet',
  s.record(s.any),
  undefined,
  async (step, ctx) => {
    for (const key of Object.keys(step)) {
      if (key === 'op' || key === 'result') continue
      ctx.state[key] = resolveValue(step[key], ctx)
    }
  },
  {
    docs: 'Initialize a set of variables in the current scope from the step object properties.',
    cost: 0.1,
  }
)

export const varsExport = defineAtom(
  'varsExport',
  s.object({
    keys: s.union([s.array(s.string), s.record(s.string)]),
  }),
  s.record(s.any),
  async ({ keys }, ctx) => {
    const result: Record<string, any> = {}
    if (Array.isArray(keys)) {
      for (const key of keys) {
        result[key] = resolveValue(key, ctx)
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        result[alias] = resolveValue(path, ctx)
      }
    }
    return result
  },
  {
    docs: 'Export variables from the current scope, with optional renaming.',
    cost: 0.2,
  }
)

export const scope = defineAtom(
  'scope',
  s.object({ steps: s.array(s.any) }),
  undefined,
  async ({ steps }, ctx) => {
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps } as any, scopedCtx)
    // Propagate output/return up
    if (scopedCtx.output !== undefined) ctx.output = scopedCtx.output
  },
  { docs: 'Create new scope', timeoutMs: 0, cost: 0.1 }
)

// 3. Logic (Basic boolean ops - Low cost 0.1)
const binaryLogic = (op: string, fn: (a: any, b: any) => boolean) =>
  defineAtom(
    op,
    s.object({ a: s.any, b: s.any }),
    s.boolean,
    async ({ a, b }, ctx) => fn(resolveValue(a, ctx), resolveValue(b, ctx)),
    { docs: 'Logic', cost: 0.1 }
  )

export const eq = binaryLogic('eq', (a, b) => a == b)
export const neq = binaryLogic('neq', (a, b) => a != b)
export const gt = binaryLogic('gt', (a, b) => a > b)
export const lt = binaryLogic('lt', (a, b) => a < b)
export const and = binaryLogic('and', (a, b) => !!(a && b))
export const or = binaryLogic('or', (a, b) => !!(a || b))
export const not = defineAtom(
  'not',
  s.object({ value: s.any }),
  s.boolean,
  async ({ value }, ctx) => !resolveValue(value, ctx),
  { docs: 'Not', cost: 0.1 }
)

// 4. List (Cost 1)
export const map = defineAtom(
  'map',
  s.object({ items: s.array(s.any), as: s.string, steps: s.array(s.any) }),
  s.array(s.any),
  async ({ items, as, steps }, ctx) => {
    const results = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('map: items is not an array')
    for (const item of resolvedItems) {
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      results.push(scopedCtx.state['result'] ?? null)
    }
    return results
  },
  { docs: 'Map Array', timeoutMs: 0, cost: 1 }
)

export const push = defineAtom(
  'push',
  s.object({ list: s.array(s.any), item: s.any }),
  s.array(s.any),
  async ({ list, item }, ctx) => {
    const resolvedList = resolveValue(list, ctx)
    const resolvedItem = resolveValue(item, ctx)
    if (Array.isArray(resolvedList)) resolvedList.push(resolvedItem)
    return resolvedList
  },
  { docs: 'Push to Array', cost: 1 }
)

export const len = defineAtom(
  'len',
  s.object({ list: s.any }),
  s.number,
  async ({ list }, ctx) => {
    const val = resolveValue(list, ctx)
    return Array.isArray(val) || typeof val === 'string' ? val.length : 0
  },
  { docs: 'Length', cost: 1 }
)

// 6. String (Cost 1)
export const split = defineAtom(
  'split',
  s.object({ str: s.string, sep: s.string }),
  s.array(s.string),
  async ({ str, sep }, ctx) =>
    resolveValue(str, ctx).split(resolveValue(sep, ctx)),
  { docs: 'Split String', cost: 1 }
)
export const join = defineAtom(
  'join',
  s.object({ list: s.array(s.string), sep: s.string }),
  s.string,
  async ({ list, sep }, ctx) =>
    resolveValue(list, ctx).join(resolveValue(sep, ctx)),
  { docs: 'Join String', cost: 1 }
)
export const template = defineAtom(
  'template',
  s.object({ tmpl: s.string, vars: s.record(s.any) }),
  s.string,
  async ({ tmpl, vars }: { tmpl: string; vars: Record<string, any> }, ctx) => {
    const resolvedTmpl = resolveValue(tmpl, ctx)
    return resolvedTmpl.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
      String(resolveValue(vars[key], ctx) ?? '')
    )
  },
  { docs: 'String Template', cost: 1 }
)

export const regexMatch = defineAtom(
  'regexMatch',
  s.object({
    pattern: s.string,
    value: s.any,
  }),
  s.boolean,
  async ({ pattern, value }, ctx: RuntimeContext) => {
    const resolvedValue = resolveValue(value, ctx)
    const p = new RegExp(pattern)
    return p.test(resolvedValue)
  },
  {
    docs: 'Returns true if the value matches the regex pattern.',
    cost: 2,
  }
)

// 7. Object (Cost 1)
export const pick = defineAtom(
  'pick',
  s.object({ obj: s.record(s.any), keys: s.array(s.string) }),
  s.record(s.any),
  async ({ obj, keys }: { obj: Record<string, any>; keys: string[] }, ctx) => {
    const resolvedObj = resolveValue(obj, ctx)
    const resolvedKeys = resolveValue(keys, ctx)
    const res: any = {}
    if (resolvedObj && Array.isArray(resolvedKeys)) {
      resolvedKeys.forEach((k: string) => (res[k] = resolvedObj[k]))
    }
    return res
  },
  { docs: 'Pick Keys', cost: 1 }
)

export const merge = defineAtom(
  'merge',
  s.object({ a: s.record(s.any), b: s.record(s.any) }),
  s.record(s.any),
  async ({ a, b }, ctx) => ({
    ...resolveValue(a, ctx),
    ...resolveValue(b, ctx),
  }),
  { docs: 'Merge Objects', cost: 1 }
)
export const keys = defineAtom(
  'keys',
  s.object({ obj: s.record(s.any) }),
  s.array(s.string),
  async ({ obj }, ctx) => Object.keys(resolveValue(obj, ctx) ?? {}),
  { docs: 'Object Keys', cost: 1 }
)

// 8. IO (Cost 1)
export const fetch = defineAtom(
  'httpFetch',
  s.object({
    url: s.string,
    method: s.string.optional,
    headers: s.record(s.string).optional,
    body: s.any.optional,
  }),
  s.any,
  async (step, ctx) => {
    const url = resolveValue(step.url, ctx)
    const method = resolveValue(step.method, ctx)
    const headers = resolveValue(step.headers, ctx)
    const body = resolveValue(step.body, ctx)
    if (ctx.capabilities.fetch) {
      return ctx.capabilities.fetch(url, { method, headers, body })
    }
    // Default: global fetch
    if (typeof globalThis.fetch === 'function') {
      const res = await globalThis.fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })
      // Try to parse JSON if content-type says so, else text
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return res.json()
      }
      return res.text()
    }
    throw new Error("Capability 'fetch' missing and no global fetch available")
  },
  { docs: 'HTTP Fetch', cost: 5 }
)

// 9. Store
export const storeGet = defineAtom(
  'storeGet',
  s.object({ key: s.string }),
  s.any,
  async ({ key }, ctx) => {
    const k = resolveValue(key, ctx)
    return ctx.capabilities.store?.get(k)
  },
  { docs: 'Store Get', cost: 5 }
)

export const storeSet = defineAtom(
  'storeSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    const k = resolveValue(key, ctx)
    const v = resolveValue(value, ctx)
    return ctx.capabilities.store?.set(k, v)
  },
  { docs: 'Store Set', cost: 5 }
)

export const storeQuery = defineAtom(
  'storeQuery',
  s.object({ query: s.any }),
  s.array(s.any),
  async ({ query }, ctx) =>
    ctx.capabilities.store?.query?.(resolveValue(query, ctx)) ?? [],
  { docs: 'Store Query', cost: 5 }
)
export const vectorSearch = defineAtom(
  'storeVectorSearch',
  s.object({
    collection: s.string,
    vector: s.array(s.number),
    k: s.number.optional,
  }),
  s.array(s.any),
  async ({ collection, vector, k }, ctx) =>
    ctx.capabilities.store?.vectorSearch?.(
      resolveValue(collection, ctx),
      resolveValue(vector, ctx),
      resolveValue(k, ctx)
    ) ?? [],
  {
    docs: 'Vector Search',
    cost: (input, ctx) => 5 + (resolveValue(input.k, ctx) ?? 5),
  }
)

// 10. Agent
export const llmPredict = defineAtom(
  'llmPredict',
  s.object({ prompt: s.string, options: s.any.optional }),
  s.string,
  async ({ prompt, options }, ctx) => {
    if (!ctx.capabilities.llm?.predict)
      throw new Error("Capability 'llm.predict' missing")
    return ctx.capabilities.llm.predict(
      resolveValue(prompt, ctx),
      resolveValue(options, ctx)
    )
  },
  { docs: 'LLM Predict', cost: 1 }
)

export const agentRun = defineAtom(
  'agentRun',
  s.object({ agentId: s.string, input: s.any }),
  s.any,
  async ({ agentId, input }, ctx) => {
    if (!ctx.capabilities.agent?.run)
      throw new Error("Capability 'agent.run' missing")

    const resolvedId = resolveValue(agentId, ctx)
    const rawInput = resolveValue(input, ctx)

    let resolvedInput = rawInput
    if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      resolvedInput = {}
      for (const k in rawInput) {
        resolvedInput[k] = resolveValue(rawInput[k], ctx)
      }
    }

    return ctx.capabilities.agent.run(resolvedId, resolvedInput)
  },
  { docs: 'Run Sub-Agent', cost: 1 }
)

// 11. Parsing (Cost 1)
export const jsonParse = defineAtom(
  'jsonParse',
  s.object({ str: s.string }),
  s.any,
  async ({ str }, ctx) => JSON.parse(resolveValue(str, ctx)),
  { docs: 'Parse JSON', cost: 1 }
)
export const jsonStringify = defineAtom(
  'jsonStringify',
  s.object({ value: s.any }),
  s.string,
  async ({ value }, ctx) => JSON.stringify(resolveValue(value, ctx)),
  { docs: 'Stringify JSON', cost: 1 }
)
export const xmlParse = defineAtom(
  'xmlParse',
  s.object({ str: s.string }),
  s.any,
  async ({ str }, ctx) => {
    if (!ctx.capabilities.xml?.parse)
      throw new Error("Capability 'xml.parse' missing")
    return ctx.capabilities.xml.parse(resolveValue(str, ctx))
  },
  { docs: 'Parse XML', cost: 1 }
)

// 12. Optimization
export const memoize = defineAtom(
  'memoize',
  s.object({ key: s.string.optional, steps: s.array(s.any) }),
  s.any,
  async ({ key, steps }, ctx) => {
    // In-memory memoization scoped to VM run
    if (!ctx.memo) ctx.memo = new Map()

    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))

    // Check if result exists
    if (ctx.memo.has(k)) {
      return ctx.memo.get(k)
    }

    // Execute steps in isolated scope
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps } as any, scopedCtx)

    // Result is implicit from last step or explicit scope result variable?
    // Convention: result variable or last output
    const result = scopedCtx.output ?? scopedCtx.state['result']

    // Store
    ctx.memo.set(k, result)
    return result
  },
  { docs: 'Memoize steps result in memory', cost: 1 }
)

export const cache = defineAtom(
  'cache',
  s.object({
    key: s.string.optional,
    steps: s.array(s.any),
    ttlMs: s.number.optional,
  }),
  s.any,
  async ({ key, steps, ttlMs }, ctx) => {
    if (!ctx.capabilities.store)
      throw new Error("Capability 'store' missing for caching")

    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))

    // Check cache
    const cacheKey = `cache:${k}`
    const cached = await ctx.capabilities.store.get(cacheKey)

    if (cached) {
      // If object with timestamp?
      // For simple store, we might store { val, exp }
      // Let's assume we store { val, exp } if we manage TTL manually
      // or capabilities handle TTL?
      // Standard KV doesn't enforce TTL usually unless Redis.
      // We implement soft TTL logic wrapper here.
      if (typeof cached === 'object' && cached._exp) {
        if (Date.now() < cached._exp) return cached.val
        // Expired
      } else {
        // No expiry metadata, assume valid if exists (or legacy data)
        return cached
      }
    }

    // Execute
    const scopedCtx = createChildScope(ctx)
    await seq.exec({ op: 'seq', steps } as any, scopedCtx)
    const result = scopedCtx.output ?? scopedCtx.state['result']

    // Store with TTL
    const expiry = Date.now() + (ttlMs ?? 24 * 3600 * 1000)

    if ((ctx.fuel.current -= 5) <= 0) throw new Error('Out of Fuel')
    await ctx.capabilities.store.set(cacheKey, { val: result, _exp: expiry })

    return result
  },
  { docs: 'Cache steps result in store with TTL', cost: 5 }
)

// 13. Utils
export const random = defineAtom(
  'random',
  s.object({
    min: s.number.optional,
    max: s.number.optional,
    format: s.string.optional,
    length: s.number.optional,
  }),
  s.any,
  async ({ min, max, format, length }, ctx) => {
    const f = resolveValue(format, ctx) ?? 'float'
    const len = resolveValue(length, ctx) ?? 10
    const mn = resolveValue(min, ctx) ?? 0
    const mx = resolveValue(max, ctx) ?? 1

    if (f === 'base36') {
      const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
      let result = ''
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const values = new Uint8Array(len)
        crypto.getRandomValues(values)
        for (let i = 0; i < len; i++) {
          result += chars[values[i] % 36]
        }
      } else {
        for (let i = 0; i < len; i++) {
          result += chars.charAt(Math.floor(Math.random() * 36))
        }
      }
      return result
    }

    let val = Math.random()
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      val = arr[0] / (0xffffffff + 1)
    }

    const range = mx - mn
    const result = val * range + mn

    if (f === 'integer') {
      return Math.floor(result)
    }
    return result
  },
  { docs: 'Generate Random', cost: 1 }
)

export const uuid = defineAtom(
  'uuid',
  undefined,
  s.string,
  async () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  },
  { docs: 'Generate UUID', cost: 1 }
)

export const hash = defineAtom(
  'hash',
  s.object({
    value: s.any,
    algorithm: s.string.optional, // e.g., 'SHA-256'
  }),
  s.string,
  async ({ value, algorithm }, ctx) => {
    const str =
      typeof value === 'string'
        ? value
        : JSON.stringify(resolveValue(value, ctx))
    const algo = resolveValue(algorithm, ctx) || 'SHA-256'

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(str)
      const hashBuffer = await crypto.subtle.digest(algo, data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }

    // Fallback for environments without crypto.subtle
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return String(hash)
  },
  { docs: 'Hash a value', cost: 1 }
)

// --- Exports ---

export const coreAtoms = {
  seq,
  if: iff,
  while: whileLoop,
  return: ret,
  try: tryCatch,
  varSet,
  varGet,
  varsImport,
  varsLet,
  varsExport,
  scope,
  eq,
  neq,
  gt,
  lt,
  and,
  or,
  not,
  map,
  push,
  len,
  split,
  join,
  template,
  regexMatch,
  pick,
  merge,
  keys,
  httpFetch: fetch,
  storeGet,
  storeSet,
  storeQuery,
  storeVectorSearch: vectorSearch,
  llmPredict,
  agentRun,
  jsonParse,
  jsonStringify,
  xmlParse,
  memoize,
  cache,
  random,
  uuid,
  hash,
}
