/**
 * TypeScript to TJS Transpiler
 *
 * Converts TypeScript source to TJS (or directly to JS + metadata).
 *
 * Two modes:
 * 1. TS → TJS (for inspection/migration)
 * 2. TS → JS + __tjs metadata (for production)
 *
 * @example
 * ```typescript
 * // Input TypeScript:
 * function greet(name: string, age?: number): string {
 *   return `Hello, ${name}!`
 * }
 *
 * // Output TJS:
 * function greet(name: '', age = 0): '' {
 *   return `Hello, ${name}!`
 * }
 *
 * // Output JS + metadata:
 * function greet(name, age) {
 *   return `Hello, ${name}!`
 * }
 * greet.__tjs = {
 *   params: { name: { type: 'string', required: true }, age: { type: 'number', required: false } },
 *   returns: { type: 'string' }
 * }
 * ```
 */

import ts from 'typescript'
import { maskLiteralsKeepComments, scanLiterals } from '../../strip-comments'

export interface FromTSOptions {
  /** Emit TJS intermediate instead of JS + metadata */
  emitTJS?: boolean
  /** Include sourcemap */
  sourceMap?: boolean
  /** Filename for error messages */
  filename?: string
}

export interface FromTSResult {
  /** The transpiled code (TJS or JS depending on options) */
  code: string
  /** Function type metadata (only when emitting JS) */
  types?: Record<string, FunctionTypeInfo>
  /** Class type metadata (only when emitting JS) */
  classes?: Record<string, ClassTypeInfo>
  /** Any warnings during transpilation */
  warnings?: string[]
}

export interface TypeParamInfo {
  /** Constraint schema (from `extends`) - example-based */
  constraint?: string | Record<string, any>
  /** Default schema (from `= Type`) - example-based */
  default?: string | Record<string, any>
}

export interface FunctionTypeInfo {
  name: string
  params: Record<string, ParamTypeInfo>
  returns?: TypeInfo
  description?: string
  /** Generic type parameters with constraints/defaults */
  typeParams?: Record<string, TypeParamInfo>
  /** Overload signatures (when function has TS overloads) */
  overloads?: FunctionTypeInfo[]
}

export interface ClassTypeInfo {
  name: string
  /** Constructor parameters - also serves as the type shape */
  constructor?: {
    params: Record<string, ParamTypeInfo>
  }
  /** Instance methods */
  methods: Record<string, FunctionTypeInfo>
  /** Static methods */
  staticMethods: Record<string, FunctionTypeInfo>
  /** Generic type parameters */
  typeParams?: Record<string, TypeParamInfo>
}

export interface ParamTypeInfo {
  type: TypeInfo
  required: boolean
  default?: any
  description?: string
}

export interface TypeInfo {
  kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'undefined'
    | 'array'
    | 'tuple'
    | 'object'
    | 'union'
    | 'any'
  items?: TypeInfo
  /** For tuples: element types in order */
  elements?: TypeInfo[]
  shape?: Record<string, TypeInfo>
  members?: TypeInfo[]
  nullable?: boolean
}

/** Context for type resolution */
interface TypeResolutionContext {
  typeAliases?: Map<string, ts.TypeNode>
  interfaces?: Map<string, ts.InterfaceDeclaration>
  sourceFile?: ts.SourceFile
  warnings?: string[]
  /** Track visited types to prevent infinite recursion */
  visited?: Set<string>
  /** Type parameter constraints and defaults from enclosing generic function/class */
  typeParams?: Map<string, { constraint?: ts.TypeNode; default?: ts.TypeNode }>
  /** Cache resolved type alias/interface results to avoid redundant traversals */
  resolvedCache?: Map<string, TypeInfo>
  /** Current resolution depth — bail to 'any' when too deep */
  depth?: number
}

/** Maximum type resolution depth before degrading to 'any' */
const MAX_TYPE_DEPTH = 20

/**
 * DOM interface types — not constructible but common in TS signatures.
 * Map to {} (opaque object) so params stay annotated and required
 * rather than degrading to bare names.
 */
const domInterfaceTypes = new Set([
  // Events
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'TouchEvent',
  'FocusEvent',
  'InputEvent',
  'CompositionEvent',
  'WheelEvent',
  'DragEvent',
  'AnimationEvent',
  'TransitionEvent',
  'ClipboardEvent',
  'UIEvent',
  'ProgressEvent',
  'ErrorEvent',
  'MessageEvent',
  'PopStateEvent',
  'HashChangeEvent',
  'PageTransitionEvent',
  'StorageEvent',
  'BeforeUnloadEvent',
  'SubmitEvent',
  // Event targets / misc
  'EventTarget',
  'EventListener',
  // Nodes
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Document',
  'DocumentFragment',
  'ShadowRoot',
  'Text',
  'Comment',
  'Attr',
  // Specific HTML elements
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'HTMLAudioElement',
  'HTMLCanvasElement',
  'HTMLDivElement',
  'HTMLSpanElement',
  'HTMLParagraphElement',
  'HTMLTableElement',
  'HTMLTemplateElement',
  'HTMLSlotElement',
  'HTMLDialogElement',
  'HTMLDetailsElement',
  'HTMLLabelElement',
  'HTMLOptionElement',
  'HTMLIFrameElement',
  'HTMLScriptElement',
  'HTMLStyleElement',
  'HTMLLinkElement',
  'HTMLMetaElement',
  'HTMLHeadElement',
  'HTMLBodyElement',
  'HTMLMediaElement',
  // SVG elements
  'SVGSVGElement',
  'SVGPathElement',
  'SVGGElement',
  'SVGCircleElement',
  'SVGRectElement',
  'SVGTextElement',
  'SVGLineElement',
  'SVGPolygonElement',
  // Collections / lists
  'NodeList',
  'HTMLCollection',
  'NamedNodeMap',
  'DOMTokenList',
  'DOMStringMap',
  'CSSStyleDeclaration',
  'DOMRect',
  'DOMRectReadOnly',
  'DOMPoint',
  'DOMMatrix',
  // Ranges / selection
  'Range',
  'Selection',
  'StaticRange',
  // Observers
  'MutationObserver',
  'MutationRecord',
  'IntersectionObserver',
  'IntersectionObserverEntry',
  'ResizeObserver',
  'ResizeObserverEntry',
  'PerformanceObserver',
  'PerformanceEntry',
  // Window / global
  'Window',
  'Location',
  'History',
  'Navigator',
  'Screen',
  'Storage',
  // Canvas / media
  'CanvasRenderingContext2D',
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
  'OffscreenCanvas',
  'ImageData',
  'ImageBitmap',
  'MediaStream',
  'MediaRecorder',
  'AudioContext',
  'AudioNode',
  'AudioBuffer',
  // Workers / messaging
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'ServiceWorkerRegistration',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  // Other Web APIs
  'WebSocket',
  'XMLHttpRequest',
  'FileReader',
  'FileList',
  'DataTransfer',
  'Crypto',
  'SubtleCrypto',
  'CryptoKey',
  'Geolocation',
  'Notification',
  'PermissionStatus',
  'MediaQueryList',
  'TreeWalker',
  'NodeIterator',
  'ClipboardItem',
])

/**
 * Convert a TypeScript type node to a TJS example value string
 *
 * @param warnings - Optional array to collect warnings about generic types
 */
/**
 * Length of a leading `super(...)` call, matched on BALANCED parens — or 0.
 *
 * A non-greedy `\([\s\S]*?\)` stops at the first `)`, which inside a multi-line
 * ``super(`…${xs.join('\n')}`)`` is the one belonging to `join(...)`. The
 * parameter-property assignment was then spliced into the middle of a template literal and
 * the emitted class came out structurally scrambled — silently, since the converter
 * reported success and only the downstream compile failed.
 *
 * Found by the full gate's converter stage, on our own `predicate-canonical.ts`.
 */
