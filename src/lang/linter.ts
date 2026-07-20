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

import type {
  Program,
  Node,
  Identifier,
  VariableDeclaration,
  AssignmentExpression,
  Expression,
} from 'acorn'
import { parse } from './parser'
import * as walk from 'acorn-walk'
import { FORBIDDEN_KEYS_SET } from '../forbidden-keys'

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
  /** Warn about explicit `new` keyword usage (TJS makes classes callable without new) */
  noExplicitNew?: boolean
  /**
   * Check `let` declarations for missing type information and forbid literal
   * undefined/null assignments to typed lets. If undefined, the parser's
   * `TjsSafeAssign` mode controls whether the rule runs.
   */
  safeAssign?: boolean
  /** Filename for error messages */
  filename?: string
  /** Treat safeAssign violations as errors instead of warnings (TjsStrict semantics) */
  strict?: boolean
  /**
   * Flag object-literal call-site keys that aren't members of a dictionary-default
   * (`=`) object param — a typo like `place({x, y, treshold})` that the runtime
   * silently strips. If undefined, follows the parser's `TjsDictDefaults` mode.
   */
  dictDefaultExcessKeys?: boolean
}

const DEFAULT_OPTIONS: LintOptions = {
  unusedVariables: true,
  undefinedVariables: true,
  unreachableCode: true,
  noExplicitNew: true,
}

/**
 * Lint TJS source code
 */
export function lint(source: string, options: LintOptions = {}): LintResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const diagnostics: LintDiagnostic[] = []

  // Parse the source
  let program: Program
  let letAnnotations: Map<string, string> = new Map()
  let safeAssignMode: boolean
  let dictDefaultsMode: boolean
  try {
    const result = parse(source, {
      filename: opts.filename,
      colonShorthand: true,
    })
    program = result.ast
    letAnnotations = result.letAnnotations
    safeAssignMode = result.tjsModes.tjsSafeAssign
    dictDefaultsMode = result.tjsModes.tjsDictDefaults
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
  const safeAssignEnabled =
    opts.safeAssign !== undefined ? opts.safeAssign : safeAssignMode
  const safeAssignSeverity: LintDiagnostic['severity'] = opts.strict
    ? 'error'
    : 'warning'

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

  // TjsSafeAssign: lets need an initializer or `: <example>` annotation, and
  // typed lets must not be (re)assigned literal undefined/null/void 0.
  if (safeAssignEnabled) {
    // First pass: track which lets are "typed" (annotated OR have a non-nullish initializer)
    const typedLets = new Set<string>()
    walk.simple(program, {
      VariableDeclaration(node: VariableDeclaration) {
        if (node.kind !== 'let') return
        for (const d of node.declarations) {
          if (d.id.type !== 'Identifier') continue
          const name = d.id.name
          const annotated = letAnnotations.has(name)
          const init = d.init
          if (annotated) {
            typedLets.add(name)
          } else if (init && !isLiteralNullish(init)) {
            typedLets.add(name)
          }
        }
      },
    })

    // Declaration-site rule: missing type information
    walk.simple(program, {
      VariableDeclaration(node: VariableDeclaration) {
        if (node.kind !== 'let') return
        for (const d of node.declarations) {
          if (d.id.type !== 'Identifier') continue
          const name = d.id.name
          if (letAnnotations.has(name)) continue
          if (!d.init) {
            diagnostics.push({
              severity: safeAssignSeverity,
              message: `'let ${name}' has no initializer or type annotation. Add an initializer (let ${name} = ...) or annotate (let ${name}: <example>).`,
              line: (d as any).loc?.start?.line,
              column: (d as any).loc?.start?.column,
              rule: 'safe-assign-let-needs-type',
            })
          } else if (isLiteralNullish(d.init)) {
            diagnostics.push({
              severity: safeAssignSeverity,
              message: `'let ${name}' is initialized to ${describeNullish(
                d.init
              )} with no type annotation. Annotate (let ${name}: <example>) to record the intended type.`,
              line: (d as any).loc?.start?.line,
              column: (d as any).loc?.start?.column,
              rule: 'safe-assign-let-needs-type',
            })
          }
        }
      },
    })

    // Use-site rule: literal undefined/null assigned to a typed let
    walk.simple(program, {
      AssignmentExpression(node: AssignmentExpression) {
        if (node.operator !== '=') return
        if (node.left.type !== 'Identifier') return
        const name = (node.left as Identifier).name
        if (!typedLets.has(name)) return
        if (!isLiteralNullish(node.right)) return
        diagnostics.push({
          severity: safeAssignSeverity,
          message: `Cannot assign ${describeNullish(
            node.right
          )} to typed let '${name}'.`,
          line: (node as any).loc?.start?.line,
          column: (node as any).loc?.start?.column,
          rule: 'safe-assign-no-nullish',
        })
      },
    })
  }

  // Check for explicit `new` keyword usage
  // In TJS, classes are callable without `new`, so using `new` is unnecessary
  if (opts.noExplicitNew) {
    walk.simple(program, {
      NewExpression(node: any) {
        // Get the callee name
        let calleeName = 'class'
        if (node.callee.type === 'Identifier') {
          calleeName = node.callee.name
        } else if (node.callee.type === 'MemberExpression') {
          // e.g., new foo.Bar()
          if (node.callee.property.type === 'Identifier') {
            calleeName = node.callee.property.name
          }
        }

        diagnostics.push({
          severity: 'warning',
          message: `Unnecessary 'new' keyword. In TJS, classes are callable without 'new': ${calleeName}(...) instead of new ${calleeName}(...)`,
          line: node.loc?.start?.line,
          column: node.loc?.start?.column,
          rule: 'no-explicit-new',
        })
      },
    })
  }

  // Dictionary-default excess keys: an object-literal argument passed to a `=`
  // object param carries a key the param doesn't declare. The runtime strips it
  // (with a once-per-site notice), but at a LITERAL call site it's almost always
  // a typo — flag it statically. Mode-gated: only meaningful when TjsDictDefaults
  // is on (under dialect:'js'/TjsCompat the `=` form is an atomic JS default with
  // no member contract, so no key is "excess").
  const excessEnabled =
    opts.dictDefaultExcessKeys !== undefined
      ? opts.dictDefaultExcessKeys
      : dictDefaultsMode
  if (excessEnabled) {
    // funcName -> per-position shape (null for non-dict-default params)
    const dictShapes = new Map<string, Array<DictShape | null>>()
    const collect = (name: string | undefined, params: any[]) => {
      if (!name) return
      const shapes = params.map((p) =>
        p.type === 'AssignmentPattern' &&
        p.left.type === 'Identifier' &&
        p.right.type === 'ObjectExpression'
          ? shapeFromObjectExpr(p.right)
          : null
      )
      if (shapes.some(Boolean)) dictShapes.set(name, shapes)
    }
    walk.simple(program, {
      FunctionDeclaration(node: any) {
        collect(node.id?.name, node.params)
      },
      VariableDeclarator(node: any) {
        if (
          node.id?.type === 'Identifier' &&
          (node.init?.type === 'ArrowFunctionExpression' ||
            node.init?.type === 'FunctionExpression')
        ) {
          collect(node.id.name, node.init.params)
        }
      },
    })

    if (dictShapes.size > 0) {
      walk.simple(program, {
        CallExpression(node: any) {
          if (node.callee.type !== 'Identifier') return
          const shapes = dictShapes.get(node.callee.name)
          if (!shapes) return
          node.arguments.forEach((arg: any, i: number) => {
            const shape = shapes[i]
            if (shape && arg.type === 'ObjectExpression') {
              checkExcessKeys(arg, shape, node.callee.name, diagnostics)
            }
          })
        },
      })
    }
  }

  return {
    diagnostics,
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
  }
}

