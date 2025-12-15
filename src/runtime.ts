import { s, type Infer, validate } from 'tosijs-schema'
import type { BaseNode } from './builder'

// --- Types ---

export type OpCode = string

export interface Capabilities {
  fetch?: (url: string, init?: any) => Promise<any>
  store?: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
  }
  [key: string]: any
}

export interface RuntimeContext {
  fuel: number
  args: Record<string, any>
  state: Record<string, any>
  capabilities: Capabilities
  output?: any
}

export type AtomExec = (step: any, ctx: RuntimeContext) => Promise<void>

export interface AtomDef {
  op: OpCode
  inputSchema: any
  outputSchema?: any
  exec: AtomExec
  docs?: string
  create: (input: any) => any
}

// --- Expression Parser (Safe Math & Logic) ---

function evaluateExpression(expr: string, vars: Record<string, any>): number {
  const tokens = expr.match(
    new RegExp(
      '(\\d+(\\.\\d+)?)|([a-zA-Z_]\\w*)|(>=|<=|==|!=|[+\\-*/()><])',
      'g'
    )
  )
  if (!tokens) return 0

  const ops: string[] = []
  const values: number[] = []

  const precedence: Record<string, number> = {
    '*': 3,
    '/': 3,
    '+': 2,
    '-': 2,
    '>': 1,
    '<': 1,
    '>=': 1,
    '<=': 1,
    '==': 1,
    '!=': 1,
  }

  const applyOp = () => {
    const b = values.pop()
    const a = values.pop()
    const op = ops.pop()
    if (a === undefined || b === undefined || !op)
      throw new Error(`Invalid expression: ${expr}`)

    switch (op) {
      case '+':
        values.push(a + b)
        break
      case '-':
        values.push(a - b)
        break
      case '*':
        values.push(a * b)
        break
      case '/':
        values.push(a / b)
        break
      case '>':
        values.push(a > b ? 1 : 0)
        break
      case '<':
        values.push(a < b ? 1 : 0)
        break
      case '>=':
        values.push(a >= b ? 1 : 0)
        break
      case '<=':
        values.push(a <= b ? 1 : 0)
        break
      case '==':
        values.push(a === b ? 1 : 0)
        break
      case '!=':
        values.push(a !== b ? 1 : 0)
        break
    }
  }

  for (const token of tokens) {
    if (!isNaN(parseFloat(token))) {
      values.push(parseFloat(token))
    } else if (token === '(') {
      ops.push(token)
    } else if (token === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        applyOp()
      }
      ops.pop() // Pop '('
    } else if (precedence[token]) {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== '(' &&
        precedence[ops[ops.length - 1]] >= precedence[token]
      ) {
        applyOp()
      }
      ops.push(token)
    } else {
      if (vars[token] === undefined)
        throw new Error(`Expr: Unknown variable '${token}'`)
      const val = Number(vars[token])
      if (isNaN(val))
        throw new Error(`Expr: Variable '${token}' is not a number`)
      values.push(val)
    }
  }

  while (ops.length > 0) {
    applyOp()
  }

  return values[0] ?? 0
}

function resolveVars(
  varMap: Record<string, any>,
  ctx: RuntimeContext
): Record<string, number> {
  const resolved: Record<string, number> = {}
  for (const [key, ref] of Object.entries(varMap)) {
    if (typeof ref === 'object' && ref?.$kind === 'arg') {
      resolved[key] = Number(ctx.args[ref.path])
    } else if (typeof ref === 'string') {
      const val = ctx.state[ref]
      if (val === undefined) {
        if (!isNaN(parseFloat(ref))) {
          resolved[key] = parseFloat(ref)
        } else {
          resolved[key] = 0
        }
      } else {
        resolved[key] = Number(val)
      }
    } else if (typeof ref === 'number') {
      resolved[key] = ref
    } else {
      resolved[key] = 0
    }
  }
  return resolved
}

// --- Atom Registry & Definition ---

const registry: Record<string, AtomDef> = {}

export interface Atom<I, O> extends AtomDef {
  create(input: I): I & { op: string }
}

export interface AtomOptions {
  docs?: string
  timeoutMs?: number
}

/**
 * Defines a self-documenting atom with runtime validation.
 */
export function defineAtom<I extends Record<string, any>, O = any>(
  op: string,
  inputSchema: any,
  outputSchema: any | undefined,
  fn: (input: I, ctx: RuntimeContext) => Promise<O>,
  options: AtomOptions | string = {}
): Atom<I, O> {
  const { docs = '', timeoutMs = 1000 } =
    typeof options === 'string' ? { docs: options } : options

  const exec: AtomExec = async (step: any, ctx: RuntimeContext) => {
    // 1. Validation
    // Note: We skip validation of 'op' and 'result' keys which are standard metadata
    // because schema validation is strict.
    const { op: _op, result: _res, ...inputData } = step
    if (inputSchema && !validate(inputSchema, inputData)) {
      // In production, use schema diagnostics
      throw new Error(
        `Atom '${op}' validation failed for input: ${JSON.stringify(step)}`
      )
    }

    // 2. Execution
    let timer: any
    const result =
      timeoutMs > 0
        ? await Promise.race([
            fn(step as I, ctx),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(`Atom '${op}' timed out after ${timeoutMs}ms`)
                  ),
                timeoutMs
              )
            }),
          ]).finally(() => clearTimeout(timer))
        : await fn(step as I, ctx)

    // 3. Output Handling
    if (step.result && result !== undefined) {
      ctx.state[step.result] = result
    }
  }

  const def: Atom<I, O> = {
    op,
    inputSchema,
    outputSchema,
    exec,
    docs,
    create: (input: I) => ({ op, ...input }),
  }

  registry[op] = def
  return def
}