function leadingSuperCallLength(body: string): number {
  const m = body.match(/^\s*super\s*\(/)
  if (!m) return 0
  let depth = 1
  let i = m[0].length
  let quote: string | null = null
  for (; i < body.length && depth > 0; i++) {
    const c = body[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
  }
  if (depth !== 0) return 0
  const tail = body.slice(i).match(/^\s*;?/)
  return i + (tail ? tail[0].length : 0)
}

function typeToExample(
  type: ts.TypeNode | undefined,
  checker?: ts.TypeChecker,
  warnings?: string[],
  ctx?: TypeResolutionContext,
  /**
   * Where the result will be written.
   *
   * `'annotation'` — a parameter or return type. TJS parses this with its type machinery,
   * so a sound TS name (`string`) is honoured directly and is the clearer spelling.
   *
   * `'value'` (the DEFAULT) — inside an `example: { … }` object, which is EVALUATED at
   * runtime. A type name there is an undefined identifier:
   *
   *     Type User { example: { name: string } }
   *     -> ReferenceError: string is not defined
   *
   * Defaulting to `'value'` makes the safe form the one you get by not thinking about it.
   * Emitting a type name where a value belongs crashes the module at load; emitting a value
   * where a name would do is merely less legible. When one of 39 call sites has to be wrong,
   * it should be wrong in the direction that still runs. Found by two tosijs regression
   * tests, which is exactly what they are for.
   */
  position: 'annotation' | 'value' = 'value'
): string {
  if (!type) return 'undefined'

  switch (type.kind) {
    // A sound TS primitive keeps its own SPELLING.
    //
    // These used to become examples — `number` -> `0.0`, `string` -> `''`,
    // `boolean` -> `false` — and the rewrite bought nothing: measured, `x: number` and
    // `x: 0.0` produce the identical descriptor (`kind: 'number'`) and identical runtime
    // behaviour. Same for the other two, for `number[]` vs `[0.0]`, and for
    // `string | null` vs `'' | null`.
    //
    // So it was pure churn that made a TS author's own annotation unrecognisable in the
    // output of a tool whose job is to preserve meaning. ASSUMPTIONS A10 already settled
    // the principle — TJS accepts type NAMES or examples with equal standing, and the
    // on-ramp is "keep writing TypeScript" — but the converter was rewriting away the very
    // spelling that principle exists to honour.
    //
    // It also costs legibility, which is measured rather than assumed: the example rule
    // scored **0/5** in the comprehension probe, models reading `x: ''` as *exactly* the
    // empty string (A15). Emitting examples where a sound type name would do makes
    // converted code harder to read for the audience most likely to read it.
    //
    // Examples remain the right output where TS has no name for what it means — a literal
    // type becomes `Exactly(…)`, an object type becomes a shape.
    case ts.SyntaxKind.StringKeyword:
      return position === 'annotation' ? 'string' : "''"
    case ts.SyntaxKind.NumberKeyword:
      return position === 'annotation' ? 'number' : '0.0'
    case ts.SyntaxKind.BooleanKeyword:
      return position === 'annotation' ? 'boolean' : 'false'
    case ts.SyntaxKind.NullKeyword:
      return 'null'
    case ts.SyntaxKind.UndefinedKeyword:
      return 'undefined'
    case ts.SyntaxKind.VoidKeyword:
      return 'undefined'
    case ts.SyntaxKind.AnyKeyword:
      // For function params we use 'any', for object props we use 'null'
      return 'any'
    case ts.SyntaxKind.UnknownKeyword:
      return 'any'
    case ts.SyntaxKind.NeverKeyword:
      return 'null'
    case ts.SyntaxKind.SymbolKeyword:
      return "Symbol('example')"
    case ts.SyntaxKind.BigIntKeyword:
      return '0n'
    case ts.SyntaxKind.ObjectKeyword:
      return '{}'

    case ts.SyntaxKind.ArrayType: {
      const arrayType = type as ts.ArrayTypeNode
      // Position PROPAGATES: `[number]` is legal in an annotation and a ReferenceError in a
      // value, exactly like the scalar it wraps.
      let itemExample = typeToExample(
        arrayType.elementType,
        checker,
        warnings,
        ctx,
        position
      )
      // 'any' is not a valid literal value - use null for array items
      if (itemExample === 'any') itemExample = 'null'
      return `[${itemExample}]`
    }

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode
      const typeName = typeRef.typeName.getText()

      // Handle common generic types
      if (typeName === 'Array' && typeRef.typeArguments?.length) {
        const itemExample = typeToExample(
          typeRef.typeArguments[0],
          checker,
          warnings,
          ctx
        )
        return `[${itemExample}]`
      }
      if (typeName === 'Promise') {
        // Unwrap Promise type
        if (typeRef.typeArguments?.length) {
          return typeToExample(
            typeRef.typeArguments[0],
            checker,
            warnings,
            ctx,
            position
          )
        }
        return 'undefined'
      }
      if (
        typeName === 'Generator' ||
        typeName === 'AsyncGenerator' ||
        typeName === 'IterableIterator' ||
        typeName === 'AsyncIterableIterator'
      ) {
        // Unwrap to yield type (first type argument)
        if (typeRef.typeArguments?.length) {
          return typeToExample(typeRef.typeArguments[0], checker, warnings, ctx)
        }
        return 'undefined'
      }
      if (typeName === 'Record') {
        return '{}'
      }

      // Built-in constructible types — valid JS expressions as examples
      const builtinExamples: Record<string, string> = {
        // Collections
        Map: 'new Map()',
        Set: 'new Set()',
        WeakMap: 'new WeakMap()',
        WeakSet: 'new WeakSet()',
        WeakRef: 'new WeakRef({})',
        // Errors
        Error: "new Error('example')",
        TypeError: "new TypeError('example')",
        RangeError: "new RangeError('example')",
        SyntaxError: "new SyntaxError('example')",
        ReferenceError: "new ReferenceError('example')",
        URIError: "new URIError('example')",
        EvalError: "new EvalError('example')",
        // Date/Regex
        Date: 'new Date()',
        RegExp: '/example/',
        // Binary / WASM
        ArrayBuffer: 'new ArrayBuffer(0)',
        SharedArrayBuffer: 'new SharedArrayBuffer(0)',
        DataView: 'new DataView(new ArrayBuffer(0))',
        Float32Array: 'new Float32Array(0)',
        Float64Array: 'new Float64Array(0)',
        Int8Array: 'new Int8Array(0)',
        Int16Array: 'new Int16Array(0)',
        Int32Array: 'new Int32Array(0)',
        Uint8Array: 'new Uint8Array(0)',
        Uint16Array: 'new Uint16Array(0)',
        Uint32Array: 'new Uint32Array(0)',
        Uint8ClampedArray: 'new Uint8ClampedArray(0)',
        BigInt64Array: 'new BigInt64Array(0)',
        BigUint64Array: 'new BigUint64Array(0)',
        // Web APIs (constructible)
        URL: "new URL('https://example.com')",
        URLSearchParams: 'new URLSearchParams()',
        Headers: 'new Headers()',
        FormData: 'new FormData()',
        Blob: 'new Blob()',
        File: "new File([], 'example')",
        Response: 'new Response()',
        Request: "new Request('https://example.com')",
        AbortController: 'new AbortController()',
        AbortSignal: 'AbortSignal.abort()',
        // Streams
        ReadableStream: 'new ReadableStream()',
        WritableStream: 'new WritableStream()',
        TransformStream: 'new TransformStream()',
        // Structured data
        TextEncoder: 'new TextEncoder()',
        TextDecoder: 'new TextDecoder()',
        // Promises
        Promise: 'Promise.resolve(null)',
      }

      if (typeName in builtinExamples) {
        return builtinExamples[typeName]
      }

      // Resolve type aliases
      if (ctx?.typeAliases?.has(typeName)) {
        // Prevent infinite recursion
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          warnings?.push(`Circular type reference '${typeName}' - using 'any'`)
          return 'any'
        }
        visited.add(typeName)
        const resolvedType = ctx.typeAliases.get(typeName)!
        return typeToExample(resolvedType, checker, warnings, {
          ...ctx,
          visited,
        })
      }

      // Resolve interfaces
      if (ctx?.interfaces?.has(typeName)) {
        // Prevent infinite recursion
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          warnings?.push(`Circular type reference '${typeName}' - using 'any'`)
          return 'any'
        }
        visited.add(typeName)
        const iface = ctx.interfaces.get(typeName)!
        // Build example object from interface members
        const props: string[] = []
        for (const member of iface.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(ctx.sourceFile)
            let propExample = typeToExample(member.type, checker, warnings, {
              ...ctx,
              visited,
            })
            // `any` is not a valid literal value — use null for object properties.
            //
            // The INLINE object path has done this for a long time; the interface path did
            // not, so a resolved interface emitted `{ source: any }`. That is not merely
            // untidy: an optional object param is a DICTIONARY DEFAULT
            // (`docs/dictionary-defaults.md` §5.1 — `:` required, `=` defaulted), and §6.1
            // requires every member of one to be a pure literal. `any` is not, so the whole
            // parameter was rejected at graduation with "must be a pure literal". Two files
            // in our own dogfood corpus failed on exactly this.
            //
            // `null` is also the RIGHT default here rather than a placeholder: §5.2 says a
            // member admits null iff its default example is null, which is what an optional
            // member of unknown type should accept.
            if (propExample === 'any') propExample = 'null'
            // Always use : for object shape properties — = is only valid
            // in destructuring patterns, not in object literal examples
            props.push(`${propName}: ${propExample}`)
          }
        }
        return `{ ${props.join(', ')} }`
      }

      // Type parameters (generics like T, K, V)
      // Check if we have constraint or default info from enclosing context
      if (ctx?.typeParams?.has(typeName)) {
        const tp = ctx.typeParams.get(typeName)!
        if (tp.constraint) {
          return typeToExample(tp.constraint, checker, warnings, ctx)
        }
        if (tp.default) {
          return typeToExample(tp.default, checker, warnings, ctx)
        }
        // No constraint or default — fall through to 'any'
      }

      // DOM interface types — opaque objects, keep params annotated
      if (domInterfaceTypes.has(typeName)) {
        return '{}'
      }

      // Single uppercase letter or common generic names — treat as any
      if (
        /^[A-Z]$/.test(typeName) ||
        ['T', 'K', 'V', 'U', 'TKey', 'TValue', 'TItem', 'TResult'].includes(
          typeName
        )
      ) {
        warnings?.push(
          `Generic type parameter '${typeName}' converted to 'any' - consider specializing`
        )
        return 'any'
      }
      // Unknown type reference - treat as any
      warnings?.push(
        `Unknown type '${typeName}' converted to 'any' - may need manual review`
      )
      return 'any'
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode
      const props: string[] = []
      for (const member of typeLiteral.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText()
          // Position propagates into members: an object ANNOTATION may name types
          // (`{ name: string }`), an object VALUE may not.
          let propType = typeToExample(
            member.type,
            checker,
            warnings,
            ctx,
            position
          )
          // 'any' is not a valid literal value - use null for object properties
          if (propType === 'any') propType = 'null'
          // In object literals, always use : syntax (= is for function params only)
          props.push(`${propName}: ${propType}`)
        }
      }
      return `{ ${props.join(', ')} }`
    }

    case ts.SyntaxKind.UnionType: {
      const unionType = type as ts.UnionTypeNode

      // Helper to check if a type is null or undefined
      const isNullType = (t: ts.TypeNode) =>
        t.kind === ts.SyntaxKind.NullKeyword ||
        (ts.isLiteralTypeNode(t) &&
          t.literal.kind === ts.SyntaxKind.NullKeyword)
      const isUndefinedType = (t: ts.TypeNode) =>
        t.kind === ts.SyntaxKind.UndefinedKeyword ||
        (ts.isLiteralTypeNode(t) &&
          t.literal.kind === ts.SyntaxKind.UndefinedKeyword)

      // Check for nullable: T | null or T | undefined
      const nonNullTypes = unionType.types.filter(
        (t) => !isNullType(t) && !isUndefinedType(t)
      )
      const hasNull = unionType.types.some(isNullType)
      const hasUndefined = unionType.types.some(isUndefinedType)

      // All null/undefined — just return the simplest form
      if (nonNullTypes.length === 0) {
        if (hasNull) return 'null'
        return 'undefined'
      }

      if (nonNullTypes.length === 1 && (hasNull || hasUndefined)) {
        // Nullable type: T | null -> T | null
        const baseExample = typeToExample(
          nonNullTypes[0],
          checker,
          warnings,
          ctx,
          position
        )
        // any | null/undefined is just any — don't emit 'any | null'
        if (baseExample === 'any') return 'any'
        if (hasNull) return `${baseExample} | null`
        if (hasUndefined) return `${baseExample} | undefined`
      }

      // General union: if any member can't be expressed (any), degrade
      // the whole union to any — don't silently drop members
      const examples = unionType.types
        .map((t) => typeToExample(t, checker, warnings, ctx, position))
        .filter((e, i, arr) => arr.indexOf(e) === i) // deduplicate
      if (examples.some((e) => e === 'any')) return 'any'
      if (examples.length === 1) return examples[0]
      if (examples.length > 0) {
        // Check if any member is a complex expression (function call, new, etc.)
        // that would make | ambiguous as JS bitwise OR
        const hasComplexMember = examples.some(
          (e) => /[()]/.test(e) || e.startsWith('new ')
        )
        if (hasComplexMember) return 'any'
        return examples.join(' | ')
      }
      return 'undefined'
    }

    case ts.SyntaxKind.LiteralType: {
      // A TS literal type is EXACT, and TJS's example rule cannot say that on its own.
      //
      // `x: 1` in TypeScript means "x must BE 1". Emitted as bare `1` it becomes a TJS
      // EXAMPLE, i.e. "an integer, for instance 1" — so `one(2)` was accepted where TS
      // admits only `1`. Silent widening, no warning, in the converter whose whole job is
      // to preserve what the annotation meant. Same for `'go'` and `true`.
      //
      // `Exactly(…)` is the faithful spelling (#45). It costs nothing when the value really
      // was an example, because a TS author who meant "a number" wrote `number`.
      const literalType = type as ts.LiteralTypeNode
      if (ts.isStringLiteral(literalType.literal)) {
        return `Exactly('${literalType.literal.text}')`
      }
      if (ts.isNumericLiteral(literalType.literal)) {
        return `Exactly(${literalType.literal.text})`
      }
      if (literalType.literal.kind === ts.SyntaxKind.TrueKeyword) {
        return 'Exactly(true)'
      }
      if (literalType.literal.kind === ts.SyntaxKind.FalseKeyword) {
        return 'Exactly(false)'
      }
      if (literalType.literal.kind === ts.SyntaxKind.NullKeyword) {
        return 'null'
      }
      return 'undefined'
    }

    case ts.SyntaxKind.ParenthesizedType: {
      const parenType = type as ts.ParenthesizedTypeNode
      return typeToExample(parenType.type, checker)
    }

    case ts.SyntaxKind.FunctionType: {
      // Convert to inline FunctionPredicate expression
      const funcType = type as ts.FunctionTypeNode
      const fpParams: string[] = []
      for (const param of funcType.parameters) {
        const name = param.name?.getText() || '_'
        if (name === 'this') continue
        let paramExample = typeToExample(param.type, checker, warnings, ctx)
        if (paramExample === 'any') paramExample = 'null'
        fpParams.push(`${name}: ${paramExample}`)
      }
      let fpReturn = typeToExample(funcType.type, checker, warnings, ctx)
      if (fpReturn === 'any') fpReturn = 'null'
      const spec: string[] = []
      if (fpParams.length > 0) spec.push(`params: { ${fpParams.join(', ')} }`)
      if (fpReturn !== 'undefined') spec.push(`returns: ${fpReturn}`)
      return `FunctionPredicate('function', { ${spec.join(', ')} })`
    }

    case ts.SyntaxKind.TupleType: {
      const tupleType = type as ts.TupleTypeNode
      const elements = tupleType.elements.map((e) => {
        const example = ts.isNamedTupleMember(e)
          ? typeToExample(e.type, checker)
          : typeToExample(e as ts.TypeNode, checker)
        // 'any' is not a valid literal value
        return example === 'any' ? 'null' : example
      })
      return `[${elements.join(', ')}]`
    }

    default:
      return 'undefined'
  }
}

/**
 * Convert TypeScript type to TypeInfo for metadata
 */
