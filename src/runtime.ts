import { s, validate, filter as schemaFilter } from 'tosijs-schema'

// --- Monadic Error Type ---

/**
 * AgentError wraps errors as values for monadic error flow.
 * When an atom fails, it stores an AgentError instead of throwing.
 * Subsequent atoms check for errors and pass them through without executing.
 */
export class AgentError {
  readonly $error = true as const
  readonly message: string
  readonly op: string
  readonly cause?: Error

  constructor(message: string, op: string, cause?: Error) {
    this.message = message
    this.op = op
    this.cause = cause
  }

  toString(): string {
    return `AgentError[${this.op}]: ${this.message}`
  }

  toJSON(): { $error: true; message: string; op: string } {
    return { $error: true, message: this.message, op: this.op }
  }
}

/**
 * Check if a value is an AgentError
 */
export function isAgentError(value: any): value is AgentError {
  return value instanceof AgentError || (value && value.$error === true)
}

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

/** Cost override: static number or dynamic function */
export type CostOverride =
  | number
  | ((input: any, ctx: RuntimeContext) => number)

export interface RuntimeContext {
  fuel: { current: number }
  args: Record<string, any>
  state: Record<string, any> // Current scope state
  consts: Set<string> // Variables declared with const (immutable)
  capabilities: Capabilities
  resolver: (op: string) => Atom<any, any> | undefined
  output?: any
  error?: AgentError // Monadic error - when set, subsequent atoms are skipped
  memo?: Map<string, any>
  trace?: TraceEvent[]
  signal?: AbortSignal // External abort signal for timeout enforcement
  costOverrides?: Record<string, CostOverride> // Per-atom cost overrides
  context?: Record<string, any> // Immutable request-scoped metadata (auth, permissions, etc.)
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
  error?: AgentError
  fuelUsed: number
  trace?: TraceEvent[]
}

// --- Security ---

/**
 * Properties that are forbidden to access for security reasons.
 * Accessing these could allow prototype pollution or sandbox escape.
 */
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Throws if the property name is forbidden for security reasons.
 */
function assertSafeProperty(prop: string): void {
  if (FORBIDDEN_PROPERTIES.has(prop)) {
    throw new Error(`Security Error: Access to '${prop}' is forbidden`)
  }
}

// --- Helpers ---

/**
 * Creates a child scope for the context.
 * Uses prototype inheritance so reads fall through to parent, but writes stay local.
 */
export function createChildScope(ctx: RuntimeContext): RuntimeContext {
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
      // Security: check each property name for forbidden access
      for (const part of parts) {
        if (FORBIDDEN_PROPERTIES.has(part)) {
          throw new Error(`Security Error: Access to '${part}' is forbidden`)
        }
      }
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
  // Recursively resolve plain object values (but not arrays or special objects)
  if (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val.constructor === Object
  ) {
    const result: Record<string, any> = {}
    for (const key of Object.keys(val)) {
      result[key] = resolveValue(val[key], ctx)
    }
    return result
  }
  // Recursively resolve array elements
  if (Array.isArray(val)) {
    return val.map((item) => resolveValue(item, ctx))
  }
  return val
}

// --- Expression Node Types ---

export type ExprNode =
  | { $expr: 'literal'; value: any }
  | { $expr: 'ident'; name: string }
  | {
      $expr: 'member'
      object: ExprNode
      property: string
      computed?: boolean
      optional?: boolean
    }
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
  | {
      $expr: 'methodCall'
      object: ExprNode
      method: string
      arguments: ExprNode[]
      optional?: boolean
    }

// --- Built-in Objects (Proxy-based) ---

/**
 * Create a proxy that provides helpful error messages for unsupported methods
 */
function createBuiltinProxy(
  name: string,
  supported: Record<string, any>,
  alternatives?: Record<string, string>
): any {
  return new Proxy(supported, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop]
      }
      const alt = alternatives?.[prop]
      if (alt) {
        throw new Error(`${name}.${prop} is not available. ${alt}`)
      }
      throw new Error(
        `${name}.${prop} is not supported in AsyncJS. Check docs for available ${name} methods.`
      )
    },
  })
}