// --- Core Atoms ---

// Sequence
const SeqSchema = s.object({
  steps: s.array(s.any),
})
type SeqNode = Infer<typeof SeqSchema>

export const seq = defineAtom(
  'seq',
  SeqSchema,
  undefined,
  async (step: SeqNode, ctx) => {
    for (const subStep of step.steps) {
      if (ctx.fuel <= 0) throw new Error('Agent99: Out of Fuel')
      ctx.fuel--

      const def = registry[subStep.op as string]
      if (!def) throw new Error(`Agent99: Unknown OpCode '${subStep.op}'`)

      await def.exec(subStep, ctx)
      if (ctx.output !== undefined) return
    }
  },
  { docs: 'Execute a list of steps sequentially.', timeoutMs: 0 }
)

// If/Else
const IfSchema = s.object({
  condition: s.string,
  vars: s.record(s.any),
  then: s.array(s.any),
  else: s.array(s.any).optional,
})
type IfNode = Infer<typeof IfSchema>

export const iff = defineAtom(
  'if',
  IfSchema,
  undefined,
  async (step: IfNode, ctx) => {
    const vars = resolveVars(step.vars, ctx)
    const result = evaluateExpression(step.condition, vars)

    if (result !== 0) {
      await registry['seq'].exec({ op: 'seq', steps: step.then }, ctx)
    } else if (step.else && step.else.length > 0) {
      await registry['seq'].exec({ op: 'seq', steps: step.else }, ctx)
    }
  },
  {
    docs: 'Conditional execution based on numeric expression (0=false, !0=true).',
    timeoutMs: 0,
  }
)

// Math
const MathSchema = s.object({
  expr: s.string,
  vars: s.record(s.any),
})
type MathNode = Infer<typeof MathSchema>

export const calc = defineAtom(
  'math.calc',
  MathSchema,
  s.number,
  async (step: MathNode, ctx) => {
    const vars = resolveVars(step.vars, ctx)
    return evaluateExpression(step.expr, vars)
  },
  'Safe evaluation of mathematical expressions.'
)

// HTTP Fetch
const FetchSchema = s.object({
  url: s.string,
  method: s.string.optional,
  headers: s.record(s.string).optional,
  body: s.any.optional,
})
type FetchNode = Infer<typeof FetchSchema>

export const fetch = defineAtom(
  'http.fetch',
  FetchSchema,
  s.any,
  async (step: FetchNode, ctx) => {
    if (!ctx.capabilities.fetch) {
      throw new Error(
        "Capability Error: 'http.fetch' is not available in this runtime."
      )
    }
    return ctx.capabilities.fetch(step.url, {
      method: step.method ?? 'GET',
      headers: step.headers,
      body: step.body ? JSON.stringify(step.body) : undefined,
    })
  },
  'Perform an HTTP request using the runtime capability.'
)

// Store Get
const StoreGetSchema = s.object({ key: s.string })
type StoreGetNode = Infer<typeof StoreGetSchema>

export const storeGet = defineAtom(
  'store.get',
  StoreGetSchema,
  s.any,
  async (step: StoreGetNode, ctx) => {
    if (!ctx.capabilities.store) {
      throw new Error("Capability Error: 'store' is not available.")
    }
    return ctx.capabilities.store.get(step.key)
  },
  'Retrieve a value from the KV store.'
)

// Store Set
const StoreSetSchema = s.object({ key: s.string, value: s.any })
type StoreSetNode = Infer<typeof StoreSetSchema>

export const storeSet = defineAtom(
  'store.set',
  StoreSetSchema,
  undefined,
  async (step: StoreSetNode, ctx) => {
    if (!ctx.capabilities.store) {
      throw new Error("Capability Error: 'store' is not available.")
    }
    await ctx.capabilities.store.set(step.key, step.value)
  },
  'Save a value to the KV store.'
)

// Return
const ReturnSchema = s.object({ schema: s.any })
type ReturnNode = Infer<typeof ReturnSchema>

export const ret = defineAtom(
  'return',
  undefined,
  s.any,
  async (step: ReturnNode, ctx) => {
    const resultObj: Record<string, any> = {}
    if (step.schema && step.schema.properties) {
      for (const key of Object.keys(step.schema.properties)) {
        resultObj[key] = ctx.state[key]
      }
    }
    ctx.output = resultObj
    return resultObj
  },
  'Terminate execution and return values matching the schema from state.'
)

// --- VM Engine ---

export interface RunOptions {
  fuel?: number
  capabilities?: Capabilities
}

export const VM = {
  /**
   * Registers a new atom definition.
   */
  register(def: AtomDef) {
    registry[def.op as string] = def
  },

  /**
   * Helper to manually register a raw exec function (legacy support)
   */
  registerExec(op: string, exec: AtomExec) {
    registry[op] = {
      op,
      inputSchema: s.any, // No validation
      exec,
      create: (input: any) => ({ op, ...input }),
    }
  },

  /**
   * Access the registry for documentation/inspection
   */
  get registry() {
    return registry
  },

  async run(
    ast: BaseNode,
    args: Record<string, any>,
    options: RunOptions = {}
  ) {
    const ctx: RuntimeContext = {
      fuel: options.fuel ?? 1000,
      args,
      state: {},
      capabilities: options.capabilities ?? {},
      output: undefined,
    }

    if (ast.op !== 'seq') {
      throw new Error("Root AST must be a 'seq'.")
    }

    const def = registry['seq']
    await def.exec(ast, ctx)
    return ctx.output
  },
}
