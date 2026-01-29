/**
 * TJS to WebAssembly Compiler (Proof of Concept)
 *
 * Compiles a subset of TJS to WebAssembly for performance-critical code.
 *
 * Supported subset:
 * - Numeric operations (+, -, *, /, %)
 * - Typed arrays (Float32Array, Float64Array, Int32Array, etc.)
 * - For loops with numeric bounds
 * - Basic conditionals
 *
 * The goal is to show that TJS can target WASM for hot paths while
 * maintaining the same source code with a JS fallback.
 */

import type { WasmBlock } from './parser'

/**
 * WASM type codes
 */
const WasmType = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
  funcref: 0x70,
  externref: 0x6f,
} as const

/**
 * WASM section codes
 */
const Section = {
  custom: 0,
  type: 1,
  import: 2,
  function: 3,
  table: 4,
  memory: 5,
  global: 6,
  export: 7,
  start: 8,
  element: 9,
  code: 10,
  data: 11,
} as const

/**
 * WASM opcodes (subset we use)
 */
const Op = {
  // Control
  unreachable: 0x00,
  nop: 0x01,
  block: 0x02,
  loop: 0x03,
  if: 0x04,
  else: 0x05,
  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  return: 0x0f,
  call: 0x10,

  // Variable
  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22,

  // Memory
  i32_load: 0x28,
  f32_load: 0x2a,
  f64_load: 0x2b,
  i32_store: 0x36,
  f32_store: 0x38,
  f64_store: 0x39,

  // Constants
  i32_const: 0x41,
  i64_const: 0x42,
  f32_const: 0x43,
  f64_const: 0x44,

  // Comparison
  i32_eqz: 0x45,
  i32_eq: 0x46,
  i32_ne: 0x47,
  i32_lt_s: 0x48,
  i32_lt_u: 0x49,
  i32_gt_s: 0x4a,
  i32_gt_u: 0x4b,
  i32_le_s: 0x4c,
  i32_le_u: 0x4d,
  i32_ge_s: 0x4e,
  i32_ge_u: 0x4f,

  f64_eq: 0x61,
  f64_ne: 0x62,
  f64_lt: 0x63,
  f64_gt: 0x64,
  f64_le: 0x65,
  f64_ge: 0x66,

  // Numeric i32
  i32_add: 0x6a,
  i32_sub: 0x6b,
  i32_mul: 0x6c,
  i32_div_s: 0x6d,
  i32_div_u: 0x6e,
  i32_rem_s: 0x6f,
  i32_rem_u: 0x70,

  // Numeric f64
  f64_add: 0xa0,
  f64_sub: 0xa1,
  f64_mul: 0xa2,
  f64_div: 0xa3,

  // Conversions
  i32_trunc_f64_s: 0xaa,
  f64_convert_i32_s: 0xb7,
} as const

/**
 * Encode an unsigned LEB128 integer
 */
function encodeULEB128(value: number): number[] {
  const result: number[] = []
  do {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    result.push(byte)
  } while (value !== 0)
  return result
}

/**
 * Encode a signed LEB128 integer
 * Reserved for future use with signed WASM values
 */
function _encodeSLEB128(value: number): number[] {
  const result: number[] = []
  let more = true
  while (more) {
    let byte = value & 0x7f
    value >>= 7
    if (
      (value === 0 && (byte & 0x40) === 0) ||
      (value === -1 && (byte & 0x40) !== 0)
    ) {
      more = false
    } else {
      byte |= 0x80
    }
    result.push(byte)
  }
  return result
}

/**
 * Encode a string as UTF-8 with length prefix
 */
function encodeString(s: string): number[] {
  const bytes = new TextEncoder().encode(s)
  return [...encodeULEB128(bytes.length), ...bytes]
}

/**
 * Encode a vector (length-prefixed array)
 * Reserved for future use with WASM vectors
 */
function _encodeVector(items: number[][]): number[] {
  return [...encodeULEB128(items.length), ...items.flat()]
}

/**
 * Encode a section
 */
