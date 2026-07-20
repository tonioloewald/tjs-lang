/**
 * TJS to JavaScript Emitter
 *
 * Transforms TJS source into standard JavaScript with runtime type metadata.
 * Unlike the AST emitter (for AgentJS), this outputs executable JS code.
 *
 * Input:
 *   function greet(name: 'world'): '' {
 *     return `Hello, ${name}!`
 *   }
 *
 * Output:
 *   function greet(name = 'world') {
 *     return `Hello, ${name}!`
 *   }
 *   greet.__tjs = {
 *     params: { name: { type: 'string', required: true, example: 'world' } },
 *     returns: { type: 'string' }
 *   }
 *
 * TODO: Self-contained output (no runtime dependency)
 * =====================================================
 * Currently, transpiled code references `globalThis.__tjs` for:
 *   - __tjs.pushStack() / popStack() - debug stack traces
 *   - __tjs.typeError() - monadic error creation
 *   - __tjs.Is() / IsNot() - structural equality (when == / != used)
 *
 * This requires either:
 *   1. The runtime to be installed via installRuntime()
 *   2. A stub to be provided (e.g., playground's inline stub)
 *
 * The ideal is that TJS produces completely independent code that only needs
 * things it semantically needs (like fetch for HTTP calls). The runtime
 * functions above are ~30 lines and could be inlined when used:
 *
 *   - typeError: Create a simple Error with extra properties
 *   - pushStack/popStack: Could be no-ops in production, or inline array ops
 *   - Is/IsNot: ~20 lines for deep structural equality
 *
 * Options to explore:
 *   1. Inline minimal runtime when needed (adds ~1KB unminified per output)
 *   2. Add transpile option: { standalone: true } to emit self-contained code
 *   3. Tree-shake: only inline the specific functions actually referenced
 *
 * See also: demo/src/tjs-playground.ts which has a manual __tjs stub that
 * must stay in sync with the runtime - a symptom of this leaky abstraction.
 */

import type { FunctionDeclaration, Program } from 'acorn'
import { parseExpressionAt } from 'acorn'

// ---------------------------------------------------------------------------
// Inline runtime core, emitted into standalone output when no shared runtime is
// installed. Single definitions — these were once copy-pasted three times.
// ---------------------------------------------------------------------------

const INLINE_MONADIC_ERROR = `class MonadicError extends Error{constructor(m,p,e,a,c,r){super(m);this.name='MonadicError';this.path=p;this.expected=e;this.actual=a;this.callStack=c;this.reason=r}}`

/**
 * The inline typeError also reports to the flight recorder when a shared
 * runtime is installed — otherwise emitted code that fell back to the inline
 * runtime would be a plane with no black box, and `__tjs.records()` would come
 * back empty while things were quietly failing.
 *
 * Reads `globalThis.__tjs` at CALL time, not module-init time, so installing
 * the runtime after a module loads still starts capturing its errors. The
 * try/catch is the recorder's prime directive: recording must never change the
 * behavior of the program it records.
 */
const INLINE_TYPE_ERROR = `function typeError(p,e,v,r){const a=v===null?'null':typeof v;const m=r?'Expected '+e+" for '"+p+"': "+r:'Expected '+e+" for '"+p+"', got "+a;const err=new MonadicError(m,p,e,a,undefined,r);const g=globalThis.__tjs;const c=g?.getConfig?.();try{g?.record?.({source:'type',severity:'error',message:err.message,error:err})}catch{}if(c?.logTypeErrors)console.error('[TJS TypeError] '+err.message);if(c?.throwTypeErrors)throw err;return err}`

const INLINE_IS_MONADIC_ERROR = `function isMonadicError(v){return v instanceof Error&&v.name==='MonadicError'&&'path' in v}`
import {
  parse,
  extractTDoc,
  preprocess,
  transformExtensionCalls,
  stripLineComments,
} from '../parser'
import {
  transformEqualityToStructural,
  transformIsOperators,
} from '../parser-transforms'
import type {
  TypeDescriptor,
  ParameterDescriptor,
  PredicateVerification,
} from '../types'
import { inferTypeFromValue, parseParameter } from '../inference'
import { FORBIDDEN_KEYS } from '../../forbidden-keys'
import { extractTests } from '../tests'
import {
  runAllTests,
  extractSignatureTestInfos,
  extractReturnExampleFromSource,
} from './js-tests'
export { stripModuleSyntax, stripTjsPreamble } from './js-tests'
import { generateWasmBootstrap } from './js-wasm'
import {
  rewriteBoolCoercion,
  rewriteBoolCoercionInSource,
} from '../bool-coercion'

export interface TJSTranspileOptions {
  /** Filename for error messages */
  filename?: string
  /** Include source map comment */
  sourceMap?: boolean
  /** Mode: 'dev' | 'strict' | 'production' */
  mode?: 'dev' | 'strict' | 'production'
  /**
   * Source dialect — what kind of source this string is:
   * - `'tjs'` (default for a bare string): native TJS, footgun-removal modes ON
   *   (structural `==`, `TjsStandard`, etc.).
   * - `'js'`: plain JavaScript — modes OFF, `safety: 'none'`; the source's own
   *   semantics are preserved (no `==`→`Eq`, no truthiness rewrite, no input
   *   validation). Use this when feeding tjs() a vanilla `.js` string so it
   *   transpiles without changing meaning. See PRINCIPLES.md (TJS ⊇ JS).
   *
   * For TypeScript, use the `fromTS` entry point (TS → TJS → JS).
   */
  dialect?: 'js' | 'tjs'
  /**
   * Test execution mode:
   * - true (default): run tests at transpile time, throw on failure
   * - false: skip tests entirely (production build)
   * - 'only': only run tests, don't emit code (CI/test runner)
   * - 'report': run tests, report results in testResults, don't throw
   *             (caller decides whether to use the code based on results)
   */
  runTests?: boolean | 'only' | 'report'
  /**
   * Debug mode: include source locations in __tjs metadata
   * Enables better error messages with file:line:column info
   */
  debug?: boolean
  /**
   * Pre-resolved import code for test execution.
   * Map of import specifier to compiled JavaScript code.
   * Used when tests depend on imported modules.
   */
  resolvedImports?: Record<string, string>
  /**
   * Optional ModuleLoader for cross-file `wasm function` composition (Phase 3
   * of the wasm-library plan). When provided, `import { dot } from
   * 'tjs-lang/linalg'`-style imports are resolved at transpile time and any
   * matching `wasm function` declarations are composed into this file's
   * consolidated WebAssembly.Module. When omitted, imports are preserved
   * verbatim (default behavior — runtime resolves them).
   */
  moduleLoader?: any
}

/** Result of running tests at transpile time */
export type { TestResult } from './js-tests'
import type { TestResult } from './js-tests'

export interface TJSTranspileResult {
  /**
   * The TJS modes in effect for this transpilation (dialect + directives).
   * Lets downstream tooling (e.g. generateDTS's deep-partial emission for
   * TjsDictDefaults params) know the semantics without re-deriving them.
   */
  tjsModes?: import('../parser-types').TjsModes
  /** The transpiled JavaScript code */
  code: string
  /** Type information for the function(s) - Record of function name to type info */
  types: Record<string, TJSTypeInfo>
  /** Function metadata (alias for types, used by runtime) */
  metadata: Record<string, TJSTypeInfo>
  /** Any warnings during transpilation */
  warnings?: string[]
  /**
   * Per-`Type`/`Generic` predicate verification status: `verified` → compiled to
   * a fuel-bounded, DoS-safe native guard; `!verified` → fell back to a plain
   * function (valid, but not fuel-bounded / not safe on untrusted data — its
   * `reason` is the verifier diagnostic). Unverified entries are also mirrored
   * into `warnings`. Lets tools flag unverifiable predicates.
   */
  predicates?: PredicateVerification[]
  /** Generated test runner code (if tests were present) - DEPRECATED, tests now run at transpile time */
  testRunner?: string
  /** Number of tests extracted */
  testCount?: number
  /** Test results (when runTests is true or 'only') */
  testResults?: TestResult[]
  /** WASM compilation results (for debugging/inspection) */
  wasmCompiled?: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[]
}

export interface TJSTypeInfo {
  /** Function name */
  name: string
  /** Parameter types */
  params: Record<string, ParameterDescriptor>
  /** Return type */
  returns?: TypeDescriptor
  /** TDoc description */
  description?: string
  /** True if function uses destructured object param (the fast path) */
  isDestructuredParam?: boolean
  /** The shape of the destructured param (for inline validation) */
  destructuredShape?: Record<string, TypeDescriptor>
  /** Which fields in destructuredShape are required */
  destructuredRequired?: Set<string>
}

/**
 * Check if a param used `:` (required) or `=` (optional) in the raw source.
 * Finds the function's param list by name, then looks for `paramName:` vs `paramName =`.
 */
