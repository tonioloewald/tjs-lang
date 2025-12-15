import { s, type Infer, validate } from 'tosijs-schema'
import type { BaseNode } from './builder'
import jsep from 'jsep'

// --- Types ---

export type OpCode = string

export interface Capabilities {
  fetch?: (url: string, init?: any) => Promise<any>
  store?: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    query?: (query: any) => Promise<any[]>
    vectorSearch?: (vector: number[]) => Promise<any[]>
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

export interface RuntimeContext {
  fuel: number
  args: Record<string, any>
  state: Record<string, any> // Current scope state
  capabilities: Capabilities
  resolver: (op: string) => Atom<any, any> | undefined
  output?: any
}

export type AtomExec = (step: any, ctx: RuntimeContext) => Promise<void>

export interface AtomDef {
  op: OpCode
  inputSchema: any
  outputSchema?: any
  exec: AtomExec
  docs?: string
  timeoutMs?: number
  cost?: number
}

export interface Atom<I, O> extends AtomDef {
  create(input: I): I & { op: string }
}

export interface AtomOptions {
  docs?: string
  timeoutMs?: number
  cost?: number
}

export interface RunResult {
  result: any
  fuelUsed: number
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

function resolveValue(val: any, ctx: RuntimeContext): any {
  if (val && typeof val === 'object' && val.$kind === 'arg') {
    return ctx.args[val.path]
  }
  if (typeof val === 'string') {
    if (val.startsWith('args.')) {
      return ctx.args[val.replace('args.', '')]
    }
    // Simple state lookup (not an expression, just key)
    const v = ctx.state[val]
    return v !== undefined ? v : val
  }
  return val
}

// --- JSEP Evaluator ---

// Add binary ops
jsep.addBinaryOp('and', 1)
jsep.addBinaryOp('or', 1)
jsep.addBinaryOp('eq', 6)
jsep.addBinaryOp('neq', 6)
jsep.addBinaryOp('gt', 7)
jsep.addBinaryOp('lt', 7)
jsep.addBinaryOp('ge', 7)
jsep.addBinaryOp('le', 7)

function evaluateJsep(node: any, context: Record<string, any>): any {
  switch (node.type) {
    case 'Literal':
      return node.value

    case 'Identifier':
      return context[node.name]

    case 'UnaryExpression': {
      const arg = evaluateJsep(node.argument, context)
      if (node.operator === '!') return !arg
      if (node.operator === '-') return -arg
      throw new Error(`Unknown unary operator: ${node.operator}`)
    }

    case 'BinaryExpression': {
      const left = evaluateJsep(node.left, context)
      const right = evaluateJsep(node.right, context)
      switch (node.operator) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return left / right
        case '%': return left % right
        case '>': return left > right
        case '<': return left < right
        case '>=': case 'ge': return left >= right
        case '<=': case 'le': return left <= right
        case '==': case 'eq': return left == right
        case '!=': case 'neq': return left != right
        case '&&': case 'and': return left && right
        case '||': case 'or': return left || right
        default: throw new Error(`Unknown binary operator: ${node.operator}`)
      }
    }

    case 'MemberExpression': {
      const obj = evaluateJsep(node.object, context)
      const prop = node.computed 
        ? evaluateJsep(node.property, context)
        : node.property.name
        
      // Security Check: Block prototype access
      if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
        throw new Error(`Security Error: Access to '${prop}' is forbidden`)
      }
      
      return obj?.[prop]
    }

    case 'ArrayExpression':
      return node.elements.map((el: any) => evaluateJsep(el, context))

    case 'CallExpression':
      // Basic function support if needed, or throw
      // For now, no function calls allowed in expressions for safety
      throw new Error('Function calls not supported in expressions')

    default:
      throw new Error(`Unknown node type: ${node.type}`)
  }
}

/**
 * Evaluates a JSEP-compatible expression string against a context object.
 */