function encodeSection(id: number, contents: number[]): number[] {
  return [id, ...encodeULEB128(contents.length), ...contents]
}

/**
 * Compile result
 */
export interface WasmCompileResult {
  /** The compiled WebAssembly module bytes */
  bytes: Uint8Array
  /** Any warnings during compilation */
  warnings: string[]
  /** Whether compilation succeeded */
  success: boolean
  /** Error message if compilation failed */
  error?: string
}

/**
 * Compile a WASM block to WebAssembly
 *
 * The block's body is analyzed and compiled to WASM if possible.
 * Captured variables become function parameters.
 *
 * Currently supports:
 * - Numeric expressions with +, -, *, /
 * - Variable references (captured from scope)
 * - Return statements
 *
 * Future: loops, conditionals, typed array access
 */
export function compileToWasm(block: WasmBlock): WasmCompileResult {
  const warnings: string[] = []

  try {
    const body = block.body.trim()

    // For POC: match simple return <expr> pattern
    const returnMatch = body.match(/return\s+(.+)/)
    if (!returnMatch) {
      return {
        bytes: new Uint8Array(),
        warnings: ['WASM block must have a return statement (for now)'],
        success: false,
        error: 'No return statement found',
      }
    }

    const expr = returnMatch[1].trim()

    // Use captured variables as parameters
    const params = block.captures.join(', ')

    // Build the WASM module
    const moduleBytes = buildWasmModule(params, expr, warnings)

    return {
      bytes: new Uint8Array(moduleBytes),
      warnings,
      success: true,
    }
  } catch (e: any) {
    return {
      bytes: new Uint8Array(),
      warnings,
      success: false,
      error: e.message,
    }
  }
}

/**
 * Build a complete WASM module for a simple numeric function
 */
function buildWasmModule(
  params: string,
  expr: string,
  warnings: string[]
): number[] {
  // Parse parameter names
  const paramNames = params
    .split(',')
    .map((p) => p.trim().split(':')[0].trim())
    .filter(Boolean)
  const numParams = paramNames.length

  // For POC: assume all params are f64 (doubles)
  // A real implementation would use type annotations

  // Compile the expression to WASM instructions
  const exprCode = compileExpression(expr, paramNames, warnings)

  // Magic number and version
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

  // Type section: (f64, f64, ...) -> f64
  const paramTypes = new Array(numParams).fill(WasmType.f64)
  const typeSection = encodeSection(Section.type, [
    0x01, // one type
    0x60, // func type
    ...encodeULEB128(numParams),
    ...paramTypes,
    0x01,
    WasmType.f64, // one f64 return
  ])

  // Function section: function 0 has type 0
  const funcSection = encodeSection(Section.function, [
    0x01, // one function
    0x00, // type index 0
  ])

  // Export section: export function as "compute"
  const exportSection = encodeSection(Section.export, [
    0x01, // one export
    ...encodeString('compute'),
    0x00, // export kind: function
    0x00, // function index 0
  ])

  // Code section
  const funcBody = [
    0x00, // no locals
    ...exprCode,
    Op.end,
  ]
  const codeSection = encodeSection(Section.code, [
    0x01, // one function
    ...encodeULEB128(funcBody.length),
    ...funcBody,
  ])

  return [
    ...header,
    ...typeSection,
    ...funcSection,
    ...exportSection,
    ...codeSection,
  ]
}

/**
 * Compile a simple expression to WASM instructions
 *
 * Supports: +, -, *, /, identifiers, numbers
 */