// --- Internal types and helpers ---

/** A declared object-param shape: top-level keys + nested object shapes. */
interface DictShape {
  keys: Set<string>
  nested: Map<string, DictShape>
}

function propKeyName(key: any): string | null {
  if (!key) return null
  if (key.type === 'Identifier') return key.name
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return null
}

function shapeFromObjectExpr(obj: any): DictShape {
  const keys = new Set<string>()
  const nested = new Map<string, DictShape>()
  for (const p of obj.properties) {
    if (p.type !== 'Property' || p.computed) continue
    const key = propKeyName(p.key)
    if (key == null) continue
    keys.add(key)
    if (p.value.type === 'ObjectExpression') {
      nested.set(key, shapeFromObjectExpr(p.value))
    }
  }
  return { keys, nested }
}

function checkExcessKeys(
  argObj: any,
  shape: DictShape,
  path: string,
  diagnostics: LintDiagnostic[]
): void {
  for (const p of argObj.properties) {
    // A spread may legitimately contribute declared keys; skip the whole object
    // rather than false-flag (we can't know statically what the spread adds).
    if (p.type === 'SpreadElement') return
  }
  for (const p of argObj.properties) {
    if (p.type !== 'Property' || p.computed) continue
    const key = propKeyName(p.key)
    if (key == null) continue
    if (FORBIDDEN_KEYS_SET.has(key)) continue // rejected at runtime; a different concern
    if (!shape.keys.has(key)) {
      diagnostics.push({
        severity: 'warning',
        message: `'${key}' is not a member of ${path}'s dictionary parameter and will be stripped at runtime`,
        line: (p as any).loc?.start?.line,
        column: (p as any).loc?.start?.column,
        rule: 'dict-default-excess-key',
      })
    } else if (p.value.type === 'ObjectExpression' && shape.nested.has(key)) {
      checkExcessKeys(
        p.value,
        shape.nested.get(key)!,
        `${path}.${key}`,
        diagnostics
      )
    }
  }
}

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

/**
 * Is the given expression a literal that evaluates to undefined or null?
 * Catches: `undefined`, `null`, `void 0`, `void <any-literal>`.
 */
function isLiteralNullish(node: Expression | null | undefined): boolean {
  if (!node) return false
  if (node.type === 'Identifier' && (node as Identifier).name === 'undefined') {
    return true
  }
  if (node.type === 'Literal' && (node as any).value === null) return true
  if (node.type === 'UnaryExpression' && (node as any).operator === 'void') {
    return true
  }
  return false
}

function describeNullish(node: Expression): string {
  if (node.type === 'Identifier') return 'undefined'
  if (node.type === 'Literal' && (node as any).value === null) return 'null'
  if (node.type === 'UnaryExpression' && (node as any).operator === 'void') {
    return 'void <expr> (undefined)'
  }
  return 'a nullish value'
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