function isParamRequiredInSource(
  source: string,
  funcName: string,
  paramName: string
): boolean {
  if (!source || !funcName) return false
  // Find the function declaration and its param list
  const funcPattern = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*?\\b${paramName}\\s*([=:])`,
    's'
  )
  const match = source.match(funcPattern)
  if (!match) return false
  return match[1] === ':'
}

/**
 * Extract type info for a single function declaration
 */
function extractFunctionTypeInfo(
  func: FunctionDeclaration,
  originalSource: string,
  requiredParams: Set<string>,
  returnTypeStr: string | null,
  inputSource?: string
): { types: TJSTypeInfo; warnings: string[] } {
  const warnings: string[] = []

  // Extract TDoc (/*# ... */) comments
  const tdoc = extractTDoc(originalSource, func)

  // Build parameter type info
  const params: Record<string, ParameterDescriptor> = {}
  let isDestructuredParam = false
  let destructuredShape: Record<string, TypeDescriptor> | undefined
  let destructuredRequired: Set<string> | undefined

  // Check if this is a single destructured object param (the fast path)
  if (
    func.params.length === 1 &&
    (func.params[0].type === 'ObjectPattern' ||
      (func.params[0].type === 'AssignmentPattern' &&
        func.params[0].left.type === 'ObjectPattern'))
  ) {
    isDestructuredParam = true
    const param = func.params[0]
    const objectPattern =
      param.type === 'ObjectPattern' ? param : (param as any).left

    const paramInfo = parseParameter(objectPattern, requiredParams)
    if (paramInfo.type.kind === 'object' && paramInfo.type.destructuredParams) {
      destructuredShape = {}
      destructuredRequired = new Set()

      // Build shape and track required fields
      for (const [key, descriptor] of Object.entries(
        paramInfo.type.destructuredParams
      )) {
        params[key] = {
          ...descriptor,
          description: tdoc.params[key],
        }
        destructuredShape[key] = descriptor.type
        if (descriptor.required) {
          destructuredRequired.add(key)
        }
      }
    }
  } else {
    // Traditional param handling (multiple params or non-destructured)
    for (const param of func.params) {
      if (param.type === 'Identifier') {
        const paramInfo = parseParameter(param, requiredParams)
        params[param.name] = {
          ...paramInfo,
          required: requiredParams.has(param.name),
          description: tdoc.params[param.name],
        }
      } else if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier'
      ) {
        const paramInfo = parseParameter(param, requiredParams)
        // Determine if this param used `:` (required) or `=` (optional).
        // The global requiredParams set is name-based, which fails when
        // two functions share a param name with different syntax.
        // Use the raw input source to check the actual syntax.
        const isRequired = isParamRequiredInSource(
          inputSource || '',
          func.id?.name || '',
          param.left.name
        )
        params[param.left.name] = {
          ...paramInfo,
          required: isRequired,
          default: isRequired ? null : paramInfo.example ?? paramInfo.default,
          description: tdoc.params[param.left.name],
        }
      } else if (param.type === 'ObjectPattern') {
        // Handle destructured object parameters (non-single case)
        const paramInfo = parseParameter(param, requiredParams)
        if (
          paramInfo.type.kind === 'object' &&
          paramInfo.type.destructuredParams
        ) {
          for (const [key, descriptor] of Object.entries(
            paramInfo.type.destructuredParams
          )) {
            params[key] = {
              ...descriptor,
              description: tdoc.params[key],
            }
          }
        }
      } else if (
        param.type === 'RestElement' &&
        param.argument?.type === 'Identifier'
      ) {
        // Handle rest parameters: ...args: [0]
        // The type annotation was stripped by preprocessing (JS forbids
        // defaults on rest params), so extract it from the original source
        const restName = param.argument.name
        const restTypeMatch = originalSource.match(
          new RegExp(`\\.\\.\\.${restName}\\s*:\\s*([^)]+?)\\s*\\)`)
        )
        if (restTypeMatch) {
          try {
            const typeExpr = parseExpressionAt(restTypeMatch[1].trim(), 0, {
              ecmaVersion: 2022,
            })
            const restItemType = inferTypeFromValue(typeExpr as any)
            params[restName] = {
              name: restName,
              type: restItemType,
              required: false,
              description: tdoc.params[restName],
            }
          } catch {
            // If we can't parse the type, emit as any array
            params[restName] = {
              name: restName,
              type: { kind: 'array' },
              required: false,
              description: tdoc.params[restName],
            }
          }
        } else {
          // No type annotation — bare rest param
          params[restName] = {
            name: restName,
            type: { kind: 'array' },
            required: false,
            description: tdoc.params[restName],
          }
        }
      }
    }
  }

  // Parse return type if present
  let returns: TypeDescriptor | undefined
  if (returnTypeStr) {
    try {
      // Transform `key = value` (default keys) to `key: value` for acorn parsing
      const parsableReturnStr = returnTypeStr.includes('=')
        ? transformReturnDefaults(returnTypeStr)
        : returnTypeStr
      const returnExpr = parseExpressionAt(parsableReturnStr, 0, {
        ecmaVersion: 2022,
      })
      returns = inferTypeFromValue(returnExpr as any)
    } catch {
      // If we can't parse the return type, just store it as-is
      returns = { kind: 'any' }
      warnings.push(`Could not parse return type: ${returnTypeStr}`)
    }
  }

  // Build type info object
  const types: TJSTypeInfo = {
    name: func.id?.name || 'anonymous',
    params,
    returns,
    description: tdoc.description,
    isDestructuredParam,
    destructuredShape,
    destructuredRequired,
  }

  return { types, warnings }
}

/**
 * Generate inline validation code to be inserted at the start of a function body
 *
 * Implements proper monadic error handling:
 * 1. Check if any param is an Error - if so, pass it through (no work)
 * 2. Check types with fast inline typeof checks
 * 3. On type mismatch, call __tjs.typeError() (only on error path)
 *
 * @param funcName - Function name for error paths
 * @param types - Type information for the function
 * @param source - Source location (e.g., "src/utils.ts:42") for error reporting
 */
function generateInlineValidationCode(
  funcName: string,
  types: TJSTypeInfo,
  source?: string,
  dictDefaults = false
): { preamble: string; suffix: string } | null {
  const lines: string[] = []
  // Include source in path if available: "src/file.ts:42:funcName.param"
  const pathPrefix = source ? `${source}:` : ''
  const stackEntry = source ? `${source}:${funcName}` : funcName

  // Destructured params: validate each field of the input object
  if (types.isDestructuredParam && types.destructuredShape) {
    const shape = types.destructuredShape
    const requiredFields = types.destructuredRequired || new Set()
    const fieldNames = Object.keys(shape)

    if (fieldNames.length === 0) return null

    // 1. Error pass-through: check if any field is an Error
    for (const fieldName of fieldNames) {
      lines.push(`if (${fieldName} instanceof Error) return ${fieldName};`)
    }

    // 2. Type checks with proper error emission
    for (const [fieldName, fieldType] of Object.entries(shape)) {
      const isRequired = requiredFields.has(fieldName)
      const path = `${pathPrefix}${funcName}.${fieldName}`
      const typeCheck = generateTypeCheckExpr(fieldName, fieldType)

      if (typeCheck) {
        const expectedType = fieldType.kind
        if (isRequired) {
          lines.push(
            `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${fieldName});`
          )
          lines.push(...generateMemberCheckLines(fieldName, path, fieldType))
        } else {
          lines.push(
            `if (${fieldName} !== undefined && ${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${fieldName});`
          )
        }
      }
    }

    if (lines.length === 0) return null

    // pushStack is a no-op unless callStacks/debug is enabled at runtime.
    // No try/finally needed — the ring buffer tolerates missed popStack.
    lines.unshift(`__tjs.pushStack('${stackEntry}');`)

    return {
      preamble: lines.join('\n  '),
      suffix: '__tjs.popStack();',
    }
  }

  // Positional params: validate each param
  const params = Object.entries(types.params)
  if (params.length === 0) return null

  // 1. Error pass-through: check if any param is an Error
  for (const [paramName] of params) {
    lines.push(`if (${paramName} instanceof Error) return ${paramName};`)
  }

  // 2. Type checks with proper error emission
  // One uid counter shared across ALL dict-default params in this function —
  // each param's merge preamble declares `let __ddN…` at the function's top
  // level, so per-call counters would collide (two object-default params both
  // starting at __dd0 → duplicate `let`, a SyntaxError).
  const dictUid = { n: 0 }
  for (const [paramName, param] of params) {
    const path = `${pathPrefix}${funcName}.${paramName}`

    // For array params: if the array contains a MonadicError, propagate
    // the first one we find instead of failing the type check with
    // "expected array, got X". This is the "errors propagate, not
    // accumulate" rule — a function receiving an array of values where
    // one is an error should surface that error, not say the array's
    // shape is wrong.
    if (param.type.kind === 'array') {
      lines.push(
        `if (Array.isArray(${paramName})) { for (const __i of ${paramName}) { if (__i instanceof Error && __i.path !== undefined) return __i } }`
      )
    }

    const typeCheck = generateTypeCheckExpr(paramName, param.type)

    if (typeCheck) {
      const expectedType =
        param.type.kind === 'union'
          ? (param.type as any).members.map((m: any) => m.kind).join(' | ')
          : param.type.kind
      if (param.required) {
        lines.push(
          `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
        // Stage 0: colon-form object params get member-level checks (the
        // object-ness line above guards these accesses).
        lines.push(...generateMemberCheckLines(paramName, path, param.type))
      } else if (
        dictDefaults &&
        param.type.kind === 'object' &&
        param.type.shape &&
        param.default !== undefined &&
        param.default !== null &&
        typeof param.default === 'object' &&
        !Array.isArray(param.default)
      ) {
        // Stage 1 (TjsDictDefaults): `= {object literal}` params get
        // merge-on-partial. Replaces the shallow optional check entirely —
        // the merge validates object-ness and members itself.
        lines.push(
          ...generateDictMergeLines(
            paramName,
            path,
            param.type,
            param.default,
            dictUid
          )
        )
      } else {
        lines.push(
          `if (${paramName} !== undefined && ${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
      }
    }

    // If the param is a function with declared shape (e.g. `fn = (x: 0) => 0`),
    // wrap it so its arguments and return value are validated on every call.
    // Skipped when shape is unspecified or contains non-simple kinds.
    if (param.type.kind === 'function') {
      const shapeCheck = generateFunctionShapeCheck(paramName, param.type, path)
      if (shapeCheck) {
        lines.push(shapeCheck)
        // checkFnShape returns either the function unchanged or a
        // MonadicError. Re-check Error propagation after the assignment.
        lines.push(`if (${paramName} instanceof Error) return ${paramName};`)
      }
    }
  }

  if (lines.length === 0) return null

  // pushStack is a no-op unless callStacks/debug is enabled at runtime.
  // No try/finally needed — the ring buffer tolerates missed popStack.
  lines.unshift(`__tjs.pushStack('${stackEntry}');`)

  return {
    preamble: lines.join('\n  '),
    suffix: '__tjs.popStack();',
  }
}

/**
 * Transform `key = value` to `key: value` in a return type string
 * so acorn can parse it as a valid JS object expression.
 */
function transformReturnDefaults(str: string): string {
  let result = ''
  let depth = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      result += ch
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      result += ch
    } else if (ch === "'" || ch === '"' || ch === '`') {
      result += ch
      i++
      while (i < str.length && str[i] !== ch) {
        if (str[i] === '\\') result += str[i++]
        result += str[i++]
      }
      if (i < str.length) result += str[i]
    } else if (
      depth === 1 &&
      ch === '=' &&
      str[i - 1] !== '!' &&
      str[i + 1] !== '='
    ) {
      // Top-level = that isn't != or == — replace with :
      result += ':'
    } else {
      result += ch
    }
  }

  return result
}