function typeToInfo(
  type: ts.TypeNode | undefined,
  ctx?: TypeResolutionContext
): TypeInfo {
  if (!type) return { kind: 'any' }

  // Bail on deeply nested type resolution to prevent exponential traversal
  const depth = ctx?.depth ?? 0
  if (depth > MAX_TYPE_DEPTH) return { kind: 'any' }
  // Increment depth for recursive calls (mutating ctx would be wrong since
  // sibling types share the same ctx; spread creates a child scope)
  ctx = ctx ? { ...ctx, depth: depth + 1 } : undefined

  switch (type.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'boolean' }
    case ts.SyntaxKind.NullKeyword:
      return { kind: 'null' }
    case ts.SyntaxKind.UndefinedKeyword:
    case ts.SyntaxKind.VoidKeyword:
      return { kind: 'undefined' }

    case ts.SyntaxKind.ArrayType: {
      const arrayType = type as ts.ArrayTypeNode
      return { kind: 'array', items: typeToInfo(arrayType.elementType, ctx) }
    }

    case ts.SyntaxKind.TypeLiteral: {
      const typeLiteral = type as ts.TypeLiteralNode
      const shape: Record<string, TypeInfo> = {}
      for (const member of typeLiteral.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText()
          shape[propName] = typeToInfo(member.type, ctx)
        }
      }
      return { kind: 'object', shape }
    }

    case ts.SyntaxKind.UnionType: {
      const unionType = type as ts.UnionTypeNode
      const nonNullTypes = unionType.types.filter(
        (t) =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      )
      const hasNull = unionType.types.some(
        (t) => t.kind === ts.SyntaxKind.NullKeyword
      )

      if (nonNullTypes.length === 1 && hasNull) {
        return { ...typeToInfo(nonNullTypes[0], ctx), nullable: true }
      }

      return {
        kind: 'union',
        members: unionType.types.map((t) => typeToInfo(t, ctx)),
      }
    }

    case ts.SyntaxKind.IntersectionType: {
      const intersectionType = type as ts.IntersectionTypeNode
      // Flatten intersection into merged object shape
      const mergedShape: Record<string, TypeInfo> = {}
      for (const member of intersectionType.types) {
        const memberInfo = typeToInfo(member, ctx)
        if (memberInfo.kind === 'object' && memberInfo.shape) {
          Object.assign(mergedShape, memberInfo.shape)
        }
      }
      if (Object.keys(mergedShape).length > 0) {
        return { kind: 'object', shape: mergedShape }
      }
      // If no object shapes found, treat as any
      return { kind: 'any' }
    }

    case ts.SyntaxKind.TupleType: {
      const tupleType = type as ts.TupleTypeNode
      const elements: TypeInfo[] = []
      for (const element of tupleType.elements) {
        // Handle named tuple members: [x: number, y: string]
        if (ts.isNamedTupleMember(element)) {
          elements.push(typeToInfo(element.type, ctx))
        } else {
          elements.push(typeToInfo(element as ts.TypeNode, ctx))
        }
      }
      return { kind: 'tuple', elements }
    }

    case ts.SyntaxKind.TypeReference: {
      const typeRef = type as ts.TypeReferenceNode
      const typeName = typeRef.typeName.getText()
      if (typeName === 'Array' && typeRef.typeArguments?.length) {
        return {
          kind: 'array',
          items: typeToInfo(typeRef.typeArguments[0], ctx),
        }
      }
      if (typeName === 'Promise' && typeRef.typeArguments?.length) {
        return typeToInfo(typeRef.typeArguments[0], ctx)
      }
      if (
        (typeName === 'Generator' ||
          typeName === 'AsyncGenerator' ||
          typeName === 'IterableIterator' ||
          typeName === 'AsyncIterableIterator') &&
        typeRef.typeArguments?.length
      ) {
        return typeToInfo(typeRef.typeArguments[0], ctx)
      }

      // Handle utility types
      if (typeRef.typeArguments?.length) {
        const innerType = typeToInfo(typeRef.typeArguments[0], ctx)

        // Partial<T> - all properties become optional (we just return the shape)
        if (typeName === 'Partial') {
          return innerType
        }

        // Required<T> - all properties become required (we just return the shape)
        if (typeName === 'Required') {
          return innerType
        }

        // Readonly<T> - same shape, readonly is a compile-time concept
        if (typeName === 'Readonly') {
          return innerType
        }

        // Record<K, V> - object with string keys and V values
        if (typeName === 'Record' && typeRef.typeArguments.length >= 2) {
          const valueType = typeToInfo(typeRef.typeArguments[1], ctx)
          // Record is essentially an object with dynamic keys
          return { kind: 'object', shape: { '[key]': valueType } }
        }

        // Pick<T, K> and Omit<T, K> - just return the base type for now
        // Full implementation would need to filter properties
        if (typeName === 'Pick' || typeName === 'Omit') {
          return innerType
        }

        // NonNullable<T> - remove null/undefined
        if (typeName === 'NonNullable') {
          if (innerType.nullable) {
            return { ...innerType, nullable: false }
          }
          return innerType
        }

        // ReturnType<T>, Parameters<T>, etc. - complex, return any
        if (
          ['ReturnType', 'Parameters', 'ConstructorParameters'].includes(
            typeName
          )
        ) {
          return { kind: 'any' }
        }
      }

      // Resolve type aliases
      if (ctx?.typeAliases?.has(typeName)) {
        // Check cache first
        if (ctx.resolvedCache?.has(typeName)) {
          return ctx.resolvedCache.get(typeName)!
        }
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          return { kind: 'any' } // Circular reference
        }
        visited.add(typeName)
        const resolvedType = ctx.typeAliases.get(typeName)!
        const result = typeToInfo(resolvedType, { ...ctx, visited })
        ctx.resolvedCache?.set(typeName, result)
        return result
      }

      // Resolve interfaces
      if (ctx?.interfaces?.has(typeName)) {
        // Check cache first
        if (ctx.resolvedCache?.has(typeName)) {
          return ctx.resolvedCache.get(typeName)!
        }
        const visited = ctx.visited ?? new Set<string>()
        if (visited.has(typeName)) {
          return { kind: 'any' } // Circular reference
        }
        visited.add(typeName)
        const iface = ctx.interfaces.get(typeName)!
        const shape: Record<string, TypeInfo> = {}

        // Handle extends clauses - merge in base interface properties
        if (iface.heritageClauses) {
          for (const clause of iface.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              for (const baseType of clause.types) {
                const baseName = baseType.expression.getText(ctx.sourceFile)
                // Look up the base interface and recursively resolve it
                if (ctx.interfaces?.has(baseName) && !visited.has(baseName)) {
                  // Create a synthetic type reference node to look up the base
                  const syntheticRef = {
                    kind: ts.SyntaxKind.TypeReference,
                    typeName: { getText: () => baseName },
                  } as unknown as ts.TypeReferenceNode
                  const baseInfo = typeToInfo(syntheticRef, { ...ctx, visited })
                  if (baseInfo.kind === 'object' && baseInfo.shape) {
                    Object.assign(shape, baseInfo.shape)
                  }
                }
              }
            }
          }
        }

        // Add own members (may override base)
        for (const member of iface.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(ctx.sourceFile)
            shape[propName] = typeToInfo(member.type, { ...ctx, visited })
          }
        }
        const result = { kind: 'object' as const, shape }
        ctx.resolvedCache?.set(typeName, result)
        return result
      }

      // Check type parameter constraints/defaults from enclosing context
      if (ctx?.typeParams?.has(typeName)) {
        const tp = ctx.typeParams.get(typeName)!
        if (tp.constraint) {
          return typeToInfo(tp.constraint, ctx)
        }
        if (tp.default) {
          return typeToInfo(tp.default, ctx)
        }
      }

      // DOM interface types — opaque objects
      if (domInterfaceTypes.has(typeName)) {
        return { kind: 'object' }
      }

      // Generics and unknown types become 'any'
      return { kind: 'any' }
    }

    default:
      return { kind: 'any' }
  }
}

/**
 * Extract type parameter info (generics) from a function
 */
function extractTypeParams(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  warnings?: string[]
): Record<string, TypeParamInfo> | undefined {
  if (!node.typeParameters || node.typeParameters.length === 0) {
    return undefined
  }

  const typeParams: Record<string, TypeParamInfo> = {}

  for (const param of node.typeParameters) {
    const name = param.name.getText()
    const info: TypeParamInfo = {}

    // Extract constraint: T extends Foo
    if (param.constraint) {
      const constraintExample = typeToExample(
        param.constraint,
        undefined,
        warnings
      )
      // Try to parse as object/value for richer schema
      if (constraintExample.startsWith('{')) {
        try {
          // This is a rough parse - in production we'd use proper AST
          info.constraint = constraintExample
        } catch {
          info.constraint = constraintExample
        }
      } else {
        info.constraint = constraintExample
      }
    }

    // Extract default: T = Foo
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      info.default = defaultExample
    }

    typeParams[name] = info
  }

  return Object.keys(typeParams).length > 0 ? typeParams : undefined
}

/**
 * Transform a TypeScript function to TJS syntax
 */
/**
 * Transform a TypeScript interface to TJS Type declaration
 *
 * interface User { name: string; age: number }
 * ->
 * Type User { example: { name: '', age: 0 } }
 */
function transformInterfaceToType(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  annotations?: TjsAnnotation[]
): string | null {
  const typeName = node.name.getText(sourceFile)

  // Check for generics
  if (node.typeParameters && node.typeParameters.length > 0) {
    return transformGenericInterfaceToGeneric(
      node,
      sourceFile,
      warnings,
      annotations
    )
  }

  // Use @tjs example if provided, otherwise build from members
  const exampleAnnotation = annotations?.find((a) => a.kind === 'example')
  const predicateAnnotation = annotations?.find((a) => a.kind === 'predicate')

  let example: string
  if (exampleAnnotation?.text) {
    example = exampleAnnotation.text
  } else {
    const props: string[] = []
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText(sourceFile)
        let propExample = typeToExample(member.type, undefined, warnings)
        if (propExample === 'any') propExample = 'null'
        props.push(`${propName}: ${propExample}`)
      }
    }
    if (props.length === 0 && !predicateAnnotation) {
      return `Type ${typeName} {}`
    }
    example = props.length > 0 ? `{ ${props.join(', ')} }` : '{}'
  }

  const parts = [`example: ${example}`]
  if (predicateAnnotation?.text) {
    parts.push(predicateAnnotation.text)
  }

  return `Type ${typeName} {\n  ${parts.join('\n  ')}\n}`
}

/**
 * Transform a generic TypeScript interface to TJS Generic declaration
 *
 * interface Box<T> { value: T }
 * ->
 * Generic Box<T> {
 *   description: 'Box'
 *   predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) }
 * }
 */
function transformGenericInterfaceToGeneric(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  annotations?: TjsAnnotation[]
): string {
  const typeName = node.name.getText(sourceFile)
  const typeParams: string[] = []

  // Extract type parameters with constraints/defaults
  for (const param of node.typeParameters || []) {
    const paramName = param.name.getText(sourceFile)
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      typeParams.push(`${paramName} = ${defaultExample}`)
    } else {
      typeParams.push(paramName)
    }
  }

  // Use @tjs predicate if provided, otherwise auto-generate
  const predicateAnnotation = annotations?.find((a) => a.kind === 'predicate')
  const declarationAnnotation = annotations?.find(
    (a) => a.kind === 'declaration'
  )

  let predicateLine: string
  if (predicateAnnotation?.text) {
    predicateLine = predicateAnnotation.text
  } else {
    // Build predicate checks from interface members
    const typeParamNames = (node.typeParameters || []).map((p) =>
      p.name.getText(sourceFile)
    )
    const checks: string[] = ["typeof x === 'object'", 'x !== null']

    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText(sourceFile)
        const isComputed = propName.startsWith('[') && propName.endsWith(']')
        const symbolName = isComputed ? propName.slice(1, -1) : null

        if (isComputed) {
          checks.push(`${symbolName} in x`)
        } else {
          checks.push(`'${propName}' in x`)
        }

        if (member.type && ts.isTypeReferenceNode(member.type)) {
          const refName = member.type.typeName.getText(sourceFile)
          if (typeParamNames.includes(refName)) {
            if (isComputed) {
              checks.push(`${refName}(x[${symbolName}])`)
            } else {
              checks.push(`${refName}(x.${propName})`)
            }
          }
        }
      }
    }

    const predicateParams = ['x', ...typeParamNames].join(', ')
    predicateLine = `predicate(${predicateParams}) { return ${checks.join(
      ' && '
    )} }`
  }

  const parts = [`description: '${typeName}'`, predicateLine]

  if (declarationAnnotation?.text) {
    parts.push(`declaration ${declarationAnnotation.text}`)
  } else {
    // Auto-generate declaration block from interface members. Each member's
    // type is converted to a TJS example via `typeToExample` (the same converter
    // the non-generic interface path uses) rather than emitted as raw TS — so
    // `path: string` → `path: ''`, `touch: () => void` → a FunctionPredicate
    // example, and un-representable shapes (call-signature objects, etc.) degrade
    // to a safe placeholder instead of producing TJS that won't re-parse.
    // (The `@tjs declaration { … }` annotation path above is verbatim and
    // unaffected — authors can still hand-write precise type signatures.)
    const declMembers: string[] = []
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText(sourceFile)
        const optional = member.questionToken ? '?' : ''
        const example = member.type
          ? typeToExample(member.type, undefined, warnings)
          : 'null'
        declMembers.push(`${propName}${optional}: ${example}`)
      } else if (ts.isMethodSignature(member) && member.name) {
        // Method → a function example built from its return type (params are
        // descriptive; the predicate above does the actual runtime check).
        const propName = member.name.getText(sourceFile)
        const ret = member.type
          ? typeToExample(member.type, undefined, warnings)
          : 'null'
        declMembers.push(
          `${propName}: FunctionPredicate('function', { returns: ${ret} })`
        )
      }
    }
    if (declMembers.length > 0) {
      parts.push(`declaration {\n    ${declMembers.join('\n    ')}\n  }`)
    }
  }

  return `Generic ${typeName}<${typeParams.join(', ')}> {\n  ${parts.join(
    '\n  '
  )}\n}`
}

/**
 * Check if a TypeScript union type is a literal union (e.g., 'up' | 'down' | 'left')
 * Returns the literal values if it is, null otherwise
 */
function extractLiteralUnionValues(
  type: ts.TypeNode,
  _sourceFile: ts.SourceFile
): string[] | null {
  if (!ts.isUnionTypeNode(type)) return null

  const values: string[] = []
  for (const member of type.types) {
    if (ts.isLiteralTypeNode(member)) {
      if (ts.isStringLiteral(member.literal)) {
        values.push(`'${member.literal.text}'`)
      } else if (ts.isNumericLiteral(member.literal)) {
        values.push(member.literal.text)
      } else if (member.literal.kind === ts.SyntaxKind.TrueKeyword) {
        values.push('true')
      } else if (member.literal.kind === ts.SyntaxKind.FalseKeyword) {
        values.push('false')
      } else if (member.literal.kind === ts.SyntaxKind.NullKeyword) {
        values.push('null')
      } else {
        // Not a literal we can handle
        return null
      }
    } else if (member.kind === ts.SyntaxKind.NullKeyword) {
      values.push('null')
    } else if (member.kind === ts.SyntaxKind.UndefinedKeyword) {
      values.push('undefined')
    } else {
      // Not a literal union (has complex types)
      return null
    }
  }

  return values.length > 0 ? values : null
}

/**
 * Transform a TypeScript enum to TJS Enum declaration
 *
 * enum Status { Pending, Active, Done }
 * ->
 * Enum Status 'Status' {
 *   Pending
 *   Active
 *   Done
 * }
 *
 * enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
 * ->
 * Enum Color 'Color' {
 *   Red = 'red'
 *   Green = 'green'
 *   Blue = 'blue'
 * }
 */
function transformEnumToTJS(
  node: ts.EnumDeclaration,
  sourceFile: ts.SourceFile,
  _warnings?: string[]
): string | null {
  const enumName = node.name.getText(sourceFile)
  const members: string[] = []

  let nextValue = 0
  for (const member of node.members) {
    const memberName = member.name.getText(sourceFile)

    if (member.initializer) {
      // Has explicit value
      if (ts.isStringLiteral(member.initializer)) {
        members.push(`  ${memberName} = '${member.initializer.text}'`)
      } else if (ts.isNumericLiteral(member.initializer)) {
        const numValue = parseInt(member.initializer.text, 10)
        members.push(`  ${memberName} = ${numValue}`)
        nextValue = numValue + 1
      } else if (
        ts.isPrefixUnaryExpression(member.initializer) &&
        member.initializer.operator === ts.SyntaxKind.MinusToken
      ) {
        // Negative number
        const operand = member.initializer.operand
        if (ts.isNumericLiteral(operand)) {
          const numValue = -parseInt(operand.text, 10)
          members.push(`  ${memberName} = ${numValue}`)
          nextValue = numValue + 1
        }
      } else {
        // Expression or other complex initializer - use the text directly
        members.push(
          `  ${memberName} = ${member.initializer.getText(sourceFile)}`
        )
      }
    } else {
      // Auto-increment numeric value
      members.push(`  ${memberName} = ${nextValue}`)
      nextValue++
    }
  }

  return `Enum ${enumName} '${enumName}' {
${members.join('\n')}
}`
}

