/**
 * TJS Transpiler - Core transpilation without TS compiler
 *
 * This is the lightweight entry point for TJS/AJS transpilation.
 * Does NOT include fromTS (which requires the full TypeScript compiler).
 *
 * For TS -> TJS conversion, use the full bundle or import fromTS separately.
 */

// Core transpiler functions
export { transpile, ajs, tjs, createAgent, getToolDefinitions } from './index'

// Parser
export { parse, preprocess, extractTDoc } from './parser'

// AST emitter
export { transformFunction } from './emitters/ast'

// JS emitter (TJS -> JS)
export { transpileToJS } from './emitters/js'
export type {
  TJSTranspileOptions,
  TJSTranspileResult,
  TJSTypeInfo,
} from './emitters/js'

// Type inference
export * from './inference'

// Schema
export { Schema } from './schema'

// Linter
export { lint } from './linter'
export type { LintResult, LintDiagnostic, LintOptions } from './linter'

// Tests
export { extractTests, assertFunction, expectFunction, testUtils } from './tests'
export type { ExtractedTest, ExtractedMock, TestExtractionResult } from './tests'

// Runtime
export {
  runtime,
  installRuntime,
  isError,
  error,
  typeOf,
  checkType,
  validateArgs,
  wrap,
  emitRuntimeWrapper,
  TJS_VERSION,
} from './runtime'
export type { TJSError } from './runtime'

// Types
export type {
  TypeDescriptor,
  ParameterDescriptor,
  FunctionSignature,
  TranspileOptions,
  TranspileResult,
  TranspileWarning,
} from './types'