/**
 * Extract the return type string for a specific function from source
 * Returns null if no return type found
 */
function extractFunctionReturnType(
  source: string,
  funcName: string
): string | null {
  // Match: function funcName(params): returnExample {
  // or: function funcName(params):? returnExample {
  // or: function funcName(params):! returnExample {
  const regex = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*\\)\\s*(:[?!]?)\\s*`,
    'g'
  )
  const match = regex.exec(source)
  if (!match) return null

  const afterMarker = source.slice(match.index + match[0].length)
  return extractReturnExampleFromSource(afterMarker)
}

/**
 * Extract return safety marker for a specific function from source
 * Returns 'safe' for :?, 'unsafe' for :!, undefined for : or no marker
 */
function extractFunctionReturnSafety(
  source: string,
  funcName: string
): 'safe' | 'unsafe' | undefined {
  const regex = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*\\)\\s*:([?!]?)`,
    'g'
  )
  const match = regex.exec(source)
  if (!match) return undefined

  const marker = match[1]
  if (marker === '?') return 'safe'
  if (marker === '!') return 'unsafe'
  return undefined // : is the default, no special safety flag
}

/**
 * Extract source file annotation from TJS source
 * Looks for: /★ tjs <- path/to/file.ts ★/ at the start (★ = *)
 */