function compileExpression(
  expr: string,
  params: string[],
  warnings: string[]
): number[] {
  expr = expr.trim()

  // Try to parse as a number
  const num = parseFloat(expr)
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(expr)) {
    // f64.const
    const buffer = new ArrayBuffer(8)
    new Float64Array(buffer)[0] = num
    return [Op.f64_const, ...new Uint8Array(buffer)]
  }

  // Try to parse as an identifier (parameter reference)
  if (/^\w+$/.test(expr)) {
    const idx = params.indexOf(expr)
    if (idx >= 0) {
      return [Op.local_get, ...encodeULEB128(idx)]
    }
    warnings.push(`Unknown identifier: ${expr}`)
    return [Op.f64_const, 0, 0, 0, 0, 0, 0, 0, 0] // 0.0
  }

  // Try to parse binary operations (simple left-to-right for POC)
  // Find the last +/- at depth 0 (lowest precedence)
  let depth = 0
  let lastOp = -1
  let lastOpChar = ''

  for (let i = expr.length - 1; i >= 0; i--) {
    const c = expr[i]
    if (c === ')') depth++
    else if (c === '(') depth--
    else if (depth === 0 && (c === '+' || c === '-') && i > 0) {
      // Make sure it's not a unary minus - check previous non-whitespace char
      let prevIdx = i - 1
      while (prevIdx >= 0 && /\s/.test(expr[prevIdx])) prevIdx--
      const prevChar = prevIdx >= 0 ? expr[prevIdx] : ''
      // It's binary if previous is alphanumeric or closing paren
      if (prevChar && /[\w)]/.test(prevChar)) {
        lastOp = i
        lastOpChar = c
        break
      }
    }
  }

  // If no +/-, look for * or /
  if (lastOp === -1) {
    depth = 0
    for (let i = expr.length - 1; i >= 0; i--) {
      const c = expr[i]
      if (c === ')') depth++
      else if (c === '(') depth--
      else if (depth === 0 && (c === '*' || c === '/')) {
        lastOp = i
        lastOpChar = c
        break
      }
    }
  }

  if (lastOp > 0) {
    const left = expr.slice(0, lastOp).trim()
    const right = expr.slice(lastOp + 1).trim()

    const leftCode = compileExpression(left, params, warnings)
    const rightCode = compileExpression(right, params, warnings)

    let opcode: number
    switch (lastOpChar) {
      case '+':
        opcode = Op.f64_add
        break
      case '-':
        opcode = Op.f64_sub
        break
      case '*':
        opcode = Op.f64_mul
        break
      case '/':
        opcode = Op.f64_div
        break
      default:
        opcode = Op.f64_add
    }

    return [...leftCode, ...rightCode, opcode]
  }

  // Handle parentheses
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return compileExpression(expr.slice(1, -1), params, warnings)
  }

  warnings.push(`Could not compile expression: ${expr}`)
  return [Op.f64_const, 0, 0, 0, 0, 0, 0, 0, 0] // 0.0
}

/**
 * Instantiate a compiled WASM module
 */
export async function instantiateWasm(
  bytes: Uint8Array
): Promise<WebAssembly.Instance> {
  const module = await WebAssembly.compile(bytes)
  return WebAssembly.instantiate(module)
}

/**
 * Compile and register a WASM block globally
 *
 * This is the main entry point for runtime WASM compilation.
 * Call this during module initialization to enable WASM acceleration.
 */
export async function registerWasmBlock(block: WasmBlock): Promise<boolean> {
  const result = compileToWasm(block)

  if (!result.success) {
    console.warn(`WASM compilation failed for ${block.id}:`, result.error)
    return false
  }

  try {
    const instance = await instantiateWasm(result.bytes)
    const compute = instance.exports.compute as (...args: number[]) => number

    // Register globally so the dispatch code can find it
    ;(globalThis as any)[block.id] = compute

    return true
  } catch (e) {
    console.warn(`WASM instantiation failed for ${block.id}:`, e)
    return false
  }
}

/**
 * Compile all WASM blocks from a preprocessed source
 */
export async function compileWasmBlocks(blocks: WasmBlock[]): Promise<{
  compiled: number
  failed: number
  errors: string[]
}> {
  let compiled = 0
  let failed = 0
  const errors: string[] = []

  for (const block of blocks) {
    const success = await registerWasmBlock(block)
    if (success) {
      compiled++
    } else {
      failed++
      errors.push(`Failed to compile ${block.id}`)
    }
  }

  return { compiled, failed, errors }
}