/**
 * Convert an example-value schema (AsyncJS style) to JSON Schema.
 * Examples:
 *   'string' or 'hello' -> { type: 'string' }
 *   0 or 42 -> { type: 'number' }
 *   true/false -> { type: 'boolean' }
 *   ['string'] -> { type: 'array', items: { type: 'string' } }
 *   { name: 'string', age: 0 } -> { type: 'object', properties: {...}, required: [...] }
 */
function convertExampleToSchema(example: any): any {
  if (example === null) {
    return { type: 'null' }
  }

  if (example === undefined) {
    return {}
  }

  // Already a JSON Schema object (has 'type' property)
  if (
    typeof example === 'object' &&
    example !== null &&
    'type' in example &&
    typeof example.type === 'string'
  ) {
    return example
  }

  // tosijs-schema builder object (has 'schema' property)
  if (
    typeof example === 'object' &&
    example !== null &&
    'schema' in example &&
    typeof example.schema === 'object'
  ) {
    return example.schema
  }

  const type = typeof example

  if (type === 'string') {
    return { type: 'string' }
  }

  if (type === 'number') {
    return Number.isInteger(example) ? { type: 'integer' } : { type: 'number' }
  }

  if (type === 'boolean') {
    return { type: 'boolean' }
  }

  if (Array.isArray(example)) {
    if (example.length === 0) {
      return { type: 'array' }
    }
    // Use first element as item schema
    return {
      type: 'array',
      items: convertExampleToSchema(example[0]),
    }
  }

  if (type === 'object') {
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(example)) {
      properties[key] = convertExampleToSchema(value)
      required.push(key)
    }

    return {
      type: 'object',
      properties,
      required,
    }
  }

  // Fallback - accept anything
  return {}
}

/**
 * Built-in objects available in expressions.
 * These are Proxy objects that provide JS-like APIs mapped to safe implementations.
 */
