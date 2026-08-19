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
import { parseExpressionAt, parse as acornParse } from 'acorn'
import * as walk from 'acorn-walk'

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
const INLINE_TYPE_ERROR = `function __arrKinds(v){if(!v.length)return'empty array';const k=[],n=Math.min(v.length,64);for(let i=0;i<n;i++){const x=v[i],t=x===null?'null':Array.isArray(x)?'array':typeof x;if(!k.includes(t))k.push(t);if(k.length===4)return'array of '+k.join(' | ')}return'array of '+k.join(' | ')+(v.length>64?' …':'')}
function typeError(p,e,v,r){const a=v===null?'null':Array.isArray(v)?__arrKinds(v):typeof v;const m=r?'Expected '+e+" for '"+p+"': "+r:'Expected '+e+" for '"+p+"', got "+a;const err=new MonadicError(m,p,e,a,undefined,r);const g=globalThis.__tjs;const c=g?.getConfig?.();try{g?.record?.({source:'type',severity:'error',message:err.message,error:err})}catch{}if(c?.logTypeErrors)console.error('[TJS TypeError] '+err.message);if(c?.throwTypeErrors)throw err;return err}`

const INLINE_IS_MONADIC_ERROR = `function isMonadicError(v){return v instanceof Error&&v.name==='MonadicError'&&'path' in v}`
import { parse, extractTDoc, preprocess, stripLineComments } from '../parser'

import {
  transformEqualityToStructural,
  transformIsOperators,
} from '../parser-transforms'
import type {
  TypeDescriptor,
  ParameterDescriptor,
  PredicateVerification,
} from '../types'
import { isDictDefaultParam } from '../types'
import {
  inferTypeFromValue,
  parseParameter,
  typeNameExample,
} from '../inference'
import { FORBIDDEN_KEYS } from '../../forbidden-keys'
import { maskLiterals, maskLiteralsKeepComments } from '../../strip-comments'
import { UNWRAP_BOXED_SOURCE } from '../../unwrap-boxed'
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