/**
 * Transform a TypeScript type alias to TJS Type declaration
 *
 * type User = { name: string; age: number }
 * ->
 * Type User { example: { name: '', age: 0 } }
 *
 * type Direction = 'up' | 'down' | 'left' | 'right'
 * ->
 * Union Direction 'Direction' 'up' | 'down' | 'left' | 'right'
 */
function transformTypeAliasToType(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  annotations?: TjsAnnotation[]
): string | null {
  const typeName = node.name.getText(sourceFile)

  // Check for generics
  if (node.typeParameters && node.typeParameters.length > 0) {
    // Generic function types → generic FunctionPredicate
    if (node.type.kind === ts.SyntaxKind.FunctionType) {
      return transformGenericFunctionTypeToFP(node, sourceFile, warnings)
    }
    return transformGenericTypeAliasToGeneric(
      node,
      sourceFile,
      warnings,
      annotations
    )
  }

  // Check for literal union type → emit Union syntax
  const literalValues = extractLiteralUnionValues(node.type, sourceFile)
  if (literalValues) {
    return `Union ${typeName} '${typeName}' ${literalValues.join(' | ')}`
  }

  // Function types → FunctionPredicate declaration
  if (node.type.kind === ts.SyntaxKind.FunctionType) {
    const funcType = node.type as ts.FunctionTypeNode
    const fpParams: string[] = []
    for (const param of funcType.parameters) {
      const name = param.name?.getText(sourceFile) || '_'
      if (name === 'this') continue
      let paramExample = typeToExample(param.type, undefined, warnings)
      if (paramExample === 'any') paramExample = 'null'
      fpParams.push(`${name}: ${paramExample}`)
    }
    let fpReturn = typeToExample(funcType.type, undefined, warnings)
    if (fpReturn === 'any') fpReturn = 'null'
    const spec: string[] = []
    if (fpParams.length > 0) spec.push(`params: { ${fpParams.join(', ')} }`)
    if (fpReturn !== 'undefined') spec.push(`returns: ${fpReturn}`)
    return `FunctionPredicate ${typeName} {\n  ${spec.join('\n  ')}\n}`
  }

  const example = typeToExample(node.type, undefined, warnings)

  // 'any' and 'undefined' — un-representable in TJS (intersections with
  // `typeof`/index signatures, etc.). Degrade to an empty Type (validates as
  // anything) and preserve the original TS body as a SINGLE-LINE comment so the
  // DTS emitter can recover it. The collapse is essential: a multi-line type
  // body would leave lines 2+ uncommented = raw TS leaking into the block =
  // unparseable. (Representable shapes never reach here — they convert above.)
  if (example === 'any' || example === 'undefined') {
    const originalType = node.type
      .getText(sourceFile)
      .trim()
      .replace(/\s+/g, ' ')
    return `Type ${typeName} {\n  // TS: ${originalType}\n}`
  }

  // For simple primitive types, use short form
  if (
    example === "''" ||
    example === '0' ||
    example === 'true' ||
    example === 'null'
  ) {
    return `Type ${typeName} ${example}`
  }

  return `Type ${typeName} {
  example: ${example}
}`
}

/**
 * Transform a generic function type alias to a generic FunctionPredicate declaration.
 * e.g. `type Creator<T> = (x: string) => T` → `FunctionPredicate Creator<T> { params: { x: '' } returns: T }`
 */
function transformGenericFunctionTypeToFP(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string {
  const typeName = node.name.getText(sourceFile)
  const funcType = node.type as ts.FunctionTypeNode

  // Build type params string: <T, U = {}>
  const typeParamNames = new Set<string>()
  const typeParams: string[] = []
  for (const tp of node.typeParameters!) {
    const name = tp.name.getText(sourceFile)
    typeParamNames.add(name)
    if (tp.default) {
      const defaultExample = typeToExample(tp.default, undefined, warnings)
      typeParams.push(`${name} = ${defaultExample}`)
    } else {
      typeParams.push(name)
    }
  }

  // Build params — preserve type param references as bare identifiers
  const fpParams: string[] = []
  for (const param of funcType.parameters) {
    const name = param.name?.getText(sourceFile) || '_'
    if (name === 'this') continue
    const paramTypeText = param.type?.getText(sourceFile) || 'any'
    if (typeParamNames.has(paramTypeText)) {
      // Type param reference — keep as-is
      fpParams.push(`${name}: ${paramTypeText}`)
    } else {
      let paramExample = typeToExample(param.type, undefined, warnings)
      if (paramExample === 'any') paramExample = 'null'
      fpParams.push(`${name}: ${paramExample}`)
    }
  }

  // Build return type — preserve type param references
  const returnTypeText = funcType.type?.getText(sourceFile) || 'void'
  let fpReturn: string | undefined
  if (returnTypeText !== 'void') {
    if (typeParamNames.has(returnTypeText)) {
      fpReturn = returnTypeText
    } else {
      fpReturn = typeToExample(funcType.type, undefined, warnings)
      if (fpReturn === 'any') fpReturn = 'null'
      if (fpReturn === 'undefined') fpReturn = undefined
    }
  }

  const spec: string[] = []
  if (fpParams.length > 0) spec.push(`params: { ${fpParams.join(', ')} }`)
  if (fpReturn !== undefined) spec.push(`returns: ${fpReturn}`)
  return `FunctionPredicate ${typeName}<${typeParams.join(
    ', '
  )}> {\n  ${spec.join('\n  ')}\n}`
}

/**
 * Transform a generic type alias to TJS Generic declaration
 */
function transformGenericTypeAliasToGeneric(
  node: ts.TypeAliasDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  annotations?: TjsAnnotation[]
): string {
  const typeName = node.name.getText(sourceFile)
  const typeParams: string[] = []

  // Extract type parameters
  for (const param of node.typeParameters || []) {
    const paramName = param.name.getText(sourceFile)
    if (param.default) {
      const defaultExample = typeToExample(param.default, undefined, warnings)
      typeParams.push(`${paramName} = ${defaultExample}`)
    } else {
      typeParams.push(paramName)
    }
  }

  const typeParamNames = (node.typeParameters || []).map((p) =>
    p.name.getText(sourceFile)
  )

  // Use @tjs predicate if provided, otherwise default placeholder
  const predicateAnnotation = annotations?.find((a) => a.kind === 'predicate')
  const declarationAnnotation = annotations?.find(
    (a) => a.kind === 'declaration'
  )

  let predicateLine: string
  if (predicateAnnotation?.text) {
    predicateLine = predicateAnnotation.text
  } else {
    const predicateParams = ['x', ...typeParamNames].join(', ')
    predicateLine = `predicate(${predicateParams}) { return true }`
  }

  const parts = [`description: '${typeName}'`, predicateLine]

  if (declarationAnnotation?.text) {
    parts.push(`declaration ${declarationAnnotation.text}`)
  } else {
    // Auto-generate declaration block from the type body
    const typeBody = node.type

    if (typeBody && ts.isTypeLiteralNode(typeBody)) {
      // Object type literal: { item: T; count: number }. Convert each member's
      // type to a TJS example (degrades gracefully) rather than emitting raw TS.
      const declMembers: string[] = []
      for (const member of typeBody.members) {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile)
          const optional = member.questionToken ? '?' : ''
          const example = member.type
            ? typeToExample(member.type, undefined, warnings)
            : 'null'
          declMembers.push(`${propName}${optional}: ${example}`)
        } else if (ts.isMethodSignature(member) && member.name) {
          const propName = member.name.getText(sourceFile)
          const ret = member.type
            ? typeToExample(member.type, undefined, warnings)
            : 'null'
          declMembers.push(
            `${propName}: FunctionPredicate('function', { returns: ${ret} })`
          )
        }
      }
      if (declMembers.length > 0) {
        parts.push(`declaration {\n    ${declMembers.join('\n    ')}\n  }`)
      }
    } else if (typeBody) {
      // Complex type (conditional, mapped, intersection, …) — un-representable.
      // Keep the TS body as a SINGLE-LINE comment (collapse newlines, else lines
      // 2+ leak as raw TS and won't re-parse).
      const typeText = typeBody.getText(sourceFile).trim().replace(/\s+/g, ' ')
      parts.push(`declaration {\n    // TS: ${typeText}\n  }`)
    }
  }

  return `Generic ${typeName}<${typeParams.join(', ')}> {\n  ${parts.join(
    '\n  '
  )}\n}`
}

function transformFunctionToTJS(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  explicitName?: string,
  warnings?: string[],
  includeLineNumber?: boolean,
  ctx?: TypeResolutionContext
): string {
  // Build type parameter map from generic params (constraint/default)
  let typeParamMap:
    | Map<string, { constraint?: ts.TypeNode; default?: ts.TypeNode }>
    | undefined
  if (node.typeParameters && node.typeParameters.length > 0) {
    typeParamMap = new Map()
    for (const tp of node.typeParameters) {
      typeParamMap.set(tp.name.getText(sourceFile), {
        constraint: tp.constraint,
        default: tp.default,
      })
    }
  }

  // Merge type params into ctx for resolution in typeToExample
  const resolveCtx: TypeResolutionContext | undefined =
    typeParamMap || ctx
      ? { ...ctx, typeParams: typeParamMap ?? ctx?.typeParams }
      : ctx

  const degraded: string[] = []
  const params = transformParams(
    node.parameters,
    sourceFile,
    warnings,
    degraded,
    resolveCtx
  )

  // Get line number (1-indexed) for source mapping
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  )
  const lineComment = includeLineNumber ? `/* line ${line + 1} */\n` : ''

  const funcName =
    explicitName ||
    (ts.isFunctionDeclaration(node) && node.name
      ? node.name.getText(sourceFile)
      : '')
  const returnExample = node.type
    ? typeToExample(node.type, undefined, warnings, resolveCtx, 'annotation')
    : ''
  // Use :! to skip signature tests - TS types are compile-time only,
  // the example values won't necessarily match runtime behavior
  const returnAnnotation = usableAsReturnExample(returnExample)
    ? `:! ${returnExample}`
    : ''

  // Track degraded return type
  if (node.type && (returnExample === 'any' || returnExample === 'undefined')) {
    const originalReturn = node.type.getText(sourceFile)
    if (
      originalReturn !== 'any' &&
      originalReturn !== 'unknown' &&
      originalReturn !== 'void'
    ) {
      degraded.push(`return: ${originalReturn}`)
    }
  }

  // Get function body and strip TypeScript syntax using ts.transpileModule
  let body: string
  if (node.body) {
    const bodyText = ts.isBlock(node.body)
      ? node.body.getText(sourceFile)
      : `{ return ${node.body.getText(sourceFile)} }`

    // Use TypeScript's transpiler to strip all type syntax
    const transpiled = ts.transpileModule(bodyText, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        removeComments: false,
      },
    })
    body = transpiled.outputText.trim()
  } else {
    body = '{ }'
  }

  // Check for export, async, and generator modifiers
  const isExported = node.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  )
  const isAsync = node.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.AsyncKeyword
  )
  const isGenerator = !!(node as ts.FunctionDeclaration).asteriskToken
  const exportPrefix = isExported ? 'export ' : ''
  const asyncPrefix = isAsync ? 'async ' : ''
  const funcKeyword = isGenerator ? 'function* ' : 'function '

  // Emit migration comment if any types were degraded
  const degradedComment =
    degraded.length > 0
      ? `/* TODO: TS types degraded — ${degraded.join(', ')} */\n`
      : ''

  return `${lineComment}${degradedComment}${exportPrefix}${asyncPrefix}${funcKeyword}${funcName}(${params.join(
    ', '
  )})${returnAnnotation} ${body}`
}

/**
 * Emit a full TJS overload group: the implementation (renamed) + wrapper signatures.
 * Each overload signature becomes a TJS function that delegates to the implementation.
 * TJS polymorphic dispatch merges the wrappers into a dispatcher automatically.
 */
