/**
 * TJS Transpiler - Core transpilation without TS compiler
 *
 * This is the lightweight entry point for TJS/AJS transpilation.
 * Does NOT include fromTS (which requires the full TypeScript compiler).
 *
 * For TS -> TJS conversion, use the full bundle or import fromTS separately.
 *
 * NOTE: We import directly from source files, NOT from ./index, because
 * ./index imports from-ts.ts which pulls in the TypeScript compiler (~4MB).
 */

// Core transpiler functions - imported directly to avoid TS compiler
export { transpile, ajs, tjs, createAgent, getToolDefinitions } from './core'

// Parser
export { parse, preprocess, extractTDoc } from './parser'

// Dialect resolution for file-based tooling (extension → dialect)
export {
  dialectForFilename,
  sourceKindForFilename,
  type Dialect,
  type SourceKind,
} from './dialect'

// Predicate-safety: verify a cluster of pure, synchronous, composable predicates
export {
  verifyPredicate,
  compilePredicate,
  suggest,
  effectfulFromAtoms,
  formatPredicateDiagnostics,
  PredicateFuelExhausted,
  type PredicateDiagnostic,
  type PredicateVerifyResult,
  type VerifyPredicateOptions,
  type CompilePredicateOptions,
  type Suggestion,
  type SuggestOptions,
} from './predicate'

// Predicate-aware JSON-Schema: the `$predicate` keyword (computational types)
export {
  compilePredicateSchema,
  validatePredicateSchema,
  type PredicateSchema,
  type SchemaError,
  type SchemaValidationResult,
  type PredicateSchemaOptions,
} from './predicate-schema'

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
export {
  extractTests,
  assertFunction,
  expectFunction,
  testUtils,
} from './tests'
export type {
  ExtractedTest,
  ExtractedMock,
  TestExtractionResult,
} from './tests'

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
