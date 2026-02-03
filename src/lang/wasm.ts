/**
 * TJS to WebAssembly Compiler
 *
 * Compiles a subset of TJS to WebAssembly for performance-critical code.
 *
 * Supported features:
 * - Numeric operations (+, -, *, /, %)
 * - Typed arrays (Float32Array, Float64Array, Int32Array, Uint8Array)
 * - For loops with numeric bounds
 * - Math functions (sin, cos, sqrt, abs, floor, ceil, min, max)
 * - Basic conditionals (if/else)
 * - Variable declarations (let)
 *
 * The goal is to enable real-world WASM acceleration for hot paths like
 * audio processing, image manipulation, and physics simulations.
 */

import * as acorn from 'acorn'
import type { WasmBlock } from './parser'

// ============================================================================
// WASM Binary Encoding Constants
// ============================================================================

/** WASM value type codes */
const Type = {
  i32: 0x7f,
  i64: 0x7e,
  f32: 0x7d,
  f64: 0x7c,
  v128: 0x7b,
  funcref: 0x70,
  externref: 0x6f,
  void: 0x40, // empty block type
} as const

/** WASM section codes */
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

/** WASM opcodes */
const Op = {
  // Control flow
  unreachable: 0x00,
  nop: 0x01,
  block: 0x02,
  loop: 0x03,
  if: 0x04,
  else: 0x05,
  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  br_table: 0x0e,
  return: 0x0f,
  call: 0x10,
  call_indirect: 0x11,

  // Parametric
  drop: 0x1a,
  select: 0x1b,

  // Variable access
  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22,
  global_get: 0x23,
  global_set: 0x24,

  // Memory operations
  i32_load: 0x28,
  i64_load: 0x29,
  f32_load: 0x2a,
  f64_load: 0x2b,
  i32_load8_s: 0x2c,
  i32_load8_u: 0x2d,
  i32_load16_s: 0x2e,
  i32_load16_u: 0x2f,
  i32_store: 0x36,
  i64_store: 0x37,
  f32_store: 0x38,
  f64_store: 0x39,
  i32_store8: 0x3a,
  i32_store16: 0x3b,
  memory_size: 0x3f,
  memory_grow: 0x40,

  // Constants
  i32_const: 0x41,
  i64_const: 0x42,
  f32_const: 0x43,
  f64_const: 0x44,

  // i32 comparison
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

  // i64 comparison
  i64_eqz: 0x50,
  i64_eq: 0x51,
  i64_ne: 0x52,
  i64_lt_s: 0x53,
  i64_lt_u: 0x54,
  i64_gt_s: 0x55,
  i64_gt_u: 0x56,
  i64_le_s: 0x57,
  i64_le_u: 0x58,
  i64_ge_s: 0x59,
  i64_ge_u: 0x5a,

  // f32 comparison
  f32_eq: 0x5b,
  f32_ne: 0x5c,
  f32_lt: 0x5d,
  f32_gt: 0x5e,
  f32_le: 0x5f,
  f32_ge: 0x60,

  // f64 comparison
  f64_eq: 0x61,
  f64_ne: 0x62,
  f64_lt: 0x63,
  f64_gt: 0x64,
  f64_le: 0x65,
  f64_ge: 0x66,

  // i32 arithmetic
  i32_clz: 0x67,
  i32_ctz: 0x68,
  i32_popcnt: 0x69,
  i32_add: 0x6a,
  i32_sub: 0x6b,
  i32_mul: 0x6c,
  i32_div_s: 0x6d,
  i32_div_u: 0x6e,
  i32_rem_s: 0x6f,
  i32_rem_u: 0x70,
  i32_and: 0x71,
  i32_or: 0x72,
  i32_xor: 0x73,
  i32_shl: 0x74,
  i32_shr_s: 0x75,
  i32_shr_u: 0x76,
  i32_rotl: 0x77,
  i32_rotr: 0x78,

  // i64 arithmetic
  i64_add: 0x7c,
  i64_sub: 0x7d,
  i64_mul: 0x7e,
  i64_div_s: 0x7f,

  // f32 arithmetic
  f32_abs: 0x8b,
  f32_neg: 0x8c,
  f32_ceil: 0x8d,
  f32_floor: 0x8e,
  f32_trunc: 0x8f,
  f32_nearest: 0x90,
  f32_sqrt: 0x91,
  f32_add: 0x92,
  f32_sub: 0x93,
  f32_mul: 0x94,
  f32_div: 0x95,
  f32_min: 0x96,
  f32_max: 0x97,
  f32_copysign: 0x98,

  // f64 arithmetic
  f64_abs: 0x99,
  f64_neg: 0x9a,
  f64_ceil: 0x9b,
  f64_floor: 0x9c,
  f64_trunc: 0x9d,
  f64_nearest: 0x9e,
  f64_sqrt: 0x9f,
  f64_add: 0xa0,
  f64_sub: 0xa1,
  f64_mul: 0xa2,
  f64_div: 0xa3,
  f64_min: 0xa4,
  f64_max: 0xa5,
  f64_copysign: 0xa6,

  // Conversions
  i32_wrap_i64: 0xa7,
  i32_trunc_f32_s: 0xa8,
  i32_trunc_f32_u: 0xa9,
  i32_trunc_f64_s: 0xaa,
  i32_trunc_f64_u: 0xab,
  i64_extend_i32_s: 0xac,
  i64_extend_i32_u: 0xad,
  f32_convert_i32_s: 0xb2,
  f32_convert_i32_u: 0xb3,
  f32_convert_i64_s: 0xb4,
  f32_demote_f64: 0xb6,
  f64_convert_i32_s: 0xb7,
  f64_convert_i32_u: 0xb8,
  f64_convert_i64_s: 0xb9,
  f64_promote_f32: 0xbb,
  i32_reinterpret_f32: 0xbc,
  f32_reinterpret_i32: 0xbe,
  f64_reinterpret_i64: 0xbf,

  // Sign extension
  i32_extend8_s: 0xc0,
  i32_extend16_s: 0xc1,
} as const

// ============================================================================
// LEB128 Encoding
// ============================================================================

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