function emitOverloadGroup(
  signatures: ts.FunctionDeclaration[],
  implementation: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[]
): string[] {
  const funcName = implementation.name?.getText(sourceFile) || ''
  const implName = `_${funcName}_impl`
  const results: string[] = []

  // TS overloads map onto TJS polymorphic dispatch — an UPGRADE, since TS erases the
  // signatures at runtime while TJS makes them real. But the upgrade is not always
  // expressible: TJS dispatch rejects rest parameters in a variant, so a group like
  //   function ajs(strings: TemplateStringsArray, ...values: any[]): SeqNode
  // produces code our own language refuses, and the whole file fails to convert.
  //
  // Fall back to what TypeScript actually runs — the IMPLEMENTATION — and say what we
  // could not do. Obligation 1 (behavior preserved: the implementation is the only thing
  // that exists at runtime in TS) plus obligation 3 (name the upgrade we skipped).
  const restInSignature = signatures.some((sig) =>
    sig.parameters.some((p) => !!p.dotDotDotToken)
  )
  if (restInSignature) {
    warnings?.push(
      `Overloads for '${funcName}' use rest parameters, which TJS polymorphic dispatch ` +
        `does not support. Emitted the implementation only — behavior is unchanged, but ` +
        `the overload signatures are not enforced at runtime.`
    )
    const only = transformFunctionToTJS(
      implementation,
      sourceFile,
      undefined,
      warnings
    )
    return [
      `/* TJS: ${signatures.length} overload signature(s) for \`${funcName}\` not ` +
        `converted to polymorphic dispatch (rest parameters are unsupported there). ` +
        `TypeScript erases these at runtime, so behavior is unchanged. */\n${only}`,
    ]
  }

  /**
   * Does the implementation discriminate by hand?
   *
   * In TypeScript it HAS to: overload signatures are erased, there is one implementation
   * typed `any`, and it must sort out which case it got. After conversion the wrappers
   * dispatch for real, so that branching is redundant — the author is now paying for
   * dispatch twice, with the inner copy untyped.
   *
   * We do NOT unroll it. Splitting a hand-written `if` chain into variants is the kind of
   * rewrite that would be right most of the time and silently wrong occasionally, and a
   * converter that is occasionally wrong is worse than one that is honest. So: recognise
   * it, and say so at the site.
   *
   * An `if`/`switch` anywhere in the body is the signal. A false positive costs one comment
   * and points at a simplification that is available anyway; a false negative costs nothing.
   */
  const implDiscriminates = (() => {
    let found = false
    const visit = (n: ts.Node): void => {
      if (found) return
      if (ts.isIfStatement(n) || ts.isSwitchStatement(n)) {
        found = true
        return
      }
      ts.forEachChild(n, visit)
    }
    if (implementation.body) visit(implementation.body)
    return found
  })()

  // Emit the implementation as a renamed private function
  const implParams = transformParams(
    implementation.parameters,
    sourceFile,
    warnings
  )
  let implBody = '{ }'
  if (implementation.body) {
    const bodyText = implementation.body.getText(sourceFile)
    const transpiled = ts.transpileModule(bodyText, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        removeComments: false,
      },
    })
    implBody = transpiled.outputText.trim()
  }
  const isAsync = implementation.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.AsyncKeyword
  )
  const isGenerator = !!implementation.asteriskToken
  const asyncPrefix = isAsync ? 'async ' : ''
  const funcKeyword = isGenerator ? 'function* ' : 'function '

  // Guidance, not a rewrite. The comment sits ON the redundant implementation because a
  // remedy shown at the site is what gets acted on — measured: a remedy in code repaired
  // 80% where the same advice as prose repaired 50% and a bare diagnostic 0% (A1).
  const guidance = implDiscriminates
    ? `/* TJS: \`${funcName}\` now dispatches for REAL — each signature above is a variant
` +
      `   selected at runtime, not just checked at compile time. TypeScript erased them, so
` +
      `   this implementation had to sort out which case it got by hand; that branching is
` +
      `   now redundant.
` +
      `   To simplify: move each branch into its own \`${funcName}\` variant and delete
` +
      `   \`${implName}\`. Each variant gets its parameters typed, instead of one \`any\`. */
`
    : ''

  results.push(
    `${guidance}${asyncPrefix}${funcKeyword}${implName}(${implParams.join(
      ', '
    )}) ${implBody}`
  )

  // Emit each overload signature as a wrapper that delegates to the implementation
  for (const sig of signatures) {
    const params = transformParams(sig.parameters, sourceFile, warnings)
    const paramNames = sig.parameters.map((p) => p.name.getText(sourceFile))
    const returnExample = sig.type
      ? typeToExample(sig.type, undefined, warnings, undefined, 'annotation')
      : ''
    const returnAnnotation = usableAsReturnExample(returnExample)
      ? `:! ${returnExample}`
      : ''

    const { line } = sourceFile.getLineAndCharacterOfPosition(
      sig.getStart(sourceFile)
    )
    const lineComment = `/* line ${line + 1} */\n`
    const returnKw = isGenerator ? 'yield* ' : 'return '

    results.push(
      `${lineComment}${asyncPrefix}${funcKeyword}${funcName}(${params.join(
        ', '
      )})${returnAnnotation} { ${returnKw}${implName}(${paramNames.join(
        ', '
      )}) }`
    )
  }

  return results
}

/**
 * Transform TypeScript class to TJS class
 * Converts TS type annotations to TJS example-based annotations
 */

/**
 * An expression's source text with every type-argument list removed.
 *
 * `extendsType.expression` already drops the heritage clause's OWN type arguments
 * (`extends Component<T>` -> `Component`), which is why that was all this needed for a long
 * time. It is not enough when the base is a CALL:
 *
 *     class User extends Schema.Class<User>("User")({ id: 1 }) {}
 *
 * There the `<User>` belongs to an inner call expression, so `getText()` returns it verbatim
 * and the emitted class does not parse. That is effect's standard idiom and the single
 * largest cause of conversion failure in that codebase.
 *
 * Spans are removed right-to-left so earlier offsets stay valid, and they are taken from the
 * AST rather than matched textually — `<` and `>` are also comparison operators, and a
 * regex that cannot tell them apart is the literal-blindness defect this repo keeps finding.
 */
function stripTypeArguments(
  expr: ts.Expression,
  sourceFile: ts.SourceFile
): string {
  const text = expr.getText(sourceFile)
  const base = expr.getStart(sourceFile)
  const spans: Array<[number, number]> = []

  const visit = (node: ts.Node): void => {
    const args = (node as any).typeArguments as
      | ts.NodeArray<ts.Node>
      | undefined
    if (args && args.length > 0) {
      // `pos` sits just after `<` and `end` just before `>`, so widen by one each way.
      spans.push([args.pos - 1 - base, args.end + 1 - base])
    }
    node.forEachChild(visit)
  }
  visit(expr)

  let out = text
  for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) {
    if (a >= 0 && b <= out.length && a < b) out = out.slice(0, a) + out.slice(b)
  }
  return out
}

function transformClassToTJS(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  ctx?: TypeResolutionContext,
  convertPrivateToHash = false
): string {
  // Build type parameter map from class-level generics
  let resolveCtx = ctx
  if (node.typeParameters && node.typeParameters.length > 0) {
    const typeParamMap = new Map<
      string,
      { constraint?: ts.TypeNode; default?: ts.TypeNode }
    >()
    for (const tp of node.typeParameters) {
      typeParamMap.set(tp.name.getText(sourceFile), {
        constraint: tp.constraint,
        default: tp.default,
      })
    }
    resolveCtx = { ...ctx, typeParams: typeParamMap }
  }

  const className = node.name?.getText(sourceFile) || 'Anonymous'
  // Get base class name, stripping type arguments (e.g. Component<T> → Component)
  const extendsType = node.heritageClauses?.find(
    (h) => h.token === ts.SyntaxKind.ExtendsKeyword
  )?.types[0]
  const extendsClause = extendsType
    ? stripTypeArguments(extendsType.expression, sourceFile)
    : undefined

  // With TjsClass: convert TS private to JS # (true runtime privacy).
  // Without TjsClass: strip the keyword, keep the name (TS private is compile-time only).
  const privateFieldMap = new Map<string, string>()
  if (convertPrivateToHash) {
    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member) && member.name) {
        const propName = member.name.getText(sourceFile)
        const isPrivate = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.PrivateKeyword
        )
        if (isPrivate && !propName.startsWith('#')) {
          privateFieldMap.set(propName, `#${propName}`)
        }
      }
    }
  }

  // Helper to replace private field references in transpiled code
  // Handles: this.prop, ClassName.prop (static), varName.prop (instance via variable)
  const replacePrivateRefs = (code: string): string => {
    let result = code
    for (const [tsName, jsName] of privateFieldMap) {
      // Match property access on any identifier: word.propName or this.propName
      // This covers this.prop, ClassName.prop, and varName.prop
      result = result.replace(
        new RegExp(`(\\b\\w+)\\.${tsName}\\b`, 'g'),
        `$1.${jsName}`
      )
    }
    return result
  }

  const members: string[] = []

  for (const member of node.members) {
    // Constructor
    if (ts.isConstructorDeclaration(member)) {
      const params = transformParams(member.parameters, sourceFile, warnings)
      let body = '{ }'
      if (member.body) {
        const transpiled = ts.transpileModule(member.body.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        body = replacePrivateRefs(transpiled.outputText.trim())
      }

      // TypeScript PARAMETER PROPERTIES (`constructor(public x: number)`) are not
      // annotations — they GENERATE `this.x = x`. They live on the parameter list, not
      // in the body, so transpiling `member.body` alone drops them and every such field
      // is `undefined` at runtime. The class still compiles and still runs, which is
      // what made this expensive: nothing reported it. (The plain-JS path was always
      // correct, because there tsc does its own downleveling.)
      const paramProps = member.parameters
        .filter((p) =>
          p.modifiers?.some(
            (m) =>
              m.kind === ts.SyntaxKind.PublicKeyword ||
              m.kind === ts.SyntaxKind.PrivateKeyword ||
              m.kind === ts.SyntaxKind.ProtectedKeyword ||
              m.kind === ts.SyntaxKind.ReadonlyKeyword
          )
        )
        .map((p) => p.name.getText(sourceFile))
      if (paramProps.length) {
        const assigns = paramProps.map((n) => `this.${n} = ${n}`)
        const inner = body.replace(/^\{|\}$/g, '').trim()
        // AFTER `super(…)`, never before — touching `this` first throws, which is why
        // TypeScript orders it this way too.
        const supLen = leadingSuperCallLength(inner)
        const rest = supLen ? inner.slice(supLen).trim() : inner
        const head = supLen ? [inner.slice(0, supLen).trim()] : []
        body = `{\n    ${[...head, ...assigns, rest]
          .filter(Boolean)
          .join('\n    ')}\n  }`
      }

      members.push(`  constructor(${params.join(', ')}) ${body}`)
    }

    // Regular methods
    if (ts.isMethodDeclaration(member) && member.name) {
      const methodName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )
      const isAsync = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.AsyncKeyword
      )

      const params = transformParams(
        member.parameters,
        sourceFile,
        warnings,
        undefined,
        resolveCtx
      )
      const returnExample = member.type
        ? typeToExample(
            member.type,
            undefined,
            warnings,
            resolveCtx,
            'annotation'
          )
        : ''
      // Use :! to skip signature tests for TS-transpiled code
      const returnAnnotation = usableAsReturnExample(returnExample)
        ? `:! ${returnExample}`
        : ''

      let body = '{ }'
      if (member.body) {
        const transpiled = ts.transpileModule(member.body.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        body = replacePrivateRefs(transpiled.outputText.trim())
      }

      const isGenerator = !!member.asteriskToken
      const staticPrefix = isStatic ? 'static ' : ''
      const asyncPrefix = isAsync ? 'async ' : ''
      const generatorStar = isGenerator ? '*' : ''
      members.push(
        `  ${staticPrefix}${asyncPrefix}${generatorStar}${methodName}(${params.join(
          ', '
        )})${returnAnnotation} ${body}`
      )
    }

    // Getters
    if (ts.isGetAccessorDeclaration(member) && member.name) {
      const propName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )
      const staticPrefix = isStatic ? 'static ' : ''
      const returnExample = member.type
        ? typeToExample(
            member.type,
            undefined,
            warnings,
            resolveCtx,
            'annotation'
          )
        : ''
      const returnAnnotation =
        returnExample &&
        returnExample !== 'undefined' &&
        returnExample !== 'any' &&
        !returnExample.startsWith('new ')
          ? `: ${returnExample}`
          : ''

      let body = '{ }'
      if (member.body) {
        const transpiled = ts.transpileModule(member.body.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        body = replacePrivateRefs(transpiled.outputText.trim())
      }

      members.push(
        `  ${staticPrefix}get ${propName}()${returnAnnotation} ${body}`
      )
    }

    // Setters
    if (ts.isSetAccessorDeclaration(member) && member.name) {
      const propName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )
      const staticPrefix = isStatic ? 'static ' : ''
      const params = transformParams(member.parameters, sourceFile, warnings)

      let body = '{ }'
      if (member.body) {
        const transpiled = ts.transpileModule(member.body.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        body = replacePrivateRefs(transpiled.outputText.trim())
      }

      members.push(
        `  ${staticPrefix}set ${propName}(${params.join(', ')}) ${body}`
      )
    }

    // Properties with initializers (private fields, regular properties)
    if (ts.isPropertyDeclaration(member) && member.name) {
      const origName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )
      const staticPrefix = isStatic ? 'static ' : ''

      // Use mapped name (# for private) or original
      const propName = privateFieldMap.get(origName) || origName

      if (member.initializer) {
        // Wrap in parens so TS treats { ... } as an object expression,
        // not a block with labels (which mangles property colons)
        const initText = member.initializer.getText(sourceFile)
        const wrapped = initText.trimStart().startsWith('{')
          ? `(${initText})`
          : initText
        const transpiled = ts.transpileModule(wrapped, {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        let output = transpiled.outputText.trim()
        // Strip the wrapping parens and trailing semicolon
        if (wrapped !== initText) {
          output = output.replace(/^\(/, '').replace(/\);?\s*$/, '')
        }
        members.push(`  ${staticPrefix}${propName} = ${output}`)
      } else {
        // Property without initializer - just declare it
        members.push(`  ${staticPrefix}${propName}`)
      }
    }
  }

  const isExported = node.modifiers?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  )
  const exportPrefix = isExported ? 'export ' : ''
  const extendsStr = extendsClause ? ` extends ${extendsClause}` : ''
  return `${exportPrefix}class ${className}${extendsStr} {\n${members.join(
    '\n'
  )}\n}`
}

/**
 * Helper to transform parameters to TJS format
 */
/**
 * Text of a parameter's default value, with type-only wrappers removed — and a note saying
 * so, because **we do not silently erase TypeScript.**
 *
 * `param.initializer.getText()` returns raw source, so `m = {} as M` kept the cast and the
 * emitted TJS failed to parse (`as` is not valid in a parameter default). Dropping it is
 * safe — `as`/`satisfies`/`!` have no runtime effect, so removing them cannot change
 * behavior (conversion contract, obligation 1) — but it DOES discard something the author
 * wrote, so obligation 3 applies: leave guidance at the site rather than quietly deleting
 * intent. `m = {} as M` is a type annotation in disguise, and once `n: T = default` is
 * supported it should become an UPGRADE rather than a deletion.
 *
 * Unwraps repeatedly, since `x as unknown as T` and `(x as T)!` both occur in the wild.
 */
