/**
 * TJS Linter
 *
 * Static analysis for TJS code:
 * - Unused variables
 * - Undefined variables
 * - Type mismatches (when __tjs metadata available)
 * - Unreachable code
 *
 * POC: Focus on variable usage first, then type checking.
 */

import type { Program, Node, Identifier, VariableDeclaration } from 'acorn'
import { parse } from './parser'
import * as walk from 'acorn-walk'

export interface LintDiagnostic {
  severity: 'error' | 'warning' | 'info'
  message: string
  line?: number
  column?: number
  rule: string
}

export interface LintResult {
  diagnostics: LintDiagnostic[]
  valid: boolean
}

export interface LintOptions {
  /** Check for unused variables */
  unusedVariables?: boolean
  /** Check for undefined variables */
  undefinedVariables?: boolean
  /** Check for unreachable code */
  unreachableCode?: boolean
  /** Filename for error messages */
  filename?: string
}

const DEFAULT_OPTIONS: LintOptions = {
  unusedVariables: true,
  undefinedVariables: true,
  unreachableCode: true,
}

/**
 * Lint TJS source code
 */
export function lint(source: string, options: LintOptions = {}): LintResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const diagnostics: LintDiagnostic[] = []

  // Parse the source
  let program: Program
  try {
    const result = parse(source, {
      filename: opts.filename,
      colonShorthand: true,
    })
    program = result.ast
  } catch (error: any) {
    return {
      diagnostics: [
        {
          severity: 'error',
          message: error.message,
          line: error.loc?.line,
          column: error.loc?.column,
          rule: 'parse-error',
        },
      ],
      valid: false,
    }
  }

  // Track variable declarations and usages per scope
  const scopes: Scope[] = [createScope()] // Global scope

  // First pass: collect all declarations
  walk.ancestor(program, {
    FunctionDeclaration(node: any, _state: any, _ancestors: any) {
      // Function creates new scope
      const scope = createScope()
      scopes.push(scope)

      // Add parameters to scope
      for (const param of node.params) {
        addDeclaration(scope, param, 'parameter')
      }

      // Function name is in parent scope
      if (node.id) {
        const parentScope = scopes[scopes.length - 2] || scopes[0]
        parentScope.declarations.set(node.id.name, {
          node: node.id,
          kind: 'function',
          used: false,
        })
      }
    },

    VariableDeclaration(node: VariableDeclaration) {
      const scope = scopes[scopes.length - 1]
      for (const decl of node.declarations) {
        if (decl.id.type === 'Identifier') {
          scope.declarations.set(decl.id.name, {
            node: decl.id,
            kind: node.kind as 'let' | 'const' | 'var',
            used: false,
          })
        }
        // TODO: handle destructuring patterns
      }
    },
  })

  // Second pass: check usages
  walk.simple(program, {
    Identifier(node: Identifier) {
      // Skip declaration sites (handled above)
      // This is a simplified check - just mark as used
      for (let i = scopes.length - 1; i >= 0; i--) {
        const decl = scopes[i].declarations.get(node.name)
        if (decl) {
          decl.used = true
          break
        }
      }
    },
  })

  // Report unused variables
  if (opts.unusedVariables) {
    for (const scope of scopes) {
      for (const [name, decl] of scope.declarations) {
        // Skip parameters starting with _ (intentionally unused)
        if (name.startsWith('_')) continue

        if (!decl.used && decl.kind !== 'function') {
          diagnostics.push({
            severity: 'warning',
            message: `'${name}' is declared but never used`,
            line: (decl.node as any).loc?.start?.line,
            column: (decl.node as any).loc?.start?.column,
            rule: 'no-unused-vars',
          })
        }
      }
    }
  }

  // Check for unreachable code
  if (opts.unreachableCode) {
    walk.simple(program, {
      BlockStatement(node: any) {
        let foundReturn = false
        for (const stmt of node.body) {
          if (foundReturn) {
            diagnostics.push({
              severity: 'warning',
              message: 'Unreachable code after return statement',
              line: stmt.loc?.start?.line,
              column: stmt.loc?.start?.column,
              rule: 'no-unreachable',
            })
            break // Only report once per block
          }
          if (stmt.type === 'ReturnStatement') {
            foundReturn = true
          }
        }
      },
    })
  }

  return {
    diagnostics,
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
  }
}

// --- Internal types and helpers ---

interface Scope {
  declarations: Map<string, Declaration>
}

interface Declaration {
  node: Node
  kind: 'let' | 'const' | 'var' | 'parameter' | 'function'
  used: boolean
}

function createScope(): Scope {
  return { declarations: new Map() }
}

function addDeclaration(scope: Scope, node: Node, kind: Declaration['kind']) {
  if (node.type === 'Identifier') {
    scope.declarations.set((node as Identifier).name, {
      node,
      kind,
      used: false,
    })
  } else if (
    node.type === 'AssignmentPattern' &&
    (node as any).left.type === 'Identifier'
  ) {
    scope.declarations.set((node as any).left.name, {
      node: (node as any).left,
      kind,
      used: false,
    })
  }
  // TODO: handle destructuring
}

/**
 * Questions/Notes for future:
 *
 * Q1: Should we integrate with __tjs metadata for cross-file type checking?
 *     - Would need to load metadata from imported modules
 *     - Could check function call arguments against declared parameter types
 *
 * Q2: How strict should undefined variable checking be?
 *     - Currently relies on JS globals being available
 *     - Could have a whitelist of known globals (console, Math, etc.)
 *
 * Q3: Should linting be incremental / cacheable?
 *     - For large projects, re-linting everything is slow
 *     - Could hash files and skip unchanged ones
 */