function evaluateExpression(expr: string, vars: Record<string, any>): any {
  if (!expr || expr.trim() === '') return undefined
  try {
    const ast = jsep(expr)
    return evaluateJsep(ast, vars)
  } catch (e: any) {
    throw new Error(`Expression error "${expr}": ${e.message}`)
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
  const { docs = '', timeoutMs = 1000, cost = 1 } =
    typeof options === 'string' ? { docs: options } : options

  const exec: AtomExec = async (step: any, ctx: RuntimeContext) => {
    // 1. Deduct Fuel
    if ((ctx.fuel -= cost) <= 0) throw new Error('Out of Fuel')

    // 2. Validation (Strip metadata before validation)
    const { op: _op, result: _res, ...inputData } = step
    if (inputSchema && !validate(inputSchema, inputData)) {
      // In production: detailed diagnostics
      throw new Error(`Atom '${op}' validation failed: ${JSON.stringify(inputData)}`)
    }

    // 3. Execution with Timeout
    let timer: any
    const execute = async () => fn(step as I, ctx)
    
    const result = timeoutMs > 0 
      ? await Promise.race([
          execute(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Atom '${op}' timed out`)), timeoutMs)
          })
        ]).finally(() => clearTimeout(timer))
      : await execute()

    // 4. Result
    if (step.result && result !== undefined) {
      ctx.state[step.result] = result
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
export const seq = defineAtom('seq', s.object({ steps: s.array(s.any) }), undefined, async ({ steps }, ctx) => {
  for (const step of steps) {
    if (ctx.output !== undefined) return // Return check
    const atom = ctx.resolver(step.op)
    if (!atom) throw new Error(`Unknown Atom: ${step.op}`)
    await atom.exec(step, ctx)
  }
}, { docs: 'Sequence', timeoutMs: 0, cost: 0.1 })

export const iff = defineAtom('if', s.object({ condition: s.string, vars: s.record(s.any), then: s.array(s.any), else: s.array(s.any).optional }), undefined, async (step, ctx) => {
  // Resolve vars from state if they are strings pointing to keys, or use literals
  const vars: Record<string, any> = {}
  for (const [k, v] of Object.entries(step.vars)) {
     vars[k] = resolveValue(v, ctx)
  }
  if (evaluateExpression(step.condition, vars)) {
    await seq.exec({ op: 'seq', steps: step.then } as any, ctx)
  } else if (step.else) {
    await seq.exec({ op: 'seq', steps: step.else } as any, ctx)
  }
}, { docs: 'If/Else', timeoutMs: 0, cost: 0.1 })

export const whileLoop = defineAtom('while', s.object({ condition: s.string, vars: s.record(s.any), body: s.array(s.any) }), undefined, async (step, ctx) => {
  while (true) {
    if (ctx.fuel <= 0) throw new Error('Out of Fuel')
    const vars: Record<string, any> = {}
    for (const [k, v] of Object.entries(step.vars)) vars[k] = resolveValue(v, ctx)
    
    if (!evaluateExpression(step.condition, vars)) break
    await seq.exec({ op: 'seq', steps: step.body } as any, ctx)
    if (ctx.output !== undefined) return
  }
}, { docs: 'While Loop', timeoutMs: 0, cost: 0.1 })

export const ret = defineAtom('return', undefined, s.any, async (step: any, ctx) => {
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
}, { docs: 'Return', cost: 0.1 })

export const tryCatch = defineAtom('try', s.object({ try: s.array(s.any), catch: s.array(s.any).optional }), undefined, async (step, ctx) => {
  try {
    await seq.exec({ op: 'seq', steps: step.try } as any, ctx)
  } catch (e: any) {
    if (step.catch) {
      ctx.state['error'] = e.message || String(e)
      await seq.exec({ op: 'seq', steps: step.catch } as any, ctx)
    }
  }
}, { docs: 'Try/Catch', timeoutMs: 0, cost: 0.1 })

// 2. State (Low cost: 0.1)
export const varSet = defineAtom('varSet', s.object({ key: s.string, value: s.any }), undefined, async ({ key, value }, ctx) => {
  ctx.state[key] = resolveValue(value, ctx)
}, { docs: 'Set Variable', cost: 0.1 })

export const varGet = defineAtom('varGet', s.object({ key: s.string }), s.any, async ({ key }, ctx) => {
  return resolveValue(key, ctx)
}, { docs: 'Get Variable', cost: 0.1 })

export const scope = defineAtom('scope', s.object({ steps: s.array(s.any) }), undefined, async ({ steps }, ctx) => {
  const scopedCtx = createChildScope(ctx)
  await seq.exec({ op: 'seq', steps } as any, scopedCtx)
  // Propagate output/return up
  if (scopedCtx.output !== undefined) ctx.output = scopedCtx.output
}, { docs: 'Create new scope', timeoutMs: 0, cost: 0.1 })

// 3. Logic (Basic boolean ops - Low cost 0.1)
const binaryLogic = (op: string, fn: (a: any, b: any) => boolean) => 
  defineAtom(op, s.object({ a: s.any, b: s.any }), s.boolean, async ({ a, b }, ctx) => fn(resolveValue(a, ctx), resolveValue(b, ctx)), { docs: 'Logic', cost: 0.1 })

export const eq = binaryLogic('eq', (a, b) => a == b)
export const neq = binaryLogic('neq', (a, b) => a != b)
export const gt = binaryLogic('gt', (a, b) => a > b)
export const lt = binaryLogic('lt', (a, b) => a < b)
export const and = binaryLogic('and', (a, b) => !!(a && b))
export const or = binaryLogic('or', (a, b) => !!(a || b))
export const not = defineAtom('not', s.object({ value: s.any }), s.boolean, async ({ value }, ctx) => !resolveValue(value, ctx), { docs: 'Not', cost: 0.1 })

// 4. Math (Cost 1)
export const calc = defineAtom('mathCalc', s.object({ expr: s.string, vars: s.record(s.any) }), s.number, async ({ expr, vars }, ctx) => {
  const resolved: Record<string, any> = {}
  for (const [k, v] of Object.entries(vars)) resolved[k] = resolveValue(v, ctx)
  return evaluateExpression(expr, resolved)
}, { docs: 'Math Calc', cost: 1 })

// 5. List (Cost 1)
export const map = defineAtom('map', s.object({ items: s.array(s.any), as: s.string, steps: s.array(s.any) }), s.array(s.any), async ({ items, as, steps }, ctx) => {
  const results = []
  const resolvedItems = resolveValue(items, ctx)
  if (!Array.isArray(resolvedItems)) throw new Error('map: items is not an array')
  for (const item of resolvedItems) {
    const scopedCtx = createChildScope(ctx)
    scopedCtx.state[as] = item
    await seq.exec({ op: 'seq', steps } as any, scopedCtx)
    results.push(scopedCtx.state['result'] ?? null)
  }
  return results
}, { docs: 'Map Array', timeoutMs: 0, cost: 1 })

export const push = defineAtom('push', s.object({ list: s.array(s.any), item: s.any }), s.array(s.any), async ({ list, item }, ctx) => {
  const resolvedList = resolveValue(list, ctx)
  const resolvedItem = resolveValue(item, ctx)
  if (Array.isArray(resolvedList)) resolvedList.push(resolvedItem)
  return resolvedList
}, { docs: 'Push to Array', cost: 1 })

export const len = defineAtom('len', s.object({ list: s.any }), s.number, async ({ list }, ctx) => {
  const val = resolveValue(list, ctx)
  return Array.isArray(val) || typeof val === 'string' ? val.length : 0
}, { docs: 'Length', cost: 1 })

// 6. String (Cost 1)
export const split = defineAtom('split', s.object({ str: s.string, sep: s.string }), s.array(s.string), async ({ str, sep }, ctx) => resolveValue(str, ctx).split(resolveValue(sep, ctx)), { docs: 'Split String', cost: 1 })
export const join = defineAtom('join', s.object({ list: s.array(s.string), sep: s.string }), s.string, async ({ list, sep }, ctx) => resolveValue(list, ctx).join(resolveValue(sep, ctx)), { docs: 'Join String', cost: 1 })
export const template = defineAtom('template', s.object({ tmpl: s.string, vars: s.record(s.any) }), s.string, async ({ tmpl, vars }: { tmpl: string, vars: Record<string, any> }, ctx) => {
  const resolvedTmpl = resolveValue(tmpl, ctx)
  return resolvedTmpl.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => String(resolveValue(vars[key], ctx) ?? ''))
}, { docs: 'String Template', cost: 1 })

// 7. Object (Cost 1)
export const pick = defineAtom('pick', s.object({ obj: s.record(s.any), keys: s.array(s.string) }), s.record(s.any), async ({ obj, keys }: { obj: Record<string, any>, keys: string[] }, ctx) => {
  const resolvedObj = resolveValue(obj, ctx)
  const resolvedKeys = resolveValue(keys, ctx)
  const res: any = {}
  if (resolvedObj && Array.isArray(resolvedKeys)) {
    resolvedKeys.forEach((k: string) => res[k] = resolvedObj[k])
  }
  return res
}, { docs: 'Pick Keys', cost: 1 })

export const merge = defineAtom('merge', s.object({ a: s.record(s.any), b: s.record(s.any) }), s.record(s.any), async ({ a, b }, ctx) => ({ ...resolveValue(a, ctx), ...resolveValue(b, ctx) }), { docs: 'Merge Objects', cost: 1 })
export const keys = defineAtom('keys', s.object({ obj: s.record(s.any) }), s.array(s.string), async ({ obj }, ctx) => Object.keys(resolveValue(obj, ctx) ?? {}), { docs: 'Object Keys', cost: 1 })

// 8. IO (Cost 1)
export const fetch = defineAtom('httpFetch', s.object({ url: s.string, method: s.string.optional, headers: s.record(s.string).optional, body: s.any.optional }), s.any, async (step, ctx) => {
  if (!ctx.capabilities.fetch) throw new Error("Capability 'fetch' missing")
  const url = resolveValue(step.url, ctx)
  const method = resolveValue(step.method, ctx)
  const headers = resolveValue(step.headers, ctx)
  const body = resolveValue(step.body, ctx)
  return ctx.capabilities.fetch(url, { method, headers, body })
}, { docs: 'HTTP Fetch', cost: 1 })

// 9. Store (Cost 1)
export const storeGet = defineAtom('storeGet', s.object({ key: s.string }), s.any, async ({ key }, ctx) => ctx.capabilities.store?.get(resolveValue(key, ctx)), { docs: 'Store Get', cost: 1 })
export const storeSet = defineAtom('storeSet', s.object({ key: s.string, value: s.any }), undefined, async ({ key, value }, ctx) => ctx.capabilities.store?.set(resolveValue(key, ctx), resolveValue(value, ctx)), { docs: 'Store Set', cost: 1 })
export const storeQuery = defineAtom('storeQuery', s.object({ query: s.any }), s.array(s.any), async ({ query }, ctx) => ctx.capabilities.store?.query?.(resolveValue(query, ctx)) ?? [], { docs: 'Store Query', cost: 1 })
export const vectorSearch = defineAtom('storeVectorSearch', s.object({ vector: s.array(s.number) }), s.array(s.any), async ({ vector }, ctx) => ctx.capabilities.store?.vectorSearch?.(resolveValue(vector, ctx)) ?? [], { docs: 'Vector Search', cost: 1 })

// 10. Agent (Cost 1)
export const llmPredict = defineAtom('llmPredict', s.object({ prompt: s.string, options: s.any.optional }), s.string, async ({ prompt, options }, ctx) => {
  if (!ctx.capabilities.llm?.predict) throw new Error("Capability 'llm.predict' missing")
  return ctx.capabilities.llm.predict(resolveValue(prompt, ctx), resolveValue(options, ctx))
}, { docs: 'LLM Predict', cost: 1 })

export const agentRun = defineAtom('agentRun', s.object({ agentId: s.string, input: s.any }), s.any, async ({ agentId, input }, ctx) => {
  if (!ctx.capabilities.agent?.run) throw new Error("Capability 'agent.run' missing")
  
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
}, { docs: 'Run Sub-Agent', cost: 1 })

// 11. Parsing (Cost 1)
export const jsonParse = defineAtom('jsonParse', s.object({ str: s.string }), s.any, async ({ str }, ctx) => JSON.parse(resolveValue(str, ctx)), { docs: 'Parse JSON', cost: 1 })
export const jsonStringify = defineAtom('jsonStringify', s.object({ value: s.any }), s.string, async ({ value }, ctx) => JSON.stringify(resolveValue(value, ctx)), { docs: 'Stringify JSON', cost: 1 })
export const xmlParse = defineAtom('xmlParse', s.object({ str: s.string }), s.any, async ({ str }, ctx) => {
  if (!ctx.capabilities.xml?.parse) throw new Error("Capability 'xml.parse' missing")
  return ctx.capabilities.xml.parse(resolveValue(str, ctx))
}, { docs: 'Parse XML', cost: 1 })


// --- Exports ---

export const coreAtoms = {
  seq, if: iff, while: whileLoop, return: ret, try: tryCatch,
  varSet, varGet, scope,
  eq, neq, gt, lt, and, or, not,
  mathCalc: calc,
  map, push, len,
  split, join, template,
  pick, merge, keys,
  httpFetch: fetch,
  storeGet, storeSet, storeQuery, storeVectorSearch: vectorSearch,
  llmPredict, agentRun,
  jsonParse, jsonStringify, xmlParse
}

// --- VM ---

export class AgentVM {
  private atoms: Record<string, Atom<any, any>>

  constructor(customAtoms: Record<string, Atom<any, any>> = {}) {
    this.atoms = { ...coreAtoms, ...customAtoms }
  }

  resolve(op: string) {
    return this.atoms[op]
  }

  async run(ast: BaseNode, args: Record<string, any> = {}, options: { fuel?: number, capabilities?: Capabilities } = {}): Promise<RunResult> {
    const startFuel = options.fuel ?? 1000
    const ctx: RuntimeContext = {
      fuel: startFuel,
      args,
      state: {},
      capabilities: options.capabilities ?? {},
      resolver: (op) => this.resolve(op),
      output: undefined
    }

    if (ast.op !== 'seq') throw new Error("Root AST must be 'seq'")
    
    // Boot
    await this.resolve('seq')?.exec(ast, ctx)
    
    return {
      result: ctx.output,
      fuelUsed: startFuel - ctx.fuel
    }
  }
}

// Global default instance for backward compatibility
export const VM = new AgentVM()