function initializerText(
  init: ts.Expression,
  sourceFile: ts.SourceFile
): { text: string; erased: string[] } {
  let node: ts.Expression = init
  const erased: string[] = []
  for (;;) {
    if (ts.isAsExpression(node)) {
      erased.push(`as ${node.type.getText(sourceFile)}`)
      node = node.expression
      continue
    }
    if (ts.isSatisfiesExpression(node)) {
      erased.push(`satisfies ${node.type.getText(sourceFile)}`)
      node = node.expression
      continue
    }
    if (ts.isTypeAssertionExpression(node)) {
      erased.push(`<${node.type.getText(sourceFile)}>`)
      node = node.expression
      continue
    }
    if (ts.isNonNullExpression(node)) {
      erased.push('!')
      node = node.expression
      continue
    }
    if (ts.isParenthesizedExpression(node)) {
      // Only unwrap parens that exist SOLELY to hold a cast — otherwise keep them, since
      // they may be carrying precedence.
      const inner = node.expression
      if (
        ts.isAsExpression(inner) ||
        ts.isSatisfiesExpression(inner) ||
        ts.isTypeAssertionExpression(inner)
      ) {
        node = inner
        continue
      }
    }
    break
  }
  return { text: node.getText(sourceFile), erased }
}

/**
 * A parameter default plus, when something type-only was removed, an inline note.
 * The comment is the deliverable: it makes the drop visible in the diff a human reviews.
 */
function initializerSource(
  init: ts.Expression,
  sourceFile: ts.SourceFile
): string {
  const { text, erased } = initializerText(init, sourceFile)
  if (!erased.length) return text
  return `${text} /* TJS: dropped \`${erased.join(
    ' '
  )}\` — type-only, no runtime effect */`
}

function transformParams(
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  degraded?: string[],
  ctx?: TypeResolutionContext
): string[] {
  const params: string[] = []

  for (const param of parameters) {
    const name = param.name.getText(sourceFile)
    // Skip TypeScript's `this` pseudo-parameter (declares `this` context type)
    if (name === 'this') continue
    const isRest = !!param.dotDotDotToken
    const isOptional = !!param.questionToken || !!param.initializer
    const typeExample = typeToExample(
      param.type,
      undefined,
      warnings,
      ctx,
      'annotation'
    )

    if (isRest) {
      // Rest parameter: ...args: T[] → ...args: [example]
      // typeToExample already converts T[] to [example], so use directly
      if (typeExample === 'any' || typeExample === 'undefined') {
        params.push(`...${name}: [null]`)
      } else {
        params.push(`...${name}: ${typeExample}`)
      }
    } else if (param.initializer) {
      // Has default value - use it directly
      const defaultText = initializerSource(param.initializer, sourceFile)
      params.push(`${name} = ${defaultText}`)
    } else if (typeExample === 'any' || typeExample === 'undefined') {
      // any/undefined type - no annotation in TJS (bare name means any)
      params.push(name)
      // Record original TS type for migration comments
      if (degraded && param.type) {
        const originalType = param.type.getText(sourceFile)
        if (originalType !== 'any' && originalType !== 'unknown') {
          degraded.push(`${name}: ${originalType}`)
        }
      }
    } else if (isOptional) {
      // Optional without default. TJS spells this `name?: T` — the SAME syntax TypeScript
      // uses, so the author's own annotation survives the conversion.
      //
      // It used to emit `name: T | undefined`, reasoning that the union preserved the
      // three-state semantics of `flag?: boolean`. It does preserve the TYPE, but `name: T`
      // is REQUIRED in TJS whatever T is, so the parameter came out mandatory — and the
      // emitted `__tjs` then said `required: true` while `fromTS`'s own returned metadata
      // said `required: false`. The text and the metadata disagreed about the same
      // parameter.
      //
      // Invisible until the JS output stopped coming from `ts.transpileModule`: the metadata
      // came from the extractor and the JavaScript came from TypeScript, so nothing ever ran
      // our parser over this line. See `src/no-ts-emitter.test.ts`.
      // Optional without default. TJS spells this `name?: T` — the SAME syntax TypeScript
      // uses, so the author's own annotation survives the conversion.
      //
      // For an OBJECT type this lands on the dictionary-default path, and that is correct
      // rather than incidental: `docs/dictionary-defaults.md` §5.1 resolves required-ness at
      // the PARAM level (`:` required, `=` defaulted), and an optional options-bag is the
      // motivating case for the whole feature — the spec's own precedent is
      // `addEventListener(type, listener, options)`. So `f()` yields a fresh clone of the
      // full default (§5.5) and `f({a: 1})` merges on partial (§5.2).
      //
      // It used to emit `name: T | undefined`, which preserves the TYPE but is a REQUIRED
      // param: the emitted `__tjs` said `required: true` while `fromTS`'s own metadata said
      // `required: false`. Invisible while the JS output came from `ts.transpileModule` —
      // nothing ran our parser over that line (`src/no-ts-emitter.test.ts`).
      // ...UNLESS the object's members are not pure literals. A dictionary default is cloned
      // per call, so §6.1 requires every member to be a clonable literal — and `typeToExample`
      // legitimately produces `new Map()`, `new Set()` and the like for builtin types. Those
      // are fine as a TYPE example on a required param and impossible as a default.
      //
      // §6.1's own error names the remedy ("use a colon-form (required) parameter"), so that
      // is what we emit, with a warning rather than silently: the parameter is optional in
      // the TypeScript and this is the one case where conversion cannot preserve that.
      // A dictionary default is lowered to a real JS default expression, so its members must
      // be VALUES. `position: 'annotation'` yields type NAMES — `{ a: number }` — which are
      // bare identifiers at runtime and throw `number is not defined` on the first call. This
      // is the exact hazard the `position` parameter was introduced for; a dictionary default
      // is a value position, so ask for one.
      // Only an OBJECT example becomes a dictionary default; `title?: string` stays a type
      // name, which is what the author wrote and reads far better than `title?: ''`.
      const isObject = typeExample.trimStart().startsWith('{')
      const valueExample = isObject
        ? typeToExample(param.type, undefined, warnings, ctx, 'value')
        : typeExample
      // Even in value position some examples cannot be pure literals: `typeToExample`
      // legitimately produces `new Map()` for a builtin. Fine as a TYPE example on a required
      // param, impossible as a per-call clone (§6.1). Its own error names the remedy — a
      // colon-form parameter — so that is what we emit, with a warning rather than silently,
      // since this is the one case where conversion cannot preserve optionality.
      const impure = /\bnew\s+[A-Z]/.test(valueExample)
      if (impure) {
        warnings?.push(
          `${name}: optional object parameter kept as \`${name}: T | undefined\` (required, ` +
            `accepts undefined). Its example contains a constructed value, and a dictionary ` +
            `default must be a pure literal — see docs/dictionary-defaults.md §6.1.`
        )
        params.push(`${name}: ${typeExample} | undefined`)
      } else {
        params.push(`${name}?: ${valueExample}`)
      }
    } else {
      // Required - use : for required
      params.push(`${name}: ${typeExample}`)
    }
  }

  return params
}

/**
 * Extract type metadata from a TypeScript function
 */
function extractFunctionMetadata(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  ctx?: TypeResolutionContext
): FunctionTypeInfo {
  // Build type parameter map from generic params
  let resolveCtx = ctx
  if (node.typeParameters && node.typeParameters.length > 0) {
    const typeParamMap = new Map<
      string,
      { constraint?: ts.TypeNode; default?: ts.TypeNode }
    >()
    for (const tp of node.typeParameters) {
      typeParamMap.set(tp.name.getText(sourceFile), {
        constraint: tp.constraint,
        default: tp.default,
      })
    }
    resolveCtx = { ...ctx, typeParams: typeParamMap }
  }

  const name =
    ts.isFunctionDeclaration(node) && node.name
      ? node.name.getText(sourceFile)
      : 'anonymous'
  const params: Record<string, ParamTypeInfo> = {}

  for (const param of node.parameters) {
    const paramName = param.name.getText(sourceFile)
    const isOptional = !!param.questionToken || !!param.initializer

    let defaultValue: any = undefined
    if (param.initializer) {
      // Try to extract literal default value
      const initText = initializerSource(param.initializer, sourceFile)
      try {
        defaultValue = JSON.parse(initText)
      } catch {
        defaultValue = initText
      }
    }

    params[paramName] = {
      type: typeToInfo(param.type, resolveCtx),
      required: !isOptional,
      default: defaultValue,
    }
  }

  const result: FunctionTypeInfo = {
    name,
    params,
    returns: node.type ? typeToInfo(node.type, resolveCtx) : undefined,
  }

  // Extract generic type parameters
  const typeParams = extractTypeParams(node, warnings)
  if (typeParams) {
    result.typeParams = typeParams
  }

  return result
}

/**
 * Extract type metadata from a TypeScript class
 */
function extractClassMetadata(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  warnings?: string[],
  ctx?: TypeResolutionContext
): ClassTypeInfo {
  // Build type parameter map from class-level generics
  let resolveCtx = ctx
  if (node.typeParameters && node.typeParameters.length > 0) {
    const typeParamMap = new Map<
      string,
      { constraint?: ts.TypeNode; default?: ts.TypeNode }
    >()
    for (const tp of node.typeParameters) {
      typeParamMap.set(tp.name.getText(sourceFile), {
        constraint: tp.constraint,
        default: tp.default,
      })
    }
    resolveCtx = { ...ctx, typeParams: typeParamMap }
  }

  const name = node.name?.getText(sourceFile) || 'anonymous'
  const methods: Record<string, FunctionTypeInfo> = {}
  const staticMethods: Record<string, FunctionTypeInfo> = {}
  let constructorInfo: { params: Record<string, ParamTypeInfo> } | undefined

  for (const member of node.members) {
    // Constructor
    if (ts.isConstructorDeclaration(member)) {
      const params: Record<string, ParamTypeInfo> = {}
      for (const param of member.parameters) {
        const paramName = param.name.getText(sourceFile)
        const isOptional = !!param.questionToken || !!param.initializer

        let defaultValue: any = undefined
        if (param.initializer) {
          const initText = initializerSource(param.initializer, sourceFile)
          try {
            defaultValue = JSON.parse(initText)
          } catch {
            defaultValue = initText
          }
        }

        params[paramName] = {
          type: typeToInfo(param.type, resolveCtx),
          required: !isOptional,
          default: defaultValue,
        }
      }
      constructorInfo = { params }
    }

    // Methods (instance and static)
    if (ts.isMethodDeclaration(member) && member.name) {
      const methodName = member.name.getText(sourceFile)
      const isStatic = member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.StaticKeyword
      )

      const params: Record<string, ParamTypeInfo> = {}
      for (const param of member.parameters) {
        const paramName = param.name.getText(sourceFile)
        const isOptional = !!param.questionToken || !!param.initializer

        let defaultValue: any = undefined
        if (param.initializer) {
          const initText = initializerSource(param.initializer, sourceFile)
          try {
            defaultValue = JSON.parse(initText)
          } catch {
            defaultValue = initText
          }
        }

        params[paramName] = {
          type: typeToInfo(param.type, resolveCtx),
          required: !isOptional,
          default: defaultValue,
        }
      }

      const methodInfo: FunctionTypeInfo = {
        name: methodName,
        params,
        returns: member.type ? typeToInfo(member.type, resolveCtx) : undefined,
      }

      if (isStatic) {
        staticMethods[methodName] = methodInfo
      } else {
        methods[methodName] = methodInfo
      }
    }
  }

  const result: ClassTypeInfo = {
    name,
    methods,
    staticMethods,
    constructor: constructorInfo,
  }

  // Extract class-level generic type parameters
  if (node.typeParameters && node.typeParameters.length > 0) {
    const typeParams: Record<string, TypeParamInfo> = {}
    for (const param of node.typeParameters) {
      const paramName = param.name.getText(sourceFile)
      const info: TypeParamInfo = {}
      if (param.constraint) {
        info.constraint = typeToExample(
          param.constraint,
          undefined,
          warnings,
          ctx
        )
      }
      if (param.default) {
        info.default = typeToExample(param.default, undefined, warnings, ctx)
      }
      typeParams[paramName] = info
    }
    result.typeParams = typeParams
  }

  return result
}

/**
 * Transpile TypeScript source to TJS or JS + metadata
 */
/**
 * Extract embedded test comments from source
 * These use syntax: /*test 'description' { ... }* / (without space before /)
 * They survive TS compilation and should be preserved in TJS output
 */
// =============================================================================
// @tjs annotations — enrich TJS output from TS source comments
// =============================================================================

interface TjsAnnotation {
  index: number
  kind: 'predicate' | 'example' | 'skip' | 'declaration'
  text?: string // raw text for predicate/example/declaration
}

/** Valid TJS mode directives */
const VALID_TJS_MODES = new Set([
  'TjsStrict',
  // 'TjsDate' removed 2026-08-02 — no longer a dialable mode; use `unsafe` at the site.
])

/**
 * Extract TJS mode directives from /* @tjs ... * / comments.
 * e.g. /* @tjs TjsClass TjsEquals * / → ['TjsClass', 'TjsEquals']
 */
function extractTjsModes(source: string): string[] {
  const modes: string[] = []
  const re = /\/\*\s*@tjs\s+((?:Tjs\w+\s*)+)\*\//g
  let m
  while ((m = re.exec(source)) !== null) {
    const words = m[1].trim().split(/\s+/)
    for (const word of words) {
      if (VALID_TJS_MODES.has(word) && !modes.includes(word)) {
        modes.push(word)
      }
    }
  }
  return modes
}

/**
 * Extract @tjs annotations from source comments.
 *
 * Supported forms:
 *   /* @tjs-skip * /
 *   /* @tjs example: { name: '', age: 0 } * /
 *   /* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } * /
 *   /* @tjs declaration { value: T; path: string } * /
 */