function extractSourceFileAnnotation(source: string): string | undefined {
  const match = source.match(/^\/\*\s*tjs\s*<-\s*([^*]+?)\s*\*\//)
  return match ? match[1].trim() : undefined
}

/**
 * Extract line number annotation for a specific function
 * Looks for: /★ line N ★/ immediately before the function declaration
 */
function extractLineAnnotation(
  source: string,
  funcName: string
): number | undefined {
  // Match: /* line N */ followed by function declaration
  // Allow for async, whitespace variations
  const regex = new RegExp(
    `\\/\\*\\s*line\\s+(\\d+)\\s*\\*\\/\\s*(?:async\\s+)?function\\s+${funcName}\\s*\\(`,
    'm'
  )
  const match = source.match(regex)
  return match ? parseInt(match[1], 10) : undefined
}

/**
 * Transpile TJS source to JavaScript
 *
 * This function handles:
 * - Files with no functions (just statements/tests)
 * - Files with multiple functions
 * - Inline validation (no wrappers)
 * - __tjs metadata inserted immediately after each function
 */
export function transpileToJS(
  source: string,
  options: TJSTranspileOptions = {}
): TJSTranspileResult {
  const {
    filename = '<source>',
    runTests = true,
    debug = false,
    resolvedImports = {},
  } = options
  const warnings: string[] = []

  // Strip single-line comments early — apostrophes in comments (e.g. "don't")
  // confuse brace matching in test extraction and other transforms
  source = stripLineComments(source)

  // Extract source file annotation if present (from TS transpilation)
  const sourceFileAnnotation = extractSourceFileAnnotation(source)
  const effectiveFilename = sourceFileAnnotation || filename

  // Extract test/mock blocks before parsing (they're not valid JS)
  const { code: cleanSource, tests, mocks, testRunner } = extractTests(source)

  // Parse the cleaned source (handles TJS syntax like x: 'type' and : ReturnType)
  const {
    ast: program,
    originalSource,
    requiredParams,
    unsafeFunctions,
  } = parse(cleanSource, {
    filename,
    colonShorthand: true,
    dialect: options.dialect,
    moduleLoader: options.moduleLoader,
  })

  // Find ALL functions in the program
  const functions = findAllFunctions(program)

  // Preprocess source (handles TJS syntax transformations)
  // Pass through the moduleLoader so Phase 3 cross-file wasm composition
  // sees imported `wasm function` declarations.
  const preprocessed = preprocess(cleanSource, {
    dialect: options.dialect,
    moduleLoader: options.moduleLoader,
    filename,
  })

  // Mirror unverifiable Type/Generic predicates into `warnings` (they still
  // compile — as plain functions — but aren't fuel-bounded / safe on untrusted
  // data). The full per-predicate status is returned as `predicates`. Under the
  // explicit `TjsStrict` opt-in these escalate to a transpile error (the subset
  // invariant: warn by default, error only when the author asked for strict).
  const unverified = preprocessed.predicates.filter((p) => !p.verified)
  const predicateMsg = (p: PredicateVerification) =>
    `${p.kind} '${
      p.name
    }': predicate is not verifiable, compiled as a plain function (not fuel-bounded, not safe on untrusted data)${
      p.reason ? ` — ${p.reason.replace(/\s+/g, ' ').trim()}` : ''
    }`
  if (unverified.length && preprocessed.tjsModes.tjsStrict) {
    throw new Error(
      `TjsStrict: ${
        unverified.length
      } predicate(s) could not be verified:\n${unverified
        .map((p) => `  ${predicateMsg(p)}`)
        .join('\n')}`
    )
  }
  for (const p of unverified) warnings.push(predicateMsg(p))
  const predicateReport = preprocessed.predicates.length
    ? preprocessed.predicates
    : undefined

  // Apply the same source-level equality transforms to extracted test/mock
  // bodies so they observe the module's TJS semantics (e.g. structural ==).
  // Test bodies are extracted as raw text before parse(), so they would
  // otherwise run with native JS == coercion regardless of TjsEquals mode.
  for (const t of tests) {
    t.body = transformIsOperators(t.body)
    if (preprocessed.tjsModes.tjsEquals) {
      t.body = transformEqualityToStructural(t.body)
    }
    if (preprocessed.tjsModes.tjsStandard) {
      t.body = rewriteBoolCoercionInSource(t.body)
    }
  }
  for (const m of mocks) {
    m.body = transformIsOperators(m.body)
    if (preprocessed.tjsModes.tjsEquals) {
      m.body = transformEqualityToStructural(m.body)
    }
    if (preprocessed.tjsModes.tjsStandard) {
      m.body = rewriteBoolCoercionInSource(m.body)
    }
  }

  // Build types map for all functions
  const allTypes: Record<string, TJSTypeInfo> = {}

  // Collect insertions: { position, text } to be applied in reverse order
  const insertions: { position: number; text: string }[] = []
  // Collect deletions for | union suffixes in param defaults
  // e.g. `x = false | undefined` -> `x = false` (the `| undefined` is type-only)
  const deletions: { start: number; end: number }[] = []

  // Process each function
  for (const func of functions) {
    const funcName = func.id?.name || 'anonymous'

    // Extract return type for this specific function from original source
    const returnTypeStr = extractFunctionReturnType(cleanSource, funcName)

    // Extract default values from return type (e.g. { value: 0, error = '' })
    let returnDefaults: Record<string, unknown> | undefined
    if (returnTypeStr && returnTypeStr.includes('=')) {
      try {
        const defaultsMatch = returnTypeStr.matchAll(/(\w+)\s*=\s*/g)
        const transformed = transformReturnDefaults(returnTypeStr)
        const parsed = new Function(`return ${transformed}`)()
        const defaults: Record<string, unknown> = {}
        for (const m of defaultsMatch) {
          const key = m[1]
          if (key in parsed) defaults[key] = parsed[key]
        }
        if (Object.keys(defaults).length > 0) returnDefaults = defaults
      } catch {
        // If parsing fails, skip defaults
      }
    }

    // Extract type info for this function
    const { types, warnings: funcWarnings } = extractFunctionTypeInfo(
      func,
      originalSource,
      requiredParams,
      returnTypeStr,
      cleanSource
    )
    warnings.push(...funcWarnings)
    allTypes[funcName] = types

    // Cross-reference inference: when a parameter default is a bare
    // identifier referring to a previously-declared TJS function, use that
    // function's signature as the parameter's type. So
    //
    //   function strLength(s: ''): 0 { ... }
    //   function map(arr: [''], counter = strLength) { ... }
    //
    // makes `counter`'s type `(s: string) => integer` (instead of `any`),
    // which means the checkFnShape pass-time check fires when a wrong-
    // shape callback is passed at the call site.
    for (const param of func.params) {
      if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier' &&
        param.right.type === 'Identifier'
      ) {
        const localName = param.left.name
        const refName = (param.right as any).name as string
        const refInfo = allTypes[refName]
        if (refInfo && types.params[localName]) {
          const fnParams = Object.entries(refInfo.params).map(([n, p]) => ({
            name: n,
            type: p.type,
          }))
          const fnReturns =
            (refInfo as any).returns ?? ({ kind: 'any' } as TypeDescriptor)
          types.params[localName].type = {
            kind: 'function',
            params: fnParams,
            returns: fnReturns,
          }
        }
      }
    }

    // Clean up param defaults in the emitted JS.
    // After colon→equals transform, `x: false | undefined` becomes
    // `x = false | undefined` in the parsed source.
    // - For required params (`:` syntax), strip the entire `= value` — there's
    //   no JS default for required params, the value is a type annotation only.
    // - For union defaults, strip just the `| suffix` to avoid bitwise OR.
    for (const param of func.params) {
      if (param.type === 'AssignmentPattern') {
        const paramName =
          (param as any).left?.name || (param as any).left?.value
        const paramInfo = paramName ? types.params[paramName] : null

        if (paramInfo?.required && paramInfo.default === null) {
          // Required param — strip entire `= value` from JS output
          deletions.push({
            start: (param as any).left.end,
            end: (param as any).right.end,
          })
        } else {
          // Optional param with union — strip just the `| suffix`
          const right = (param as any).right
          if (right.type === 'BinaryExpression' && right.operator === '|') {
            deletions.push({ start: right.left.end, end: right.end })
          }
        }
      }
    }

    // Determine safety options
    // Module-level "safety none" makes ALL functions unsafe (no validation)
    const isUnsafe =
      preprocessed.moduleSafety === 'none' || unsafeFunctions.has(funcName)
    const isSafe = preprocessed.safeFunctions.has(funcName)
    // Extract return safety per-function from original source
    const returnSafety = extractFunctionReturnSafety(cleanSource, funcName)

    // Get source location - prefer line annotation from TS transpilation
    const annotatedLine = extractLineAnnotation(source, funcName)
    const funcLoc = {
      file: effectiveFilename,
      line: annotatedLine ?? func.loc?.start.line ?? 0,
      column: func.loc?.start.column ?? 0,
    }

    const safetyOptions = {
      unsafe: isUnsafe,
      safe: isSafe,
      returnSafety,
    }

    // Check if this is a polymorphic dispatcher
    const isPolymorphicDispatcher = preprocessed.polymorphicNames.has(funcName)

    // Generate __tjs metadata (to insert after function)
    let typeMetadata: string
    if (isPolymorphicDispatcher) {
      // Build composite metadata referencing variants
      const variantNames: string[] = []
      for (const f of functions) {
        const fn = f.id?.name || ''
        if (fn.startsWith(funcName + '$')) variantNames.push(fn)
      }
      const metadata: any = {
        polymorphic: true,
        variants: variantNames,
      }
      if (funcLoc) {
        metadata.source = `${funcLoc.file}:${funcLoc.line}`
      }
      typeMetadata = `${funcName}.__tjs = ${JSON.stringify(metadata, null, 2)}`
    } else {
      typeMetadata = generateTypeMetadata(funcName, types, safetyOptions, {
        debug,
        source: funcLoc,
        returnDefaults,
      })
    }

    // Queue insertion of __tjs after function closing brace
    insertions.push({
      position: func.end,
      text: `\n${typeMetadata}`,
    })

    // Generate inline validation (to insert at start of function body)
    // Skip for unsafe functions and polymorphic dispatchers (they handle routing)
    if (!isUnsafe && !isPolymorphicDispatcher) {
      const sourceStr = `${funcLoc.file}:${funcLoc.line}`
      const validation = generateInlineValidationCode(
        funcName,
        types,
        sourceStr,
        preprocessed.tjsModes.tjsDictDefaults
      )
      if (validation && func.body && func.body.start !== undefined) {
        // Insert preamble right after the opening brace
        insertions.push({
          position: func.body.start + 1,
          text: `\n  ${validation.preamble}\n`,
        })
        if (validation.suffix) {
          insertions.push({
            position: func.body.end - 1,
            text: `\n  ${validation.suffix}\n`,
          })
        }
      }
    }
  }

  // Boolean coercion rewrite (TjsStandard). Rewrites every truthiness
  // context (`if`, `while`, `for`, `do/while`, `!`, `&&`, `||`, `?:`,
  // and `Boolean(x)` calls) to call `__tjs.toBool` so boxed primitives
  // unwrap before coercion. See src/lang/bool-coercion.ts.
  if (preprocessed.tjsModes.tjsStandard) {
    const boolPatches = rewriteBoolCoercion(program, preprocessed.source)
    for (const p of boolPatches) {
      deletions.push({ start: p.start, end: p.end })
      insertions.push({ position: p.start, text: p.newText })
    }
  }

  // Apply deletions first (reverse order to maintain offsets), then insertions.
  // Deletions strip | union suffixes from param defaults in the output JS.
  deletions.sort((a, b) => b.start - a.start)
  let code = preprocessed.source
  for (const { start, end } of deletions) {
    code = code.slice(0, start) + code.slice(end)
  }

  // Adjust insertion positions for any deletions that shifted offsets
  for (const ins of insertions) {
    let shift = 0
    for (const del of deletions) {
      if (del.start < ins.position) {
        shift += del.end - del.start
      }
    }
    ins.position -= shift
  }

  // Apply insertions in reverse position order
  insertions.sort((a, b) => b.position - a.position)
  for (const { position, text } of insertions) {
    code = code.slice(0, position) + text + code.slice(position)
  }

  // Add __tjs reference for monadic error handling and structural equality
  // Use createRuntime() for isolated state per-module
  const needsTypeError = code.includes('__tjs.typeError(')
  const needsStack = code.includes('__tjs.pushStack(')
  const needsIs = code.includes('Is(')
  const needsIsNot = code.includes('IsNot(')
  const needsEq = code.includes('Eq(')
  const needsNotEq = code.includes('NotEq(')
  const needsTypeOf = code.includes('TypeOf(')
  // Type system constructors (from Type/Generic/FunctionPredicate/Enum/Union declarations)
  const needsType = /\bType\(/.test(code)
  const needsGeneric = /\bGeneric\(/.test(code)
  const needsFunctionPredicate = /\bFunctionPredicate\(/.test(code)
  const needsEnum = /\bEnum\(/.test(code)
  const needsUnion = /\bUnion\(/.test(code)
  // `.toJSONSchema()` / `.strip()` on a runtime type — only inline the
  // example→schema helper for files that actually call them.
  const needsExampleSchema = /\.(toJSONSchema|strip)\(/.test(code)
  const needsBang = code.includes('__tjs.bang(')
  // checkFnShape and bang both build MonadicErrors, so they pull in the core too
  const needsMonadicCore =
    needsTypeError ||
    code.includes('__tjs.checkFnShape(') ||
    code.includes('__tjs.bang(')
  const needsToBool = code.includes('__tjs.toBool(')
  const needsCheckFnShape = code.includes('__tjs.checkFnShape(')
  const needsSafeEval = preprocessed.tjsModes.tjsSafeEval

  const needsRuntime =
    needsTypeError ||
    needsStack ||
    needsIs ||
    needsIsNot ||
    needsEq ||
    needsNotEq ||
    needsTypeOf ||
    needsType ||
    needsGeneric ||
    needsFunctionPredicate ||
    needsEnum ||
    needsUnion ||
    needsBang ||
    needsToBool ||
    needsCheckFnShape ||
    needsSafeEval

  if (needsRuntime) {
    // Build standalone preamble — emitted JS must work without any setup.
    // Use globalThis.__tjs if available (shared runtime), otherwise inline
    // a minimal self-contained runtime. Only includes functions actually used.
    const inlineParts: string[] = []

    // Core: MonadicError + typeError + isMonadicError.
    //
    // checkFnShape and bang also need these, and each used to inline its own
    // copy behind `if (!needsTypeError)` — three identical copies of the same
    // source string. Nothing forced them to stay in sync, and if a file ever
    // needed checkFnShape AND bang without typeError, both would have declared
    // `class MonadicError` in the same scope (a SyntaxError). Pushed once, from
    // one definition, so neither drift nor collision is possible.
    if (needsMonadicCore) {
      inlineParts.push(
        INLINE_MONADIC_ERROR,
        INLINE_TYPE_ERROR,
        INLINE_IS_MONADIC_ERROR
      )
    }

    // Stack tracking
    if (needsStack) {
      inlineParts.push(
        `const __stack=[];function pushStack(n){__stack.push(n)}function popStack(){__stack.pop()}function getStack(){return[...__stack]}`
      )
    }

    // Eq/NotEq (honest equality)
    if (needsEq) {
      inlineParts.push(
        `function Eq(a,b){if(a instanceof String||a instanceof Number||a instanceof Boolean)a=a.valueOf();if(b instanceof String||b instanceof Number||b instanceof Boolean)b=b.valueOf();if(a===b)return true;if(typeof a==='number'&&typeof b==='number'&&isNaN(a)&&isNaN(b))return true;if((a===null||a===undefined)&&(b===null||b===undefined))return true;return false}`
      )
    }
    if (needsNotEq) {
      inlineParts.push(`function NotEq(a,b){return!Eq(a,b)}`)
    }

    // TypeOf (honest typeof)
    if (needsTypeOf) {
      inlineParts.push(`function TypeOf(v){return v===null?'null':typeof v}`)
    }

    // Is/IsNot (structural equality)
    if (needsIs) {
      // #21: past depth 8, __goIs memoizes visited (a,b) pairs (revisit ⇒
      // equal) so shared-reference graphs compare in bounded time instead of
      // O(2^depth), and distinct-but-cyclic graphs terminate instead of
      // overflowing the stack. The threshold keeps flat/shallow compares
      // allocation-free. Mirrors runtime.ts goIs — the two must stay in
      // algorithmic sync (dag-safety.test.ts guards both).
      inlineParts.push(
        `const tjsEquals=Symbol.for('tjs.equals');function Is(a,b){return __goIs(a,b,0,null)}function __goIs(a,b,d,m){if(a!=null&&typeof a==='object'&&typeof a[tjsEquals]==='function')return a[tjsEquals](b);if(b!=null&&typeof b==='object'&&typeof b[tjsEquals]==='function')return b[tjsEquals](a);if(a!=null&&typeof a==='object'&&typeof a.Equals==='function')return a.Equals(b);if(b!=null&&typeof b==='object'&&typeof b.Equals==='function')return b.Equals(a);if(a instanceof String||a instanceof Number||a instanceof Boolean)a=a.valueOf();if(b instanceof String||b instanceof Number||b instanceof Boolean)b=b.valueOf();if(a===b)return true;if(typeof a==='number'&&typeof b==='number'&&isNaN(a)&&isNaN(b))return true;if((a==null)&&(b==null))return true;if(a==null||b==null)return false;if(typeof a!==typeof b)return false;if(typeof a!=='object')return false;if(d>=8){if(m===null)m=new WeakMap();let s=m.get(a);if(s){if(s.has(b))return true}else{s=new WeakSet();m.set(a,s)}s.add(b)}if(a instanceof Set&&b instanceof Set){if(a.size!==b.size)return false;for(const v of a)if(!b.has(v))return false;return true}if(a instanceof Map&&b instanceof Map){if(a.size!==b.size)return false;for(const[k,v]of a)if(!b.has(k)||!__goIs(v,b.get(k),d+1,m))return false;return true}if(a instanceof Date&&b instanceof Date)return a.getTime()===b.getTime();if(a instanceof RegExp&&b instanceof RegExp)return a.toString()===b.toString();if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return false;return a.every((v,i)=>__goIs(v,b[i],d+1,m))}if(Array.isArray(a)!==Array.isArray(b))return false;const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;return ka.every(k=>__goIs(a[k],b[k],d+1,m))}`
      )
    }
    if (needsIsNot) {
      inlineParts.push(`function IsNot(a,b){return!Is(a,b)}`)
    }

    // Type system constructors — these need tosijs-schema for full
    // functionality but we provide a working fallback.
    //
    // NOTE these are ALWAYS used, even when a shared runtime is installed: the
    // emitted code calls them bare, and these declarations shadow. Do not
    // "improve" that into `const Type = globalThis.__tjs?.Type ?? …` without
    // reconciling the two implementations first — they are not drop-in
    // equivalents, and swapping silently changes behavior. The real `Type`
    // THROWS on `Type(description)` with no example where the stub is permissive,
    // and the real `FunctionPredicate.check()` returns an error message where the
    // stub returns `false`. Same source, different answers, depending only on
    // whether a runtime happened to be installed.
    //
    // The consequence to be aware of: the stubs carry none of the real type's API
    // (no `.toJSONSchema()`, no `.strip()`), so emitted code cannot use it. That
    // is why examples/json-schema.tjs imports the standalone
    // `functionMetaToJSONSchema` from `tjs-lang/lang` rather than calling
    // `Type(…).toJSONSchema()`.
    // `.toJSONSchema()` / `.strip()` — derived purely from the example value, so
    // the stub can carry them without tosijs-schema. A TJS type that survives to
    // runtime but can't describe itself there isn't much of a runtime type; this
    // is the whole "types are examples that survive" claim, and it did not work
    // from inside .tjs code at all (examples/json-schema.tjs died on
    // `User.toJSONSchema is not a function`). Emitted only when actually used, so
    // files that don't ask for a schema pay nothing.
    if (needsExampleSchema) {
      inlineParts.push(
        `function __ex2js(v){if(v===null)return{type:'null'};if(v===undefined)return{};const t=typeof v;if(t==='string')return{type:'string'};if(t==='number')return Number.isInteger(v)?{type:'integer'}:{type:'number'};if(t==='boolean')return{type:'boolean'};if(Array.isArray(v))return v.length?{type:'array',items:__ex2js(v[0])}:{type:'array'};if(t==='object'){const p={},r=[];for(const k of Object.keys(v)){p[k]=__ex2js(v[k]);r.push(k)}return{type:'object',properties:p,required:r,additionalProperties:false}}return{}}`
      )
    }
    if (needsType) {
      // `check` matches the value against the EXAMPLE, structurally.
      //
      // It used to be `typeof v === typeof ex`, which for an object example means
      // *any* object passes: `User.check({ name: 'Alice' })` returned true for a
      // type requiring name+age+email. A validator that answers "yes" to everything
      // is worse than no validator — examples/json-schema.tjs printed
      // "Missing field: true" and looked like it worked.
      inlineParts.push(
        `function __match(v,ex){if(ex===null)return v===null;if(ex===undefined)return true;const t=typeof ex;if(t==='string'||t==='number'||t==='boolean')return typeof v===t;if(Array.isArray(ex)){if(!Array.isArray(v))return false;return ex.length?v.every(x=>__match(x,ex[0])):true}if(t==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return false;return Object.keys(ex).every(k=>k in v&&__match(v[k],ex[k]))}return v===ex}`
      )
      const typeExtras = needsExampleSchema
        ? `t.toJSONSchema=()=>t.__ex===undefined?{}:__ex2js(t.__ex);t.strip=v=>{const ex=t.__ex;if(!ex||typeof ex!=='object'||!v||typeof v!=='object')return v;const o={};for(const k of Object.keys(ex))if(k in v)o[k]=v[k];return o};`
        : ''
      inlineParts.push(
        `function Type(d,p,e){const t={description:d,__runtimeType:true};if(typeof p==='function'){t.check=p;t.default=e??null}else{const ex=e??p;t.default=ex;t.__ex=ex;t.check=v=>__match(v,ex)}${typeExtras}return t}`
      )
    }
    if (needsGeneric) {
      // A generic's predicate receives (value, ...typeChecks) — its type params
      // arrive as CHECK FUNCTIONS, not as the raw type arguments. That is the
      // whole point of the form:
      //
      //   Generic Box<T> { predicate(obj, T) { … && T(obj.value) } }
      //   const StringBox = Box('')
      //
      // The real `Generic` (src/types/Type.ts) runs each type argument through
      // `typeParamToCheck` first. This fallback used to spread the raw args
      // straight into the predicate, so `T` was the string `''` and calling it
      // threw "checkT is not a function" — every generic in emitted standalone
      // code was dead on arrival (examples/generic-demo.tjs).
      //
      // The inline runtime has no tosijs-schema, so an example value checks by
      // `typeof`, exactly as the inline `Type` fallback above does. A RuntimeType
      // defers to its own `.check`; a bare predicate function is used as-is.
      inlineParts.push(
        `function Generic(tp,pred,d){const c=a=>{if(a===null||a===undefined)return()=>true;if(a.__runtimeType&&typeof a.check==='function')return v=>a.check(v)===true;if(typeof a==='function')return v=>a(v)===true;return v=>typeof v===typeof a};const f=(...args)=>{const ck=args.map(c);const t={description:d||'generic',__runtimeType:true,check:v=>pred(v,...ck)};return t};f.__runtimeType=true;f.description=d;return f}`
      )
    }
    if (needsFunctionPredicate) {
      inlineParts.push(
        `function FunctionPredicate(n,s,b){if(Array.isArray(s)&&b){const f=(...a)=>FunctionPredicate(n,b(...a));f.typeParamNames=s.map(p=>Array.isArray(p)?p[0]:p);f.description=n;f.__runtimeType=true;return f}const spec=typeof s==='function'?{}:s||{};return{description:n,params:spec.params||{},returns:spec.returns,returnContract:spec.returnContract||'assertReturns',check:v=>typeof v==='function',__runtimeType:true}}`
      )
    }
    // An enum/union is a closed set of values, so its schema is just that set.
    const setSchema = needsExampleSchema
      ? `,toJSONSchema:()=>({enum:vals})`
      : ''
    if (needsEnum) {
      inlineParts.push(
        `function Enum(d,m){const vals=typeof m==='object'?Object.values(m):[];return{description:d,check:v=>vals.includes(v),values:vals,__runtimeType:true${setSchema}}}`
      )
    }
    if (needsUnion) {
      inlineParts.push(
        `function Union(d,...v){const vals=v.flat();return{description:d,check:x=>vals.includes(x),values:vals,__runtimeType:true${setSchema}}}`
      )
    }
    // toBool — honest truthiness (unwraps boxed primitives)
    if (needsToBool) {
      inlineParts.push(
        `function toBool(v){if(v instanceof Boolean||v instanceof Number||v instanceof String)return Boolean(v.valueOf());return Boolean(v)}`
      )
    }

    // checkFnShape — pass-time shape check for function-typed params
    // (MonadicError/typeError already inlined above via needsMonadicCore)
    if (needsCheckFnShape) {
      inlineParts.push(
        `function checkFnShape(fn,expectedParams,expectedReturn,path){if(typeof fn!=='function')return fn;const meta=fn.__tjs;if(!meta||!meta.params)return fn;const entries=Object.entries(meta.params);for(let i=0;i<expectedParams.length;i++){const e=expectedParams[i];if(e==='any')continue;const a=entries[i];if(!a)continue;const ak=a[1]&&a[1].type&&a[1].type.kind;if(!ak||ak==='any')continue;if(ak!==e)return new MonadicError("Expected (...arg"+i+": "+e+", ...) for '"+path+"', but callback declares arg"+i+" as "+ak,path+"(arg"+i+")",e,ak)}if(expectedReturn!=='any'&&meta.returns){const ar=(meta.returns.type&&meta.returns.type.kind)||meta.returns.kind;if(ar&&ar!=='any'&&ar!==expectedReturn)return new MonadicError("Expected callback returning "+expectedReturn+" for '"+path+"', but callback returns "+ar,path+"(return)",expectedReturn,ar)}return fn}`
      )
    }

    // Bang access (!.) — asserted non-null member access
    // (MonadicError/typeError already inlined above via needsMonadicCore)
    if (needsBang) {
      inlineParts.push(
        `function bang(o,p){if(o===null||o===undefined)return typeError('bang.'+p,'non-null',o);if(isMonadicError(o))return o;return o[p]}`
      )
    }

    // Build preamble: inline functions are declared at module scope,
    // then __tjs either uses the shared runtime or references the inlined ones.
    const inlineBlock =
      inlineParts.length > 0 ? inlineParts.join(';\n') + ';\n' : ''

    // Build __tjs object from inlined functions (fallback when no shared runtime)
    const fallbackEntries: string[] = []
    // One source of truth: whoever pulled in the core gets it in the fallback.
    if (needsMonadicCore) fallbackEntries.push('typeError', 'isMonadicError')
    if (needsStack) fallbackEntries.push('pushStack', 'popStack', 'getStack')
    if (needsEq) fallbackEntries.push('Eq')
    if (needsNotEq) fallbackEntries.push('NotEq')
    if (needsTypeOf) fallbackEntries.push('TypeOf')
    if (needsIs) fallbackEntries.push('Is', 'tjsEquals')
    if (needsIsNot) fallbackEntries.push('IsNot')
    if (needsType) fallbackEntries.push('Type')
    if (needsGeneric) fallbackEntries.push('Generic')
    if (needsFunctionPredicate) fallbackEntries.push('FunctionPredicate')
    if (needsEnum) fallbackEntries.push('Enum')
    if (needsUnion) fallbackEntries.push('Union')
    if (needsToBool) fallbackEntries.push('toBool')
    if (needsCheckFnShape) fallbackEntries.push('checkFnShape')
    if (needsBang) fallbackEntries.push('bang')

    const fallbackObj =
      fallbackEntries.length > 0
        ? `{${fallbackEntries.join(',')}}`
        : 'undefined'

    const preamble =
      inlineBlock +
      `const __tjs = globalThis.__tjs?.createRuntime?.() ?? ${fallbackObj};\n`

    code = preamble + code
  }

  // Add Eval/SafeFunction import when TjsSafeEval directive is present
  if (needsSafeEval) {
    code = `import { Eval, SafeFunction } from 'tjs-lang';\n` + code
  }

  // Run tests at transpile time if enabled
  let testResults: TestResult[] | undefined

  if (runTests) {
    // Extract signature tests info (doesn't execute yet)
    const sigTestInfos = extractSignatureTestInfos(source)

    // Run all tests in a single execution context
    testResults = runAllTests(
      tests,
      mocks,
      sigTestInfos,
      code,
      resolvedImports,
      preprocessed.extensions
    )

    // Check for failures and throw only if runTests === true (strict mode)
    // 'only' and 'report' modes return results without throwing.
    // Inconclusive results (a test that couldn't *run* — undefined refs like AJS
    // atoms, or a module the harness can't execute) never block transpilation:
    // that would turn subset-legal code illegal. See PRINCIPLES.md.
    const failures = testResults.filter((r) => !r.passed && !r.inconclusive)
    if (failures.length > 0 && runTests === true) {
      const errorLines = failures.map((f) => {
        if (f.isSignatureTest) {
          return `  Function signature example is inconsistent:\n    ${f.error}`
        }
        const loc = f.line ? ` (line ${f.line})` : ''
        return `  Test '${f.description}'${loc} failed:\n    ${f.error}`
      })
      throw new Error(`Transpile-time test failures:\n${errorLines.join('\n')}`)
    }
  }

  // If runTests === 'only', return minimal result
  if (runTests === 'only') {
    return {
      code: '',
      types: allTypes,
      metadata: allTypes,
      testResults,
      testCount: testResults?.length,
      predicates: predicateReport,
    }
  }

  // Compile WASM blocks at transpile time and embed in output
  let wasmCompiled:
    | { id: string; success: boolean; error?: string; byteLength?: number }[]
    | undefined
  if (preprocessed.wasmBlocks.length > 0) {
    const wasmBootstrap = generateWasmBootstrap(preprocessed.wasmBlocks)
    if (wasmBootstrap.code) {
      code = wasmBootstrap.code + '\n' + code
    }
    wasmCompiled = wasmBootstrap.results
    // Surface WASM compile failures as warnings (they were only in
    // `wasmCompiled` before, so a `wasm{}` block that can't compile fell back to
    // its `fallback{}` SILENTLY — the worst failure mode for a perf feature).
    // The full status stays on `wasmCompiled`; this just makes it visible.
    for (const w of wasmCompiled) {
      if (!w.success) {
        warnings.push(
          `wasm{} block '${
            w.id
          }' did not compile — running the fallback{} (JS)${
            w.error ? `: ${w.error}` : ''
          }`
        )
      }
    }
    // Compile-time wasm lints (e.g. i32/i32 integer division — UI-#4).
    for (const w of wasmBootstrap.warnings) warnings.push(`wasm{}: ${w}`)
  }

  return {
    code,
    types: allTypes,
    metadata: allTypes, // alias for runtime compatibility
    warnings: warnings.length > 0 ? warnings : undefined,
    predicates: predicateReport,
    testRunner: tests.length > 0 ? testRunner : undefined,
    testCount: tests.length > 0 ? tests.length : undefined,
    testResults,
    wasmCompiled,
    tjsModes: preprocessed.tjsModes,
  }
}

/**
 * Find ALL function declarations in the AST
 * Includes functions inside export declarations
 */
function findAllFunctions(program: Program): FunctionDeclaration[] {
  const functions: FunctionDeclaration[] = []

  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration') {
      functions.push(node)
    } else if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration'
    ) {
      functions.push(node.declaration as FunctionDeclaration)
    } else if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration'
    ) {
      functions.push(node.declaration as FunctionDeclaration)
    }
  }

  return functions
}

/**
 * Serialize a TypeDescriptor to JSON-compatible object
 * Preserves full type structure (shape, items, members)
 */
function serializeType(t: TypeDescriptor): any {
  const result: any = { kind: t.kind }
  if (t.nullable) result.nullable = true
  if (t.items) result.items = serializeType(t.items)
  if (t.shape) {
    result.shape = Object.fromEntries(
      Object.entries(t.shape).map(([k, v]) => [k, serializeType(v)])
    )
  }
  if (t.members) result.members = t.members.map(serializeType)
  return result
}

/**
 * Safety options for metadata generation
 */
interface SafetyOptions {
  /** Function marked with (!) - never validate inputs */
  unsafe?: boolean
  /** Function marked with (?) - always validate inputs */
  safe?: boolean
  /** Return type safety: 'safe' (:?) or 'unsafe' (:!) */
  returnSafety?: 'safe' | 'unsafe'
}

/**
 * Debug options for metadata generation
 */
interface DebugOptions {
  /** Include source locations in metadata */
  debug?: boolean
  /** Source location of the function */
  source?: {
    file: string
    line: number
    column: number
  }
  /** Default values for optional return type keys */
  returnDefaults?: Record<string, unknown>
}

/**
 * Generate type metadata code
 *
 * @param funcName - Function name
 * @param types - Type information
 * @param safety - Safety flags for the function
 * @param debugOpts - Debug options (source locations)
 */
function generateTypeMetadata(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {},
  debugOpts: DebugOptions = {}
): string {
  const paramsObj: Record<string, any> = {}

  for (const [name, param] of Object.entries(types.params)) {
    paramsObj[name] = {
      type: serializeType(param.type),
      required: param.required,
    }
    if (param.default !== undefined) {
      paramsObj[name].default = param.default
    }
    if (param.description) {
      paramsObj[name].description = param.description
    }
  }

  const metadata: any = {
    params: paramsObj,
  }

  if (types.returns) {
    metadata.returns = {
      type: serializeType(types.returns),
    }
    if (debugOpts.returnDefaults) {
      metadata.returns.defaults = debugOpts.returnDefaults
    }
    // Add return safety flags
    if (safety.returnSafety === 'safe') {
      metadata.safeReturn = true // :? forces output validation
    } else if (safety.returnSafety === 'unsafe') {
      metadata.unsafeReturn = true // :! skips output validation
    }
  }

  if (types.description) {
    metadata.description = types.description
  }

  // Mark unsafe functions - they skip runtime input validation
  if (safety.unsafe) {
    metadata.unsafe = true
  }

  // Mark safe functions - they force runtime input validation
  if (safety.safe) {
    metadata.safe = true
  }

  // Always include source location for error reporting
  if (debugOpts.source) {
    const { file, line } = debugOpts.source
    metadata.source = `${file}:${line}`
  }

  return `${funcName}.__tjs = ${JSON.stringify(metadata, null, 2)}`
}

/**
 * Check if this function can use inline validation (the fast path)
 *
 * Two patterns qualify:
 * 1. Single destructured object param: function foo({ x: 0, y: '' }) { ... }
 * 2. Single named object param: function foo(input: { x: 0, y: '' }) { ... }
 *
 * These can be validated with fast inline checks instead of schema interpretation.
 */
function canUseInlineValidation(types: TJSTypeInfo): boolean {
  // Destructured params always qualify
  if (types.isDestructuredParam && types.destructuredShape) {
    return true
  }

  // Any function with params can use inline validation
  // (we generate typeof checks for primitives too)
  return Object.keys(types.params).length > 0
}

/**
 * Generate inline validation code for single-arg object types
 *
 * This is ~20x faster than schema-based validation because:
 * 1. No schema interpretation at runtime
 * 2. No object iteration
 * 3. JIT can inline the checks
 *
 * Generated code looks like:
 *   if (typeof input !== 'object' || input === null ||
 *       typeof input.x !== 'number' ||
 *       typeof input.y !== 'number') {
 *     return __tjs.typeError('funcName.input', 'object', input)
 *   }
 */
export function generateInlineValidation(
  funcName: string,
  paramName: string,
  shape: Record<string, TypeDescriptor>,
  requiredFields: Set<string>
): string {
  const checks: string[] = []
  const path = `${funcName}.${paramName}`

  // Check it's an object
  checks.push(`typeof ${paramName} !== 'object'`)
  checks.push(`${paramName} === null`)

  // Check each field
  for (const [fieldName, fieldType] of Object.entries(shape)) {
    const fieldPath = `${paramName}.${fieldName}`
    const isRequired = requiredFields.has(fieldName)

    const typeCheck = generateTypeCheck(fieldPath, fieldType)
    if (typeCheck) {
      if (isRequired) {
        // Required: must exist and have correct type
        checks.push(typeCheck)
      } else {
        // Optional: only check type if defined
        checks.push(`(${fieldPath} !== undefined && ${typeCheck})`)
      }
    }
  }

  if (checks.length === 0) return ''

  return `if (${checks.join(' || ')}) {
  return __tjs.typeError('${path}', 'object', ${paramName})
}`
}

/**
 * Generate a type check expression for a single field
 * Returns null if no check needed (e.g., 'any' type)
 */
/**
 * Generate a type check expression for a single field
 * Returns an expression that evaluates to true when type is INVALID
 * Returns null if no check needed (e.g., 'any' type)
 */
/**
 * Stage 1 of dictionary defaults (docs/dictionary-defaults.md): the
 * TjsDictDefaults mode. `(args = {x: 0, y: 0})` in native tjs gets
 * WebIDL-dictionary semantics — per-member defaults with merge-on-partial —
 * emitted as SHAPE-SPECIALIZED code (Spike B: the generic walker costs ~2x the
 * hand-written merge; specialization is how the feature reaches parity while
 * also validating).
 *
 * The JS signature default is kept: by the time this preamble runs, a missing/
 * undefined argument has already become a fresh full literal (JS evaluates
 * default expressions per call), which IS the spec's §5.5 no-arg semantics.
 * The preamble therefore only: validates object-ness, scans members
 * (validate present / fill absent from inlined literals), rejects
 * prototype-pollution keys, strips excess keys (with a once-per-site
 * flight-recorder notice), and rebuilds — or, when the payload is complete
 * and clean, leaves it untouched (identity, zero allocation — I3).
 *
 * Fills are INLINED literals (JSON of the parsed default value), so every fill
 * is fresh by construction — there is no shared template object to corrupt
 * (the spec's hoisted-template + deep-freeze machinery is unnecessary in the
 * specialized path; I1/I2 hold by construction).
 */
function assertPureDictTemplate(
  displayPath: string,
  type: TypeDescriptor,
  template: any
): void {
  const ALLOWED = new Set([
    'string',
    'number',
    'integer',
    'non-negative-integer',
    'boolean',
    'null',
    'array',
    'object',
  ])
  if (type.kind !== 'object' || !type.shape) return
  for (const [key, member] of Object.entries(type.shape)) {
    const mpath = `${displayPath}.${key}`
    const impure =
      !ALLOWED.has(member.kind) ||
      template === null ||
      typeof template !== 'object' ||
      !(key in template)
    if (impure) {
      throw new Error(
        `Dictionary default for '${mpath}' must be a pure literal — ` +
          `member '${key}' is not a clonable literal value. Compute impure ` +
          `values inside the function body, or use a colon-form (required) ` +
          `parameter. (TjsDictDefaults mode; disable with TjsCompat or ` +
          `dialect: 'js'.)`
      )
    }
    if (member.kind === 'object' && member.shape) {
      assertPureDictTemplate(mpath, member, template[key])
    }
  }
}

function generateDictMergeLines(
  paramName: string,
  displayPath: string,
  type: TypeDescriptor,
  template: any,
  uidCounter: { n: number }
): string[] {
  assertPureDictTemplate(displayPath, type, template)
  const lines: string[] = []
  const uid = () => `__dd${uidCounter.n++}`

  // Post-JS-default, the param is never undefined — check object-ness flat out.
  lines.push(
    `if (typeof ${paramName} !== 'object' || ${paramName} === null || Array.isArray(${paramName})) return __tjs.typeError('${displayPath}', 'object', ${paramName});`
  )
  emitDictLevel(
    paramName,
    displayPath,
    type.shape!,
    template,
    lines,
    uid,
    paramName,
    null
  )
  return lines
}

function emitDictLevel(
  access: string,
  displayPath: string,
  shape: Record<string, TypeDescriptor>,
  template: any,
  lines: string[],
  uid: () => string,
  reassignTarget: string,
  parentChangedVar: string | null
): void {
  const keys = Object.keys(shape)
  const declaredCount = keys.length
  const p = uid()

  // Own-key census: prototype-pollution rejection + excess detection without
  // allocating (the excess-key COLLECTION only runs on the cold strip path).
  lines.push(`let ${p}n = 0;`)
  const forbiddenCheck = FORBIDDEN_KEYS.map(
    (k) => `${p}k === ${JSON.stringify(k)}`
  ).join(' || ')
  lines.push(
    `for (const ${p}k in ${access}) { if (Object.prototype.hasOwnProperty.call(${access}, ${p}k)) { if (${forbiddenCheck}) return __tjs.typeError('${displayPath}.' + ${p}k, 'safe key', ${p}k); ${p}n++; } }`
  )
  lines.push(`let ${p}f = 0;`)
  lines.push(`let ${p}c = false;`)

  const memberVars: Array<[string, string]> = []
  for (const key of keys) {
    const member = shape[key]
    const identSafe = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    const acc = identSafe
      ? `${access}.${key}`
      : `${access}[${JSON.stringify(key)}]`
    const mpath = `${displayPath}.${key}`
    const v = uid()
    memberVars.push([key, v])
    const fillLiteral = JSON.stringify(template[key])

    lines.push(`let ${v} = ${acc};`)
    lines.push(
      `if (${v} === undefined) { ${v} = ${fillLiteral}; ${p}f++; ${p}c = true; }`
    )

    if (member.kind === 'object' && member.shape) {
      lines.push(
        `else if (typeof ${v} !== 'object' || ${v} === null || Array.isArray(${v})) return __tjs.typeError('${mpath}', 'object', ${v});`
      )
      lines.push(`else {`)
      emitDictLevel(
        v,
        mpath,
        member.shape,
        template[key],
        lines,
        uid,
        v,
        `${p}c`
      )
      lines.push(`}`)
    } else if (member.kind === 'null') {
      // §5.2: example-null member admits any value (nullable any) — no check.
    } else {
      const check = generateTypeCheckExpr(v, member)
      if (check) {
        lines.push(
          `else if (${check}) return __tjs.typeError('${mpath}', '${member.kind}', ${v});`
        )
      }
    }
  }

  // Rebuild when anything filled/changed, or when excess keys must be
  // stripped. Complete clean payloads fall through untouched (I3).
  const excessExpr = `${p}n > ${declaredCount} - ${p}f`
  const declaredMiss = keys
    .map((k) => `${p}k3 !== ${JSON.stringify(k)}`)
    .join(' && ')
  const rebuild = `{ ${memberVars
    .map(([k, v]) =>
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
        ? `${k}: ${v}`
        : `${JSON.stringify(k)}: ${v}`
    )
    .join(', ')} }`
  lines.push(`if (${p}f > 0 || ${p}c || ${excessExpr}) {`)
  // Once-per-site excess notice — the flight-recorder discipline: record
  // liberally, never change behavior; once per site, never per call.
  // displayPath embeds file:line, so it is globally unique per site.
  lines.push(
    `  if ((${excessExpr}) && !(globalThis.__tjsDDNoticed ??= new Set()).has('${displayPath}')) {`
  )
  lines.push(`    const ${p}x = [];`)
  lines.push(
    `    for (const ${p}k3 in ${access}) if (Object.prototype.hasOwnProperty.call(${access}, ${p}k3) && ${declaredMiss}) ${p}x.push(${p}k3);`
  )
  // Only record (and consume the once-guard) when there are REAL excess keys.
  // The count-based excessExpr also fires for a present-but-undefined member
  // (counted as a payload key AND as filled), which would otherwise emit a
  // spurious "excess key(s) [] stripped" notice with an empty list.
  lines.push(`    if (${p}x.length > 0) {`)
  lines.push(`      globalThis.__tjsDDNoticed.add('${displayPath}');`)
  lines.push(
    `      __tjs.record?.({ source: 'type', severity: 'notice', message: "excess key(s) [" + ${p}x.join(', ') + "] stripped at '${displayPath}' (dictionary defaults)", data: { path: '${displayPath}', keys: ${p}x } });`
  )
  lines.push(`    }`)
  lines.push(`  }`)
  lines.push(`  ${reassignTarget} = ${rebuild};`)
  if (parentChangedVar) lines.push(`  ${parentChangedVar} = true;`)
  lines.push(`}`)
}

/**
 * Stage 0 of dictionary defaults (docs/dictionary-defaults.md): member-level
 * checks for REQUIRED (colon-form) object params.
 *
 * `args: {x: 0, y: 0}` has always documented a member contract, but the
 * emitted check was typeof-only — partials, wrong member types, and garbage
 * members passed while the full shape sat unused in fn.__tjs.params (measured
 * 2026-07-18). These lines enforce it, one statement per member so every error
 * carries a precise path ('fn.args.pos.y'), mirroring typeMatches / the
 * inline Type.check semantics: declared members required + type-checked,
 * EXCESS members ignored (excess policy belongs to the merge mode, OQ2).
 *
 * Scope: required params only. The `=` form is JS-legal syntax and keeps
 * atomic-JS default semantics until the merge MODE lands (spec §3) — do not
 * extend this to defaulted params without that gating.
 *
 * Ordering matters: the caller emits the parent object-ness check FIRST, and
 * nested member lines recurse after their own object-ness line, so deeper
 * accesses (`args.pos.x`) are always guarded by an earlier return.
 */
function generateMemberCheckLines(
  accessExpr: string,
  displayPath: string,
  type: TypeDescriptor
): string[] {
  const lines: string[] = []
  if (type.kind !== 'object' || !type.shape) return lines
  for (const [key, memberType] of Object.entries(type.shape)) {
    const identSafe = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    const memberExpr = identSafe
      ? `${accessExpr}.${key}`
      : `${accessExpr}[${JSON.stringify(key)}]`
    const memberPath = `${displayPath}.${key}`
    const check = generateTypeCheckExpr(memberExpr, memberType)
    if (check) {
      const expected =
        memberType.kind === 'union'
          ? (memberType as any).members.map((m: any) => m.kind).join(' | ')
          : memberType.kind
      lines.push(
        `if (${check}) return __tjs.typeError('${memberPath}', '${expected}', ${memberExpr});`
      )
    }
    if (memberType.kind === 'object' && memberType.shape) {
      lines.push(
        ...generateMemberCheckLines(memberExpr, memberPath, memberType)
      )
    }
  }
  return lines
}

function generateTypeCheckExpr(
  fieldPath: string,
  type: TypeDescriptor
): string | null {
  let check: string | null

  switch (type.kind) {
    case 'string':
      check = `typeof ${fieldPath} !== 'string'`
      break
    case 'number':
      check = `typeof ${fieldPath} !== 'number'`
      break
    case 'integer':
      check = `(typeof ${fieldPath} !== 'number' || !Number.isInteger(${fieldPath}))`
      break
    case 'non-negative-integer':
      check = `(typeof ${fieldPath} !== 'number' || !Number.isInteger(${fieldPath}) || ${fieldPath} < 0)`
      break
    case 'boolean':
      check = `typeof ${fieldPath} !== 'boolean'`
      break
    case 'null':
      return `${fieldPath} !== null` // nullable doesn't apply to null itself
    case 'undefined':
      return `${fieldPath} !== undefined`
    case 'array': {
      // Always require an Array. If item type is known and non-trivial,
      // also validate every item — `arr: [0]` means "array of integers",
      // not "any array". Without this, a function returning
      // `[MonadicError, MonadicError]` would pass the `: [0]` return-
      // type check (it's an array) and surface a confusing array-of-
      // errors to the caller.
      const itemCheck =
        type.items && type.items.kind !== 'any'
          ? generateTypeCheckExpr('__a', type.items)
          : null
      if (itemCheck) {
        check = `(!Array.isArray(${fieldPath}) || ${fieldPath}.some(__a => ${itemCheck}))`
      } else {
        check = `!Array.isArray(${fieldPath})`
      }
      break
    }
    case 'object':
      // For nested objects, just check it's an object (deep validation is separate)
      check = `(typeof ${fieldPath} !== 'object' || ${fieldPath} === null || Array.isArray(${fieldPath}))`
      break
    case 'function':
      // Shape isn't validated at call time (we don't introspect arity or
      // call the function with probes) — just check it IS callable.
      check = `typeof ${fieldPath} !== 'function'`
      break
    case 'union': {
      const checks = (type as any).members
        .map((m: TypeDescriptor) => generateTypeCheckExpr(fieldPath, m))
        .filter((c: string | null) => c !== null)
      if (checks.length === 0) return null
      check = `(${checks.join(' && ')})`
      break
    }
    case 'any':
      return null // No check needed
    default:
      return null
  }

  // If type is nullable, allow null to pass
  if (check && type.nullable) {
    check = `(${fieldPath} !== null && ${check})`
  }

  return check
}

// Alias for backward compatibility with other functions that use this
const generateTypeCheck = generateTypeCheckExpr

/** Kinds checkType can validate by string name (no RuntimeType needed). */
const SIMPLE_KINDS = new Set([
  'string',
  'number',
  'integer',
  'non-negative-integer',
  'boolean',
  'function',
  'any',
  'undefined',
  'null',
  'object', // checkType handles this via typeof
])

/**
 * Generate a `__tjs.checkFnShape(...)` call that validates a passed-in
 * function's declared shape against the expected shape ONCE at pass time.
 * On mismatch the param is reassigned to a MonadicError; the existing
 * `if (param instanceof Error) return param` check above handles
 * propagation. On match the param is unchanged. Untyped functions
 * (no `__tjs` metadata — anonymous arrows) pass through unchanged.
 *
 * Returns null when the expected shape can't be represented as simple
 * TypeSpec strings, or when there's nothing useful to check (all-`any`).
 */
function generateFunctionShapeCheck(
  paramName: string,
  type: TypeDescriptor,
  path: string
): string | null {
  const fnParams = (type.params ?? []) as Array<{
    name: string
    type: TypeDescriptor
  }>
  const fnReturns = type.returns ?? { kind: 'any' as const }
  const paramKinds = fnParams.map((p) => p.type?.kind)
  const allSimple =
    paramKinds.every((k) => k && SIMPLE_KINDS.has(k)) &&
    SIMPLE_KINDS.has(fnReturns.kind)
  const hasUsefulCheck =
    paramKinds.some((k) => k !== 'any') || fnReturns.kind !== 'any'
  if (!allSimple || !hasUsefulCheck) return null
  const paramTypesJson = JSON.stringify(paramKinds)
  return `if (typeof ${paramName} === 'function') ${paramName} = __tjs.checkFnShape(${paramName}, ${paramTypesJson}, '${fnReturns.kind}', '${path}');`
}

/**
 * Generate the complete function wrapper with inline validation
 *
 * For destructured object params, this generates:
 *
 *   const _original_funcName = funcName
 *   funcName = function(__input) {
 *     if (typeof __input !== 'object' || __input === null || ...) {
 *       return __tjs.typeError('funcName.input', 'object', __input)
 *     }
 *     return _original_funcName.call(this, __input)
 *   }
 *
 * For single named object params, same pattern with the actual param name.
 */
export function generateInlineWrapper(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {}
): string | null {
  // Check if we can use inline validation
  if (!canUseInlineValidation(types)) return null

  // Unsafe functions don't need wrappers
  if (safety.unsafe) return null

  // Destructured params: use __input as the wrapper param name
  if (types.isDestructuredParam && types.destructuredShape) {
    const paramName = '__input'
    const shape = types.destructuredShape
    const requiredFields = types.destructuredRequired || new Set()

    const validation = generateInlineValidation(
      funcName,
      paramName,
      shape,
      requiredFields
    )
    if (!validation) return null

    return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramName}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramName})
}
`.trim()
  }

  // Positional params path (primitives or single object param)
  const params = Object.entries(types.params)

  // Check if it's a single object param with shape
  if (params.length === 1) {
    const [paramName, param] = params[0]
    if (param.type.kind === 'object' && param.type.shape) {
      // Single named object param
      const shape = param.type.shape
      const requiredFields = new Set<string>()
      for (const [fieldName] of Object.entries(shape)) {
        requiredFields.add(fieldName)
      }

      const validation = generateInlineValidation(
        funcName,
        paramName,
        shape,
        requiredFields
      )
      if (!validation) return null

      return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramName}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramName})
}
`.trim()
    }
  }

  // Generate validation for positional primitive params
  const validation = generatePositionalValidation(funcName, params)
  if (!validation) return null

  const paramNames = params.map(([name]) => name).join(', ')
  return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramNames}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramNames})
}
`.trim()
}

/**
 * Generate validation for positional (primitive) params
 */
function generatePositionalValidation(
  funcName: string,
  params: [string, ParameterDescriptor][]
): string | null {
  const lines: string[] = []

  for (const [paramName, param] of params) {
    const typeCheck = generateTypeCheck(paramName, param.type)
    if (typeCheck) {
      const path = `${funcName}.${paramName}`
      const expectedType = param.type.kind
      if (param.required) {
        lines.push(
          `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
      } else {
        lines.push(
          `if (${paramName} !== undefined && ${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
      }
    }
  }

  if (lines.length === 0) return null

  return lines.join('\n  ')
}

// =============================================================================
// Transpile-time Test Execution
// =============================================================================

/**
 * Fuzzy comparison for floating point numbers
 */