/** A key safe to emit as `base.key` (else it must be bracket-accessed). */
const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/
/** Emit member access, dot for ident-safe keys, bracket (JSON-quoted) otherwise. */
function memberAccess(base: string, key: string): string {
  return IDENT_RE.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`
}
/** Emit an object-literal key, bare for ident-safe keys, JSON-quoted otherwise. */
function propKey(key: string): string {
  return IDENT_RE.test(key) ? key : JSON.stringify(key)
}

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
/**
 * The hoisted-`var` sentinel proving a declared type's binding has been INITIALISED.
 *
 * See the `case 'declared'` guard: `typeof X` throws for a `const` in TDZ, so it could not
 * be used to ask "is this ready yet". A `var` can — it exists (as `undefined`) from scope
 * entry, so reading it early is falsy instead of fatal.
 */
/**
 * Parameter names of `func` whose rewritten default carries `marker`.
 *
 * Reads the text between each parameter's `=` and its value in the source acorn actually
 * parsed. Positional, so two functions sharing a parameter name and a literal cannot be
 * confused for each other — the defect that made `function grow(factor = 1)` lose its
 * default because some other function wrote `factor: 1`.
 */
function markedParams(
  func: { params?: any[] },
  offsets: Set<number> | undefined
): Set<string> {
  const found = new Set<string>()
  if (!offsets?.size) return found
  const consider = (name: string | undefined, _left: any, right: any) => {
    if (!name || !right || typeof right.start !== 'number') return
    if (offsets.has(right.end)) found.add(name)
  }
  for (const param of func.params ?? []) {
    const pattern =
      param?.type === 'AssignmentPattern' &&
      param.left?.type === 'ObjectPattern'
        ? param.left
        : param
    if (pattern?.type === 'ObjectPattern') {
      for (const prop of pattern.properties ?? []) {
        if (prop.type !== 'Property') continue
        if (prop.value?.type !== 'AssignmentPattern') continue
        consider(
          prop.key?.name ?? prop.key?.value,
          prop.value.left,
          prop.value.right
        )
      }
    } else if (param?.type === 'AssignmentPattern') {
      consider(param.left?.name, param.left, param.right)
    }
  }
  return found
}

function sentinelName(typeName: string): string {
  return `__tjs_has_${typeName.replace(/[^A-Za-z0-9_$]/g, '_')}`
}

/**
 * Extract type info for a single function declaration
 */
/** `number[]` -> `[0.0]` for a rest annotation; `null` when not an array suffix. */
function restTypeSuffix(type: string): string | null {
  const t = type.trim()
  if (!t.endsWith('[]')) return null
  const inner = t.slice(0, -2).trim()
  if (!inner) return null
  const nested = restTypeSuffix(inner)
  if (nested !== null) return `[${nested}]`
  const example = typeNameExample(inner)
  return example ? `[${example}]` : null
}

function extractFunctionTypeInfo(
  func: FunctionDeclaration,
  originalSource: string,
  requiredParams: Set<string>,
  returnTypeStr: string | null,
  inputSource?: string,
  declaredTypes?: Set<string>,
  requiredValueOffsets?: Set<number>
): { types: TJSTypeInfo; warnings: string[] } {
  const warnings: string[] = []

  // Which of THIS function's parameters are required, read from the marker the parser
  // wrote between the `=` and the value.
  //
  // Module-wide sets cannot answer this. Keyed by name they collided across functions;
  // keyed by name plus value text they still collided on ordinary code — `factor: 1` in
  // one function and `factor = 1` in another are the same key, so a legitimate default was
  // deleted. A marker is positional by construction: each parameter carries its own
  // answer, so nothing can reach across functions.
  const localRequired = markedParams(func, requiredValueOffsets)

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

    const paramInfo = parseParameter(objectPattern, localRequired)
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
        const paramInfo = parseParameter(param, localRequired)
        params[param.name] = {
          ...paramInfo,
          required: localRequired.has(param.name),
          description: tdoc.params[param.name],
        }
      } else if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier'
      ) {
        const paramInfo = parseParameter(param, localRequired)
        // Did this param use `:` (required) or `=` (optional)?
        //
        // This used to re-read the ORIGINAL source with a regex anchored on
        // `function NAME(`, because the module-wide `requiredParams` set was name-keyed
        // and could not tell two functions apart. That regex could not match an ARROW at
        // all, so `const f = (n: 0) => …` was always "not required": the colon example
        // silently became a JS default and `f()` returned 0 where the identical
        // `function g(n: 0)` returned a MonadicError. It was also `[^)]*?`-bounded and
        // literal-blind, so a default containing `)` broke it.
        //
        // `localRequired` is the same channel, now keyed by name AND value text and
        // narrowed to this function (see B1). It works for declarations, arrows, function
        // expressions and methods alike, because it asks the parser rather than
        // re-guessing from source shape.
        const isRequired = localRequired.has(param.left.name)
        params[param.left.name] = {
          ...paramInfo,
          required: isRequired,
          default: isRequired ? null : paramInfo.example ?? paramInfo.default,
          description: tdoc.params[param.left.name],
        }
      } else if (param.type === 'ObjectPattern') {
        // Handle destructured object parameters (non-single case)
        const paramInfo = parseParameter(param, localRequired)
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
            // `T[]` needs the same rewrite the param transform applies to ordinary
            // annotations. A rest param's type is read from the ORIGINAL source (JS
            // forbids defaults on rest params, so the annotation is stripped rather than
            // rewritten), which meant `...xs: number[]` arrived here unrewritten, failed
            // to parse, and fell through to the bare-`array` catch — accepting `['x']`.
            // `...xs: [0]` worked all along, so this was never a rest-param gap: it was
            // `T[]`.
            const restSrc =
              restTypeSuffix(restTypeMatch[1].trim()) ?? restTypeMatch[1].trim()
            const typeExpr = parseExpressionAt(restSrc, 0, {
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

  // Best-effort degradation should TEACH, not just happen silently.
  //
  // TJS implements the sound parts of TypeScript and best-efforts the rest — but a
  // parameter that quietly became `any` is exactly the failure the "types survive to
  // runtime" pitch exists to prevent, and the user has no way to know it happened.
  // So say so, and point at the ladder that gets the safety back:
  //
  //   foo: number  → validates (sound TS type)
  //   foo: 3       → validates AND is a worked example
  //   foo: 3.0     → same, as a float
  //   Predicate    → arbitrary constraints, checked at runtime, composable
  //
  // Worked suggestions rather than prose is deliberate: measured, a remedy shown as
  // code repaired 80% where the same advice as prose repaired 50% and a bare
  // diagnostic 0% (ASSUMPTIONS.md A1, experiments/agent-legibility).
  for (const [name, descriptor] of Object.entries(params)) {
    // `unresolved` is set only when an annotation DEGRADED; an explicit `any`
    // carries no marker, because honouring `any` isn't a degradation.
    const annotated = descriptor.type?.unresolved
    // A name declared in THIS module as `Type X {…}` is not unresolved — it is the most
    // resolved thing in the file. It used to degrade anyway, so a verified, fuel-bounded
    // predicate sat one line above a function that named it and checked nothing, while the
    // warning helpfully suggested declaring the Type the file had already declared.
    if (annotated && declaredTypes?.has(String(annotated))) {
      descriptor.type = { kind: 'declared', typeName: String(annotated) }
      continue
    }
    if (annotated) {
      warnings.push(
        `'${name}: ${annotated}' could not be resolved to a runtime type, so it is ` +
          `unchecked (best effort). For real runtime safety give an example ` +
          `(${name}: 3), a sound type (${name}: number), or a predicate:\n` +
          `  Type ${
            String(annotated).replace(/\W/g, '') || 'Thing'
          } { predicate(v) { return typeof v === 'object' && v !== null } }`
      )
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
        const expectedType = expectedLabel(fieldType)
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

    // The ring buffer tolerates a missed popStack, so no try/finally is needed — the
    // suffix below is emitted after the `return` and does not run on the happy path.
    //
    // (This comment used to add "pushStack is a no-op unless callStacks/debug is enabled
    // at runtime". True of `lang/runtime.ts`, and false of the inline stub that emitted
    // code actually calls — which was neither gated nor, until recently, bounded. See
    // `inline-stack.test.ts`.)
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
      // A declared Type reports its NAME, a union its members — see `expectedLabel`.
      const expectedType = expectedLabel(param.type)
      if (param.required) {
        lines.push(
          `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
        // Stage 0: colon-form object params get member-level checks (the
        // object-ness line above guards these accesses).
        lines.push(...generateMemberCheckLines(paramName, path, param.type))
      } else if (
        dictDefaults &&
        isDictDefaultParam(param.type, param.default)
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

  // The ring buffer tolerates a missed popStack (the suffix is emitted after the
  // `return`), so no try/finally is needed. NOT a no-op in a standalone file: the inline
  // stub always runs there — see `inline-stack.test.ts`.
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
 * Locate a named function's signature — declaration, arrow, or function expression — and
 * return the `:` return annotation that follows its parameter list.
 *
 * This replaces two regexes that were both anchored on `function\s+NAME\s*\([^)]*\)`,
 * and so shared two defects:
 *
 *   - An ARROW never matched. `const h = (n: 0): 0 => n * 2` got no `returns` metadata,
 *     no signature test, and no `:?` return wrapper — the annotation was parsed by the
 *     preprocessor and thrown away, silently. Arrows are most of real TypeScript.
 *   - `[^)]*` cannot cross a `)`, so a default containing one (`(a = f(1)): 0`) ended the
 *     match early and the annotation was missed. It was also literal-blind.
 *
 * Scans a MASKED view so a signature quoted in a string or comment is not one, and matches
 * the parameter list by balanced parens rather than by "characters that are not `)`".
 */
function findSignatureReturn(
  source: string,
  funcName: string
): { type: string | null; safety: 'safe' | 'unsafe' | undefined } {
  const masked = maskLiterals(source)
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // `function NAME(` or `const/let/var NAME = (` — the second covers arrows and function
  // expressions alike, since both put the parameter list right after the `=`.
  //
  // `,` joins the declarator alternatives so a NON-FIRST declarator is reachable:
  // `const a = 1, mk = (x: 0): 0 => x` bound nothing at all, because the pattern demanded
  // `const` immediately before the name.
  const anchor = new RegExp(
    `(?:function\\s+${escaped}\\s*\\(|(?:const|let|var|,)\\s*${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\()`,
    'g'
  )
  // EVERY match is tried, not just the first.
  //
  // A single `exec` took whichever anchor appeared earliest in the file, so an unrelated
  // same-named binding in another scope stole it —
  // `function outer() { const helper = (a) => a }` before `function helper(x: 0): 0`
  // silently cost the real `helper` its `returns` metadata, its `:?` wrapper and its
  // safety marker, with `tjs check` reporting the file clean. A thief has no signature to
  // find, so trying the next candidate costs nothing and recovers the right one.
  //
  // (Anchoring on the acorn node would be more direct, but the node's offsets are relative
  // to the PREPROCESSED source while this reads `cleanSource`, and preprocessing is not
  // length-preserving.)
  for (const m of masked.matchAll(anchor)) {
    const found = readSignatureAt(source, masked, m.index! + m[0].length)
    if (found.type !== null || found.safety !== undefined) return found
  }
  return { type: null, safety: undefined }
}

/** Read `): <example>` starting just past an opening paren, or report nothing. */
function readSignatureAt(
  source: string,
  masked: string,
  from: number
): { type: string | null; safety: 'safe' | 'unsafe' | undefined } {
  // Balanced scan from the opening paren.
  let depth = 1
  let i = from
  while (i < masked.length && depth > 0) {
    const c = masked[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    i++
  }
  if (depth !== 0) return { type: null, safety: undefined }

  while (i < masked.length && /\s/.test(masked[i])) i++
  if (masked[i] !== ':') return { type: null, safety: undefined }
  i++
  let safety: 'safe' | 'unsafe' | undefined
  if (masked[i] === '?') {
    safety = 'safe'
    i++
  } else if (masked[i] === '!') {
    safety = 'unsafe'
    i++
  }
  while (i < masked.length && /\s/.test(masked[i])) i++
  // Read the example from the ORIGINAL source — masking blanks literal contents, and a
  // return example is very often a literal.
  return { type: extractReturnExampleFromSource(source.slice(i)), safety }
}

function extractFunctionReturnType(
  source: string,
  funcName: string
): string | null {
  return findSignatureReturn(source, funcName).type
}

/**
 * Extract return safety marker for a specific function from source
 * Returns 'safe' for :?, 'unsafe' for :!, undefined for : or no marker
 */
function extractFunctionReturnSafety(
  source: string,
  funcName: string
): 'safe' | 'unsafe' | undefined {
  return findSignatureReturn(source, funcName).safety
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

  // Mode violations that are FLAGGED rather than rejected (unsafe `new Function`, the
  // numeric Date statics). They reach the caller as warnings so tooling and the converter
  // can surface them at the site — "turn all doubt into guidance".
  warnings.push(...preprocessed.modeWarnings)

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
      cleanSource,
      preprocessed.declaredTypes,
      preprocessed.requiredValueOffsets
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
      // Members of a DESTRUCTURED param get the same rule, and used not to: this loop only
      // ever walked top-level params, and `{a: 2, b: 3}` is one ObjectPattern — so every
      // member kept its `= value` and `:` (required) was unenforceable. `f({a: 2})` with a
      // required `b` returned 5 instead of a MonadicError, because `b` had silently
      // defaulted to its own example. The example is a TYPE and a worked value; it is not a
      // default, and conflating the two makes "required" mean nothing in the one parameter
      // shape people actually destructure.
      if (param.type === 'ObjectPattern') {
        for (const prop of (param as any).properties ?? []) {
          if (prop.type !== 'Property') continue
          const key = prop.key?.name ?? prop.key?.value
          if (!key) continue
          if (prop.value?.type !== 'AssignmentPattern') continue
          // Positional, not a module-wide key: `function a({x: 2})` used to delete the
          // default out of `function b({x = 2})` — same name, same literal, same key.
          if (!preprocessed.requiredValueOffsets.has(prop.value.right.end))
            continue
          // `{ b = 3 }` where b was written `b: 3` → emit `{ b }` and let the generated
          // `typeof b !== …` check fire on absence, which it already does correctly.
          deletions.push({
            start: prop.value.left.end,
            end: prop.value.right.end,
          })
        }
        continue
      }

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
          const right = (param as any).right
          // Optional param with union — strip just the `| suffix`
          if (right.type === 'BinaryExpression' && right.operator === '|') {
            deletions.push({ start: right.left.end, end: right.end })
          } else if (
            right.type === 'Identifier' &&
            preprocessed.typeNameValueOffsets.has(right.end)
          ) {
            // Optional param annotated with a bare TYPE NAME: `n?: number`.
            //
            // The colon shorthand rewrites that to `n = number`, which is right when the
            // annotation is an example (`n?: 0` → `n = 0`) and a DANGLING IDENTIFIER when
            // it is a type — so `g()` threw `number is not defined` at call time. Emitted
            // JavaScript that throws on the happy path, from the single most common shape
            // a TypeScript author pastes.
            //
            // The annotation cannot be dropped earlier: that same string feeds the acorn
            // parse, and inference reads the identifier to learn the type, so stripping it
            // in the parser would silently degrade the param to `any`. Deleting it HERE
            // keeps the type and emits the correct JS — `function g(n)`, whose parameter
            // is genuinely optional, which is exactly what `n?: number` means.
            //
            // Driven by the parser's `typeNameOptionals` set, NOT by inspecting the
            // identifier: `n?: MyThing` and `x = someVar` produce byte-identical AST, and
            // only the parser knows which was an annotation. Testing the name instead
            // deleted genuine JS defaults that happened to reference a variable.
            //
            // The generated check already handles it: `n !== undefined && typeof n !== …`.
            deletions.push({ start: (param as any).left.end, end: right.end })
          }
        }
      }
    }

    // Determine safety options
    // Module-level "safety none" makes ALL functions unsafe (no validation)
    // `unsafeFunctions` is keyed by NAME, and only the `function` branch of the param
    // transform records it — an arrow has no name at that stage, so `(! a: 0)` was
    // dropped. That was harmless while arrows went unvalidated and became a real bug the
    // moment they didn't: the marker asks for NO checks and got them anyway.
    //
    // The transform already leaves `/* unsafe */` in the parameter list, so read that
    // rather than thread binding names back through the parser — it is the same fact,
    // recorded where both sides can see it.
    //
    // Scanned over `maskLiteralsKeepComments`, NOT raw text. A plain `.includes` here read
    // the marker out of a STRING, so `function h(n: 0, s = '/* unsafe */')` emitted no
    // validation at all for `n`, while the same function without the literal validates.
    // Identical for a template default, and for a nested arrow's default — where it
    // disarmed the OUTER function. This is the literal-blindness class in the one place
    // where getting it wrong turns checks OFF rather than merely garbling output.
    //
    // `maskLiterals` would be wrong here, and wrong in a way that looks right: it blanks
    // comments too, so it erases the very marker being searched for and nothing is ever
    // unsafe. This view blanks literals and KEEPS comments, which is exactly the question
    // being asked — is there a real `/* unsafe */` comment in this parameter list?
    const paramsSrc =
      func.params.length && func.body
        ? maskLiteralsKeepComments(preprocessed.source).slice(
            func.start,
            (func.body as any).start
          )
        : ''
    const isUnsafe =
      preprocessed.moduleSafety === 'none' ||
      unsafeFunctions.has(funcName) ||
      paramsSrc.includes('/* unsafe */')
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

    // `:?` return validation, if asked for. Emitted in the SAME insertion as the
    // metadata and before it, because both land at `func.end` and the wrapper rebinds
    // the name — metadata assigned first would attach `__tjs` to the function the
    // wrapper then replaces, silently losing every type descriptor on the file.
    const returnWrapper =
      !isUnsafe && returnSafety === 'safe'
        ? generateReturnValidationWrapper(
            funcName,
            types,
            `${funcLoc.file}:${funcLoc.line}`,
            Boolean((func as any).async)
          )
        : null

    // The wrapper rebinds the name, so a `const`-declared arrow has to become `let`.
    //
    // `NAME = function (...__a) {…}` is fine for a function DECLARATION (mutable binding)
    // and a TypeError for a `const`. Until arrow return annotations were read, this path
    // could not be reached by an arrow at all, so it crashed the moment it began working —
    // "Attempted to assign to readonly property". Widening the keyword is confined to
    // arrows that actually get a return wrapper, and only in the EMITTED JavaScript: TJS
    // immutability is a compile-time property (`const!`), enforced before this point.
    if (returnWrapper && (func as any).__declKind === 'const') {
      const at = (func as any).__declStart as number
      if (
        typeof at === 'number' &&
        preprocessed.source.startsWith('const', at)
      ) {
        deletions.push({ start: at, end: at + 'const'.length })
        insertions.push({ position: at, text: 'let' })
      }
    }

    // Queue insertion of __tjs after function closing brace — or, for a named arrow,
    // after the `const` statement that binds it (see `__metaEnd`).
    //
    // The RETURN WRAPPER goes to the top of the module for a hoisted `function`
    // declaration, and stays put for a `const` arrow.
    //
    // It reassigns the binding (`name = function (...) { … }`), and that ran only when
    // control reached the closing brace — while the declaration itself is hoisted. So a
    // call ABOVE the declaration got the raw function and no return validation at all:
    //
    //     const early = bad()                       // 'BAD'          — unvalidated
    //     function bad():? 0 { return 'BAD' }
    //     const late  = bad()                       // MonadicError   — validated
    //
    // Same function, same argument, opposite answers, decided by call position. Moving the
    // wrapper up works because every piece it emits is hoisted or captures a hoisted
    // binding. An arrow's `const` is NOT hoisted (it would be a TDZ error), so that case
    // keeps the old position — and an arrow cannot be called above its own declaration
    // anyway, so it never had the hole.
    //
    // Gated on what ACTUALLY hoists — a real `function` declaration — not on "is not
    // `const`". `!== 'const'` is true for `let`, so `let f = (x: 0):? 0 => x` had its
    // wrapper inserted at position 0, emitting `const _tjsret_f = f` above `let f = …`:
    // `ReferenceError: Cannot access 'f' before initialization` at module load, on legal
    // TJS, with an error naming nothing near the cause. A hoisted declaration is the only
    // binding that can be captured before its own text; every declarator form must keep
    // the wrapper after it.
    const wrapperHoists = !!returnWrapper && func.type === 'FunctionDeclaration'
    insertions.push({
      position: (func as any).__metaEnd ?? func.end,
      text:
        returnWrapper && !wrapperHoists
          ? `\n${returnWrapper}\n${typeMetadata}`
          : `\n${typeMetadata}`,
    })
    if (wrapperHoists) {
      insertions.push({ position: 0, text: `${returnWrapper}\n` })
    }

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
        if ((func as any).__exprBody) {
          // A concise arrow body has no braces to insert into, so grow one:
          //   (n: 0) => n   ->   (n: 0) => { <checks> return n }
          //
          // Anchored on the ARROW, not on `func.body`. A parenthesised concise body puts
          // the `(` OUTSIDE the body node's span, so inserting at `body.start` dropped the
          // opening brace inside the parens and the result parsed as an object literal:
          //
          //   (a, b) => ({ a, b })
          //   -> (a, b) => ({ __tjs.pushStack(…); … return { a, b } })   // PARSE ERROR
          //
          // `(x, y) => ({ x, y })` is one of the most ordinary shapes in JavaScript, and
          // it needs no annotation to break — plain JS in a `.tjs` file emitted output
          // that would not parse, which is a PRINCIPLES.md "TJS ⊇ JS" subset violation.
          // `tjs check` reported the file clean; only `tjs run` failed.
          //
          // Inserting just past the `=>` puts the brace outside any parens, so they nest
          // instead of colliding, and the expression is still preserved verbatim —
          // evaluation order and `this` binding are untouched.
          const arrowAt = preprocessed.source.lastIndexOf('=>', func.body.start)
          const openAt = arrowAt === -1 ? func.body.start : arrowAt + 2
          if (validation.suffix) {
            // The suffix (`popStack`) must run BEFORE returning, so bind the result
            // first. Appending it after the `return` left it unreachable, and with
            // `callStacks: true` the stack then grew without bound for every concise
            // arrow — the leak was invisible because the code still parsed.
            const tmp = `__tjs_r${func.body.start}`
            insertions.push({
              position: openAt,
              text: ` {\n  ${validation.preamble}\n  const ${tmp} = (`,
            })
            insertions.push({
              position: func.end,
              text: `);\n  ${validation.suffix}\n  return ${tmp}\n}`,
            })
          } else {
            insertions.push({
              position: openAt,
              text: ` {\n  ${validation.preamble}\n  return (`,
            })
            insertions.push({ position: func.end, text: `)\n}` })
          }
        } else {
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
  }

  // Hoisted sentinels for every type declared in this module.
  //
  // A `Type`/`Enum`/`Union`/`Generic` emits as `const X = …`, which is in TDZ until the
  // declaration runs. The parameter guard needs to ask "has this been initialised yet"
  // WITHOUT touching the binding, because `typeof X` on a `const` in TDZ throws the exact
  // ReferenceError the guard exists to avoid — a legal JS ordering (calling a function
  // declared above a type it names, during module evaluation) crashed at module load.
  //
  // `var` hoists and initialises to `undefined`, so the sentinel is readable from scope
  // entry and the guard short-circuits. Emitted immediately AFTER the declaration, so it
  // only becomes true once the type really exists.
  for (const typeName of preprocessed.declaredTypes ?? []) {
    for (const node of program.body as any[]) {
      const decl =
        node.type === 'VariableDeclaration'
          ? node
          : node.type === 'ExportNamedDeclaration' &&
            node.declaration?.type === 'VariableDeclaration'
          ? node.declaration
          : null
      if (!decl) continue
      if (!decl.declarations?.some((d: any) => d.id?.name === typeName))
        continue
      insertions.push({
        position: node.end,
        text: `\nvar ${sentinelName(typeName)} = true;`,
      })
      break
    }
  }

  // Class METHOD parameters get the same treatment, and used not to.
  //
  // `findAllFunctions` collects declarations, exports and named arrows — never methods —
  // so the loop above never saw a single one. `class C { m(value?: string) {} }` shipped
  // as `m(value = string)`: a dangling reference that throws `string is not defined` at
  // call time, on the happy path, from the most common shape a TypeScript author pastes.
  // No collision required, unlike the name-keyed side channel this sits beside; the
  // deletion simply never ran.
  //
  // Deliberately narrow: this strips annotations that would otherwise be RUNTIME ERRORS.
  // Giving methods full metadata and validation is a larger change (they have no entry in
  // `allTypes`, and `wrapClass` is the mechanism for that) and is filed, not smuggled in
  // here as a blocker fix.
  const stripMethodAnnotations = (params: any[] | undefined): void => {
    for (const param of params ?? []) {
      if (param?.type !== 'AssignmentPattern') continue
      const name = param.left?.name
      const right = param.right
      if (!name || !right || typeof right.start !== 'number') continue
      // `x: 0` — required, so the example is a type and never a default.
      // `x?: T` — optional, and `T` is a dangling identifier.
      if (
        preprocessed.requiredValueOffsets.has(right.end) ||
        (right.type === 'Identifier' &&
          preprocessed.typeNameValueOffsets.has(right.end))
      ) {
        deletions.push({ start: param.left.end, end: right.end })
      }
    }
  }
  walk.simple(program as any, {
    MethodDefinition(node: any) {
      stripMethodAnnotations(node.value?.params)
    },
    PropertyDefinition(node: any) {
      const v = node.value
      if (
        v?.type === 'ArrowFunctionExpression' ||
        v?.type === 'FunctionExpression'
      ) {
        stripMethodAnnotations(v.params)
      }
    },
  })

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
  // Legacy equality bridges — emitted only when the author reached for one, which is the
  // point: they are deliberate, greppable escapes back to JavaScript's semantics.
  const needsLegacyEquals = code.includes('DangerousLegacyEquals(')
  const needsLegacyNot = code.includes('DangerousLegacyNot(')
  const needsLegacyExactly = code.includes('LegacyExactly(')
  const needsLegacyNotExactly = code.includes('LegacyNotExactly(')
  const needsLegacyDefault = code.includes('LegacyDefault(')
  const needsTypeOf = code.includes('TypeOf(')
  const needsOneOf = code.includes('__oneOf(')
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
    needsCheckFnShape

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

    // Stack tracking — a BOUNDED ring, like the real runtime's.
    //
    // This was `const __stack=[]` with a plain `push`, and the matching `popStack()` is
    // emitted AFTER the `return`, so it never runs. Every call therefore appended one
    // entry, forever: 201,000 calls left 201,000 entries. In a standalone emitted file —
    // which is the shipping configuration, since emitted code calls these bare and the
    // inline stub always wins (`docs/type-identity.md`) — that is an unbounded leak in
    // any long-running program, growing with call count and never released.
    //
    // Two lines above it, the emitter's own comment says "pushStack is a no-op unless
    // callStacks/debug is enabled at runtime" and "the ring buffer tolerates missed
    // popStack". Both are true of `lang/runtime.ts` and neither was true here: the real
    // one is gated off by default AND bounded to STACK_SIZE, and this one was neither. The
    // comment described the runtime that does not run.
    //
    // Bounded rather than removed, because the entries are what a MonadicError's call
    // stack is built from — the ring keeps that at a fixed cost, which is exactly the
    // trade the real runtime already made.
    if (needsStack) {
      inlineParts.push(
        `const __stackSize=64,__stack=new Array(__stackSize);let __stackHead=0,__stackCount=0;` +
          `function pushStack(n){if(!n)return;__stack[__stackHead]=n;__stackHead=(__stackHead+1)%__stackSize;if(__stackCount<__stackSize)__stackCount++}` +
          `function popStack(){if(__stackCount>0){__stackHead=(__stackHead-1+__stackSize)%__stackSize;__stackCount--}}` +
          `function getStack(){const o=[];for(let i=0;i<__stackCount;i++)o.push(__stack[(__stackHead-__stackCount+i+__stackSize)%__stackSize]);return o}`
      )
    }

    // `__ub` is shared by `Eq`, `Is` and `__oneOf`, and is emitted EXACTLY ONCE.
    //
    // Each of the three used to prepend its own copy. Two of them in one file emitted two
    // `function __ub` declarations at module top level — which Bun happily runs and Node
    // REFUSES to load:
    //
    //     SyntaxError: Identifier '__ub' has already been declared
    //
    // So any emitted module using both `==` and `Is` was dead on arrival for a Node
    // consumer while every test here stayed green. Same shape as the `typescript` import
    // snowfox hit in production: works in our runtime, broken in theirs.
    // `emitted-module-scope.test.ts` now parses emitted output as a MODULE, where a
    // duplicate top-level declaration is an error rather than a shrug.
    if (needsEq || needsIs || needsOneOf) {
      inlineParts.push(UNWRAP_BOXED_SOURCE)
    }

    // Eq/NotEq (honest equality)
    if (needsEq) {
      inlineParts.push(
        `function Eq(a,b){a=__ub(a);b=__ub(b);if(a===b)return true;if(typeof a==='number'&&typeof b==='number'&&isNaN(a)&&isNaN(b))return true;if((a===null||a===undefined)&&(b===null||b===undefined))return true;return false}`
      )
    }
    if (needsNotEq) {
      inlineParts.push(`function NotEq(a,b){return!Eq(a,b)}`)
    }

    // Legacy equality — JavaScript's own semantics, by explicit request.
    if (needsLegacyEquals) {
      inlineParts.push(`function DangerousLegacyEquals(a,b){return a==b}`)
    }
    if (needsLegacyNot) {
      inlineParts.push(`function DangerousLegacyNot(a,b){return a!=b}`)
    }
    if (needsLegacyExactly) {
      inlineParts.push(`function LegacyExactly(a,b){return a===b}`)
    }
    if (needsLegacyNotExactly) {
      inlineParts.push(`function LegacyNotExactly(a,b){return a!==b}`)
    }
    if (needsLegacyDefault) {
      inlineParts.push(`function LegacyDefault(v){return v}`)
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
        `const tjsEquals=Symbol.for('tjs.equals');function Is(a,b){return __goIs(a,b,0,null)}function __goIs(a,b,d,m){if(a!=null&&typeof a==='object'&&typeof a[tjsEquals]==='function')return a[tjsEquals](b);if(b!=null&&typeof b==='object'&&typeof b[tjsEquals]==='function')return b[tjsEquals](a);if(a!=null&&typeof a==='object'&&typeof a.Equals==='function')return a.Equals(b);if(b!=null&&typeof b==='object'&&typeof b.Equals==='function')return b.Equals(a);a=__ub(a);b=__ub(b);if(a===b)return true;if(typeof a==='number'&&typeof b==='number'&&isNaN(a)&&isNaN(b))return true;if((a==null)&&(b==null))return true;if(a==null||b==null)return false;if(typeof a!==typeof b)return false;if(typeof a!=='object')return false;if(d>=8){if(m===null)m=new WeakMap();let s=m.get(a);if(s){if(s.has(b))return true}else{s=new WeakSet();m.set(a,s)}s.add(b)}if(a instanceof Set&&b instanceof Set){if(a.size!==b.size)return false;for(const v of a)if(!b.has(v))return false;return true}if(a instanceof Map&&b instanceof Map){if(a.size!==b.size)return false;for(const[k,v]of a)if(!b.has(k)||!__goIs(v,b.get(k),d+1,m))return false;return true}if(a instanceof Date&&b instanceof Date)return a.getTime()===b.getTime();if(a instanceof RegExp&&b instanceof RegExp)return a.toString()===b.toString();if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)return false;return a.every((v,i)=>__goIs(v,b[i],d+1,m))}if(Array.isArray(a)!==Array.isArray(b))return false;const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;return ka.every(k=>__goIs(a[k],b[k],d+1,m))}`
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
    if (needsOneOf) {
      // Literal-union membership. Canonicalises the probe — unwrap boxed primitives, fold
      // `undefined` to `null` — then a plain `indexOf`, which is SameValueZero and
      // therefore already right for `NaN`.
      //
      // The unwrap is the SHARED `__ub`, not a hand-inlined copy. This was the fifth copy
      // of that logic and the only one still missing the fail-soft guard, so it threw
      // where every other copy returns:
      //
      //     function pick(mode: 'a' | 'b') {…}
      //     pick(new Proxy({}, { getPrototypeOf: () => Number.prototype }))
      //     -> TypeError: thisNumberValue called on incompatible object
      //
      // A raw throw out of a TYPE CHECK breaks the language's central promise that errors
      // are returned, not thrown — and it is reachable from any hostile input.
      inlineParts.push(
        `function __oneOf(v,ms){v=__ub(v);if(v===undefined)v=null;return ms.indexOf(v)!==-1}`
      )
    }
    if (needsType || needsGeneric) {
      // `check` matches the value against the EXAMPLE, structurally.
      //
      // It used to be `typeof v === typeof ex`, which for an object example means
      // *any* object passes: `User.check({ name: 'Alice' })` returned true for a
      // type requiring name+age+email. A validator that answers "yes" to everything
      // is worse than no validator — examples/json-schema.tjs printed
      // "Missing field: true" and looked like it worked.
      inlineParts.push(
        // An INTEGER example narrows: `{ x: 1 }` must not accept `{ x: 1.5 }`. (A float
        // example stays permissive: `1.5` describes any number.) That constraint is
        // derivable from the example VALUE, so the stub enforces it without needing
        // source information — see docs/type-identity.md.
        //
        // EXCESS KEYS ARE FINE (decided 2026-08-14). An earlier version closed a
        // non-empty object example, on the reasoning that describing a shape means
        // describing all of it. That is stricter than anything TypeScript can express:
        // TS's excess-property check fires only on FRESH object literals assigned
        // directly to a typed target, so
        //
        //     const p = { x: 1, y: 2, z: 3 }
        //     f(p)                              // fine in TS
        //     f({ x: 1, y: 2, z: 3 })           // error in TS — freshness only
        //
        // and there is no `Exact<T>` to opt into. Closing therefore rejected values that
        // work in the JavaScript this compiles to, which is the wrong direction for a
        // language whose contract is that it is a superset.
        //
        // It also created a worse anomaly: the OTHER structural checker
        // (`validate(infer(example))`, used whenever a Type carries a predicate) is open,
        // so adding a `predicate` that returns `true` — adding no constraint at all —
        // made a type MORE permissive. A predicate must only ever narrow. Both checkers
        // are open now, so they agree.
        `function __match(v,ex){if(ex===null)return v===null;if(ex===undefined)return true;const t=typeof ex;if(t==='number')return typeof v==='number'&&(Number.isInteger(ex)?Number.isInteger(v):true);if(t==='string'||t==='boolean')return typeof v===t;if(Array.isArray(ex)){if(!Array.isArray(v))return false;return ex.length?v.every(x=>__match(x,ex[0])):true}if(t==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return false;const ks=Object.keys(ex);return ks.every(k=>k in v&&__match(v[k],ex[k]))}return v===ex}`
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
      // A raw example type argument checks through `__match`, exactly as the inline
      // `Type` fallback does. It used to be `typeof v === typeof a`, which is the
      // weakest answer available: `Box(0)` accepted `1.5`, because both are 'number'.
      // That was the documented blocker for `Box<int>` — the syntax was never the
      // problem — and it is fixed by reusing the matcher rather than by a second
      // hand-rolled comparison, which is how the two drifted apart in the first place.
      // A RuntimeType defers to its own `.check`; a bare predicate function is used as-is.
      inlineParts.push(
        `function Generic(tp,pred,d){const c=a=>{if(a===null||a===undefined)return()=>true;if(a.__runtimeType&&typeof a.check==='function')return v=>a.check(v)===true;if(typeof a==='function')return v=>a(v)===true;return v=>__match(v,a)};const f=(...args)=>{const ck=args.map(c);const t={description:d||'generic',__runtimeType:true,check:v=>pred(v,...ck)};return t};f.__runtimeType=true;f.description=d;return f}`
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
        // `members`/`names`/`keys` as well as `values` — the real `Enum` documents
        // `Color.members.Red` as THE way to reference a member, and the stub carried only
        // `values`, so that documented access returned `undefined` in every emitted file.
        // The stub is not a fallback (it always wins in emitted code), so a field it omits
        // is a field the language does not have — see docs/type-identity.md.
        `function Enum(d,m){const mm=typeof m==='object'&&m?m:{};const vals=Object.values(mm);const names={};for(const k of Object.keys(mm))names[mm[k]]=k;return{description:d,check:v=>vals.includes(v),values:vals,members:mm,names,keys:Object.keys(mm),__runtimeType:true${setSchema}}}`
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
        `function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)}`
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

  // Import `Eval`/`SafeFunction` if and only if the emitted code actually calls them as
  // FREE identifiers, and import only the ones used. This is what makes the old
  // `TjsSafeEval` mode unnecessary: it existed solely so the import was opt-in, and usage
  // detection answers that question exactly rather than asking the author to.
  //
  // Decided from the AST, not a regex. The regex version (`\bEval\s*\(` over a masked copy)
  // shipped broken in three ways, all of them emitting JavaScript that does not parse:
  //   - `import { Eval } from 'tjs-lang/eval'` — the DOCUMENTED form, and the one `fromTS`
  //     faithfully preserves from a TypeScript file that must import it to typecheck — got
  //     a second, duplicate import. So the documented TS → TJS → JS chain produced a module
  //     that could not be loaded, and there was no correct authoring path for the feature.
  //   - `function Eval(x) { … }` — legal JavaScript, and legal under `dialect: 'js'` too —
  //     got an import placed above the declaration. A TJS ⊇ JS violation (PRINCIPLES.md).
  //   - `o.Eval(x)` matched, because `\b` matches after a `.`, pulling a spurious import
  //     into output that is supposed to be standalone.
  code = addSafeEvalImports(code)

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

  /**
   * `const f = (n: 0) => n` — an arrow or function expression bound to a name.
   *
   * These used to be skipped entirely, so the SAME annotation was enforced or ignored
   * depending only on which spelling you used. Arrows are most of real TypeScript, which
   * made this the largest silent hole in the language: it parsed, it looked typed, and it
   * checked nothing.
   *
   * Two things differ from a declaration, and both are recorded on the node:
   *   `__metaEnd` — `NAME.__tjs = {…}` must land after the whole STATEMENT. The arrow's
   *     own `end` is inside the `const`, so appending there would splice metadata into the
   *     initializer.
   *   `__exprBody` — a concise body (`=> n`) has no braces to insert a preamble into, so
   *     the emitter has to grow one.
   */
  const collectNamed = (decl: any, stmtEnd: number): void => {
    if (decl?.type !== 'VariableDeclaration') return
    for (const d of decl.declarations) {
      const init = d.init
      if (
        d.id?.type !== 'Identifier' ||
        (init?.type !== 'ArrowFunctionExpression' &&
          init?.type !== 'FunctionExpression')
      ) {
        continue
      }
      // An arrow has `id: null`; the binding name is the only name it has.
      if (!init.id) init.id = d.id
      init.__metaEnd = stmtEnd
      init.__exprBody = init.body?.type !== 'BlockStatement'
      // Where the binding was declared, and with what keyword. The return-safety wrapper
      // rebinds the name (`NAME = function (...) {…}`), which a `const` forbids — and
      // that path was unreachable for arrows until their return annotations started being
      // read, so it crashed the moment it started working. Recorded here so the emitter
      // can widen `const` to `let` for exactly the arrows that get wrapped.
      init.__declKind = decl.kind
      init.__declStart = decl.start
      functions.push(init as FunctionDeclaration)
    }
  }

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
    } else if (node.type === 'VariableDeclaration') {
      collectNamed(node, node.end)
    } else if (node.type === 'ExportNamedDeclaration') {
      collectNamed(node.declaration, node.end)
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
  if (t.pattern) {
    result.pattern = t.pattern
    if (t.flags) result.flags = t.flags
  }
  if (t.items) result.items = serializeType(t.items)
  if (t.shape) {
    result.shape = Object.fromEntries(
      Object.entries(t.shape).map(([k, v]) => [k, serializeType(v)])
    )
  }
  if (t.members) result.members = t.members.map(serializeType)
  // The union's MEMBERS. Without this a literal union serialized as a bare
  // `{"kind":"literal-union"}` — the kind survived and the whole content did not — so
  // every downstream consumer of `__tjs` saw a type it could not act on. `values` is where
  // the closed set lives (`types.ts`), and it is the only field that distinguishes
  // `'yes' | 'no'` from any other union.
  if (t.values) result.values = t.values
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
    'bigint',
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
  const p = uid()

  // Own-key scan: prototype-pollution rejection. There is no excess-key census any
  // more — see the rebuild below.
  const forbiddenCheck = FORBIDDEN_KEYS.map(
    (k) => `${p}k === ${JSON.stringify(k)}`
  ).join(' || ')
  lines.push(
    `for (const ${p}k in ${access}) { if (Object.prototype.hasOwnProperty.call(${access}, ${p}k)) { if (${forbiddenCheck}) return __tjs.typeError('${displayPath}.' + ${p}k, 'safe key', ${p}k); } }`
  )
  lines.push(`let ${p}f = 0;`)
  lines.push(`let ${p}c = false;`)

  const memberVars: Array<[string, string]> = []
  for (const key of keys) {
    const member = shape[key]
    const acc = memberAccess(access, key)
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

  // Rebuild ONLY when a member was filled or a nested level changed.
  //
  // Excess keys used to force a rebuild so they could be dropped, with a once-per-site
  // recorder notice. They are now PASSED THROUGH (2026-08-14), which makes this both
  // simpler and cheaper: a complete payload that merely carries extra keys is now the
  // untouched-identity path (I3) instead of a silent copy.
  //
  // Stripping was WebIDL dictionary semantics, and WebIDL strips because a dictionary is
  // a wire format. A TJS `= {…}` parameter is an options bag, and options bags in
  // JavaScript routinely carry more than the callee declares. Dropping the caller's data
  // on the floor is the surprising half of that trade, and it disagreed with every other
  // structural check in the language once those were opened.
  //
  // The spread comes FIRST so declared members always win: a resolved member (validated,
  // or filled from the default) overrides whatever the payload had. Forbidden keys are
  // rejected above, and object spread creates own data properties, so `__proto__` in a
  // payload cannot reach a prototype here.
  const rebuild = `{ ...${access}, ${memberVars
    .map(([k, v]) => `${propKey(k)}: ${v}`)
    .join(', ')} }`
  lines.push(`if (${p}f > 0 || ${p}c) {`)
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
    const memberExpr = memberAccess(accessExpr, key)
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

/**
 * What a type error says it EXPECTED.
 *
 * "Expected literal-union" or "Expected declared" names the mechanism instead of the
 * contract, which tells the reader nothing they can act on. A literal union reports its
 * members, so the message is the fix.
 */
function expectedLabel(t: any): string {
  if (t?.kind === 'literal-union' && Array.isArray(t.values)) {
    return t.values.map((v: unknown) => JSON.stringify(v)).join(' | ')
  }
  if (t?.kind === 'union' && Array.isArray(t.members)) {
    return t.members.map((m: any) => expectedLabel(m)).join(' | ')
  }
  // An ARRAY names its element type. `sum(['a','b'])` used to report "Expected array …
  // got object" — wrong twice over: it IS an array, and `typeof []` is 'object'. The
  // actual side is fixed in the runtime's `describeActual`; this is the expected side,
  // so the pair now reads "Expected array of integer …, got array", which says what is
  // actually wrong.
  if (t?.kind === 'array' && t.items) {
    return `array of ${expectedLabel(t.items)}`
  }
  return t?.typeName ?? t?.kind
}

function generateTypeCheckExpr(
  fieldPath: string,
  type: TypeDescriptor
): string | null {
  let check: string | null

  switch (type.kind) {
    case 'string':
      // A regexp-derived string type checks BOTH stringness and the pattern.
      check = type.pattern
        ? `(typeof ${fieldPath} !== 'string' || !new RegExp(${JSON.stringify(
            type.pattern
          )}, ${JSON.stringify(type.flags ?? '')}).test(${fieldPath}))`
        : `typeof ${fieldPath} !== 'string'`
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
    // A bigint is NOT a number: `typeof 10n === 'bigint'`, and the two do not mix under
    // arithmetic. Mapping it to `number` (as this did) rejected every bigint AND accepted
    // every number — inverted in both directions at once.
    case 'bigint':
      check = `typeof ${fieldPath} !== 'bigint'`
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
    case 'literal-union': {
      const vals = (type as any).values as unknown[]
      if (!vals?.length) return null
      // Membership is the language's `==`, so this cannot be a `Set.has` or a `===` chain:
      // both are SameValueZero and would reject `new String('yes')` for `'yes' | 'no'`,
      // and `undefined` for a union containing `null`. `__oneOf` canonicalises the probe
      // the same way the members were canonicalised at inference time.
      check = `!__oneOf(${fieldPath}, ${JSON.stringify(vals)})`
      break
    }
    case 'union': {
      const checks = (type as any).members
        .map((m: TypeDescriptor) => generateTypeCheckExpr(fieldPath, m))
        .filter((c: string | null) => c !== null)
      if (checks.length === 0) return null
      check = `(${checks.join(' && ')})`
      break
    }
    case 'declared':
      // A `Type X {…}` declared in this module. `X.check(v)` already composes the
      // example-inferred structure with the declared predicate — structure first, so the
      // predicate can assume the shape rather than defending itself — and it gets `null`
      // right, which a raw `typeof v === 'object'` does not.
      //
      // Guarded on the binding being INITIALISED, because a Type declared after the
      // function that names it is in TDZ for any call made during module evaluation. The
      // intent is to degrade to "unchecked" there — a legal JS ordering must not become a
      // crash (TJS ⊇ JS).
      //
      // `typeof X` did NOT do that. `typeof` is only safe for an UNDECLARED identifier; a
      // declared `const` in TDZ throws `ReferenceError: Cannot access 'X' before
      // initialization` from the `typeof` itself. So the guard threw the very error it was
      // written to prevent, at module load, and the comment describing the behaviour sat
      // directly above the code contradicting it.
      //
      // The sentinel is a hoisted `var`, emitted immediately after each declared type (see
      // `declaredTypeSentinels`). `var` initialises to `undefined` at scope entry, so
      // reading it before the declaration is falsy rather than fatal, and the check
      // short-circuits before it can touch the type binding. Zero runtime cost — no
      // closure, no try/catch on a path that runs per argument per call.
      check = type.typeName
        ? `(typeof ${sentinelName(
            type.typeName
          )} !== 'undefined' && ${sentinelName(type.typeName)} && !${
            type.typeName
          }.check(${fieldPath}))`
        : null
      break
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
  'bigint',
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
/**
 * `:?` — validate the RETURN value at runtime.
 *
 * This used to emit nothing. `:?` set `safeReturn: true` in the `__tjs` metadata and
 * that was all: the flag was descriptive, nothing read it, and
 * `function bad(x: 0):? 0 { return 'not a number' }` returned the string at runtime.
 * The build-time signature test caught it, so the failure was invisible to anyone
 * reading the docs, which describe `:?` as "runs the test AND runtime validation".
 *
 * It is the output half of the cheap-validation pattern: an O(1) refinement on the way
 * in (`things: NonEmpty`) plus an O(1) check on the way out is a COMPLETE guarantee
 * about what the function contributes to the program, at a fraction of the cost of
 * scanning every element. That argument only holds if the return is actually checked.
 *
 * Emitted as a wrapper rather than by rewriting `return` statements: every exit path is
 * covered without touching the body, which keeps source positions intact.
 *
 * A `MonadicError` passes through unchecked — an error is a legitimate return value in
 * this language, and re-reporting it as a type error would bury the original cause.
 */
function generateReturnValidationWrapper(
  funcName: string,
  types: TJSTypeInfo,
  sourceStr: string,
  isAsync: boolean
): string | null {
  if (!types.returns) return null

  const check = generateTypeCheckExpr('__r', types.returns)
  if (!check) return null // `any` and friends — nothing to assert

  const expected =
    types.returns.typeName ??
    (types.returns.kind === 'union'
      ? (types.returns.members ?? []).map((m) => m.kind).join(' | ')
      : types.returns.kind)

  // Only unwrap for a DECLARED async function. Duck-typing any thenable would silently
  // check the resolved value of a sync function that legitimately returns a promise,
  // which is a different assertion than the one written.
  const call = `_tjsret_${funcName}.apply(this, __a)`
  const body = isAsync
    ? `const __p = ${call}\n  return __p && typeof __p.then === 'function' ? __p.then(__validate_${funcName}) : __validate_${funcName}(__p)`
    : `return __validate_${funcName}(${call})`

  return `
const _tjsret_${funcName} = ${funcName}
function __validate_${funcName}(__r) {
  if (__tjs.isMonadicError(__r)) return __r
  if (${check}) return __tjs.typeError('${sourceStr}:${funcName}:return', '${expected}', __r)
  return __r
}
${funcName} = function (...__a) {
  ${body}
}
`.trim()
}

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
      const expectedType = param.type.typeName ?? param.type.kind
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

/**
 * Prepend `import { Eval, SafeFunction } from 'tjs-lang'` — but only for names the module
 * actually CALLS and does not already have a binding for.
 *
 * Two conditions, and both are load-bearing:
 *
 *  1. **Called as a bare identifier.** `Eval(x)` qualifies; `o.Eval(x)` does not, and
 *     neither does the mere word `Eval` appearing as an argument or a property name.
 *  2. **Not already bound anywhere in the module.** An import, a function declaration, a
 *     `const`/`let`/`var`, a class, or a parameter with that name all mean the author has
 *     their own `Eval` and injecting ours would be a duplicate declaration — a hard
 *     SyntaxError, not a subtle bug.
 *
 * Condition 2 is deliberately whole-module rather than scope-precise. A local binding named
 * `Eval` in one function alongside a genuine free `Eval()` call in another is vanishingly
 * rare; emitting a module that does not parse is not. When the two conflict, decline to
 * inject: the author gets an "Eval is not defined" naming exactly what to import, which is
 * a diagnosis. A duplicate-declaration SyntaxError in generated code is a puzzle.
 *
 * If the code cannot be parsed we inject nothing. It is about to fail to parse for the
 * caller too, and adding an import to broken output only obscures where the break is.
 */
function addSafeEvalImports(code: string): string {
  const CANDIDATES = ['Eval', 'SafeFunction'] as const

  // Cheap pre-filter: skip the parse entirely for the overwhelming majority of modules.
  if (!CANDIDATES.some((n) => code.includes(n))) return code

  let program: Program
  try {
    program = acornParse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true,
    }) as unknown as Program
  } catch {
    return code
  }

  const bound = new Set<string>()
  const called = new Set<string>()

  const bindPattern = (node: any): void => {
    if (!node) return
    switch (node.type) {
      case 'Identifier':
        bound.add(node.name)
        break
      case 'ObjectPattern':
        for (const p of node.properties) {
          bindPattern(p.type === 'RestElement' ? p.argument : p.value)
        }
        break
      case 'ArrayPattern':
        for (const el of node.elements) bindPattern(el)
        break
      case 'AssignmentPattern':
        bindPattern(node.left)
        break
      case 'RestElement':
        bindPattern(node.argument)
        break
    }
  }

  walk.full(program, (node: any) => {
    switch (node.type) {
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        bound.add(node.local.name)
        break
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ClassDeclaration':
        if (node.id) bound.add(node.id.name)
        if (node.params) for (const p of node.params) bindPattern(p)
        break
      case 'ArrowFunctionExpression':
        for (const p of node.params) bindPattern(p)
        break
      case 'VariableDeclarator':
        bindPattern(node.id)
        break
      case 'CallExpression':
        if (node.callee?.type === 'Identifier') called.add(node.callee.name)
        break
    }
  })

  const needed = CANDIDATES.filter((n) => called.has(n) && !bound.has(n))
  return needed.length
    ? `import { ${needed.join(', ')} } from 'tjs-lang';\n` + code
    : code
}