export const builtins: Record<string, any> = {
  // Math - most methods are safe pure functions
  Math: createBuiltinProxy('Math', {
    // Constants
    PI: Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    SQRT2: Math.SQRT2,
    SQRT1_2: Math.SQRT1_2,

    // Safe pure functions
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    pow: Math.pow,
    exp: Math.exp,
    expm1: Math.expm1,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    log1p: Math.log1p,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    hypot: Math.hypot,
    min: Math.min,
    max: Math.max,
    clz32: Math.clz32,
    imul: Math.imul,
    fround: Math.fround,

    // Random - use crypto when available
    random: () => {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        return arr[0] / (0xffffffff + 1)
      }
      return Math.random()
    },
  }),

  // JSON - parse and stringify
  JSON: createBuiltinProxy('JSON', {
    parse: (text: string) => JSON.parse(text),
    stringify: (value: any, replacer?: any, space?: number) =>
      JSON.stringify(value, replacer, space),
  }),

  // console - maps to trace/logging
  console: createBuiltinProxy(
    'console',
    {
      log: (..._args: any[]) => {
        // In expression context, we can't access trace easily
        // This is a no-op in expressions, but works in atom context
        // The transpiler should lift console.log to a trace atom call
        return undefined
      },
      warn: (..._args: any[]) => undefined,
      error: (..._args: any[]) => undefined,
      info: (..._args: any[]) => undefined,
    },
    {
      table: 'Use console.log with JSON.stringify for structured data.',
      dir: 'Use console.log instead.',
      trace: 'Stack traces are not available in AsyncJS.',
    }
  ),

  // Array static methods
  Array: createBuiltinProxy(
    'Array',
    {
      isArray: (value: any) => Array.isArray(value),
      from: (iterable: any, mapFn?: any, thisArg?: any) =>
        Array.from(iterable, mapFn, thisArg),
      of: (...items: any[]) => Array.of(...items),
    },
    {
      prototype: 'Prototype access is not allowed.',
    }
  ),

  // Object static methods
  Object: createBuiltinProxy(
    'Object',
    {
      keys: (obj: any) => Object.keys(obj),
      values: (obj: any) => Object.values(obj),
      entries: (obj: any) => Object.entries(obj),
      fromEntries: (entries: any) => Object.fromEntries(entries),
      assign: (target: any, ...sources: any[]) =>
        Object.assign({}, target, ...sources),
      hasOwn: (obj: any, prop: string) => Object.hasOwn(obj, prop),
    },
    {
      prototype: 'Prototype access is not allowed.',
      create: 'Use object literals instead.',
      defineProperty: 'Property descriptors are not supported.',
      getPrototypeOf: 'Prototype access is not allowed.',
      setPrototypeOf: 'Prototype modification is not allowed.',
    }
  ),

  // String static methods
  String: createBuiltinProxy('String', {
    fromCharCode: (...codes: number[]) => String.fromCharCode(...codes),
    fromCodePoint: (...codePoints: number[]) =>
      String.fromCodePoint(...codePoints),
  }),

  // Number static methods and constants
  Number: createBuiltinProxy('Number', {
    isNaN: Number.isNaN,
    isFinite: Number.isFinite,
    isInteger: Number.isInteger,
    isSafeInteger: Number.isSafeInteger,
    parseFloat: parseFloat,
    parseInt: parseInt,
    MAX_VALUE: Number.MAX_VALUE,
    MIN_VALUE: Number.MIN_VALUE,
    MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
    MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
    POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
    NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
    NaN: Number.NaN,
    EPSILON: Number.EPSILON,
  }),

  // Global functions
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  encodeURI: encodeURI,
  decodeURI: decodeURI,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,

  // Constants
  undefined: undefined,
  null: null,
  NaN: NaN,
  Infinity: Infinity,

  // Schema-based filtering - strips extra properties, validates structure
  // Returns filtered data or throws on validation failure
  filter: (data: any, schema: any): any => {
    // Convert example-value schema to JSON Schema if needed
    const jsonSchema = convertExampleToSchema(schema)
    const result = schemaFilter(data, jsonSchema)
    if (result instanceof Error) {
      throw result
    }
    return result
  },

  // Schema builder - exposes tosijs-schema's fluent API for building JSON Schemas
  // Usage: Schema.object({ name: Schema.string, age: Schema.number.int.min(0) })
  // Usage: Schema.response('my_schema', Schema.object({ ... })) for LLM responseFormat
  Schema: {
    // Re-export all of tosijs-schema's `s` object
    ...s,

    // Convenience: wrap schema in OpenAI responseFormat structure
    // Accepts either a tosijs-schema builder or a plain example object
    response: (name: string, schemaOrExample: any) => {
      const jsonSchema =
        schemaOrExample?.schema != null
          ? schemaOrExample.schema
          : convertExampleToSchema(schemaOrExample)

      return {
        type: 'json_schema',
        json_schema: {
          name,
          strict: true,
          schema: jsonSchema,
        },
      }
    },

    // Convert example value to JSON Schema (for simple cases)
    fromExample: (example: any) => convertExampleToSchema(example),

    // Validation: returns boolean
    isValid: (data: any, schemaOrExample: any): boolean => {
      if (schemaOrExample?.schema != null) {
        return validate(data, schemaOrExample)
      }
      return validate(data, convertExampleToSchema(schemaOrExample))
    },
  },

  // Set factory - creates a set-like object backed by an array
  Set: (items: any[] = []) => {
    const data = [...new globalThis.Set(items)] // dedupe initial items
    return {
      // Mutable operations
      add(item: any) {
        if (!data.includes(item)) {
          data.push(item)
        }
        return this
      },
      remove(item: any) {
        const idx = data.indexOf(item)
        if (idx !== -1) {
          data.splice(idx, 1)
        }
        return this
      },
      clear() {
        data.length = 0
        return this
      },
      // Query operations
      has(item: any) {
        return data.includes(item)
      },
      get size() {
        return data.length
      },
      toArray() {
        return [...data]
      },
      // Set operations - return new sets
      union(other: any) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set([...data, ...otherItems])
      },
      intersection(other: any) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set(data.filter((x: any) => otherItems.includes(x)))
      },
      diff(other: any) {
        const otherItems = other?.toArray?.() ?? other ?? []
        return builtins.Set(data.filter((x: any) => !otherItems.includes(x)))
      },
      // Iteration
      forEach(fn: (item: any) => void) {
        data.forEach(fn)
      },
      map(fn: (item: any) => any) {
        return builtins.Set(data.map(fn))
      },
      filter(fn: (item: any) => boolean) {
        return builtins.Set(data.filter(fn))
      },
      // Serialization - Sets serialize to arrays
      toJSON() {
        return [...data]
      },
    }
  },

  // Date factory - creates a date-like object
  // Also supports Date.now() for compatibility
  Date: (() => {
    const createDate = (d: globalThis.Date): any => ({
      // Get the underlying value
      get value() {
        return d.toISOString()
      },
      get timestamp() {
        return d.getTime()
      },
      // Components
      get year() {
        return d.getFullYear()
      },
      get month() {
        return d.getMonth() + 1 // 1-indexed
      },
      get day() {
        return d.getDate()
      },
      get hours() {
        return d.getHours()
      },
      get minutes() {
        return d.getMinutes()
      },
      get seconds() {
        return d.getSeconds()
      },
      get dayOfWeek() {
        return d.getDay()
      },
      // Arithmetic - returns new Date
      add({
        years = 0,
        months = 0,
        days = 0,
        hours = 0,
        minutes = 0,
        seconds = 0,
        ms = 0,
      }: {
        years?: number
        months?: number
        days?: number
        hours?: number
        minutes?: number
        seconds?: number
        ms?: number
      } = {}) {
        const newDate = new globalThis.Date(d.getTime())
        if (years) newDate.setFullYear(newDate.getFullYear() + years)
        if (months) newDate.setMonth(newDate.getMonth() + months)
        if (days) newDate.setDate(newDate.getDate() + days)
        if (hours) newDate.setHours(newDate.getHours() + hours)
        if (minutes) newDate.setMinutes(newDate.getMinutes() + minutes)
        if (seconds) newDate.setSeconds(newDate.getSeconds() + seconds)
        if (ms) newDate.setMilliseconds(newDate.getMilliseconds() + ms)
        return createDate(newDate)
      },
      // Difference
      diff(
        other: any,
        unit: 'ms' | 'seconds' | 'minutes' | 'hours' | 'days' = 'ms'
      ) {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        const diffMs = d.getTime() - otherTime
        switch (unit) {
          case 'seconds':
            return diffMs / 1000
          case 'minutes':
            return diffMs / (1000 * 60)
          case 'hours':
            return diffMs / (1000 * 60 * 60)
          case 'days':
            return diffMs / (1000 * 60 * 60 * 24)
          default:
            return diffMs
        }
      },
      // Formatting
      format(fmt = 'ISO') {
        if (fmt === 'ISO') return d.toISOString()
        if (fmt === 'date') return d.toISOString().split('T')[0]
        if (fmt === 'time') return d.toISOString().split('T')[1].split('.')[0]
        // Simple format substitution
        return fmt
          .replace('YYYY', String(d.getFullYear()))
          .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
          .replace('DD', String(d.getDate()).padStart(2, '0'))
          .replace('HH', String(d.getHours()).padStart(2, '0'))
          .replace('mm', String(d.getMinutes()).padStart(2, '0'))
          .replace('ss', String(d.getSeconds()).padStart(2, '0'))
      },
      // Comparison
      isBefore(other: any) {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        return d.getTime() < otherTime
      },
      isAfter(other: any) {
        const otherTime =
          typeof other === 'object' && other.timestamp
            ? other.timestamp
            : new globalThis.Date(other).getTime()
        return d.getTime() > otherTime
      },
      // String representation
      toString() {
        return d.toISOString()
      },
      // Serialization - Dates serialize to ISO strings
      toJSON() {
        return d.toISOString()
      },
    })

    // The Date factory function
    const DateFactory = (init?: string | number) => {
      const date =
        init !== undefined ? new globalThis.Date(init) : new globalThis.Date()
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date: ${init}`)
      }
      return createDate(date)
    }

    // Static methods (for Date.now() compatibility)
    DateFactory.now = () => globalThis.Date.now()
    DateFactory.parse = (str: string) => createDate(new globalThis.Date(str))

    return DateFactory
  })(),
}

// Built-ins that are NOT available with helpful messages
const unsupportedBuiltins: Record<string, string> = {
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
      // Look up in state first, then args, then builtins
      if (node.name in ctx.state) {
        return ctx.state[node.name]
      }
      if (node.name in ctx.args) {
        return ctx.args[node.name]
      }
      // Check builtins (Math, JSON, Array, etc.)
      if (node.name in builtins) {
        return builtins[node.name]
      }
      // Check for unsupported builtins and give helpful error
      if (node.name in unsupportedBuiltins) {
        throw new Error(unsupportedBuiltins[node.name])
      }
      return undefined
    }

    case 'member': {
      const obj = evaluateExpr(node.object, ctx)

      // Short-circuit for optional chaining
      if (node.optional && (obj === null || obj === undefined)) {
        return undefined
      }

      const prop = node.property
      assertSafeProperty(prop)

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
      // Special case: Error() triggers monadic error flow
      if (node.callee === 'Error') {
        const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
        const message = typeof args[0] === 'string' ? args[0] : 'Error'
        ctx.error = new AgentError(message, 'Error')
        return undefined // Error triggered, subsequent operations will be skipped
      }

      // Check if this is a builtin global function (parseInt, parseFloat, etc.)
      if (node.callee in builtins) {
        const fn = builtins[node.callee]
        if (typeof fn === 'function') {
          const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
          return fn(...args)
        }
      }
      // For atom calls within expressions
      const atom = ctx.resolver(node.callee)
      if (!atom) {
        // Check unsupported builtins
        if (node.callee in unsupportedBuiltins) {
          throw new Error(unsupportedBuiltins[node.callee])
        }
        throw new Error(`Unknown function: ${node.callee}`)
      }
      // This is synchronous evaluation - atom calls need special handling
      // For now, throw - atom calls should be lifted to statements
      throw new Error(
        `Atom calls in expressions not yet supported: ${node.callee}`
      )
    }

    case 'methodCall': {
      // Method call on an object (e.g., Math.floor(x), arr.length, str.toUpperCase())
      const obj = evaluateExpr(node.object, ctx)

      // Short-circuit for optional chaining
      if (node.optional && (obj === null || obj === undefined)) {
        return undefined
      }

      const method = node.method
      assertSafeProperty(method)

      if (obj === null || obj === undefined) {
        throw new Error(`Cannot call method '${method}' on ${obj}`)
      }

      const fn = obj[method]
      if (typeof fn !== 'function') {
        throw new Error(`'${method}' is not a function`)
      }

      const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
      return fn.apply(obj, args)
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

    // Skip if already in error state (monadic flow)
    if (ctx.error) return

    // 1. Validation
    if (inputSchema && !validate(inputSchema, inputData)) {
      ctx.error = new AgentError(
        `Validation failed: ${JSON.stringify(inputData)}`,
        op
      )
      return
    }

    // --- Tracing Start ---
    const stateBefore = ctx.trace ? { ...ctx.state } : null
    const fuelBefore = ctx.fuel.current
    let result: any
    let error: string | undefined

    try {
      // 2. Deduct Fuel (check for cost overrides first)
      const overrideCost = ctx.costOverrides?.[op]
      const baseCost = overrideCost !== undefined ? overrideCost : cost
      const currentCost =
        typeof baseCost === 'function' ? baseCost(inputData, ctx) : baseCost
      if ((ctx.fuel.current -= currentCost) <= 0) {
        ctx.error = new AgentError('Out of Fuel', op)
        return
      }

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
        if (ctx.consts.has(step.result)) {
          throw new Error(`Cannot reassign const variable '${step.result}'`)
        }
        ctx.state[step.result] = result
        // Mark as const if resultConst is set
        if (step.resultConst) {
          ctx.consts.add(step.result)
        }
      }
    } catch (e: any) {
      error = e.message || String(e)
      // Convert exception to monadic error
      ctx.error = new AgentError(error!, op, e)
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
      if (ctx.error) return // Monadic error - skip remaining steps
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
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
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
    // If in error state, propagate the error as the output
    if (ctx.error) {
      ctx.output = ctx.error
      return ctx.error
    }

    let res: any = {}
    // If schema provided, extract subset of state. Else return null/void?
    // Current pattern: schema defines output shape matching state keys
    if (step.schema?.properties) {
      for (const key of Object.keys(step.schema.properties)) {
        res[key] = ctx.state[key]
      }

      // If schema has nested structure, filter to strip extra properties
      // This makes return types act as projections
      if (step.filter !== false) {
        const filterResult = schemaFilter(res, step.schema)
        if (!(filterResult instanceof Error)) {
          res = filterResult
        }
        // If filter fails, keep original result (validation already passed above)
      }
    }
    ctx.output = res
    return res
  },
  { docs: 'Return', cost: 0.1 }
)

export const tryCatch = defineAtom(
  'try',
  s.object({
    try: s.array(s.any),
    catch: s.array(s.any).optional,
    catchParam: s.string.optional,
  }),
  undefined,
  async (step, ctx) => {
    // Execute try block
    await seq.exec({ op: 'seq', steps: step.try } as any, ctx)

    // If an error occurred and we have a catch block, handle it
    if (ctx.error && step.catch) {
      // Store error message in state for catch block to access
      // Use the catch parameter name if provided, otherwise 'error'
      const paramName = step.catchParam || 'error'
      ctx.state[paramName] = ctx.error.message
      ctx.state['errorOp'] = ctx.error.op
      // Clear the error - catch block handles it
      ctx.error = undefined
      // Execute catch block
      await seq.exec({ op: 'seq', steps: step.catch } as any, ctx)
      // If catch block didn't set a new error, we're recovered
      // If it did, that error propagates
    }
  },
  { docs: 'Try/Catch', timeoutMs: 0, cost: 0.1 }
)

export const errorAtom = defineAtom(
  'Error',
  s.object({ args: s.array(s.any).optional }),
  undefined,
  async (step, ctx) => {
    const message = step.args?.[0] ?? 'Error'
    ctx.error = new AgentError(String(message), 'Error')
  },
  { docs: 'Trigger error flow', cost: 0.1 }
)

// 2. State (Low cost: 0.1)
export const varSet = defineAtom(
  'varSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    if (ctx.consts.has(key)) {
      throw new Error(`Cannot reassign const variable '${key}'`)
    }
    ctx.state[key] = resolveValue(value, ctx)
  },
  { docs: 'Set Variable', cost: 0.1 }
)

export const constSet = defineAtom(
  'constSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    if (ctx.consts.has(key)) {
      throw new Error(`Cannot reassign const variable '${key}'`)
    }
    if (key in ctx.state) {
      throw new Error(`Cannot redeclare variable '${key}' as const`)
    }
    ctx.state[key] = resolveValue(value, ctx)
    ctx.consts.add(key)
  },
  { docs: 'Set Const Variable (immutable)', cost: 0.1 }
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
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      results.push(scopedCtx.state['result'] ?? null)
    }
    return results
  },
  { docs: 'Map Array', timeoutMs: 0, cost: 1 }
)

export const filter = defineAtom(
  'filter',
  s.object({
    items: s.array(s.any),
    as: s.string,
    condition: s.any, // ExprNode that evaluates to boolean
  }),
  s.array(s.any),
  async ({ items, as, condition }, ctx) => {
    const results = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('filter: items is not an array')
    for (const item of resolvedItems) {
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      const passes = evaluateExpr(condition, scopedCtx)
      if (passes) {
        results.push(item)
      }
    }
    return results
  },
  { docs: 'Filter Array', timeoutMs: 0, cost: 1 }
)

export const reduce = defineAtom(
  'reduce',
  s.object({
    items: s.array(s.any),
    as: s.string,
    accumulator: s.string,
    initial: s.any,
    steps: s.array(s.any),
  }),
  s.any,
  async ({ items, as, accumulator, initial, steps }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    const resolvedInitial = resolveValue(initial, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('reduce: items is not an array')

    let acc = resolvedInitial
    for (const item of resolvedItems) {
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      scopedCtx.state[accumulator] = acc
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      acc = scopedCtx.state['result'] ?? acc
    }
    return acc
  },
  { docs: 'Reduce Array', timeoutMs: 0, cost: 1 }
)

export const find = defineAtom(
  'find',
  s.object({
    items: s.array(s.any),
    as: s.string,
    condition: s.any, // ExprNode that evaluates to boolean
  }),
  s.any,
  async ({ items, as, condition }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('find: items is not an array')
    for (const item of resolvedItems) {
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      const scopedCtx = createChildScope(ctx)
      scopedCtx.state[as] = item
      const matches = evaluateExpr(condition, scopedCtx)
      if (matches) {
        return item
      }
    }
    return null
  },
  { docs: 'Find in Array', timeoutMs: 0, cost: 1 }
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
    responseType: s.string.optional, // 'json' | 'text' | 'dataUrl'
  }),
  s.any,
  async (step, ctx) => {
    const url = resolveValue(step.url, ctx)
    const method = resolveValue(step.method, ctx)
    const headers = resolveValue(step.headers, ctx)
    const body = resolveValue(step.body, ctx)
    const responseType = resolveValue(step.responseType, ctx)

    if (ctx.capabilities.fetch) {
      // Pass signal and responseType to custom fetch capability if available
      return ctx.capabilities.fetch(url, {
        method,
        headers,
        body,
        signal: ctx.signal,
        responseType,
      })
    }
    // Default: global fetch with abort signal
    if (typeof globalThis.fetch === 'function') {
      const res = await globalThis.fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctx.signal, // Pass abort signal for cancellation
      })

      // Handle dataUrl response type - converts binary to data URI
      if (responseType === 'dataUrl') {
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        const contentType =
          res.headers.get('content-type') || 'application/octet-stream'
        return `data:${contentType};base64,${base64}`
      }

      // Try to parse JSON if content-type says so, else text
      const contentType = res.headers.get('content-type')
      if (
        responseType === 'json' ||
        (contentType && contentType.includes('application/json'))
      ) {
        return res.json()
      }
      return res.text()
    }
    throw new Error("Capability 'fetch' missing and no global fetch available")
  },
  { docs: 'HTTP Fetch', timeoutMs: 30000, cost: 5 }
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
  { docs: 'LLM Predict', timeoutMs: 120000, cost: 1 }
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

    const result = await ctx.capabilities.agent.run(resolvedId, resolvedInput)

    // Check if this is a RunResult (has fuelUsed property) - unwrap it
    if (
      result &&
      typeof result === 'object' &&
      'fuelUsed' in result &&
      typeof result.fuelUsed === 'number'
    ) {
      // It's a RunResult - check for error and propagate
      if (result.error) {
        throw new Error(result.error.message || 'Sub-agent failed')
      }
      return result.result
    }

    return result
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

    // Prefer cryptographically secure random when available
    let val: number
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      val = arr[0] / (0xffffffff + 1)
    } else {
      val = Math.random()
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
    // Prefer crypto.randomUUID when available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    // Fallback using crypto.getRandomValues if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0')
      ).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16
      )}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    // Last resort fallback (insecure, for legacy environments only)
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
  Error: errorAtom,
  varSet,
  constSet,
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
  filter,
  reduce,
  find,
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
