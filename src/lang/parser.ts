/**
 * Acorn parser wrapper for Agent99 JavaScript
 *
 * Handles parsing of "Better JavaScript" including custom syntax extensions
 * like the colon shorthand for required parameters.
 */

import * as acorn from 'acorn'
import type { Program, FunctionDeclaration } from 'acorn'
import { SyntaxError } from './types'

/** Parser options */
export interface ParseOptions {
  /** Filename for error messages */
  filename?: string
  /** Enable colon shorthand syntax preprocessing */
  colonShorthand?: boolean
}

/**
 * A WASM block extracted from source
 *
 * Simple form (body is both WASM source and JS fallback):
 *   wasm {
 *     for (let i = 0; i < arr.length; i++) { arr[i] *= 2 }
 *   }
 *
 * With explicit fallback (when WASM and JS need different code):
 *   wasm {
 *     // WASM-optimized path
 *   } fallback {
 *     // JS fallback using different approach
 *   }
 *
 * Variables are captured from scope automatically.
 */
export interface WasmBlock {
  /** Unique ID for this block */
  id: string
  /** The body (JS subset that compiles to WASM, also used as fallback) */
  body: string
  /** Explicit fallback body (only if different from body) */
  fallback?: string
  /** Variables captured from enclosing scope (auto-detected) */
  captures: string[]
  /** Start position in original source */
  start: number
  /** End position in original source */
  end: number
}

/**
 * Preprocess source to handle custom syntax extensions
 *
 * Transforms:
 *   function foo(x: 'example') { }
 * Into:
 *   function foo(x = 'example') { }
 * And tracks that 'x' is a required parameter.
 *
 * Also handles return type annotation:
 *   function foo(x: 'example') -> { result: 'string' } { }
 */