function extractTjsAnnotations(source: string): TjsAnnotation[] {
  const annotations: TjsAnnotation[] = []

  // @tjs-skip
  const skipRe = /\/\*\s*@tjs-skip\s*\*\//g
  let m
  while ((m = skipRe.exec(source)) !== null) {
    annotations.push({ index: m.index, kind: 'skip' })
  }

  // @tjs predicate(...) { ... }
  const predRe = /\/\*\s*@tjs\s+predicate(\([^)]*\)\s*\{[\s\S]*?\})\s*\*\//g
  while ((m = predRe.exec(source)) !== null) {
    annotations.push({
      index: m.index,
      kind: 'predicate',
      text: `predicate${m[1].trim()}`,
    })
  }

  // @tjs example: ...
  const exRe = /\/\*\s*@tjs\s+example:\s*([\s\S]*?)\s*\*\//g
  while ((m = exRe.exec(source)) !== null) {
    annotations.push({ index: m.index, kind: 'example', text: m[1].trim() })
  }

  // @tjs declaration { ... }
  const declRe = /\/\*\s*@tjs\s+declaration\s*(\{[\s\S]*?\})\s*\*\//g
  while ((m = declRe.exec(source)) !== null) {
    annotations.push({
      index: m.index,
      kind: 'declaration',
      text: m[1].trim(),
    })
  }

  return annotations.sort((a, b) => a.index - b.index)
}

/**
 * Build a map from declaration name → annotations that precede it.
 */
function buildAnnotationMap(
  annotations: TjsAnnotation[],
  sourceFile: ts.SourceFile
): Map<string, TjsAnnotation[]> {
  const result = new Map<string, TjsAnnotation[]>()
  if (annotations.length === 0) return result

  const statements = sourceFile.statements
  for (let si = 0; si < statements.length; si++) {
    const stmt = statements[si]
    let name: string | undefined

    if (ts.isInterfaceDeclaration(stmt)) {
      name = stmt.name.getText(sourceFile)
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      name = stmt.name.getText(sourceFile)
    } else if (ts.isEnumDeclaration(stmt)) {
      name = stmt.name.getText(sourceFile)
    }

    if (!name) continue

    const stmtStart = stmt.getStart(sourceFile)
    const prevEnd = si > 0 ? statements[si - 1].getEnd() : 0

    const matching = annotations.filter(
      (a) => a.index >= prevEnd && a.index < stmtStart
    )
    if (matching.length > 0) {
      result.set(name, matching)
    }
  }

  return result
}

/**
 * Collect `/*test … *\/` block comments.
 *
 * SCANNED, not regex-matched. A regex cannot tell that a `/*test` occurrence is already
 * INSIDE an open block comment — and this very file's JSDoc documents the syntax, writing
 * the closing marker spaced (`}* /`) so it does not terminate the doc. A lazy
 * `[\s\S]*?\*\/` then ran on to the next REAL close hundreds of lines later, swallowed the
 * region, and re-emitted it verbatim. That is why `export function fromTS` appeared in the
 * converted output twice — once transpiled, once as raw TypeScript.
 *
 * Walking the source makes that impossible by construction: a block comment is consumed
 * whole, so anything written inside one is never a candidate. Strings and line comments are
 * skipped for the same reason.
 */
