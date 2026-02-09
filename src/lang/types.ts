/**
 * Type definitions for the Agent99 JavaScript transpiler
 */

import type { Node } from 'acorn'
import type { SeqNode } from '../builder'

// ============================================================================
// Type System Types
// ============================================================================

/** Represents a type extracted from value patterns */
export interface TypeDescriptor {
  kind:
    | 'string'
    | 'number'
    | 'integer'
    | 'non-negative-integer'
    | 'boolean'
    | 'null'
    | 'undefined'
    | 'array'
    | 'object'
    | 'union'
    | 'any'
  nullable?: boolean
  /** For arrays: the element type */
  items?: TypeDescriptor
  /** For objects: the shape */
  shape?: Record<string, TypeDescriptor>
  /** For unions: the member types */
  members?: TypeDescriptor[]
  /** For destructured parameters: full parameter descriptors */
  destructuredParams?: Record<string, ParameterDescriptor>
}

/** Describes a function parameter */
export interface ParameterDescriptor {
  name: string
  type: TypeDescriptor
  required: boolean
  default?: any
  /** The example value used to infer the type (for autocomplete) */
  example?: any
  description?: string
  /** Source location for error reporting */
  loc?: { start: number; end: number }
}

/** Describes a function's complete signature */
export interface FunctionSignature {
  name: string
  description?: string
  parameters: Record<string, ParameterDescriptor>
  returns?: TypeDescriptor
}

// ============================================================================
// Transpiler Options and Results
// ============================================================================

/** Options for the transpile function */
export interface TranspileOptions {
  /** Include source locations in output AST */
  sourceMaps?: boolean
  /** Atom registry for validation (optional) */
  atoms?: Record<string, { op: string }>
  /** Filename for error messages */
  filename?: string
  /** Whether to use strict type checking */
  strict?: boolean
}

/** Result of transpilation */
export interface TranspileResult {
  /** The Agent99 AST */
  ast: SeqNode
  /** The function signature with types */
  signature: FunctionSignature
  /** Source map (if enabled) */
  sourceMap?: SourceMap
  /** Warnings (non-fatal issues) */
  warnings: TranspileWarning[]
}

/** A non-fatal warning during transpilation */
export interface TranspileWarning {
  message: string
  line: number
  column: number
  source?: string
}

/** Source map for debugging */
export interface SourceMap {
  version: 3
  file: string
  sources: string[]
  mappings: string
}

// ============================================================================
// Error Types
// ============================================================================

/** Base class for transpiler errors with source location */
export class TranspileError extends Error {
  line: number
  column: number
  source?: string
  filename?: string

  constructor(
    message: string,
    location: { line: number; column: number },
    source?: string,
    filename?: string
  ) {
    const loc = `${filename || '<source>'}:${location.line}:${location.column}`
    super(`${message} at ${loc}`)
    this.name = 'TranspileError'
    this.line = location.line
    this.column = location.column
    this.source = source
    this.filename = filename
  }
}

/** Syntax error during parsing */
export class SyntaxError extends TranspileError {
  constructor(
    message: string,
    location: { line: number; column: number },
    source?: string,
    filename?: string
  ) {
    super(message, location, source, filename)
    this.name = 'SyntaxError'
  }

  /**
   * Format the error with source context for better debugging
   * Shows the problematic line with a caret pointing to the error location
   */
  formatWithContext(contextLines = 2): string {
    if (!this.source) return this.message

    const lines = this.source.split('\n')
    const errorLine = this.line - 1 // 0-indexed
    const startLine = Math.max(0, errorLine - contextLines)
    const endLine = Math.min(lines.length - 1, errorLine + contextLines)

    const output: string[] = []
    const lineNumWidth = String(endLine + 1).length

    // Add context before
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = String(i + 1).padStart(lineNumWidth)
      const marker = i === errorLine ? '>' : ' '
      output.push(`${marker} ${lineNum} | ${lines[i]}`)

      // Add caret pointing to error column
      if (i === errorLine) {
        const caretPadding = ' '.repeat(lineNumWidth + 4 + this.column)
        output.push(`${caretPadding}^ ${this.message.split(' at ')[0]}`)
      }
    }

    return output.join('\n')
  }
}

/** Type error during transpilation or runtime */
export class TypeError extends TranspileError {
  expected?: string
  received?: string
  suggestion?: string

  constructor(
    message: string,
    location: { line: number; column: number },
    options?: {
      expected?: string
      received?: string
      suggestion?: string
      source?: string
      filename?: string
    }
  ) {
    super(message, location, options?.source, options?.filename)
    this.name = 'TypeError'
    this.expected = options?.expected
    this.received = options?.received
    this.suggestion = options?.suggestion
  }
}

// ============================================================================
// Transform Context
// ============================================================================

/** Context passed through the transformer */
export interface TransformContext {
  /** Current scope depth */
  depth: number
  /** Variables declared in current scope with their types */
  locals: Map<string, TypeDescriptor>
  /** Parent scope's context (for scope chain) */
  parent?: TransformContext
  /** Function parameters */
  parameters: Map<string, ParameterDescriptor>
  /** Registered atom names */
  atoms: Set<string>
  /** Accumulated warnings */
  warnings: TranspileWarning[]
  /** Source code for error messages */
  source: string
  /** Filename */
  filename: string
  /** Options */
  options: TranspileOptions
}

/** Create a child context for nested scopes */
export function createChildContext(parent: TransformContext): TransformContext {
  return {
    depth: parent.depth + 1,
    locals: new Map(),
    parent,
    parameters: parent.parameters,
    atoms: parent.atoms,
    warnings: parent.warnings,
    source: parent.source,
    filename: parent.filename,
    options: parent.options,
  }
}

/** Look up a variable in the scope chain */
export function lookupVariable(
  name: string,
  ctx: TransformContext
): TypeDescriptor | undefined {
  // Check locals first
  if (ctx.locals.has(name)) {
    return ctx.locals.get(name)
  }
  // Check parameters
  if (ctx.parameters.has(name)) {
    return ctx.parameters.get(name)?.type
  }
  // Check parent scope
  if (ctx.parent) {
    return lookupVariable(name, ctx.parent)
  }
  return undefined
}

// ============================================================================
// AST Node Helpers
// ============================================================================

/** Extract location from an Acorn node */
export function getLocation(node: Node): { line: number; column: number } {
  if (node.loc) {
    return { line: node.loc.start.line, column: node.loc.start.column }
  }
  return { line: 1, column: 0 }
}