export function preprocess(source: string): {
  source: string
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
} {
  const originalSource = source
  let returnType: string | undefined
  let returnSafety: 'safe' | 'unsafe' | undefined
  let moduleSafety: 'none' | 'inputs' | 'all' | undefined
  const requiredParams = new Set<string>()
  const unsafeFunctions = new Set<string>()
  const safeFunctions = new Set<string>()

  // Handle module-level safety directive: safety none | safety inputs | safety all
  // Must be at the start of the file (possibly after comments/whitespace)
  const safetyMatch = source.match(
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\b/
  )
  if (safetyMatch) {
    moduleSafety = safetyMatch[2] as 'none' | 'inputs' | 'all'
    // Remove the directive from source
    source = source.replace(
      /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\s*/,
      '$1'
    )
  }

  // Handle unsafe function marker: function foo(!) or function foo(! params)
  // The ! after ( marks the function as unsafe (no runtime type validation)
  // Transform: function foo(! x: 'str') -> function foo(x: 'str') and track foo as unsafe
  source = source.replace(
    /function\s+(\w+)\s*\(\s*!\s*/g,
    (match, funcName) => {
      unsafeFunctions.add(funcName)
      return `function ${funcName}(`
    }
  )

  // Handle safe function marker: function foo(?) or function foo(? params)
  // The ? after ( marks the function as safe (always validate, even if global safety: 'none')
  // Transform: function foo(? x: 'str') -> function foo(x: 'str') and track foo as safe
  source = source.replace(
    /function\s+(\w+)\s*\(\s*\?\s*/g,
    (match, funcName) => {
      safeFunctions.add(funcName)
      return `function ${funcName}(`
    }
  )

  // Also handle arrow functions: (! params) => or (!) =>
  source = source.replace(/\(\s*!\s*([^)]*)\)\s*=>/g, (match, params) => {
    // Arrow functions are anonymous, mark via comment for now
    return `(/* unsafe */ ${params}) =>`
  })

  // Also handle safe arrow functions: (? params) => or (?) =>
  source = source.replace(/\(\s*\?\s*([^)]*)\)\s*=>/g, (match, params) => {
    // Arrow functions are anonymous, mark via comment for now
    return `(/* safe */ ${params}) =>`
  })

  // Handle return type annotation: ) -> Type {  or  ) -? Type {  or  ) -! Type {
  // Match balanced braces for object types
  // NOTE: We capture the FIRST return type for the main function (for single-function analysis)
  // but we globally remove ALL -> / -? / -! Type patterns for multi-function files
  // -? means force output validation (safeReturn)
  // -! means skip output validation (unsafeReturn)
  // -> means use global safety setting
  const returnTypeMatch = source.match(
    /\)\s*(-[>?!])\s*(\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*\{(?!\s*\w+:)/
  )
  if (returnTypeMatch) {
    const arrow = returnTypeMatch[1]
    returnType = returnTypeMatch[2]
    if (arrow === '-?') {
      returnSafety = 'safe'
    } else if (arrow === '-!') {
      returnSafety = 'unsafe'
    }
  }
  // Remove ALL -> / -? / -! Type parts globally, keeping ) and {
  const returnTypePattern =
    /\)\s*-[>?!]\s*(?:\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*(\{)(?!\s*\w+:)/g
  source = source.replace(returnTypePattern, ') $1')

  // Handle colon shorthand in parameters: (x: type) -> (x = type)
  // Track which params used colon syntax (they're required)
  // Also validate: no duplicates, no required after optional
  source = source.replace(
    /function\s+(\w+)\s*\(([^)]*)\)/g,
    (match, funcName, params) => {
      // Don't process empty params
      if (!params.trim()) return match

      const seenParams = new Set<string>()
      let sawOptional = false

      // Split parameters carefully, respecting nested structures
      const processed = splitParameters(params)
        .map((param: string) => {
          param = param.trim()

          // Skip destructuring patterns for now
          if (param.startsWith('{')) {
            return param
          }

          // Check for colon shorthand: name: type (but not inside objects)
          // Only match if the colon is directly after an identifier at the start
          const colonMatch = param.match(/^(\w+)\s*:\s*(.+)$/)
          if (colonMatch) {
            const [, name, type] = colonMatch

            // Check for duplicate parameter
            if (seenParams.has(name)) {
              throw new SyntaxError(
                `Duplicate parameter name '${name}'`,
                { line: 1, column: 0 },
                originalSource
              )
            }
            seenParams.add(name)

            // Don't transform if it already has = (it's a default value context)
            if (!type.includes('=')) {
              // This is a required parameter - check ordering
              if (sawOptional) {
                throw new SyntaxError(
                  `Required parameter '${name}' cannot follow optional parameter`,
                  { line: 1, column: 0 },
                  originalSource
                )
              }
              // Track this as a required parameter
              requiredParams.add(name)
              // Transform to standard default syntax
              return `${name} = ${type}`
            }
          }

          // Check for regular assignment (optional param): name = value
          const assignMatch = param.match(/^(\w+)\s*=/)
          if (assignMatch) {
            const name = assignMatch[1]
            if (seenParams.has(name)) {
              throw new SyntaxError(
                `Duplicate parameter name '${name}'`,
                { line: 1, column: 0 },
                originalSource
              )
            }
            seenParams.add(name)
            sawOptional = true
          }

          // Check for plain identifier (required param without type)
          const plainMatch = param.match(/^(\w+)$/)
          if (plainMatch) {
            const name = plainMatch[1]
            if (seenParams.has(name)) {
              throw new SyntaxError(
                `Duplicate parameter name '${name}'`,
                { line: 1, column: 0 },
                originalSource
              )
            }
            seenParams.add(name)
            if (sawOptional) {
              throw new SyntaxError(
                `Required parameter '${name}' cannot follow optional parameter`,
                { line: 1, column: 0 },
                originalSource
              )
            }
          }

          return param
        })
        .join(', ')

      return `function ${funcName}(${processed})`
    }
  )

  // Handle unsafe blocks: unsafe { ... } -> enterUnsafe(); try { ... } finally { exitUnsafe() }
  // `unsafe` skips type checks for all wrapped function calls within the block
  source = transformUnsafeBlocks(source)

  // Handle try-without-catch: try { ... } (no catch/finally) -> monadic error handling
  // This is the idiomatic TJS way to convert exceptions to AgentError
  source = transformTryWithoutCatch(source)

  // Extract WASM blocks: wasm(args) { ... } fallback { ... }
  const wasmBlocks = extractWasmBlocks(source)
  source = wasmBlocks.source

  return {
    source,
    returnType,
    returnSafety,
    moduleSafety,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks: wasmBlocks.blocks,
  }
}

/**
 * Transform unsafe blocks with proper brace matching
 * unsafe { ... } -> globalThis.__tjs.enterUnsafe(); try { ... } finally { globalThis.__tjs.exitUnsafe() }
 *
 * This disables validation in all wrapped function calls within the block.
 * No catch - errors propagate naturally (monadic or thrown).
 */
function transformUnsafeBlocks(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'unsafe' keyword
    const unsafeMatch = source.slice(i).match(/^\bunsafe\s*\{/)
    if (unsafeMatch) {
      // Found 'unsafe {', now find the matching closing brace
      const startBrace = i + unsafeMatch[0].length - 1 // position of '{'
      const bodyStart = startBrace + 1
      let depth = 1
      let j = bodyStart

      while (j < source.length && depth > 0) {
        const char = source[j]
        if (char === '{') depth++
        else if (char === '}') depth--
        j++
      }

      if (depth !== 0) {
        // Unbalanced braces, let the parser handle the error
        result += source[i]
        i++
        continue
      }

      // Extract the body (excluding the closing brace)
      const body = source.slice(bodyStart, j - 1)

      // Enter unsafe mode, run body, exit unsafe mode (finally ensures cleanup)
      result += `globalThis.__tjs?.enterUnsafe?.(); try {${body}} finally { globalThis.__tjs?.exitUnsafe?.() }`
      i = j
    } else {
      result += source[i]
      i++
    }
  }

  return result
}

/**
 * Transform try blocks without catch/finally into monadic error handling
 * try { ... } (alone) -> try { ... } catch (__err) { return AgentError }
 */
function transformTryWithoutCatch(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'try' keyword followed by '{'
    const tryMatch = source.slice(i).match(/^\btry\s*\{/)
    if (tryMatch) {
      // Found 'try {', now find the matching closing brace
      const startBrace = i + tryMatch[0].length - 1
      const bodyStart = startBrace + 1
      let depth = 1
      let j = bodyStart

      while (j < source.length && depth > 0) {
        const char = source[j]
        if (char === '{') depth++
        else if (char === '}') depth--
        j++
      }

      if (depth !== 0) {
        // Unbalanced braces, let the parser handle the error
        result += source[i]
        i++
        continue
      }

      // Check what comes after the closing brace
      const afterTry = source.slice(j).match(/^\s*(catch|finally)\b/)

      if (afterTry) {
        // Has catch or finally - leave it alone, copy the try block as-is
        result += source.slice(i, j)
        i = j
      } else {
        // No catch or finally - add monadic error handler
        const body = source.slice(bodyStart, j - 1)
        result += `try {${body}} catch (__try_err) { return { $error: true, message: __try_err?.message || String(__try_err), op: 'try', cause: __try_err } }`
        i = j
      }
    } else {
      result += source[i]
      i++
    }
  }

  return result
}

/**
 * Extract WASM blocks from source and replace with runtime dispatch code
 *
 * Simple form (body used as both WASM source and JS fallback):
 *   wasm {
 *     for (let i = 0; i < arr.length; i++) { arr[i] *= 2 }
 *   }
 *
 * With explicit fallback (when you need different JS code):
 *   wasm {
 *     // WASM-optimized version
 *   } fallback {
 *     // Different JS implementation
 *   }
 *
 * Output:
 *   (globalThis.__tjs_wasm_0
 *     ? globalThis.__tjs_wasm_0(captures...)
 *     : (() => { body })())
 *
 * Variables are auto-captured from the body.
 */
function extractWasmBlocks(source: string): {
  source: string
  blocks: WasmBlock[]
} {
  const blocks: WasmBlock[] = []
  let result = ''
  let i = 0
  let blockId = 0

  while (i < source.length) {
    // Look for 'wasm {' or 'wasm{' - simple block without params
    const wasmMatch = source.slice(i).match(/^\bwasm\s*\{/)
    if (wasmMatch) {
      const matchStart = i

      // Find the body
      const bodyStart = i + wasmMatch[0].length
      let braceDepth = 1
      let j = bodyStart

      while (j < source.length && braceDepth > 0) {
        const char = source[j]
        if (char === '{') braceDepth++
        else if (char === '}') braceDepth--
        j++
      }

      if (braceDepth !== 0) {
        result += source[i]
        i++
        continue
      }

      const body = source.slice(bodyStart, j - 1)
      let fallbackBody: string | undefined
      let matchEnd = j

      // Check for optional 'fallback {' block
      const fallbackMatch = source.slice(j).match(/^\s*fallback\s*\{/)
      if (fallbackMatch) {
        const fallbackStart = j + fallbackMatch[0].length
        braceDepth = 1
        let k = fallbackStart

        while (k < source.length && braceDepth > 0) {
          const char = source[k]
          if (char === '{') braceDepth++
          else if (char === '}') braceDepth--
          k++
        }

        if (braceDepth === 0) {
          fallbackBody = source.slice(fallbackStart, k - 1)
          matchEnd = k
        }
      }

      // Auto-detect captured variables from the body
      const captures = detectCaptures(body)

      // Create the block record
      const block: WasmBlock = {
        id: `__tjs_wasm_${blockId}`,
        body,
        fallback: fallbackBody,
        captures,
        start: matchStart,
        end: matchEnd,
      }
      blocks.push(block)

      // Generate runtime dispatch code:
      // The fallback is the body itself (or explicit fallback if provided)
      const fallbackCode = fallbackBody ?? body
      const captureArgs = captures.length > 0 ? captures.join(', ') : ''

      // For WASM: pass captures as arguments
      // For fallback: just run inline (captures are in scope)
      const wasmCall =
        captures.length > 0
          ? `globalThis.${block.id}(${captureArgs})`
          : `globalThis.${block.id}()`

      const dispatch = `(globalThis.${block.id} ? ${wasmCall} : (() => {${fallbackCode}})())`

      result += dispatch
      i = matchEnd
      blockId++
    } else {
      result += source[i]
      i++
    }
  }

  return { source: result, blocks }
}

/**
 * Detect variables captured from enclosing scope
 *
 * Finds identifiers that are:
 * - Used in the body
 * - Not declared within the body (let, const, var, function params)
 *
 * This is a simple heuristic - a full implementation would use proper AST analysis
 */
function detectCaptures(body: string): string[] {
  // Find all identifiers used in the body
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  const allIdentifiers = new Set<string>()
  let match
  while ((match = identifierPattern.exec(body)) !== null) {
    allIdentifiers.add(match[1])
  }

  // Find identifiers declared in the body
  const declared = new Set<string>()

  // let/const/var declarations
  const declPattern = /\b(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = declPattern.exec(body)) !== null) {
    declared.add(match[1])
  }

  // for loop variables: for (let i = ...)
  const forPattern =
    /\bfor\s*\(\s*(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = forPattern.exec(body)) !== null) {
    declared.add(match[1])
  }

  // function declarations and parameters would go here for full impl

  // JS keywords and builtins to exclude
  const reserved = new Set([
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'return',
    'function',
    'let',
    'const',
    'var',
    'new',
    'this',
    'true',
    'false',
    'null',
    'undefined',
    'typeof',
    'instanceof',
    'in',
    'of',
    'try',
    'catch',
    'finally',
    'throw',
    'async',
    'await',
    'class',
    'extends',
    'super',
    'import',
    'export',
    'default',
    'from',
    'as',
    'static',
    'get',
    'set',
    'yield',
    // Common globals
    'console',
    'Math',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'Date',
    'JSON',
    'Promise',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array',
    'BigInt64Array',
    'BigUint64Array',
    'ArrayBuffer',
    'DataView',
    'Error',
    'TypeError',
    'RangeError',
    'length',
    'push',
    'pop',
    'shift',
    'unshift',
    'slice',
    'splice',
    'map',
    'filter',
    'reduce',
    'forEach',
    'find',
    'findIndex',
    'indexOf',
    'includes',
    'globalThis',
    'window',
    'document',
    'Infinity',
    'NaN',
    'isNaN',
    'isFinite',
    'parseInt',
    'parseFloat',
    'encodeURI',
    'decodeURI',
    'eval',
  ])

  // Return identifiers that are used but not declared or reserved
  const captures: string[] = []
  for (const id of allIdentifiers) {
    if (!declared.has(id) && !reserved.has(id)) {
      captures.push(id)
    }
  }

  return captures.sort()
}

/**
 * Split parameter string respecting nested braces/brackets
 */
function splitParameters(params: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  let inLineComment = false
  let inBlockComment = false
  let i = 0

  while (i < params.length) {
    const char = params[i]
    const nextChar = params[i + 1]

    // Handle line comments
    if (!inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true
      i += 2
      continue
    }

    // Handle block comments
    if (!inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true
      i += 2
      continue
    }

    // End of line comment
    if (inLineComment && char === '\n') {
      inLineComment = false
      i++
      continue
    }

    // End of block comment
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false
      i += 2
      continue
    }

    // Skip characters inside comments
    if (inLineComment || inBlockComment) {
      i++
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth++
      current += char
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
    i++
  }

  if (current.trim()) {
    result.push(current)
  }

  return result
}

/**
 * Parse source code into an Acorn AST
 */
export function parse(
  source: string,
  options: ParseOptions = {}
): {
  ast: Program
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
} {
  const { filename = '<source>', colonShorthand = true } = options

  // Preprocess for custom syntax
  const {
    source: processedSource,
    returnType,
    returnSafety,
    moduleSafety,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks,
  } = colonShorthand
    ? preprocess(source)
    : {
        source,
        returnType: undefined,
        returnSafety: undefined,
        moduleSafety: undefined,
        originalSource: source,
        requiredParams: new Set<string>(),
        unsafeFunctions: new Set<string>(),
        safeFunctions: new Set<string>(),
        wasmBlocks: [] as WasmBlock[],
      }

  try {
    const ast = acorn.parse(processedSource, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })

    return {
      ast,
      returnType,
      returnSafety,
      moduleSafety,
      originalSource,
      requiredParams,
      unsafeFunctions,
      safeFunctions,
      wasmBlocks,
    }
  } catch (e: any) {
    // Convert Acorn error to our error type
    const loc = e.loc || { line: 1, column: 0 }
    throw new SyntaxError(
      e.message.replace(/\s*\(\d+:\d+\)$/, ''), // Remove acorn's location suffix
      loc,
      originalSource,
      filename
    )
  }
}

/**
 * Validate that the source contains exactly one function declaration
 */
export function validateSingleFunction(
  ast: Program,
  filename?: string
): FunctionDeclaration {
  // Check for unsupported top-level constructs FIRST
  // This gives better error messages for things like classes
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      throw new SyntaxError(
        'Imports are not supported. All atoms must be registered with the VM.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      throw new SyntaxError(
        'Exports are not supported. The function is automatically exported.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (node.type === 'ClassDeclaration') {
      throw new SyntaxError(
        'Classes are not supported. Agent99 uses functional composition.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
  }

  const functions = ast.body.filter(
    (node): node is FunctionDeclaration => node.type === 'FunctionDeclaration'
  )

  if (functions.length === 0) {
    throw new SyntaxError(
      'Source must contain a function declaration',
      { line: 1, column: 0 },
      undefined,
      filename
    )
  }

  if (functions.length > 1) {
    const second = functions[1]
    throw new SyntaxError(
      'Only a single function per agent is allowed',
      second.loc?.start || { line: 1, column: 0 },
      undefined,
      filename
    )
  }

  return functions[0]
}

/**
 * Extract JSDoc comment from before a function
 */
export function extractJSDoc(
  source: string,
  func: FunctionDeclaration
): {
  description?: string
  params: Record<string, string>
} {
  const result: { description?: string; params: Record<string, string> } = {
    params: {},
  }

  if (!func.loc) return result

  // Find the JSDoc comment before the function
  const beforeFunc = source.substring(0, func.start)
  const jsdocMatch = beforeFunc.match(/\/\*\*[\s\S]*?\*\/\s*$/)

  if (!jsdocMatch) return result

  const jsdoc = jsdocMatch[0]

  // Extract description (first non-tag content)
  const descMatch = jsdoc.match(/\/\*\*\s*\n?\s*\*?\s*([^@\n][^\n]*)/m)
  if (descMatch) {
    result.description = descMatch[1].trim()
  }

  // Extract @param tags
  const paramRegex = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*-?\s*(.*)/g
  let match
  while ((match = paramRegex.exec(jsdoc)) !== null) {
    result.params[match[1]] = match[2].trim()
  }

  return result
}