function extractEmbeddedTestComments(source: string): string[] {
  // Delegates to the shared scanner. The hand-rolled walk this replaces skipped strings and
  // comments but had NO REGEX BRANCH, so `const q = /['"]/` above a test comment made it
  // read the regex's `'` as opening a string literal, run to the next quote somewhere else
  // entirely, and desynchronise. Two opposite failures fell out of that one blind spot:
  // a real `/*test … *\/` block was silently DROPPED from converted output, and — with
  // `const q = /'/` above a JSDoc containing an apostrophe — a documentation example was
  // PROMOTED into a real emitted test. The dogfood corpus scores emit/compile/graduate and
  // can see neither.
  //
  // 81d4a0b replaced a regex with this walk and dropped the literal-awareness it had been
  // getting by delegation; strip-comments.ts was extracted the same release, FOR this file.
  return scanLiterals(source)
    .filter(
      (r) =>
        r.kind === 'block-comment' &&
        /^\/\*test[\s{'"`]/.test(source.slice(r.start, r.start + 8))
    )
    .map((r) => source.slice(r.start, r.end))
}

/**
 * Turn `/* @tjs-unsafe *\/` annotations into the TJS `unsafe` marker.
 *
 * TJS-only syntax cannot appear in a `.ts` file — `tsc` rejects `unsafe new Date(x)` — so a
 * TypeScript source that legitimately needs an exception has no way to say so. The `@tjs`
 * comment channel is the bridge: `tsc` sees an ordinary comment, and conversion turns it
 * into the real marker.
 *
 * Replaced in place (not stripped-then-inserted) so the marker lands exactly where the
 * annotation was — same line, immediately before its expression, which is what `unsafe`
 * requires.
 */
function applyUnsafeAnnotations(code: string): string {
  return code.replace(/\/\*\s*@tjs-unsafe\s*\*\/\s*/g, 'unsafe ')
}

/**
 * Extract top-level TJS doc comments (/*# ... *\/) from source with position info.
 * These need to be preserved in TJS output in their original positions.
 * Comments inside function bodies are already preserved by the TS transpiler.
 */
function extractDocComments(
  source: string
): Array<{ content: string; index: number }> {
  const comments: Array<{ content: string; index: number }> = []
  // Line-start `/*#` only (whitespace-only before it); a mid-line `/*#` (after
  // code, or inside a string) is an ordinary block comment. Lookbehind is
  // zero-width, so match.index stays on `/*#` for the brace-depth check below.
  const docRegex = /(?<=^[ \t]*)\/\*#[\s\S]*?\*\//gm

  // Brace depth is counted over a view with string, template and REGEX contents blanked
  // (comments kept — we are looking for one). The hand-rolled version tracked strings only,
  // so an ordinary `const R = /}/` threw the depth negative and every doc comment after it
  // was judged not-top-level and dropped. Masking preserves offsets, so the indices below
  // still point into the real source.
  const scanned = maskLiteralsKeepComments(source)
  let braceDepth = 0
  const braceDepthAt: number[] = []
  for (let i = 0; i < scanned.length; i++) {
    const ch = scanned[i]
    if (ch === '{') braceDepth++
    if (ch === '}') braceDepth--
    braceDepthAt[i] = braceDepth
  }

  let match
  while ((match = docRegex.exec(source)) !== null) {
    // Only include comments at top level (brace depth 0)
    if (braceDepthAt[match.index] === 0) {
      comments.push({
        content: match[0],
        index: match.index,
      })
    }
  }
  return comments
}

/**
 * Insert `export ` after an optional leading comment, without a regex that has to know
 * what a comment is.
 *
 * This was `typeDecl.replace(/^(\/\*[\s\S]*?\*\/\s*)?/, '$1export ')`, twice — the
 * same incidental comment-skipping whose lazy `[\s\S]*?` cost 90 seconds elsewhere. Here
 * the input is one declaration rather than a whole file, so it was slow-proof by luck
 * rather than by construction, and still wrong if the declaration's leading comment quoted
 * a close-marker.
 *
 * `scanLiterals` already knows where the comment ends. Asking it is both correct and
 * shorter than the pattern it replaces.
 */
function prefixExportAfterLeadingComment(decl: string): string {
  const first = scanLiterals(decl)[0]
  if (!first || first.kind !== 'block-comment' || first.start !== 0) {
    return `export ${decl}`
  }
  let at = first.end
  while (at < decl.length && /\s/.test(decl[at])) at++
  return decl.slice(0, at) + 'export ' + decl.slice(at)
}

/**
 * Can this example be used as a TJS return annotation (`:! <example>`)?
 *
 * Three sites emit return annotations and only ONE carried a filter — `startsWith('new ')`,
 * with the comment "new Set(), new Map() etc. aren't valid TJS literals". That filter names
 * a spelling rather than the property it means, so two entries in the builtin table slipped
 * past it (`AbortSignal.abort()`, `Promise.resolve(null)`), and the other two sites — class
 * members and overload signatures — had no filter at all. A class method returning
 * `Response`, `URL` or `AbortSignal` therefore emitted TJS THAT DOES NOT PARSE:
 *
 *     make():! new Response() {                 <- `new` is abolished in TJS
 *     make():! AbortSignal.abort() {            <- a member call is not an annotation form
 *
 * Emitting unparseable output is a straight converter bug — obligation 1 of the conversion
 * contract, before equivalence is even testable (`dogfood-tests.test.ts`).
 *
 * What IS accepted is not "anything without parentheses": `FunctionPredicate('function', …)`
 * is a call and parses, because the grammar knows that form. So the rule is stated as what
 * the grammar rejects — `new`, and a member expression — rather than by guessing at the
 * shape of a literal. `builtin-return-examples.test.ts` runs every entry in the table
 * through the converter and demands the result parse, so a new entry cannot reopen this.
 */
function usableAsReturnExample(example: string): boolean {
  if (!example || example === 'undefined' || example === 'any') return false
  if (/^new\s/.test(example)) return false // TJS abolished `new`
  if (/^[A-Za-z_$][\w$]*\./.test(example)) return false // `X.y(…)` member call
  return true
}

export function fromTS(
  source: string,
  options: FromTSOptions = {}
): FromTSResult {
  // `fromTS` does ONE job: TypeScript -> TJS. Getting to JavaScript is `tjs()`'s job, and
  // composing them at the call site is what makes the path visible:
  //
  //     const js = tjs(fromTS(src).code).code
  //
  // It used to emit JS too, via `ts.transpileModule` — a SECOND JavaScript emitter, next to
  // our own. The maintenance cost was the smaller half. The damage was to the evidence: the
  // compat lane ran that branch by default (`--full` defaulted off, and three of the six
  // scripts never had the flag), and the Bootstrap Canary called it under a comment reading
  // `// Transpile with TJS`. The two lanes cited as proof that the converter works and that
  // TJS can host itself were largely exercising the TypeScript compiler. A green result from
  // someone else's emitter says nothing about ours, and no lane should ever have been able to
  // reach one — enforced now by `src/no-ts-emitter.test.ts`.
  //
  // TypeScript is used to READ TypeScript and never to write JavaScript.
  if (options.emitTJS === false) {
    throw new Error(
      'fromTS no longer emits JavaScript — it emits TJS. Compose the two steps:\n' +
        "  import { tjs } from 'tjs-lang/lang'\n" +
        "  import { fromTS } from 'tjs-lang/lang/from-ts'\n" +
        '  const js = tjs(fromTS(source).code).code\n' +
        'This is loud on purpose: the old JS output came from `ts.transpileModule`, so it ' +
        "was TypeScript's emitter, not ours."
    )
  }
  const emitTJS = true
  const { filename = 'input.ts' } = options
  const warnings: string[] = []

  // Extract embedded test comments before TS parsing (they need to be preserved)
  const embeddedTests = extractEmbeddedTestComments(source)

  // Extract doc comments (/*# ... */) with position info for TJS output
  const docComments = emitTJS ? extractDocComments(source) : []

  // Extract @tjs annotations for enriching TJS output
  const tjsAnnotations = emitTJS ? extractTjsAnnotations(source) : []

  // Extract TJS mode directives from /* @tjs TjsClass ... */ comments
  const tjsModes = extractTjsModes(source)
  const hasTjsClass =
    tjsModes.includes('TjsClass') || tjsModes.includes('TjsStrict')

  // Parse TypeScript
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true
  )

  // Build annotation map from @tjs comments
  const annotationMap = emitTJS
    ? buildAnnotationMap(tjsAnnotations, sourceFile)
    : new Map<string, TjsAnnotation[]>()

  const tjsFunctions: string[] = []
  const seenTypeNames = new Set<string>() // Track emitted type names to avoid duplicates

  // Names that exist as VALUES at runtime. A type alias sharing one of these must not be
  // promoted to a runtime `Type`, or the emitted file declares the identifier twice.
  const valueNames = new Set<string>()
  for (const stmt of sourceFile.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) valueNames.add(d.name.text)
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name
    ) {
      valueNames.add(stmt.name.text)
    } else if (ts.isEnumDeclaration(stmt)) {
      valueNames.add(stmt.name.text)
    }
  }
  const metadata: Record<string, FunctionTypeInfo> = {}
  const classMetadata: Record<string, ClassTypeInfo> = {}

  // Track which doc comments have been emitted (by index in docComments array)
  const emittedDocComments = new Set<number>()

  // Helper: emit any doc comments that appear before a given source position
  const emitDocCommentsBefore = (pos: number) => {
    for (let i = 0; i < docComments.length; i++) {
      const doc = docComments[i]
      if (!emittedDocComments.has(i) && doc.index < pos) {
        tjsFunctions.push(doc.content)
        emittedDocComments.add(i)
      }
    }
  }

  // Build type alias and interface maps first (first pass)
  const typeAliases = new Map<string, ts.TypeNode>()
  const interfaces = new Map<string, ts.InterfaceDeclaration>()

  function collectTypes(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node)) {
      typeAliases.set(node.name.getText(sourceFile), node.type)
    }
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sourceFile)
      const existing = interfaces.get(name)
      if (existing) {
        // Merge members (TS interface merging)
        const merged = ts.factory.updateInterfaceDeclaration(
          existing,
          existing.modifiers,
          existing.name,
          existing.typeParameters,
          existing.heritageClauses,
          [...existing.members, ...node.members]
        )
        interfaces.set(name, merged)
      } else {
        interfaces.set(name, node)
      }
    }
    ts.forEachChild(node, collectTypes)
  }
  collectTypes(sourceFile)

  // Create resolution context
  const resolutionCtx: TypeResolutionContext = {
    typeAliases,
    interfaces,
    sourceFile,
    warnings,
    resolvedCache: new Map(),
  }

  // Pre-scan: detect function overload groups
  // In TS, overloads are N bodyless signatures + 1 implementation with body
  const overloadGroups = new Map<
    string,
    {
      signatures: ts.FunctionDeclaration[] // body === undefined
      implementation: ts.FunctionDeclaration | null // has body
    }
  >()
  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const name = stmt.name.getText(sourceFile)
      if (!overloadGroups.has(name)) {
        overloadGroups.set(name, { signatures: [], implementation: null })
      }
      const group = overloadGroups.get(name)!
      if (stmt.body) {
        group.implementation = stmt
      } else {
        group.signatures.push(stmt)
      }
    }
  }
  // Only keep groups that actually have overloads (signatures + implementation)
  for (const [name, group] of overloadGroups) {
    if (group.signatures.length === 0 || !group.implementation) {
      overloadGroups.delete(name)
    }
  }

  // Walk top-level statements only (don't recurse into function bodies)
  for (const statement of sourceFile.statements) {
    let handled = false

    // Emit any doc comments before this statement
    if (emitTJS) {
      emitDocCommentsBefore(statement.getStart(sourceFile))
    }

    // Handle: function foo() {}
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const funcName = statement.name.getText(sourceFile)
      handled = true

      const overloadGroup = overloadGroups.get(funcName)

      if (overloadGroup) {
        // This function is part of an overload group
        if (!statement.body) {
          // Skip bodyless signatures — handled when we encounter the implementation
        } else {
          // Implementation: emit the entire overload group
          tjsFunctions.push(
            ...emitOverloadGroup(
              overloadGroup.signatures,
              statement,
              sourceFile,
              warnings
            )
          )
          const overloads: FunctionTypeInfo[] = []
          for (const sig of overloadGroup.signatures) {
            overloads.push(
              extractFunctionMetadata(sig, sourceFile, warnings, resolutionCtx)
            )
          }
          const implInfo = extractFunctionMetadata(
            statement,
            sourceFile,
            warnings,
            resolutionCtx
          )
          implInfo.overloads = overloads
          metadata[funcName] = implInfo
        }
      } else {
        // Normal (non-overloaded) function.
        //
        // Metadata extraction and TJS emission both run. They used to be the two halves of an
        // `if (emitTJS) … else …`, which meant the two "modes" of this function were not two
        // renderings of one analysis — they were separate programs that never both ran. The
        // TJS path returned no `types` at all, so anything wanting types AND a transpile had
        // to take the `ts.transpileModule` branch. That is a large part of why the dead path
        // stayed alive.
        metadata[funcName] = extractFunctionMetadata(
          statement,
          sourceFile,
          warnings,
          resolutionCtx
        )
        tjsFunctions.push(
          transformFunctionToTJS(
            statement,
            sourceFile,
            undefined,
            warnings,
            true,
            resolutionCtx
          )
        )
      }
    }

    // Handle: const foo = () => {} or const foo = function() {}
    // Also handle: const x = ..., let x = ..., var x = ... (non-function)
    if (ts.isVariableStatement(statement)) {
      let hasFunctionDecl = false

      // Check if the variable statement itself is exported
      const varIsExported = statement.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      )

      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          hasFunctionDecl = true
          const funcName = decl.name.getText(sourceFile)
          const funcNode = decl.initializer

          if (emitTJS) {
            let tjsFunc = transformFunctionToTJS(
              funcNode,
              sourceFile,
              funcName,
              warnings,
              true,
              resolutionCtx
            )
            // Arrow/const functions: export is on the VariableStatement
            // Insert after any line comment or degraded comment
            if (varIsExported && !tjsFunc.includes('export ')) {
              const firstFuncLine = tjsFunc.search(/^(async\s+)?function[\s*]/m)
              if (firstFuncLine > 0) {
                tjsFunc =
                  tjsFunc.slice(0, firstFuncLine) +
                  'export ' +
                  tjsFunc.slice(firstFuncLine)
              } else {
                tjsFunc = 'export ' + tjsFunc
              }
            }
            tjsFunctions.push(tjsFunc)
            const info = extractFunctionMetadata(
              funcNode,
              sourceFile,
              warnings,
              resolutionCtx
            )
            info.name = funcName
            metadata[funcName] = info
          }
        }
      }

      // If this variable statement doesn't contain function declarations,
      // transpile and preserve it (strips type annotations)
      if (!hasFunctionDecl && emitTJS) {
        const transpiled = ts.transpileModule(statement.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        tjsFunctions.push(transpiled.outputText.trim())
      }

      handled = true
    }

    // Handle: interface Foo { ... }
    if (ts.isInterfaceDeclaration(statement)) {
      handled = true
      if (emitTJS) {
        const typeName = statement.name.getText(sourceFile)
        const annotations = annotationMap.get(typeName)
        if (!seenTypeNames.has(typeName)) {
          seenTypeNames.add(typeName)
          // @tjs-skip — omit this declaration entirely
          if (annotations?.some((a) => a.kind === 'skip')) {
            // Skip — do not emit
          } else if (valueNames.has(typeName)) {
            // A TYPE and a VALUE may share a name in TypeScript, and for an INTERFACE this
            // is not a corner case — it is the standard companion-object idiom:
            //
            //     export interface DropTableNode { … }
            //     export const DropTableNode = freeze({ … })
            //
            // The interface is erased at runtime, so the names never collide in TS.
            // Promoting it to a runtime `Type DropTableNode` makes them collide and the file
            // stops compiling. The type-ALIAS branch below has had this guard for a while;
            // the interface branch never got it, and interfaces are where the idiom actually
            // lives — it was the single largest cause of conversion failure across the
            // compat corpus (9 of 15 failures: effect ×4, kysely ×5).
            //
            // Erase it, exactly as TypeScript does, and say what we could not do.
            tjsFunctions.push(
              `/* TJS: interface \`${typeName}\` not promoted to a runtime Type — a value ` +
                `of the same name is declared in this file. TypeScript erases the ` +
                `interface, so behavior is unchanged. */`
            )
          } else {
            // Use merged interface (handles declaration merging)
            const merged = interfaces.get(typeName) || statement
            const typeDecl = transformInterfaceToType(
              merged,
              sourceFile,
              warnings,
              annotations
            )
            if (typeDecl) {
              const isExported = statement.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword
              )
              tjsFunctions.push(
                isExported
                  ? prefixExportAfterLeadingComment(typeDecl)
                  : typeDecl
              )
            }
          }
        }
      }
    }

    // Handle: type Foo = { ... }
    if (ts.isTypeAliasDeclaration(statement)) {
      handled = true
      if (emitTJS) {
        const typeName = statement.name.getText(sourceFile)
        const annotations = annotationMap.get(typeName)
        if (!seenTypeNames.has(typeName)) {
          seenTypeNames.add(typeName)
          // @tjs-skip — omit this declaration entirely
          if (annotations?.some((a) => a.kind === 'skip')) {
            // Skip — do not emit
          } else if (valueNames.has(typeName)) {
            // A TYPE and a VALUE may share a name in TypeScript — `type Foo = …` plus
            // `const Foo = { … }` is an everyday pattern (Date itself is declared that
            // way), because the alias is erased at runtime.
            //
            // Turning the alias into a runtime `Type Foo` is normally an UPGRADE, but here
            // it collides with the value and the file stops compiling — obligation 1
            // violated. Fall back to erasing the alias, exactly as TypeScript does, and
            // say what we could not do.
            tjsFunctions.push(
              `/* TJS: type alias \`${typeName}\` not promoted to a runtime Type — a value ` +
                `of the same name is declared in this file. TypeScript erases the alias, so ` +
                `behavior is unchanged. */`
            )
          } else {
            const typeDecl = transformTypeAliasToType(
              statement,
              sourceFile,
              warnings,
              annotations
            )
            if (typeDecl) {
              const isExported = statement.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.ExportKeyword
              )
              tjsFunctions.push(
                isExported
                  ? prefixExportAfterLeadingComment(typeDecl)
                  : typeDecl
              )
            }
          }
        }
      }
    }

    // Handle: enum Status { Pending, Active, Done }
    if (ts.isEnumDeclaration(statement)) {
      handled = true
      if (emitTJS) {
        const enumName = statement.name.getText(sourceFile)
        const annotations = annotationMap.get(enumName)
        if (!seenTypeNames.has(enumName)) {
          seenTypeNames.add(enumName)
          if (annotations?.some((a) => a.kind === 'skip')) {
            // Skip — do not emit
          } else {
            const enumDecl = transformEnumToTJS(statement, sourceFile, warnings)
            if (enumDecl) {
              tjsFunctions.push(enumDecl)
            }
          }
        }
      }
    }

    // Handle: class Foo { ... }
    if (ts.isClassDeclaration(statement) && statement.name) {
      const className = statement.name.getText(sourceFile)
      handled = true
      if (emitTJS) {
        const classDecl = transformClassToTJS(
          statement,
          sourceFile,
          warnings,
          undefined,
          hasTjsClass
        )
        tjsFunctions.push(classDecl)
        classMetadata[className] = extractClassMetadata(
          statement,
          sourceFile,
          warnings,
          resolutionCtx
        )
      } else {
        classMetadata[className] = extractClassMetadata(
          statement,
          sourceFile,
          warnings,
          resolutionCtx
        )
      }
    }

    // Handle: import statements (strip type-only imports, keep value imports)
    if (ts.isImportDeclaration(statement)) {
      handled = true
      if (emitTJS) {
        // Check if it's a type-only import
        const isTypeOnly =
          statement.importClause?.isTypeOnly ||
          (statement.importClause?.namedBindings &&
            ts.isNamedImports(statement.importClause.namedBindings) &&
            statement.importClause.namedBindings.elements.every(
              (e) => e.isTypeOnly
            ))

        if (!isTypeOnly) {
          // Emit import directly — don't use ts.transpileModule which
          // strips "unused" imports in isolation. Filter out type-only
          // specifiers manually.
          if (
            statement.importClause?.namedBindings &&
            ts.isNamedImports(statement.importClause.namedBindings)
          ) {
            const valueSpecs = statement.importClause.namedBindings.elements
              .filter((e) => !e.isTypeOnly)
              .map((e) => {
                const name = e.name.getText(sourceFile)
                const propName = e.propertyName?.getText(sourceFile)
                return propName ? `${propName} as ${name}` : name
              })
            if (valueSpecs.length > 0) {
              const modSpec = (statement.moduleSpecifier as ts.StringLiteral)
                .text
              tjsFunctions.push(
                `import { ${valueSpecs.join(', ')} } from '${modSpec}'`
              )
            }
          } else {
            // Default import, namespace import, or side-effect import
            // Emit as-is (strip types via getText which preserves structure)
            const importText = statement.getText(sourceFile)
            // Remove type annotations by running through TS
            const cleaned = importText
              .replace(/\btype\s+/g, '')
              .replace(/\s*:\s*\w+/g, '')
            tjsFunctions.push(cleaned)
          }
        }
      }
    }

    // Handle: export statements
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      handled = true
      if (emitTJS) {
        const transpiled = ts.transpileModule(statement.getText(sourceFile), {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: false,
          },
        })
        const trimmed = transpiled.outputText.trim()
        if (trimmed) {
          tjsFunctions.push(trimmed)
        }
      }
    }

    // Handle: expression statements (console.log(...), foo(), etc.)
    // and any other unhandled statements
    if (!handled && emitTJS) {
      const transpiled = ts.transpileModule(statement.getText(sourceFile), {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          removeComments: false,
        },
      })
      const trimmed = transpiled.outputText.trim()
      if (trimmed) {
        tjsFunctions.push(trimmed)
      }
    }
  }

  if (emitTJS) {
    // Emit any remaining doc comments (after all statements)
    emitDocCommentsBefore(Infinity)

    // Include source file annotation and TJS mode directives
    const sourceFileName = filename || 'unknown'
    const modesLine = tjsModes.length > 0 ? tjsModes.join('\n') + '\n\n' : ''
    const header = `${modesLine}/* tjs <- ${sourceFileName} */\n\n`

    // Append embedded test comments (they were extracted from original source)
    const testsSection =
      embeddedTests.length > 0 ? '\n\n' + embeddedTests.join('\n\n') : ''

    return {
      // `new` is PRESERVED here, and the comment that used to sit in its place had the
      // right rule and the wrong scope.
      //
      // Dropping `new` is only safe where a class is callable, and in native `.tjs` it is:
      // `class X {}` emits `let X = class X {}; X = new Proxy(X, { apply … })`. But every
      // `fromTS` output carries the `/* tjs <- file */` annotation, and that annotation
      // means JS SEMANTICS — so the Proxy wrap never happens and the class genuinely
      // requires `new`.
      //
      // So this was never the "TJS-emitting return" in the sense the old comment assumed.
      // Rewriting it produced converted modules that could not even be IMPORTED: a
      // `static zero = new Thing(0)` field throws at module-evaluation time. Regressed in
      // 0.13.0, reported from tosijs against 0.13.4 (#37), and the `--emit-tjs` path is
      // affected identically because the annotation travels with it.
      code: applyUnsafeAnnotations(
        header + tjsFunctions.join('\n\n') + testsSection
      ),
      // The extracted type metadata travels with the TJS too. It used to be returned only by
      // the JS branch, so anything that wanted BOTH the types and a real transpile had to go
      // through `ts.transpileModule` — the surviving path was missing half its output, which
      // is part of why the dead one stayed alive.
      types: metadata,
      classes:
        Object.keys(classMetadata).length > 0 ? classMetadata : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // Unreachable: every path above returns TJS. Kept as a hard failure rather than a silent
  // fall-through, because "returns undefined" is how an emitter regression would hide.
  throw new Error('unreachable: fromTS always emits TJS')
}