function encodeSLEB128(value: number): number[] {
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

function encodeF32(value: number): number[] {
  const buffer = new ArrayBuffer(4)
  new Float32Array(buffer)[0] = value
  return [...new Uint8Array(buffer)]
}

function encodeF64(value: number): number[] {
  const buffer = new ArrayBuffer(8)
  new Float64Array(buffer)[0] = value
  return [...new Uint8Array(buffer)]
}

function encodeString(s: string): number[] {
  const bytes = new TextEncoder().encode(s)
  return [...encodeULEB128(bytes.length), ...bytes]
}

function encodeSection(id: number, contents: number[]): number[] {
  return [id, ...encodeULEB128(contents.length), ...contents]
}

function encodeVector(items: number[][]): number[] {
  return [...encodeULEB128(items.length), ...items.flat()]
}

// ============================================================================
// Type System
// ============================================================================

/** TJS type that maps to WASM */
type WasmValueType = 'i32' | 'i64' | 'f32' | 'f64'

/** Typed array info */
interface TypedArrayInfo {
  elementType: WasmValueType
  bytesPerElement: number
  loadOp: number
  storeOp: number
}

const TYPED_ARRAYS: Record<string, TypedArrayInfo> = {
  Int8Array: {
    elementType: 'i32',
    bytesPerElement: 1,
    loadOp: Op.i32_load8_s,
    storeOp: Op.i32_store8,
  },
  Uint8Array: {
    elementType: 'i32',
    bytesPerElement: 1,
    loadOp: Op.i32_load8_u,
    storeOp: Op.i32_store8,
  },
  Uint8ClampedArray: {
    elementType: 'i32',
    bytesPerElement: 1,
    loadOp: Op.i32_load8_u,
    storeOp: Op.i32_store8,
  },
  Int16Array: {
    elementType: 'i32',
    bytesPerElement: 2,
    loadOp: Op.i32_load16_s,
    storeOp: Op.i32_store16,
  },
  Uint16Array: {
    elementType: 'i32',
    bytesPerElement: 2,
    loadOp: Op.i32_load16_u,
    storeOp: Op.i32_store16,
  },
  Int32Array: {
    elementType: 'i32',
    bytesPerElement: 4,
    loadOp: Op.i32_load,
    storeOp: Op.i32_store,
  },
  Uint32Array: {
    elementType: 'i32',
    bytesPerElement: 4,
    loadOp: Op.i32_load,
    storeOp: Op.i32_store,
  },
  Float32Array: {
    elementType: 'f32',
    bytesPerElement: 4,
    loadOp: Op.f32_load,
    storeOp: Op.f32_store,
  },
  Float64Array: {
    elementType: 'f64',
    bytesPerElement: 8,
    loadOp: Op.f64_load,
    storeOp: Op.f64_store,
  },
}

/** Parameter with type annotation */
interface TypedParam {
  name: string
  type: WasmValueType
  isArray?: boolean
  arrayType?: string // e.g., "Float32Array"
}

// ============================================================================
// Compilation Context
// ============================================================================

interface CompileContext {
  /** Parameter definitions */
  params: TypedParam[]
  /** Local variable definitions (name -> local index, type) */
  locals: Map<string, { index: number; type: WasmValueType }>
  /** Next available local index */
  nextLocalIndex: number
  /** Local types for the locals section */
  localTypes: WasmValueType[]
  /** Warnings collected during compilation */
  warnings: string[]
  /** Errors collected during compilation */
  errors: string[]
  /** Current loop depth (for break/continue) */
  loopDepth: number
  /** Whether we need to import Math functions */
  needsMathImports: Set<string>
  /** Whether we need memory */
  needsMemory: boolean
  /** Whether the function has a return statement */
  hasReturn: boolean
}

function createContext(params: TypedParam[]): CompileContext {
  const ctx: CompileContext = {
    params,
    locals: new Map(),
    nextLocalIndex: params.length,
    localTypes: [],
    warnings: [],
    errors: [],
    loopDepth: 0,
    needsMathImports: new Set(),
    needsMemory: false,
    hasReturn: false,
  }

  // Add params to locals map
  params.forEach((p, i) => {
    ctx.locals.set(p.name, { index: i, type: p.type })
  })

  return ctx
}

function declareLocal(
  ctx: CompileContext,
  name: string,
  type: WasmValueType
): number {
  if (ctx.locals.has(name)) {
    ctx.errors.push(`Duplicate local declaration: ${name}`)
    return ctx.locals.get(name)!.index
  }
  const index = ctx.nextLocalIndex++
  ctx.locals.set(name, { index, type })
  ctx.localTypes.push(type)
  return index
}

function getLocal(
  ctx: CompileContext,
  name: string
): { index: number; type: WasmValueType } | undefined {
  return ctx.locals.get(name)
}

// ============================================================================
// AST Compilation
// ============================================================================

/** Compile a statement, return WASM instructions */
function compileStatement(
  node: acorn.Statement,
  ctx: CompileContext
): number[] {
  switch (node.type) {
    case 'ExpressionStatement': {
      // Expression statement - compile and drop result
      const expr = (node as acorn.ExpressionStatement).expression
      const exprCode = compileExpression(expr, ctx)
      // Drop the result since this is a statement (value not used)
      return [...exprCode, Op.drop]
    }

    case 'ReturnStatement': {
      const ret = node as acorn.ReturnStatement
      ctx.hasReturn = true
      if (!ret.argument) {
        // Void return - just return without a value
        return [Op.return]
      }
      const code = compileExpression(ret.argument as acorn.Expression, ctx)
      // Ensure return value is f64 (function always returns f64 if it returns a value)
      const retType = inferExprType(ret.argument as acorn.Expression, ctx)
      if (retType === 'i32') {
        code.push(Op.f64_convert_i32_s)
      } else if (retType === 'f32') {
        code.push(Op.f64_promote_f32)
      }
      code.push(Op.return)
      return code
    }

    case 'VariableDeclaration': {
      const decl = node as acorn.VariableDeclaration
      const code: number[] = []
      for (const declarator of decl.declarations) {
        if (declarator.id.type !== 'Identifier') {
          ctx.errors.push('Destructuring not supported in WASM blocks')
          continue
        }
        const name = (declarator.id as acorn.Identifier).name
        // Infer type from initializer or default to f64
        let type: WasmValueType = 'f64'
        if (declarator.init) {
          type = inferExprType(declarator.init as acorn.Expression, ctx)
        }
        const index = declareLocal(ctx, name, type)
        if (declarator.init) {
          code.push(
            ...compileExpression(declarator.init as acorn.Expression, ctx)
          )
          code.push(Op.local_set, ...encodeULEB128(index))
        }
      }
      return code
    }

    case 'ForStatement': {
      const forStmt = node as acorn.ForStatement
      return compileForLoop(forStmt, ctx)
    }

    case 'IfStatement': {
      const ifStmt = node as acorn.IfStatement
      return compileIf(ifStmt, ctx)
    }

    case 'BlockStatement': {
      const block = node as acorn.BlockStatement
      const code: number[] = []
      for (const stmt of block.body) {
        code.push(...compileStatement(stmt, ctx))
      }
      return code
    }

    default:
      ctx.errors.push(`Unsupported statement type: ${node.type}`)
      return []
  }
}

/** Compile a for loop */
function compileForLoop(
  node: acorn.ForStatement,
  ctx: CompileContext
): number[] {
  const code: number[] = []

  // Compile init
  if (node.init) {
    if (node.init.type === 'VariableDeclaration') {
      code.push(...compileStatement(node.init, ctx))
    } else {
      code.push(...compileExpression(node.init as acorn.Expression, ctx))
    }
  }

  // block $break
  //   loop $continue
  //     br_if $break (condition is false)
  //     body
  //     update
  //     br $continue
  //   end
  // end

  code.push(Op.block, Type.void) // $break block
  code.push(Op.loop, Type.void) // $continue loop

  // Test condition - break if false
  if (node.test) {
    code.push(...compileExpression(node.test, ctx))
    code.push(Op.i32_eqz) // invert: break if condition is false
    code.push(Op.br_if, 1) // br to $break (depth 1)
  }

  // Body
  ctx.loopDepth++
  if (node.body) {
    code.push(...compileStatement(node.body, ctx))
  }
  ctx.loopDepth--

  // Update
  if (node.update) {
    code.push(...compileExpression(node.update, ctx))
    code.push(Op.drop) // discard update expression result
  }

  // Continue loop
  code.push(Op.br, 0) // br to $continue (depth 0)

  code.push(Op.end) // end loop
  code.push(Op.end) // end block

  return code
}

/** Compile an if statement */
function compileIf(node: acorn.IfStatement, ctx: CompileContext): number[] {
  const code: number[] = []

  // Compile condition
  code.push(...compileExpression(node.test, ctx))

  // if (result type void since we're not returning a value from if)
  code.push(Op.if, Type.void)

  // Consequent
  code.push(...compileStatement(node.consequent, ctx))

  // Alternate
  if (node.alternate) {
    code.push(Op.else)
    code.push(...compileStatement(node.alternate, ctx))
  }

  code.push(Op.end)

  return code
}

/** Infer the WASM type of an expression */
function inferExprType(
  node: acorn.Expression,
  ctx: CompileContext
): WasmValueType {
  switch (node.type) {
    case 'Literal': {
      const lit = node as acorn.Literal
      if (typeof lit.value === 'number') {
        // Check if the raw source contains a decimal point (e.g., "0.0")
        // This indicates the user wants a float even if the value is an integer
        if (lit.raw && (lit.raw.includes('.') || lit.raw.includes('e'))) {
          return 'f64'
        }
        // Check if it's an integer that fits in i32
        if (
          Number.isInteger(lit.value) &&
          lit.value >= -2147483648 &&
          lit.value <= 2147483647
        ) {
          return 'i32'
        }
        return 'f64'
      }
      return 'f64'
    }

    case 'Identifier': {
      const local = getLocal(ctx, (node as acorn.Identifier).name)
      return local?.type ?? 'f64'
    }

    case 'BinaryExpression':
    case 'AssignmentExpression': {
      const binExpr = node as acorn.BinaryExpression
      // Comparison operators return i32
      if (
        ['<', '>', '<=', '>=', '==', '!=', '===', '!=='].includes(
          binExpr.operator
        )
      ) {
        return 'i32'
      }
      // Bitwise operators are i32
      if (['|', '&', '^', '<<', '>>', '>>>'].includes(binExpr.operator)) {
        return 'i32'
      }
      // Otherwise infer from operands
      const leftType = inferExprType(binExpr.left as acorn.Expression, ctx)
      const rightType = inferExprType(binExpr.right as acorn.Expression, ctx)
      // If either is f64 or f32, result is floating point
      if (leftType === 'f64' || rightType === 'f64') return 'f64'
      if (leftType === 'f32' || rightType === 'f32') return 'f32'
      return 'i32'
    }

    case 'UnaryExpression': {
      const unary = node as acorn.UnaryExpression
      if (unary.operator === '!') {
        return 'i32' // boolean result
      }
      // For negation and bitwise not, result type matches argument type
      return inferExprType(unary.argument as acorn.Expression, ctx)
    }

    case 'MemberExpression': {
      // Array access - check array type
      const member = node as acorn.MemberExpression
      if (member.object.type === 'Identifier') {
        const local = getLocal(ctx, (member.object as acorn.Identifier).name)
        if (local) {
          const param = ctx.params.find(
            (p) => p.name === (member.object as acorn.Identifier).name
          )
          if (param?.arrayType) {
            const arrayInfo = TYPED_ARRAYS[param.arrayType]
            if (arrayInfo) return arrayInfo.elementType
          }
        }
      }
      return 'f64'
    }

    case 'CallExpression': {
      const call = node as acorn.CallExpression
      if (call.callee.type === 'MemberExpression') {
        const callee = call.callee as acorn.MemberExpression
        if (
          callee.object.type === 'Identifier' &&
          (callee.object as acorn.Identifier).name === 'Math'
        ) {
          // Math functions return f64
          return 'f64'
        }
      }
      return 'f64'
    }

    default:
      return 'f64'
  }
}

/** Compile an expression, return WASM instructions */
function compileExpression(
  node: acorn.Expression,
  ctx: CompileContext
): number[] {
  switch (node.type) {
    case 'Literal': {
      const lit = node as acorn.Literal
      if (typeof lit.value === 'number') {
        const type = inferExprType(node, ctx)
        if (type === 'i32') {
          return [Op.i32_const, ...encodeSLEB128(lit.value | 0)]
        } else if (type === 'f32') {
          return [Op.f32_const, ...encodeF32(lit.value)]
        } else {
          return [Op.f64_const, ...encodeF64(lit.value)]
        }
      }
      ctx.errors.push(`Unsupported literal type: ${typeof lit.value}`)
      return [Op.f64_const, ...encodeF64(0)]
    }

    case 'Identifier': {
      const name = (node as acorn.Identifier).name
      const local = getLocal(ctx, name)
      if (local) {
        return [Op.local_get, ...encodeULEB128(local.index)]
      }
      ctx.errors.push(`Unknown identifier: ${name}`)
      return [Op.f64_const, ...encodeF64(0)]
    }

    case 'BinaryExpression': {
      const bin = node as acorn.BinaryExpression
      return compileBinaryExpr(bin, ctx)
    }

    case 'UnaryExpression': {
      const unary = node as acorn.UnaryExpression
      return compileUnaryExpr(unary, ctx)
    }

    case 'AssignmentExpression': {
      const assign = node as acorn.AssignmentExpression
      return compileAssignment(assign, ctx)
    }

    case 'UpdateExpression': {
      const update = node as acorn.UpdateExpression
      return compileUpdate(update, ctx)
    }

    case 'MemberExpression': {
      const member = node as acorn.MemberExpression
      return compileArrayAccess(member, ctx)
    }

    case 'CallExpression': {
      const call = node as acorn.CallExpression
      return compileCall(call, ctx)
    }

    case 'SequenceExpression': {
      const seq = node as acorn.SequenceExpression
      const code: number[] = []
      for (let i = 0; i < seq.expressions.length; i++) {
        code.push(...compileExpression(seq.expressions[i], ctx))
        // Drop all but last value
        if (i < seq.expressions.length - 1) {
          code.push(Op.drop)
        }
      }
      return code
    }

    default:
      ctx.errors.push(`Unsupported expression type: ${node.type}`)
      return [Op.f64_const, ...encodeF64(0)]
  }
}

/** Compile a binary expression */
function compileBinaryExpr(
  node: acorn.BinaryExpression,
  ctx: CompileContext
): number[] {
  const left = compileExpression(node.left as acorn.Expression, ctx)
  const right = compileExpression(node.right as acorn.Expression, ctx)
  const resultType = inferExprType(node, ctx)

  // Type coercion if needed
  const leftType = inferExprType(node.left as acorn.Expression, ctx)
  const rightType = inferExprType(node.right as acorn.Expression, ctx)

  // Determine operand type for the operation
  const isComparison = [
    '<',
    '>',
    '<=',
    '>=',
    '==',
    '===',
    '!=',
    '!==',
  ].includes(node.operator)

  // For comparisons and arithmetic, we need operands to match
  // Promote to the "wider" type
  let opType: WasmValueType
  if (leftType === 'f64' || rightType === 'f64') {
    opType = 'f64'
  } else if (leftType === 'f32' || rightType === 'f32') {
    opType = 'f32'
  } else {
    opType = 'i32'
  }

  // For non-comparison ops, use result type if it's wider
  if (!isComparison && resultType === 'f64') {
    opType = 'f64'
  }

  let leftCode = left
  let rightCode = right

  // Coerce operands to opType
  if (opType === 'f64') {
    if (leftType === 'i32') {
      leftCode = [...left, Op.f64_convert_i32_s]
    } else if (leftType === 'f32') {
      leftCode = [...left, Op.f64_promote_f32]
    }
    if (rightType === 'i32') {
      rightCode = [...right, Op.f64_convert_i32_s]
    } else if (rightType === 'f32') {
      rightCode = [...right, Op.f64_promote_f32]
    }
  } else if (opType === 'f32') {
    if (leftType === 'i32') {
      leftCode = [...left, Op.f32_convert_i32_s]
    }
    if (rightType === 'i32') {
      rightCode = [...right, Op.f32_convert_i32_s]
    }
  }

  const opMap: Record<string, Record<string, number>> = {
    '+': { i32: Op.i32_add, f32: Op.f32_add, f64: Op.f64_add },
    '-': { i32: Op.i32_sub, f32: Op.f32_sub, f64: Op.f64_sub },
    '*': { i32: Op.i32_mul, f32: Op.f32_mul, f64: Op.f64_mul },
    '/': { i32: Op.i32_div_s, f32: Op.f32_div, f64: Op.f64_div },
    '%': { i32: Op.i32_rem_s },
    '<': { i32: Op.i32_lt_s, f32: Op.f32_lt, f64: Op.f64_lt },
    '>': { i32: Op.i32_gt_s, f32: Op.f32_gt, f64: Op.f64_gt },
    '<=': { i32: Op.i32_le_s, f32: Op.f32_le, f64: Op.f64_le },
    '>=': { i32: Op.i32_ge_s, f32: Op.f32_ge, f64: Op.f64_ge },
    '==': { i32: Op.i32_eq, f32: Op.f32_eq, f64: Op.f64_eq },
    '===': { i32: Op.i32_eq, f32: Op.f32_eq, f64: Op.f64_eq },
    '!=': { i32: Op.i32_ne, f32: Op.f32_ne, f64: Op.f64_ne },
    '!==': { i32: Op.i32_ne, f32: Op.f32_ne, f64: Op.f64_ne },
    '|': { i32: Op.i32_or },
    '&': { i32: Op.i32_and },
    '^': { i32: Op.i32_xor },
    '<<': { i32: Op.i32_shl },
    '>>': { i32: Op.i32_shr_s },
    '>>>': { i32: Op.i32_shr_u },
  }

  const ops = opMap[node.operator]
  if (!ops) {
    ctx.errors.push(`Unsupported operator: ${node.operator}`)
    return [Op.f64_const, ...encodeF64(0)]
  }

  const opcode = ops[opType] ?? ops.f64 ?? ops.i32
  if (opcode === undefined) {
    ctx.errors.push(
      `Operator ${node.operator} not supported for type ${opType}`
    )
    return [Op.f64_const, ...encodeF64(0)]
  }

  return [...leftCode, ...rightCode, opcode]
}

/** Compile a unary expression */
function compileUnaryExpr(
  node: acorn.UnaryExpression,
  ctx: CompileContext
): number[] {
  const arg = compileExpression(node.argument as acorn.Expression, ctx)
  const type = inferExprType(node.argument as acorn.Expression, ctx)

  switch (node.operator) {
    case '-':
      if (type === 'i32') {
        // 0 - x
        return [Op.i32_const, 0, ...arg, Op.i32_sub]
      } else if (type === 'f32') {
        return [...arg, Op.f32_neg]
      } else {
        return [...arg, Op.f64_neg]
      }

    case '!':
      // Boolean not: x == 0
      return [...arg, Op.i32_eqz]

    case '~':
      // Bitwise not: x ^ -1
      return [...arg, Op.i32_const, ...encodeSLEB128(-1), Op.i32_xor]

    default:
      ctx.errors.push(`Unsupported unary operator: ${node.operator}`)
      return arg
  }
}

/** Compile an assignment expression */
function compileAssignment(
  node: acorn.AssignmentExpression,
  ctx: CompileContext
): number[] {
  // Handle array element assignment: arr[i] = value
  if (node.left.type === 'MemberExpression') {
    return compileArrayStore(
      node.left as acorn.MemberExpression,
      node.right as acorn.Expression,
      node.operator,
      ctx
    )
  }

  // Handle simple variable assignment
  if (node.left.type !== 'Identifier') {
    ctx.errors.push('Assignment target must be identifier or array element')
    return []
  }

  const name = (node.left as acorn.Identifier).name
  const local = getLocal(ctx, name)
  if (!local) {
    ctx.errors.push(`Unknown variable: ${name}`)
    return []
  }

  const code: number[] = []

  if (node.operator === '=') {
    code.push(...compileExpression(node.right as acorn.Expression, ctx))
    // Type coercion if needed
    const valType = inferExprType(node.right as acorn.Expression, ctx)
    if (local.type === 'f64' && valType === 'i32') {
      code.push(Op.f64_convert_i32_s)
    } else if (local.type === 'f64' && valType === 'f32') {
      code.push(Op.f64_promote_f32)
    } else if (local.type === 'i32' && valType === 'f64') {
      code.push(Op.i32_trunc_f64_s)
    } else if (local.type === 'i32' && valType === 'f32') {
      code.push(Op.i32_trunc_f32_s)
    } else if (local.type === 'f32' && valType === 'i32') {
      code.push(Op.f32_convert_i32_s)
    } else if (local.type === 'f32' && valType === 'f64') {
      code.push(Op.f32_demote_f64)
    }
  } else {
    // Compound assignment: +=, -=, etc.
    const valType = inferExprType(node.right as acorn.Expression, ctx)

    // Determine operation type - promote to wider type for the operation
    let opType: WasmValueType = local.type
    if (valType === 'f64' || local.type === 'f64') {
      opType = 'f64'
    } else if (valType === 'f32' || local.type === 'f32') {
      opType = 'f32'
    }

    // Get left operand and convert to opType if needed
    code.push(Op.local_get, ...encodeULEB128(local.index))
    if (opType === 'f64' && local.type === 'i32') {
      code.push(Op.f64_convert_i32_s)
    } else if (opType === 'f64' && local.type === 'f32') {
      code.push(Op.f64_promote_f32)
    } else if (opType === 'f32' && local.type === 'i32') {
      code.push(Op.f32_convert_i32_s)
    }

    // Get right operand and convert to opType if needed
    code.push(...compileExpression(node.right as acorn.Expression, ctx))
    if (opType === 'f64' && valType === 'i32') {
      code.push(Op.f64_convert_i32_s)
    } else if (opType === 'f64' && valType === 'f32') {
      code.push(Op.f64_promote_f32)
    } else if (opType === 'f32' && valType === 'i32') {
      code.push(Op.f32_convert_i32_s)
    }

    // Perform operation in opType
    const op = node.operator.slice(0, -1) // Remove '='
    const opMap: Record<string, Record<string, number>> = {
      '+': { i32: Op.i32_add, f32: Op.f32_add, f64: Op.f64_add },
      '-': { i32: Op.i32_sub, f32: Op.f32_sub, f64: Op.f64_sub },
      '*': { i32: Op.i32_mul, f32: Op.f32_mul, f64: Op.f64_mul },
      '/': { i32: Op.i32_div_s, f32: Op.f32_div, f64: Op.f64_div },
    }
    const opcode = opMap[op]?.[opType]
    if (!opcode) {
      ctx.errors.push(`Unsupported compound assignment: ${node.operator}`)
      return []
    }
    code.push(opcode)

    // Convert result back to local type if needed
    if (local.type === 'i32' && opType === 'f64') {
      code.push(Op.i32_trunc_f64_s)
    } else if (local.type === 'i32' && opType === 'f32') {
      code.push(Op.i32_trunc_f32_s)
    } else if (local.type === 'f32' && opType === 'f64') {
      code.push(Op.f32_demote_f64)
    }
  }

  code.push(Op.local_tee, ...encodeULEB128(local.index)) // tee returns the value

  return code
}

/** Compile an update expression (++, --) */
function compileUpdate(
  node: acorn.UpdateExpression,
  ctx: CompileContext
): number[] {
  if (node.argument.type !== 'Identifier') {
    ctx.errors.push('Update expression argument must be identifier')
    return []
  }

  const name = (node.argument as acorn.Identifier).name
  const local = getLocal(ctx, name)
  if (!local) {
    ctx.errors.push(`Unknown variable: ${name}`)
    return []
  }

  const code: number[] = []
  const isI32 = local.type === 'i32'

  if (node.prefix) {
    // ++x or --x: modify then return new value
    code.push(Op.local_get, ...encodeULEB128(local.index))
    if (isI32) {
      code.push(Op.i32_const, 1)
      code.push(node.operator === '++' ? Op.i32_add : Op.i32_sub)
    } else {
      code.push(Op.f64_const, ...encodeF64(1))
      code.push(node.operator === '++' ? Op.f64_add : Op.f64_sub)
    }
    code.push(Op.local_tee, ...encodeULEB128(local.index))
  } else {
    // x++ or x--: return old value, then modify
    code.push(Op.local_get, ...encodeULEB128(local.index))
    // Store incremented value
    code.push(Op.local_get, ...encodeULEB128(local.index))
    if (isI32) {
      code.push(Op.i32_const, 1)
      code.push(node.operator === '++' ? Op.i32_add : Op.i32_sub)
    } else {
      code.push(Op.f64_const, ...encodeF64(1))
      code.push(node.operator === '++' ? Op.f64_add : Op.f64_sub)
    }
    code.push(Op.local_set, ...encodeULEB128(local.index))
  }

  return code
}

/** Compile array element access: arr[i] */
function compileArrayAccess(
  node: acorn.MemberExpression,
  ctx: CompileContext
): number[] {
  if (node.object.type !== 'Identifier') {
    ctx.errors.push('Array access requires identifier')
    return []
  }

  const name = (node.object as acorn.Identifier).name
  const param = ctx.params.find((p) => p.name === name)

  if (!param?.isArray || !param.arrayType) {
    ctx.errors.push(`${name} is not a typed array parameter`)
    return []
  }

  const arrayInfo = TYPED_ARRAYS[param.arrayType]
  if (!arrayInfo) {
    ctx.errors.push(`Unknown array type: ${param.arrayType}`)
    return []
  }

  ctx.needsMemory = true

  const code: number[] = []

  // Get base address (array pointer param)
  const local = getLocal(ctx, name)
  if (!local) {
    ctx.errors.push(`Unknown array: ${name}`)
    return []
  }
  code.push(Op.local_get, ...encodeULEB128(local.index))

  // Compute offset: index * bytesPerElement
  if (!node.computed || !node.property) {
    ctx.errors.push('Array access requires computed index')
    return []
  }

  const indexCode = compileExpression(node.property as acorn.Expression, ctx)
  const indexType = inferExprType(node.property as acorn.Expression, ctx)

  code.push(...indexCode)

  // Convert index to i32 if needed
  if (indexType === 'f64') {
    code.push(Op.i32_trunc_f64_s)
  }

  // Multiply by bytes per element
  if (arrayInfo.bytesPerElement > 1) {
    code.push(Op.i32_const, ...encodeSLEB128(arrayInfo.bytesPerElement))
    code.push(Op.i32_mul)
  }

  // Add base address
  code.push(Op.i32_add)

  // Load value (align=0, offset=0)
  code.push(arrayInfo.loadOp, 0, 0)

  return code
}

/** Compile array element store: arr[i] = value */
function compileArrayStore(
  target: acorn.MemberExpression,
  value: acorn.Expression,
  operator: string,
  ctx: CompileContext
): number[] {
  if (target.object.type !== 'Identifier') {
    ctx.errors.push('Array store requires identifier')
    return []
  }

  const name = (target.object as acorn.Identifier).name
  const param = ctx.params.find((p) => p.name === name)

  if (!param?.isArray || !param.arrayType) {
    ctx.errors.push(`${name} is not a typed array parameter`)
    return []
  }

  const arrayInfo = TYPED_ARRAYS[param.arrayType]
  if (!arrayInfo) {
    ctx.errors.push(`Unknown array type: ${param.arrayType}`)
    return []
  }

  ctx.needsMemory = true

  const code: number[] = []

  // Get local for array pointer
  const local = getLocal(ctx, name)
  if (!local) return []

  if (!target.computed || !target.property) {
    ctx.errors.push('Array store requires computed index')
    return []
  }

  const indexCode = compileExpression(target.property as acorn.Expression, ctx)
  const indexType = inferExprType(target.property as acorn.Expression, ctx)

  // Helper to generate address computation code
  const computeAddress = (): number[] => {
    const addr: number[] = []
    addr.push(Op.local_get, ...encodeULEB128(local.index))
    addr.push(...indexCode)
    if (indexType === 'f64') {
      addr.push(Op.i32_trunc_f64_s)
    }
    if (arrayInfo.bytesPerElement > 1) {
      addr.push(Op.i32_const, ...encodeSLEB128(arrayInfo.bytesPerElement))
      addr.push(Op.i32_mul)
    }
    addr.push(Op.i32_add)
    return addr
  }

  // Compile value
  if (operator === '=') {
    code.push(...compileExpression(value, ctx))
  } else {
    // Compound assignment - load current value, compute, store
    // Use a temp local to store address for reuse
    const addrLocal = declareLocal(ctx, `__addr_${ctx.nextLocalIndex}`, 'i32')

    // Compute address and save it
    code.push(...computeAddress())
    code.push(Op.local_tee, ...encodeULEB128(addrLocal))
    code.push(arrayInfo.loadOp, 0, 0)

    // Compile right side and convert to match array element type
    code.push(...compileExpression(value, ctx))
    const rhsType = inferExprType(value, ctx)
    if (arrayInfo.elementType === 'f32' && rhsType === 'f64') {
      code.push(Op.f32_demote_f64)
    } else if (arrayInfo.elementType === 'f64' && rhsType === 'f32') {
      code.push(Op.f64_promote_f32)
    } else if (arrayInfo.elementType === 'f32' && rhsType === 'i32') {
      code.push(Op.f32_convert_i32_s)
    } else if (arrayInfo.elementType === 'f64' && rhsType === 'i32') {
      code.push(Op.f64_convert_i32_s)
    } else if (arrayInfo.elementType === 'i32' && rhsType === 'f64') {
      code.push(Op.i32_trunc_f64_s)
    } else if (arrayInfo.elementType === 'i32' && rhsType === 'f32') {
      code.push(Op.i32_trunc_f32_s)
    }

    const op = operator.slice(0, -1)
    const opMap: Record<string, number> = {
      '+':
        arrayInfo.elementType === 'i32'
          ? Op.i32_add
          : arrayInfo.elementType === 'f32'
          ? Op.f32_add
          : Op.f64_add,
      '-':
        arrayInfo.elementType === 'i32'
          ? Op.i32_sub
          : arrayInfo.elementType === 'f32'
          ? Op.f32_sub
          : Op.f64_sub,
      '*':
        arrayInfo.elementType === 'i32'
          ? Op.i32_mul
          : arrayInfo.elementType === 'f32'
          ? Op.f32_mul
          : Op.f64_mul,
    }
    code.push(opMap[op] ?? Op.f64_add)

    // Store: need address then value
    // Swap: store value in temp, get address, get value back
    const valLocal = declareLocal(
      ctx,
      `__val_${ctx.nextLocalIndex}`,
      arrayInfo.elementType
    )
    code.push(Op.local_set, ...encodeULEB128(valLocal))
    code.push(Op.local_get, ...encodeULEB128(addrLocal))
    code.push(Op.local_get, ...encodeULEB128(valLocal))
    code.push(arrayInfo.storeOp, 0, 0)

    // Return the stored value
    code.push(Op.local_get, ...encodeULEB128(valLocal))
    return code
  }

  // Convert value type if needed
  const valType = inferExprType(value, ctx)
  if (arrayInfo.elementType === 'f32' && valType === 'f64') {
    code.push(Op.f32_demote_f64)
  } else if (arrayInfo.elementType === 'f64' && valType === 'f32') {
    code.push(Op.f64_promote_f32)
  } else if (arrayInfo.elementType === 'i32' && valType === 'f64') {
    code.push(Op.i32_trunc_f64_s)
  }

  // Store needs address then value - we have value on top
  // Swap using temp local
  const tempLocal = declareLocal(
    ctx,
    `__tmp_${ctx.nextLocalIndex}`,
    arrayInfo.elementType
  )
  code.push(Op.local_set, ...encodeULEB128(tempLocal))

  // Recompute address (simpler than complex stack manipulation)
  code.push(Op.local_get, ...encodeULEB128(local.index))
  code.push(...indexCode)
  if (indexType === 'f64') {
    code.push(Op.i32_trunc_f64_s)
  }
  if (arrayInfo.bytesPerElement > 1) {
    code.push(Op.i32_const, ...encodeSLEB128(arrayInfo.bytesPerElement))
    code.push(Op.i32_mul)
  }
  code.push(Op.i32_add)

  code.push(Op.local_get, ...encodeULEB128(tempLocal))
  code.push(arrayInfo.storeOp, 0, 0)

  // Return stored value
  code.push(Op.local_get, ...encodeULEB128(tempLocal))

  return code
}

/** Compile a function call */
function compileCall(
  node: acorn.CallExpression,
  ctx: CompileContext
): number[] {
  // Handle Math.xxx calls
  if (node.callee.type === 'MemberExpression') {
    const callee = node.callee as acorn.MemberExpression
    if (
      callee.object.type === 'Identifier' &&
      (callee.object as acorn.Identifier).name === 'Math' &&
      callee.property.type === 'Identifier'
    ) {
      const method = (callee.property as acorn.Identifier).name
      return compileMathCall(method, node.arguments as acorn.Expression[], ctx)
    }
  }

  ctx.errors.push(`Unsupported function call: ${node.callee.type}`)
  return [Op.f64_const, ...encodeF64(0)]
}

/** Compile Math.xxx calls */
function compileMathCall(
  method: string,
  args: acorn.Expression[],
  ctx: CompileContext
): number[] {
  const code: number[] = []

  // Compile arguments
  for (const arg of args) {
    code.push(...compileExpression(arg, ctx))
    // Ensure f64 for math functions
    const type = inferExprType(arg, ctx)
    if (type === 'i32') {
      code.push(Op.f64_convert_i32_s)
    } else if (type === 'f32') {
      code.push(Op.f64_promote_f32)
    }
  }

  // Map to WASM ops or imports
  const builtins: Record<string, number> = {
    abs: Op.f64_abs,
    ceil: Op.f64_ceil,
    floor: Op.f64_floor,
    trunc: Op.f64_trunc,
    sqrt: Op.f64_sqrt,
    min: Op.f64_min,
    max: Op.f64_max,
  }

  const opcode = builtins[method]
  if (opcode !== undefined) {
    code.push(opcode)
    return code
  }

  // Functions that need imports (sin, cos, etc.)
  const needsImport = [
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'exp',
    'log',
    'pow',
  ]
  if (needsImport.includes(method)) {
    ctx.needsMathImports.add(method)
    // Will be handled by import section
    // For now, error
    ctx.errors.push(`Math.${method} requires JS import (not yet implemented)`)
    return [Op.f64_const, ...encodeF64(0)]
  }

  ctx.errors.push(`Unknown Math method: ${method}`)
  return [Op.f64_const, ...encodeF64(0)]
}

// ============================================================================
// Module Building
// ============================================================================

/** Parse type annotation from capture string like "arr: Float32Array" */
function parseTypeAnnotation(capture: string): TypedParam {
  const parts = capture.split(':').map((s) => s.trim())
  const name = parts[0]

  if (parts.length === 1) {
    // No annotation - default to f64
    return { name, type: 'f64' }
  }

  const typeStr = parts[1]

  // Check for typed arrays
  if (TYPED_ARRAYS[typeStr]) {
    return { name, type: 'i32', isArray: true, arrayType: typeStr }
  }

  // Check for primitives
  const typeMap: Record<string, WasmValueType> = {
    i32: 'i32',
    i64: 'i64',
    f32: 'f32',
    f64: 'f64',
    number: 'f64',
    int: 'i32',
  }

  return { name, type: typeMap[typeStr] ?? 'f64' }
}

/** Build a complete WASM module */
function buildModule(
  params: TypedParam[],
  bodyCode: number[],
  localTypes: WasmValueType[],
  needsMemory: boolean,
  hasReturn: boolean
): number[] {
  // Magic number and version
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

  // Type section: function signature
  const paramWasmTypes = params.map((p) => Type[p.type])
  const returnSpec = hasReturn ? [0x01, Type.f64] : [0x00] // one f64 return OR void
  const typeSection = encodeSection(Section.type, [
    0x01, // one type
    0x60, // func type
    ...encodeULEB128(params.length),
    ...paramWasmTypes,
    ...returnSpec,
  ])

  // Memory section (if needed)
  const memorySection: number[] = []
  if (needsMemory) {
    // Import memory from JS instead of declaring it
    // This lets us share memory with typed arrays
  }

  // Import section for memory
  let importSection: number[] = []
  if (needsMemory) {
    importSection = encodeSection(Section.import, [
      0x01, // one import
      ...encodeString('env'),
      ...encodeString('memory'),
      0x02, // memory
      0x00, // flags: no max
      0x01, // initial: 1 page (64KB)
    ])
  }

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
  // Encode locals: group by type
  const localGroups: number[][] = []
  if (localTypes.length > 0) {
    let currentType = localTypes[0]
    let count = 1
    for (let i = 1; i < localTypes.length; i++) {
      if (localTypes[i] === currentType) {
        count++
      } else {
        localGroups.push([...encodeULEB128(count), Type[currentType]])
        currentType = localTypes[i]
        count = 1
      }
    }
    localGroups.push([...encodeULEB128(count), Type[currentType]])
  }

  const localsEncoded = [
    ...encodeULEB128(localGroups.length),
    ...localGroups.flat(),
  ]

  const funcBody = [...localsEncoded, ...bodyCode, Op.end]

  const codeSection = encodeSection(Section.code, [
    0x01, // one function
    ...encodeULEB128(funcBody.length),
    ...funcBody,
  ])

  // Assemble module
  const sections = [...header, ...typeSection]

  if (importSection.length > 0) {
    sections.push(...importSection)
  }

  sections.push(...funcSection, ...exportSection, ...codeSection)

  return sections
}

// ============================================================================
// Public API
// ============================================================================

/** Compile result */
export interface WasmCompileResult {
  /** The compiled WebAssembly module bytes */
  bytes: Uint8Array
  /** Any warnings during compilation */
  warnings: string[]
  /** Whether compilation succeeded */
  success: boolean
  /** Error message if compilation failed */
  error?: string
  /** Whether the module needs imported memory */
  needsMemory?: boolean
  /** WAT text representation (for debugging) */
  wat?: string
}

/**
 * Compile a WASM block to WebAssembly
 */
export function compileToWasm(block: WasmBlock): WasmCompileResult {
  try {
    // Parse type annotations from captures
    const params = block.captures.map(parseTypeAnnotation)

    // Parse the body as JavaScript
    let ast: acorn.Program
    try {
      // Wrap in function to allow return statements
      const wrapped = `function __wasm__(${params
        .map((p) => p.name)
        .join(', ')}) { ${block.body} }`
      ast = acorn.parse(wrapped, { ecmaVersion: 2022 }) as acorn.Program
    } catch (e: any) {
      return {
        bytes: new Uint8Array(),
        warnings: [],
        success: false,
        error: `Parse error: ${e.message}`,
      }
    }

    // Get the function body
    const funcDecl = ast.body[0] as acorn.FunctionDeclaration
    const body = funcDecl.body.body

    // Create compilation context
    const ctx = createContext(params)

    // Compile statements
    const code: number[] = []
    for (const stmt of body) {
      code.push(...compileStatement(stmt, ctx))
    }

    // Check for errors
    if (ctx.errors.length > 0) {
      return {
        bytes: new Uint8Array(),
        warnings: ctx.warnings,
        success: false,
        error: ctx.errors.join('; '),
      }
    }

    // Build the module
    const moduleBytes = buildModule(
      params,
      code,
      ctx.localTypes,
      ctx.needsMemory,
      ctx.hasReturn
    )

    return {
      bytes: new Uint8Array(moduleBytes),
      warnings: ctx.warnings,
      success: true,
      needsMemory: ctx.needsMemory,
    }
  } catch (e: any) {
    return {
      bytes: new Uint8Array(),
      warnings: [],
      success: false,
      error: e.message,
    }
  }
}

/**
 * Instantiate a compiled WASM module
 */
export async function instantiateWasm(
  bytes: Uint8Array,
  memory?: WebAssembly.Memory
): Promise<WebAssembly.Instance> {
  const imports: WebAssembly.Imports = {}

  if (memory) {
    imports.env = { memory }
  }

  const module = await WebAssembly.compile(bytes)
  return WebAssembly.instantiate(module, imports)
}

/**
 * Create a callable function from a WASM block with typed array support
 */
export async function createWasmFunction(block: WasmBlock): Promise<{
  fn: (...args: any[]) => any
  memory?: WebAssembly.Memory
  success: boolean
  error?: string
}> {
  const result = compileToWasm(block)

  if (!result.success) {
    return { fn: () => 0, success: false, error: result.error }
  }

  try {
    let memory: WebAssembly.Memory | undefined

    if (result.needsMemory) {
      // Create shared memory for typed arrays (256 pages = 16MB)
      memory = new WebAssembly.Memory({ initial: 256 })
    }

    const instance = await instantiateWasm(result.bytes, memory)
    const compute = instance.exports.compute as (...args: number[]) => number

    // Wrap to handle typed array arguments
    const params = block.captures.map(parseTypeAnnotation)
    const hasArrays = params.some((p) => p.isArray)

    if (!hasArrays) {
      return { fn: compute, memory, success: true }
    }

    // Create wrapper that copies typed arrays to/from WASM memory
    const wrappedFn = (...args: any[]) => {
      if (!memory) throw new Error('Memory not initialized')

      const memoryView = new Uint8Array(memory.buffer)
      let offset = 0
      const pointers: number[] = []

      // Copy input arrays to memory
      for (let i = 0; i < params.length; i++) {
        const param = params[i]
        const arg = args[i]

        if (param.isArray && arg instanceof Object && 'buffer' in arg) {
          const typedArray = arg as
            | Float32Array
            | Float64Array
            | Int32Array
            | Uint8Array
          const bytes = new Uint8Array(
            typedArray.buffer,
            typedArray.byteOffset,
            typedArray.byteLength
          )
          memoryView.set(bytes, offset)
          pointers.push(offset)
          offset += bytes.length
          // Align to 8 bytes
          offset = (offset + 7) & ~7
        } else {
          pointers.push(arg as number)
        }
      }

      // Call WASM function
      const resultVal = compute(...pointers)

      // Copy output arrays back (they're modified in place)
      offset = 0
      for (let i = 0; i < params.length; i++) {
        const param = params[i]
        const arg = args[i]

        if (param.isArray && arg instanceof Object && 'buffer' in arg) {
          const typedArray = arg as
            | Float32Array
            | Float64Array
            | Int32Array
            | Uint8Array
          const bytes = new Uint8Array(
            typedArray.buffer,
            typedArray.byteOffset,
            typedArray.byteLength
          )
          bytes.set(memoryView.slice(offset, offset + bytes.length))
          offset += bytes.length
          offset = (offset + 7) & ~7
        }
      }

      return resultVal
    }

    return { fn: wrappedFn, memory, success: true }
  } catch (e: any) {
    return { fn: () => 0, success: false, error: e.message }
  }
}

/**
 * Compile and register a WASM block globally
 */
export async function registerWasmBlock(block: WasmBlock): Promise<boolean> {
  const result = await createWasmFunction(block)

  if (!result.success) {
    console.warn(`WASM compilation failed for ${block.id}:`, result.error)
    return false
  }

  // Register globally
  ;(globalThis as any)[block.id] = result.fn

  return true
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

/**
 * Compiled WASM data that can be serialized and passed to an iframe
 */
export interface CompiledWasmData {
  id: string
  bytes: number[] // Uint8Array as plain array for JSON serialization
  captures: string[]
  needsMemory: boolean
}

/**
 * Compile WASM blocks and return serializable data for iframe instantiation
 */
export async function compileWasmBlocksForIframe(blocks: WasmBlock[]): Promise<{
  compiled: CompiledWasmData[]
  failed: number
  errors: string[]
}> {
  const compiled: CompiledWasmData[] = []
  let failed = 0
  const errors: string[] = []

  for (const block of blocks) {
    const result = compileToWasm(block)
    if (result.success) {
      compiled.push({
        id: block.id,
        bytes: Array.from(result.bytes),
        captures: block.captures,
        needsMemory: result.needsMemory ?? false,
      })
    } else {
      failed++
      errors.push(`Failed to compile ${block.id}: ${result.error}`)
    }
  }

  return { compiled, failed, errors }
}

/**
 * Generate JavaScript code that instantiates compiled WASM in an iframe
 * This code should be injected into the iframe's script
 */
export function generateWasmInstantiationCode(
  compiledBlocks: CompiledWasmData[]
): string {
  if (compiledBlocks.length === 0) return ''

  // Helper function to parse type annotations (same as parseTypeAnnotation)
  const parseTypeCode = `
function __parseWasmType(capture) {
  const match = capture.match(/^(\\w+)\\s*:\\s*(\\w+)$/);
  if (!match) return { name: capture, type: 'f64', isArray: false };
  const [, name, typeStr] = match;
  const arrayTypes = { Float32Array: 'f32', Float64Array: 'f64', Int32Array: 'i32', Uint8Array: 'i32' };
  if (arrayTypes[typeStr]) {
    return { name, type: 'i32', isArray: true, arrayType: typeStr };
  }
  const typeMap = { i32: 'i32', i64: 'i64', f32: 'f32', f64: 'f64', number: 'f64', int: 'i32' };
  return { name, type: typeMap[typeStr] || 'f64', isArray: false };
}
`

  // Helper to create wrapped function
  const wrapperCode = `
async function __instantiateWasm(id, bytes, captures, needsMemory) {
  const params = captures.map(__parseWasmType);
  const hasArrays = params.some(p => p.isArray);

  let memory;
  if (needsMemory) {
    memory = new WebAssembly.Memory({ initial: 256 });
  }

  const importObject = memory ? { env: { memory } } : {};
  const module = await WebAssembly.compile(new Uint8Array(bytes));
  const instance = await WebAssembly.instantiate(module, importObject);
  const compute = instance.exports.compute;

  if (!hasArrays) {
    globalThis[id] = compute;
    return;
  }

  // Create wrapper that copies typed arrays to/from WASM memory
  globalThis[id] = function(...args) {
    const memoryView = new Uint8Array(memory.buffer);
    let offset = 0;
    const pointers = [];

    // Copy input arrays to memory
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const arg = args[i];

      if (param.isArray && arg && arg.buffer) {
        const bytes = new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength);
        memoryView.set(bytes, offset);
        pointers.push(offset);
        offset += bytes.length;
        offset = (offset + 7) & ~7; // Align to 8 bytes
      } else {
        pointers.push(arg);
      }
    }

    // Call WASM function
    const result = compute(...pointers);

    // Copy output arrays back
    offset = 0;
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const arg = args[i];

      if (param.isArray && arg && arg.buffer) {
        const bytes = new Uint8Array(arg.buffer, arg.byteOffset, arg.byteLength);
        bytes.set(memoryView.slice(offset, offset + bytes.length));
        offset += bytes.length;
        offset = (offset + 7) & ~7;
      }
    }

    return result;
  };
}
`

  // Generate instantiation calls for each block
  const instantiationCalls = compiledBlocks
    .map(
      (block) =>
        `__instantiateWasm(${JSON.stringify(block.id)}, ${JSON.stringify(
          block.bytes
        )}, ${JSON.stringify(block.captures)}, ${block.needsMemory})`
    )
    .join(',\n      ')

  return `
    // WASM instantiation helpers
    ${parseTypeCode}
    ${wrapperCode}

    // Instantiate all WASM blocks
    await Promise.all([
      ${instantiationCalls}
    ]);
  `
}
