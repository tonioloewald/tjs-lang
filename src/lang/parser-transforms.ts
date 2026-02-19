/**
 * Parser source transforms
 *
 * All source-to-source text transforms used by the preprocess pipeline.
 * These operate on raw source strings before Acorn parsing.
 */

import { SyntaxError } from './types'
import type {
  WasmBlock,
  TestBlock,
  ExtensionInfo,
  PolyVariant,
  TokenizerState,
} from './parser-types'
import { extractJSValue } from './parser-params'

export function transformTryWithoutCatch(source: string): string {
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
        // Returns MonadicError to maintain monadic flow (propagates through function chains)
        const body = source.slice(bodyStart, j - 1)
        result += `try {${body}} catch (__try_err) { return new (__tjs?.MonadicError ?? Error)(__try_err?.message || String(__try_err), 'try', undefined, undefined, __tjs?.getStack?.()) }`
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
export function extractWasmBlocks(source: string): {
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
      const captureNames = detectCaptures(body)

      // Try to find type annotations from enclosing function parameters
      // Look backwards from matchStart to find the function signature
      const captures = captureNames.map((name) => {
        const typeAnnotation = findParameterType(source, matchStart, name)
        return typeAnnotation ? `${name}: ${typeAnnotation}` : name
      })

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
      // Strip type annotations from captures for runtime args (e.g., "xs: Float32Array" -> "xs")
      const captureArgNames = captures.map((c) => c.split(':')[0].trim())
      const captureArgs =
        captureArgNames.length > 0 ? captureArgNames.join(', ') : ''

      // For WASM: pass captures as arguments
      // For fallback: just run inline (captures are in scope)
      const wasmCall =
        captureArgNames.length > 0
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

/** Check if an identifier is a WASM SIMD intrinsic (not a captured variable) */
function isWasmIntrinsic(name: string): boolean {
  return name.startsWith('f32x4_') || name.startsWith('v128_')
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
  // Strip comments first to avoid extracting words from comments
  const bodyWithoutComments = body
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments

  // Collect identifiers that appear as property accesses (after a dot)
  const propertyOnly = new Set<string>()
  const propPattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  let match
  while ((match = propPattern.exec(bodyWithoutComments)) !== null) {
    propertyOnly.add(match[1])
  }

  // Find all identifiers used in the body (not after a dot)
  const identifierPattern = /(?<!\.)(\b[a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  const allIdentifiers = new Set<string>()
  while ((match = identifierPattern.exec(bodyWithoutComments)) !== null) {
    allIdentifiers.add(match[1])
  }

  // Remove identifiers that ONLY appear as property accesses
  for (const prop of propertyOnly) {
    if (!allIdentifiers.has(prop)) continue
    // Check if this identifier is also used standalone (not just as .prop)
    const standalonePattern = new RegExp(`(?<!\\.)\\b${prop}\\b`, 'g')
    const dotPattern = new RegExp(`\\.${prop}\\b`, 'g')
    const standaloneMatches =
      bodyWithoutComments.match(standalonePattern)?.length || 0
    const dotMatches = bodyWithoutComments.match(dotPattern)?.length || 0
    // If every occurrence is a property access, remove it
    if (standaloneMatches <= dotMatches) {
      allIdentifiers.delete(prop)
    }
  }

  // Find identifiers declared in the body
  const declared = new Set<string>()

  // let/const/var declarations
  const declPattern = /\b(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = declPattern.exec(bodyWithoutComments)) !== null) {
    declared.add(match[1])
  }

  // for loop variables: for (let i = ...)
  const forPattern =
    /\bfor\s*\(\s*(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  while ((match = forPattern.exec(bodyWithoutComments)) !== null) {
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
    'wasmBuffer',
  ])

  // Return identifiers that are used but not declared or reserved
  const captures: string[] = []
  for (const id of allIdentifiers) {
    if (!declared.has(id) && !reserved.has(id) && !isWasmIntrinsic(id)) {
      captures.push(id)
    }
  }

  return captures.sort()
}

/**
 * Find the type annotation for a parameter in the enclosing function
 *
 * Looks backwards from wasmBlockStart to find the function signature,
 * then extracts the type annotation for the given parameter name.
 *
 * Supports:
 * - TJS colon syntax: `param: Float32Array`
 * - TypeScript syntax: `param: Float32Array`
 */
function findParameterType(
  source: string,
  wasmBlockStart: number,
  paramName: string
): string | undefined {
  // Look backwards to find the function signature
  // Find the nearest 'function' keyword before the wasm block
  const beforeBlock = source.slice(0, wasmBlockStart)

  // Match function declaration with parameters
  // This regex finds function signatures and captures the parameter list
  const funcPattern = /function\s+\w+\s*\(([^)]*)\)\s*(?:->.*?)?\s*\{[^}]*$/
  const match = beforeBlock.match(funcPattern)

  if (!match) {
    // Try arrow function or method syntax
    const arrowPattern =
      /(?:const|let|var)?\s*\w+\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|->)?\s*\{[^}]*$/
    const arrowMatch = beforeBlock.match(arrowPattern)
    if (!arrowMatch) return undefined
    return extractTypeFromParams(arrowMatch[1], paramName)
  }

  return extractTypeFromParams(match[1], paramName)
}

/**
 * Extract the type annotation for a specific parameter from a parameter list string
 */
function extractTypeFromParams(
  paramsStr: string,
  paramName: string
): string | undefined {
  // Split by comma (handling nested structures)
  const params = paramsStr.split(',').map((p) => p.trim())

  for (const param of params) {
    // Match patterns like:
    // - `name: Float32Array`
    // - `name: number`
    // - `name = Float32Array` (TJS example syntax)
    const colonMatch = param.match(
      new RegExp(`^${paramName}\\s*:\\s*([A-Za-z][A-Za-z0-9]*)`)
    )
    if (colonMatch) {
      return colonMatch[1]
    }

    // Match TypeScript-style with equals (default value that's a type constructor)
    const equalsMatch = param.match(
      new RegExp(
        `^${paramName}\\s*=\\s*(Float32Array|Float64Array|Int32Array|Uint8Array|Int8Array|Int16Array|Uint16Array|Uint32Array)`
      )
    )
    if (equalsMatch) {
      return equalsMatch[1]
    }
  }

  return undefined
}

/**
 * Transform Is/IsNot infix operators to function calls
 *
 * Syntax:
 *   a Is b      -> Is(a, b)
 *   a IsNot b   -> IsNot(a, b)
 *
 * This enables structural equality with a clean syntax.
 */
export function transformIsOperators(source: string): string {
  // Match: (simpleExpr) IsNot (simpleExpr) - must check IsNot first (longer match)
  // simpleExpr = identifier chain with optional [], () OR literals
  const exprPat =
    '([\\w][\\w.\\[\\]()]*|null|undefined|true|false|\\d+(?:\\.\\d+)?|\'[^\']*\'|"[^"]*")'

  // Transform IsNot first (longer keyword)
  const isNotRegex = new RegExp(exprPat + '\\s+IsNot\\s+' + exprPat, 'g')
  source = source.replace(isNotRegex, 'IsNot($1, $2)')

  // Transform Is
  const isRegex = new RegExp(exprPat + '\\s+Is\\s+' + exprPat, 'g')
  source = source.replace(isRegex, 'Is($1, $2)')

  return source
}

/**
 * Insert semicolons to prevent ASI footguns (TjsStandard mode)
 *
 * JavaScript's ASI (Automatic Semicolon Insertion) has notorious footguns:
 *
 *   foo          // Intended: call foo, then IIFE
 *   (() => {})() // Actual: foo(...)(...) - calls foo with IIFE as argument!
 *
 * TjsStandard prevents this by treating newlines as statement terminators
 * (like Go, Swift, Kotlin). When a line starts with a problematic character
 * that could continue the previous line, we insert a semicolon.
 *
 * Problematic line starts: ( [ / + - `
 *
 * We only insert when the previous line doesn't already end with:
 * - A semicolon
 * - An opening brace/bracket/paren (multi-line expression)
 * - A comma (array/object literal or params)
 * - An operator that clearly continues (+, -, *, /, =, etc.)
 * - A keyword that expects continuation (return, throw, etc. followed by value)
 */
export function insertAsiProtection(source: string): string {
  // Characters that can continue a previous expression (ASI footguns)
  const continuationStarts = /^[\s]*[([/+\-`]/

  // Characters/patterns that indicate the previous line expects continuation
  // (don't insert semicolon after these)
  const expectsContinuation = /[{([,;:+\-*/%=&|?<>!~^]\s*$|^\s*$/

  // Keywords that expect an expression to follow on same or next line
  const continueKeywords =
    /\b(return|throw|yield|await|case|default|extends|new|typeof|void|delete|in|of|instanceof)\s*$/

  const lines = source.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const prevLine = i > 0 ? lines[i - 1] : ''

    // Check if this line starts with a problematic character
    if (i > 0 && continuationStarts.test(line)) {
      // Get the previous line without trailing comment
      const prevNoComment = prevLine
        .replace(/\/\/.*$/, '')
        .replace(/\/\*.*\*\/\s*$/, '')

      // Don't insert if prev line clearly expects continuation
      if (
        !expectsContinuation.test(prevNoComment) &&
        !continueKeywords.test(prevNoComment)
      ) {
        // Insert semicolon at start of this line (preserving whitespace)
        const match = line.match(/^(\s*)/)
        const indent = match ? match[1] : ''
        const rest = line.slice(indent.length)
        result.push(indent + ';' + rest)
        continue
      }
    }

    result.push(line)
  }

  return result.join('\n')
}

/**
 * Transform == and != to Is() and IsNot() calls
 *
 * In TJS normal mode:
 *   a == b   -> Is(a, b)     (structural equality)
 *   a != b   -> IsNot(a, b)  (structural inequality)
 *   a === b  -> a === b      (identity, unchanged)
 *
 * Uses a two-pass algorithm:
 * 1. Find all == and != positions (outside strings/comments/regex)
 * 2. Transform from end to start (so positions remain valid)
 */
export function transformEqualityToStructural(source: string): string {
  // First pass: find all == and != positions (outside strings/comments/regex)
  const equalityOps: Array<{ pos: number; op: '==' | '!=' }> = []
  let i = 0
  let state: TokenizerState = 'normal'
  const templateStack: number[] = []

  while (i < source.length) {
    const char = source[i]
    const nextChar = source[i + 1]

    // Handle state transitions
    switch (state) {
      case 'single-string':
        if (char === '\\' && i + 1 < source.length) {
          i += 2
          continue
        }
        if (char === "'") state = 'normal'
        i++
        continue

      case 'double-string':
        if (char === '\\' && i + 1 < source.length) {
          i += 2
          continue
        }
        if (char === '"') state = 'normal'
        i++
        continue

      case 'template-string':
        if (char === '\\' && i + 1 < source.length) {
          i += 2
          continue
        }
        if (char === '$' && nextChar === '{') {
          i += 2
          templateStack.push(1)
          state = 'normal'
          continue
        }
        if (char === '`') state = 'normal'
        i++
        continue

      case 'line-comment':
        if (char === '\n') state = 'normal'
        i++
        continue

      case 'block-comment':
        if (char === '*' && nextChar === '/') {
          i += 2
          state = 'normal'
          continue
        }
        i++
        continue

      case 'regex':
        if (char === '\\' && i + 1 < source.length) {
          i += 2
          continue
        }
        if (char === '[') {
          i++
          while (i < source.length && source[i] !== ']') {
            if (source[i] === '\\' && i + 1 < source.length) {
              i += 2
            } else {
              i++
            }
          }
          if (i < source.length) i++
          continue
        }
        if (char === '/') {
          i++
          while (i < source.length && /[gimsuy]/.test(source[i])) i++
          state = 'normal'
          continue
        }
        i++
        continue

      case 'normal':
        // Handle template stack
        if (templateStack.length > 0) {
          if (char === '{') {
            templateStack[templateStack.length - 1]++
          } else if (char === '}') {
            templateStack[templateStack.length - 1]--
            if (templateStack[templateStack.length - 1] === 0) {
              templateStack.pop()
              i++
              state = 'template-string'
              continue
            }
          }
        }

        // Check for string/comment/regex start
        if (char === "'") {
          i++
          state = 'single-string'
          continue
        }
        if (char === '"') {
          i++
          state = 'double-string'
          continue
        }
        if (char === '`') {
          i++
          state = 'template-string'
          continue
        }
        if (char === '/' && nextChar === '/') {
          i += 2
          state = 'line-comment'
          continue
        }
        if (char === '/' && nextChar === '*') {
          i += 2
          state = 'block-comment'
          continue
        }

        // Check for regex literal (simplified detection)
        if (char === '/') {
          let j = i - 1
          while (j >= 0 && /\s/.test(source[j])) j--
          const beforeChar = j >= 0 ? source[j] : ''
          const isRegexContext =
            !beforeChar ||
            /[=(!,;:{[&|?+\-*%<>~^]/.test(beforeChar) ||
            (j >= 5 &&
              /\b(return|case|throw|in|of|typeof|instanceof|new|delete|void)$/.test(
                source.slice(Math.max(0, j - 10), j + 1)
              ))
          if (isRegexContext) {
            i++
            state = 'regex'
            continue
          }
        }

        // Look for == or != (but not === or !==)
        // For ==: check it's not part of !== (char before is !)
        // For !=: check it's not !== (third char is =)
        if (
          char === '=' &&
          nextChar === '=' &&
          source[i + 2] !== '=' &&
          source[i - 1] !== '!'
        ) {
          equalityOps.push({ pos: i, op: '==' })
          i += 2
          continue
        }
        if (char === '!' && nextChar === '=' && source[i + 2] !== '=') {
          equalityOps.push({ pos: i, op: '!=' })
          i += 2
          continue
        }
        break
    }

    i++
  }

  // If no equality operators found, return source unchanged
  if (equalityOps.length === 0) {
    return source
  }

  // Second pass: transform from end to start (so positions remain valid)
  let result = source
  for (let k = equalityOps.length - 1; k >= 0; k--) {
    const { pos, op } = equalityOps[k]
    const funcName = op === '==' ? 'Is' : 'IsNot'

    // Find left operand boundary
    const leftBoundary = findLeftOperandBoundary(result, pos)
    // Find right operand boundary
    const rightBoundary = findRightOperandBoundary(result, pos + 2)

    const leftExpr = result.slice(leftBoundary, pos).trim()
    const rightExpr = result.slice(pos + 2, rightBoundary).trim()

    if (leftExpr && rightExpr) {
      // Build the replacement
      const before = result.slice(0, leftBoundary)
      const after = result.slice(rightBoundary)
      // Add space after keyword if needed (e.g., return, throw, typeof)
      const needsSpace = /[a-zA-Z0-9_$]$/.test(before)
      const spacer = needsSpace ? ' ' : ''
      result = `${before}${spacer}${funcName}(${leftExpr}, ${rightExpr})${after}`
    }
  }

  return result
}

/**
 * Find the start position of the left operand
 *
 * Scans backwards from the operator position to find where the left expression starts.
 * Respects operator precedence: == has lower precedence than arithmetic operators,
 * so `x % 2 == 0` has left operand `x % 2`.
 */
function findLeftOperandBoundary(source: string, opPos: number): number {
  let i = opPos - 1

  // Skip whitespace before operator
  while (i >= 0 && /\s/.test(source[i])) i--
  if (i < 0) return 0

  let depth = 0
  let inString = false
  let stringChar = ''

  while (i >= 0) {
    const char = source[i]
    const prevChar = i > 0 ? source[i - 1] : ''

    // Handle string literals (scan backwards through them)
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false
      }
      i--
      continue
    }

    // Check for string end (we're scanning backwards, so end is opening quote)
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      inString = true
      stringChar = char
      i--
      continue
    }

    // Track depth of parens/brackets (reversed since we're going backwards)
    if (char === ')' || char === ']') {
      depth++
      i--
      continue
    }
    if (char === '(' || char === '[') {
      if (depth > 0) {
        depth--
        i--
        continue
      }
      // Opening paren/bracket at depth 0 - this is a grouping/call paren
      // The expression starts AFTER it, not including it
      return i + 1
    }

    // Inside nested expression - keep scanning
    if (depth > 0) {
      i--
      continue
    }

    // At depth 0 - check for expression boundaries
    // Statement delimiters
    if (char === ';' || char === '{' || char === '}') {
      return i + 1
    }

    // Check for keywords that precede expressions (return, throw, etc.)
    // We need to look backwards for a word boundary and check if it's a keyword
    if (/[a-z]/.test(char)) {
      // Might be end of a keyword - scan backwards to get full word
      const wordEnd = i + 1
      let wordStart = i
      while (wordStart > 0 && /[a-z]/i.test(source[wordStart - 1])) {
        wordStart--
      }
      const word = source.slice(wordStart, wordEnd)
      // Check if preceded by word char (not a keyword then)
      const beforeWord = wordStart > 0 ? source[wordStart - 1] : ''
      if (!/[a-zA-Z0-9_$]/.test(beforeWord)) {
        // These keywords start an expression - stop after them
        if (
          [
            'return',
            'throw',
            'case',
            'typeof',
            'void',
            'delete',
            'await',
            'yield',
            'new',
          ].includes(word)
        ) {
          return wordEnd
        }
      }
    }

    // Arrow function - stop before =>
    if (char === '>' && prevChar === '=') {
      return i + 1
    }

    // Assignment operator (but not ==, !=, <=, >=)
    if (
      char === '=' &&
      prevChar !== '=' &&
      prevChar !== '!' &&
      prevChar !== '<' &&
      prevChar !== '>'
    ) {
      return i + 1
    }

    // Logical operators (lower precedence than ==)
    if (char === '&' && prevChar === '&') {
      return i + 1
    }
    if (char === '|' && prevChar === '|') {
      return i + 1
    }

    // Ternary operators
    if (char === '?' || char === ':') {
      return i + 1
    }

    // Comma
    if (char === ',') {
      return i + 1
    }

    i--
  }

  return 0
}

/**
 * Find the end position of the right operand
 *
 * Scans forward from after the operator to find where the right expression ends.
 */
function findRightOperandBoundary(
  source: string,
  startAfterOp: number
): number {
  let i = startAfterOp

  // Skip whitespace after operator
  while (i < source.length && /\s/.test(source[i])) i++
  if (i >= source.length) return source.length

  let depth = 0
  let inString = false
  let stringChar = ''

  while (i < source.length) {
    const char = source[i]
    const nextChar = i + 1 < source.length ? source[i + 1] : ''

    // Handle string literals
    if (inString) {
      if (char === stringChar && source[i - 1] !== '\\') {
        inString = false
      }
      i++
      continue
    }

    if (
      (char === '"' || char === "'" || char === '`') &&
      source[i - 1] !== '\\'
    ) {
      inString = true
      stringChar = char
      i++
      continue
    }

    // Track depth
    if (char === '(' || char === '[' || char === '{') {
      depth++
      i++
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      if (depth > 0) {
        depth--
        i++
        continue
      }
      // Closing paren at depth 0 - boundary
      return i
    }

    // Inside nested - keep scanning
    if (depth > 0) {
      i++
      continue
    }

    // At depth 0 - check for expression boundaries
    if (char === ';') {
      return i
    }

    // Logical operators - lower precedence than ==
    if (char === '&' && nextChar === '&') {
      return i
    }
    if (char === '|' && nextChar === '|') {
      return i
    }

    // Ternary
    if (char === '?') {
      return i
    }
    if (char === ':') {
      return i
    }

    // Comma
    if (char === ',') {
      return i
    }

    // Another == or != (chained equality - stop before it)
    if (
      (char === '=' || char === '!') &&
      nextChar === '=' &&
      source[i + 2] !== '='
    ) {
      return i
    }

    i++
  }

  return source.length
}

/**
 * Transform Type block declarations
 *
 * Syntax forms:
 *   Type Foo 'example'                    -> const Foo = Type('Foo', 'example')
 *   Type Foo { example: 'value' }         -> const Foo = Type('Foo', 'value')
 *   Type Foo 'description' { example: 'value' }
 *                                         -> const Foo = Type('description', 'value')
 *   Type Foo 'description' { example: 0, predicate(x) { return x > 0 } }
 *                                         -> const Foo = Type('description', (x) => { ... }, 0)
 *
 * When predicate + example: auto-generate type guard from example
 */
export function transformTypeDeclarations(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'Type' keyword followed by identifier
    const typeMatch = source.slice(i).match(/^\bType\s+([A-Z][a-zA-Z0-9_]*)\s*/)
    if (typeMatch) {
      const typeName = typeMatch[1]
      let j = i + typeMatch[0].length

      // Check for optional description string
      // Only treat as description if followed by = or {
      let description = typeName
      let descriptionWasExplicit = false
      const descStringMatch = source.slice(j).match(/^(['"`])([^]*?)\1\s*/)
      if (descStringMatch) {
        const afterString = j + descStringMatch[0].length
        const nextChar = source[afterString]
        // Check if this looks like end of statement (not followed by = or {)
        // Note: the \s* in the regex consumes trailing whitespace including newlines
        const isEndOfStatement =
          nextChar === undefined ||
          afterString >= source.length ||
          (nextChar !== '=' && nextChar !== '{')

        if (nextChar === '=' || nextChar === '{') {
          // It's a description followed by = or { block
          description = descStringMatch[2]
          descriptionWasExplicit = true
          j = afterString
        } else if (isEndOfStatement) {
          // Old simple form: Type Name 'value' - value is both example and default
          const value = descStringMatch[0].trim()
          // Preserve trailing whitespace (newlines) that was consumed by the regex
          const trailingWs = descStringMatch[0].slice(value.length)
          result += `const ${typeName} = Type('${typeName}', ${value})${trailingWs}`
          i = afterString
          continue
        }
      }

      // Check for = default value
      let defaultValue: string | undefined
      let posAfterDefault = j // Track position right after the default value
      const equalsMatch = source.slice(j).match(/^=\s*/)
      if (equalsMatch) {
        j += equalsMatch[0].length
        // Parse the default value (handles +number, strings, objects, arrays, etc.)
        const valueMatch = source
          .slice(j)
          .match(
            /^(\+?\d+(?:\.\d+)?|['"`][^'"`]*['"`]|\{[^}]*\}|\[[^\]]*\]|true|false|null)/
          )
        if (valueMatch) {
          defaultValue = valueMatch[0]
          j += valueMatch[0].length
          posAfterDefault = j // Save position before consuming whitespace
          // Skip whitespace after default (only to check for block)
          const wsMatch = source.slice(j).match(/^\s*/)
          if (wsMatch) j += wsMatch[0].length
        }
      }

      // Check for block { ... }
      if (source[j] === '{') {
        // Block form: Type Foo 'desc'? = default? { ... }
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart

        // Find matching closing brace
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }

        if (depth !== 0) {
          // Unbalanced - just copy and continue
          result += source[i]
          i++
          continue
        }

        const blockBody = source.slice(bodyStart, k - 1).trim()
        const blockEnd = k

        // Parse block body for description (old syntax fallback), example, predicate
        const descInsideMatch = blockBody.match(
          /description\s*:\s*(['"`])([^]*?)\1/
        )
        if (descInsideMatch && !descriptionWasExplicit) {
          description = descInsideMatch[2]
        }

        // Extract example value using state machine for nested structures
        let example: string | undefined
        const exampleKeyword = blockBody.match(/example\s*:\s*/)
        if (exampleKeyword) {
          const valueStart = exampleKeyword.index! + exampleKeyword[0].length
          const extracted = extractJSValue(blockBody, valueStart)
          if (extracted) {
            example = extracted.value.trim()
          }
        }

        const predicateMatch = blockBody.match(
          /predicate\s*\(([^)]*)\)\s*\{([^]*)\}/
        )

        // Build Type() call with appropriate arguments
        // Type(description, predicateOrExample, example?, default?)
        if (predicateMatch && example) {
          // Predicate + example
          const params = predicateMatch[1].trim()
          const body = predicateMatch[2].trim()
          const defaultArg = defaultValue ? `, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', (${params}) => { if (!globalThis.__tjs?.validate(${params}, globalThis.__tjs?.infer(${example}))) return false; ${body} }, ${example}${defaultArg})`
        } else if (predicateMatch) {
          // Predicate only
          const params = predicateMatch[1].trim()
          const body = predicateMatch[2].trim()
          const defaultArg = defaultValue ? `, undefined, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', (${params}) => { ${body} }${defaultArg})`
        } else if (example) {
          // Example only (becomes validation schema)
          const defaultArg = defaultValue ? `, ${defaultValue}` : ''
          result += `const ${typeName} = Type('${description}', undefined, ${example}${defaultArg})`
        } else if (defaultValue) {
          // Default only (infer schema from default)
          result += `const ${typeName} = Type('${description}', ${defaultValue})`
        } else {
          // Empty block - error or description-only type
          result += `const ${typeName} = Type('${description}')`
        }

        i = blockEnd
        continue
      } else if (defaultValue) {
        // Simple form with default: Type Foo = 'value' or Type Foo 'desc' = 'value'
        result += `const ${typeName} = Type('${description}', ${defaultValue})`
        i = posAfterDefault // Use position before whitespace was consumed
        continue
      } else if (!descStringMatch) {
        // No description, no default, no block - look for old simple form: Type Foo 'value'
        const valueMatch = source
          .slice(j)
          .match(
            /^(['"`][^]*?['"`]|\+?\d+(?:\.\d+)?|true|false|null|\{[^]*?\}|\[[^]*?\])/
          )
        if (valueMatch) {
          const example = valueMatch[0]
          result += `const ${typeName} = Type('${typeName}', ${example})`
          i = j + valueMatch[0].length
          continue
        }
      }
    }

    result += source[i]
    i++
  }

  return result
}

/**
 * Transform Generic block declarations
 *
 * Syntax:
 *   Generic Pair<T, U> { description: '...', predicate(obj, T, U) { ... } }
 *   Generic Container<T, U = ''> { ... }  // U has default
 *
 * Transforms to:
 *   const Pair = Generic(['T', 'U'], (obj, checkT, checkU) => { ... }, '...')
 *   const Container = Generic(['T', ['U', '']], (obj, checkT, checkU) => { ... }, '...')
 */
export function transformGenericDeclarations(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'Generic' keyword followed by identifier and type params
    const genericMatch = source
      .slice(i)
      .match(/^\bGeneric\s+([A-Z][a-zA-Z0-9_]*)\s*<([^>]+)>\s*\{/)
    if (genericMatch) {
      const genericName = genericMatch[1]
      const typeParamsStr = genericMatch[2]
      const blockStart = i + genericMatch[0].length - 1
      const bodyStart = blockStart + 1
      let depth = 1
      let k = bodyStart

      // Find matching closing brace
      while (k < source.length && depth > 0) {
        const char = source[k]
        if (char === '{') depth++
        else if (char === '}') depth--
        k++
      }

      if (depth !== 0) {
        // Unbalanced - just copy and continue
        result += source[i]
        i++
        continue
      }

      const blockBody = source.slice(bodyStart, k - 1).trim()
      const blockEnd = k

      // Parse type params: T, U = Default
      const typeParams = typeParamsStr.split(',').map((p) => {
        const parts = p
          .trim()
          .split('=')
          .map((s) => s.trim())
        if (parts.length === 2) {
          return `['${parts[0]}', ${parts[1]}]`
        }
        return `'${parts[0]}'`
      })

      // Parse the block body
      const descMatch = blockBody.match(/description\s*:\s*(['"`])([^]*?)\1/)
      const predicateMatch = blockBody.match(
        /predicate\s*\(([^)]*)\)\s*\{([^]*)\}/
      )

      const description = descMatch ? descMatch[2] : genericName

      if (predicateMatch) {
        const params = predicateMatch[1]
          .trim()
          .split(',')
          .map((s) => s.trim())
        let body = predicateMatch[2].trim()

        // First param is the value, rest are type params
        const valueParam = params[0] || 'x'
        const typeParamNames = params.slice(1)
        const typeCheckParams = typeParamNames.map((p) => `check${p}`)

        // Replace type param names with check functions in body
        // e.g., T(x[0]) becomes checkT(x[0])
        typeParamNames.forEach((name, idx) => {
          body = body.replace(
            new RegExp(`\\b${name}\\s*\\(`, 'g'),
            `${typeCheckParams[idx]}(`
          )
        })

        result += `const ${genericName} = Generic([${typeParams.join(
          ', '
        )}], (${valueParam}, ${typeCheckParams.join(
          ', '
        )}) => { ${body} }, '${description}')`
      } else {
        // No predicate - create a generic that always passes
        result += `const ${genericName} = Generic([${typeParams.join(
          ', '
        )}], () => true, '${description}')`
      }

      i = blockEnd
      continue
    }

    result += source[i]
    i++
  }

  return result
}

/**
 * Transform Union declarations
 *
 * Syntax:
 *   Union Direction 'cardinal direction' {
 *     'up' | 'down' | 'left' | 'right'
 *   }
 *
 * Transforms to:
 *   const Direction = Union('cardinal direction', ['up', 'down', 'left', 'right'])
 *
 * Also supports inline form:
 *   Union Direction 'cardinal direction' 'up' | 'down' | 'left' | 'right'
 */
export function transformUnionDeclarations(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'Union' keyword followed by identifier and description
    const unionMatch = source
      .slice(i)
      .match(/^\bUnion\s+([A-Z][a-zA-Z0-9_]*)\s+(['"`])([^]*?)\2\s*/)
    if (unionMatch) {
      const unionName = unionMatch[1]
      const description = unionMatch[3]
      const j = i + unionMatch[0].length

      // Check what follows: block or inline values
      if (source[j] === '{') {
        // Block form: Union Foo 'desc' { ... }
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart

        // Find matching closing brace
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }

        if (depth !== 0) {
          result += source[i]
          i++
          continue
        }

        const blockBody = source.slice(bodyStart, k - 1).trim()
        const blockEnd = k

        // Parse values: 'a' | 'b' | 'c' or "a" | "b" or mixed
        const values = parseUnionValues(blockBody)
        result += `const ${unionName} = Union('${description}', [${values.join(
          ', '
        )}])`
        i = blockEnd
        continue
      } else {
        // Inline form: Union Foo 'desc' 'a' | 'b' | 'c'
        // Find the end of the line or statement
        let lineEnd = source.indexOf('\n', j)
        if (lineEnd === -1) lineEnd = source.length
        const inlineValues = source.slice(j, lineEnd).trim()

        if (inlineValues) {
          const values = parseUnionValues(inlineValues)
          result += `const ${unionName} = Union('${description}', [${values.join(
            ', '
          )}])`
          i = lineEnd
          continue
        }
      }
    }

    result += source[i]
    i++
  }

  return result
}

/**
 * Parse union values from a string like: 'a' | 'b' | 123 | true
 * Returns array of value literals as strings
 */
function parseUnionValues(input: string): string[] {
  const values: string[] = []
  // Split on | and trim, preserving quoted strings and literals
  const parts = input.split('|').map((p) => p.trim())

  for (const part of parts) {
    if (!part) continue
    // Keep the value as-is (already a valid JS literal)
    values.push(part)
  }

  return values
}

/**
 * Transform Enum declarations
 *
 * Syntax:
 *   Enum Status 'task status' {
 *     Pending
 *     Active
 *     Done
 *   }
 *
 *   Enum Color 'CSS color' {
 *     Red = 'red'
 *     Green = 'green'
 *     Blue = 'blue'
 *   }
 *
 * Transforms to:
 *   const Status = Enum('task status', { Pending: 0, Active: 1, Done: 2 })
 *   const Color = Enum('CSS color', { Red: 'red', Green: 'green', Blue: 'blue' })
 */
export function transformEnumDeclarations(source: string): string {
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'Enum' keyword followed by identifier and description
    const enumMatch = source
      .slice(i)
      .match(/^\bEnum\s+([A-Z][a-zA-Z0-9_]*)\s+(['"`])([^]*?)\2\s*\{/)
    if (enumMatch) {
      const enumName = enumMatch[1]
      const description = enumMatch[3]
      const blockStart = i + enumMatch[0].length - 1
      const bodyStart = blockStart + 1
      let depth = 1
      let k = bodyStart

      // Find matching closing brace
      while (k < source.length && depth > 0) {
        const char = source[k]
        if (char === '{') depth++
        else if (char === '}') depth--
        k++
      }

      if (depth !== 0) {
        result += source[i]
        i++
        continue
      }

      const blockBody = source.slice(bodyStart, k - 1).trim()
      const blockEnd = k

      // Parse enum members
      const members = parseEnumMembers(blockBody)
      const membersStr = members
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')

      result += `const ${enumName} = Enum('${description}', { ${membersStr} })`
      i = blockEnd
      continue
    }

    result += source[i]
    i++
  }

  return result
}

/**
 * Parse enum members from block body
 * Handles: Pending, Active = 5, Done, Name = 'value'
 * Returns array of [key, value] pairs
 */
function parseEnumMembers(input: string): [string, string][] {
  const members: [string, string][] = []
  let currentNumericValue = 0

  // Split on newlines and commas, filter empty
  const lines = input
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))

  for (const line of lines) {
    // Match: Name or Name = value
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*(.+))?$/)
    if (match) {
      const key = match[1]
      const explicitValue = match[2]?.trim()

      if (explicitValue !== undefined) {
        members.push([key, explicitValue])
        // If it's a number, update the counter
        const numVal = Number(explicitValue)
        if (!isNaN(numVal)) {
          currentNumericValue = numVal + 1
        }
      } else {
        // Auto-increment numeric value
        members.push([key, String(currentNumericValue)])
        currentNumericValue++
      }
    }
  }

  return members
}

/**
 * Extension info for a single extend block
 */

export function transformExtendDeclarations(source: string): {
  source: string
  extensions: Map<string, Set<string>>
} {
  const extensions = new Map<string, Set<string>>()
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'extend' keyword at statement boundary
    const remaining = source.slice(i)
    const extendMatch = remaining.match(/^(\s*)extend\s+([A-Z]\w*)\s*\{/)

    if (!extendMatch) {
      // Check if we're at start of line or after semicolon/brace
      const lineStart =
        i === 0 ||
        source[i - 1] === '\n' ||
        source[i - 1] === ';' ||
        source[i - 1] === '}'

      if (lineStart) {
        const afterWS = remaining.match(/^(\s*)extend\s+([A-Z]\w*)\s*\{/)
        if (afterWS) {
          // Already handled above, fall through
        }
      }
      result += source[i]
      i++
      continue
    }

    const indent = extendMatch[1]
    const typeName = extendMatch[2]
    const blockStart = i + extendMatch[0].length - 1 // position of {

    // Find matching closing brace
    const blockEnd = findFunctionBodyEnd(source, blockStart)
    const blockBody = source.slice(blockStart + 1, blockEnd - 1).trim()

    // Parse methods from the block body
    // Match: methodName(params) { body } or async methodName(params) { body }
    const methods: { name: string; isAsync: boolean; fullText: string }[] = []
    let j = 0
    const bodySource = source.slice(blockStart + 1, blockEnd - 1)

    while (j < bodySource.length) {
      const methodRemaining = bodySource.slice(j)
      const methodMatch = methodRemaining.match(/^(\s*)(async\s+)?(\w+)\s*\(/)

      if (!methodMatch) {
        j++
        continue
      }

      const methodIndent = methodMatch[1]
      const isAsync = !!methodMatch[2]
      const methodName = methodMatch[3]

      // Reject arrow functions — they don't bind `this`
      // We'll check after finding the body

      // Find the opening paren
      const parenStart = j + methodMatch[0].length - 1
      let parenDepth = 1
      let k = parenStart + 1
      while (k < bodySource.length && parenDepth > 0) {
        if (bodySource[k] === '(') parenDepth++
        if (bodySource[k] === ')') parenDepth--
        k++
      }
      const paramsStr = bodySource.slice(parenStart + 1, k - 1)

      // Skip whitespace to find { or =>
      let afterParams = k
      while (
        afterParams < bodySource.length &&
        /\s/.test(bodySource[afterParams])
      ) {
        afterParams++
      }

      // Check for arrow function
      if (
        bodySource[afterParams] === '=' &&
        bodySource[afterParams + 1] === '>'
      ) {
        const loc = locAt(source, blockStart + 1 + j)
        throw new SyntaxError(
          `Arrow functions are not allowed in extend blocks (method '${methodName}' in extend ${typeName}). ` +
            `Use regular function syntax instead, as extension methods need 'this' binding.`,
          loc
        )
      }

      if (bodySource[afterParams] !== '{') {
        j++
        continue
      }

      // Find matching closing brace for the method body
      const methodBodyEnd = findFunctionBodyEnd(bodySource, afterParams)
      const fullMethodText = bodySource.slice(j, methodBodyEnd).trim()

      // Build: methodName: function(params) { body }
      // Transform TJS colon params (name: value) to JS defaults (name = value)
      const transformedParams = paramsStr
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => {
          // name: value -> name = value (TJS colon shorthand)
          const colonMatch = p.match(/^(\w+)\s*:\s*(.+)$/)
          if (colonMatch) return `${colonMatch[1]} = ${colonMatch[2]}`
          return p
        })
        .join(', ')
      const asyncPrefix = isAsync ? 'async ' : ''
      const methodBody = bodySource.slice(afterParams + 1, methodBodyEnd - 1)
      methods.push({
        name: methodName,
        isAsync,
        fullText: `${methodName}: ${asyncPrefix}function(${transformedParams}) {${methodBody}}`,
      })

      j = methodBodyEnd
    }

    // Track extensions
    const isFirstForType = !extensions.has(typeName)
    if (isFirstForType) {
      extensions.set(typeName, new Set())
    }
    const extSet = extensions.get(typeName)!
    for (const m of methods) {
      extSet.add(m.name)
    }

    // Generate the __ext object (or merge into existing)
    const methodEntries = methods.map((m) => `  ${m.fullText}`).join(',\n')
    let replacement: string
    if (isFirstForType) {
      replacement = `${indent}const __ext_${typeName} = {\n${methodEntries}\n${indent}}\n`
    } else {
      // Merge into existing: Object.assign(__ext_TypeName, { ... })
      replacement = `${indent}Object.assign(__ext_${typeName}, {\n${methodEntries}\n${indent}})\n`
    }

    // Generate registration calls
    for (const m of methods) {
      replacement += `${indent}if (__tjs?.registerExtension) { __tjs.registerExtension('${typeName}', '${m.name}', __ext_${typeName}.${m.name}) }\n`
    }

    result += replacement
    i = blockEnd
  }

  // Append any remaining source
  if (i <= source.length && result.length < source.length) {
    // Already handled character by character
  }

  return { source: result, extensions }
}

/**
 * Transform method calls on known-type receivers to use extension objects.
 *
 * For literals and typed variables where the type is known:
 *   'hello'.capitalize()  ->  __ext_String.capitalize.call('hello')
 *   [1,2,3].last()        ->  __ext_Array.last.call([1,2,3])
 *
 * This is a best-effort source-level transform. For unknown types,
 * the runtime fallback (resolveExtension) handles it.
 */
export function transformExtensionCalls(
  source: string,
  extensions: Map<string, Set<string>>
): string {
  if (extensions.size === 0) return source

  // Build a map of method names to possible type names for quick lookup
  const methodToTypes = new Map<string, string[]>()
  for (const [typeName, methods] of extensions) {
    for (const method of methods) {
      if (!methodToTypes.has(method)) {
        methodToTypes.set(method, [])
      }
      methodToTypes.get(method)!.push(typeName)
    }
  }

  let result = source

  // Rewrite calls on string literals: 'str'.method(...) or "str".method(...)
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('String')) continue

    // Match string literal followed by .method(
    // Single-quoted strings
    const singleQuotePattern = new RegExp(
      `('(?:[^'\\\\]|\\\\.)*')\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(singleQuotePattern, (_, str, meth, closeParen) => {
      return closeParen
        ? `__ext_String.${meth}.call(${str})`
        : `__ext_String.${meth}.call(${str}, `
    })

    // Double-quoted strings
    const doubleQuotePattern = new RegExp(
      `("(?:[^"\\\\]|\\\\.)*")\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(doubleQuotePattern, (_, str, meth, closeParen) => {
      return closeParen
        ? `__ext_String.${meth}.call(${str})`
        : `__ext_String.${meth}.call(${str}, `
    })

    // Template literals (backtick) — simple case only (no nested templates)
    const templatePattern = new RegExp(
      '(`(?:[^`\\\\]|\\\\.)*`)\\.' + method + '\\((\\))?',
      'g'
    )
    result = result.replace(templatePattern, (_, str, closeParen) => {
      return closeParen
        ? `__ext_String.${method}.call(${str})`
        : `__ext_String.${method}.call(${str}, `
    })
  }

  // Rewrite calls on array literals: [1,2,3].method(...)
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('Array')) continue

    // Match array literal [...].method(
    // This is tricky — we need to find balanced brackets
    // Simple approach: find ].method( and walk backward to find matching [
    const methodDot = `].${method}(`
    let searchFrom = 0
    let idx: number
    while ((idx = result.indexOf(methodDot, searchFrom)) !== -1) {
      // Walk backward from idx to find matching [
      let bracketDepth = 1
      let k = idx - 1
      let inStr: string | false = false
      while (k >= 0 && bracketDepth > 0) {
        const ch = result[k]
        if (inStr) {
          if (ch === inStr && (k === 0 || result[k - 1] !== '\\')) {
            inStr = false
          }
        } else {
          if (ch === ']') bracketDepth++
          if (ch === '[') bracketDepth--
          if (ch === "'" || ch === '"' || ch === '`') inStr = ch
        }
        k--
      }

      if (bracketDepth === 0) {
        const arrayLiteral = result.slice(k + 1, idx + 1)
        const before = result.slice(0, k + 1)
        const after = result.slice(idx + methodDot.length)
        // Check if no-args call: next char is )
        if (after[0] === ')') {
          result = `${before}__ext_Array.${method}.call(${arrayLiteral})${after.slice(
            1
          )}`
        } else {
          result = `${before}__ext_Array.${method}.call(${arrayLiteral}, ${after}`
        }
      }

      searchFrom = idx + 1
    }
  }

  // Rewrite calls on number literals: (42).method(...)
  for (const [method, typeNames] of methodToTypes) {
    if (!typeNames.includes('Number')) continue

    const numPattern = new RegExp(
      `(\\d+(?:\\.\\d+)?)\\.(${method})\\((\\))?`,
      'g'
    )
    result = result.replace(numPattern, (_, num, meth, closeParen) => {
      return closeParen
        ? `__ext_Number.${meth}.call(${num})`
        : `__ext_Number.${meth}.call(${num}, `
    })
  }

  return result
}

/**
 * Compute {line, column} from a character offset in source.
 */
export function locAt(
  source: string,
  pos: number
): { line: number; column: number } {
  let line = 1
  let column = 0
  for (let i = 0; i < pos && i < source.length; i++) {
    if (source[i] === '\n') {
      line++
      column = 0
    } else {
      column++
    }
  }
  return { line, column }
}

/**
 * Info about a single function variant for polymorphic dispatch
 */

function typeCheckForDefault(argExpr: string, defaultValue: string): string {
  const dv = defaultValue.trim()

  // String literal
  if (/^['"`]/.test(dv)) return `typeof ${argExpr} === 'string'`

  // Boolean
  if (dv === 'true' || dv === 'false') return `typeof ${argExpr} === 'boolean'`

  // null
  if (dv === 'null') return `${argExpr} === null`

  // undefined
  if (dv === 'undefined') return `${argExpr} === undefined`

  // Array literal
  if (dv.startsWith('[')) return `Array.isArray(${argExpr})`

  // Object literal
  if (dv.startsWith('{'))
    return `(typeof ${argExpr} === 'object' && ${argExpr} !== null && !Array.isArray(${argExpr}))`

  // Non-negative integer: +N
  if (/^\+\d+/.test(dv))
    return `(typeof ${argExpr} === 'number' && Number.isInteger(${argExpr}) && ${argExpr} >= 0)`

  // Number with decimal → float
  if (/^-?\d+\.\d+/.test(dv)) return `typeof ${argExpr} === 'number'`

  // Integer (whole number, possibly negative)
  if (/^-?\d+$/.test(dv))
    return `(typeof ${argExpr} === 'number' && Number.isInteger(${argExpr}))`

  // Fallback: any
  return 'true'
}

/**
 * Get a type "signature" string from a default value for ambiguity checking.
 * Two params with the same signature at the same position are ambiguous.
 */
function typeSignatureForDefault(defaultValue: string): string {
  const dv = defaultValue.trim()
  if (/^['"`]/.test(dv)) return 'string'
  if (dv === 'true' || dv === 'false') return 'boolean'
  if (dv === 'null') return 'null'
  if (dv === 'undefined') return 'undefined'
  if (dv.startsWith('[')) return 'array'
  if (dv.startsWith('{')) return 'object'
  if (/^\+\d+/.test(dv)) return 'non-negative-integer'
  if (/^-?\d+\.\d+/.test(dv)) return 'number'
  if (/^-?\d+$/.test(dv)) return 'integer'
  return 'any'
}

/**
 * Parse a parameter string like "a = 0, b = 'hello', c = { x: 0 }"
 * into an array of { name, defaultValue, required } objects.
 * Handles nested braces/brackets/parens and template literals.
 */
function parseParamList(
  paramStr: string,
  requiredParams: Set<string>
): { name: string; defaultValue: string; required: boolean }[] {
  const params: { name: string; defaultValue: string; required: boolean }[] = []
  let depth = 0
  let current = ''
  let inString: string | false = false

  for (let i = 0; i < paramStr.length; i++) {
    const ch = paramStr[i]

    // Track string state
    if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
      inString = ch
      current += ch
      continue
    }
    if (inString) {
      current += ch
      if (ch === '\\') {
        i++
        if (i < paramStr.length) current += paramStr[i]
        continue
      }
      if (ch === inString) inString = false
      continue
    }

    // Track nesting
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      current += ch
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      current += ch
      continue
    }

    // Split on comma at depth 0
    if (ch === ',' && depth === 0) {
      const param = parseOneParam(current.trim(), requiredParams)
      if (param) params.push(param)
      current = ''
      continue
    }

    current += ch
  }

  // Last param
  const trimmed = current.trim()
  if (trimmed) {
    const param = parseOneParam(trimmed, requiredParams)
    if (param) params.push(param)
  }

  return params
}

/**
 * Parse a single parameter like "name = 'Alice'" or "/* unsafe * / x = 0"
 */
function parseOneParam(
  paramStr: string,
  requiredParams: Set<string>
): { name: string; defaultValue: string; required: boolean } | null {
  // Strip leading /* unsafe */ comment
  const str = paramStr.replace(/^\/\*\s*unsafe\s*\*\/\s*/, '')

  // Rest params not supported in polymorphic functions
  if (str.startsWith('...')) return null

  // Find = sign (the param has been transformed from : to = by transformParenExpressions)
  const eqIdx = str.indexOf('=')
  if (eqIdx === -1) {
    // No default value — untyped param
    return { name: str.trim(), defaultValue: '', required: true }
  }

  const name = str.slice(0, eqIdx).trim()
  const defaultValue = str.slice(eqIdx + 1).trim()
  return { name, defaultValue, required: requiredParams.has(name) }
}

/**
 * Find the end of a function body (matching closing brace).
 * Handles nested braces, strings, template literals, comments, and regex.
 * Returns the index AFTER the closing brace.
 */
export function findFunctionBodyEnd(
  source: string,
  openBracePos: number
): number {
  let depth = 1
  let i = openBracePos + 1
  let inString: string | false = false
  let inLineComment = false
  let inBlockComment = false

  while (i < source.length && depth > 0) {
    const ch = source[i]
    const next = i + 1 < source.length ? source[i + 1] : ''

    // Line comment
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      i++
      continue
    }

    // Block comment
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i++
      continue
    }

    // String tracking
    if (inString) {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === inString) inString = false
      i++
      continue
    }

    // Start comments
    if (ch === '/' && next === '/') {
      inLineComment = true
      i += 2
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 2
      continue
    }

    // Start strings
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch
      i++
      continue
    }

    // Braces
    if (ch === '{') depth++
    if (ch === '}') depth--

    i++
  }

  return i
}

/**
 * Transform polymorphic functions: multiple function declarations with the
 * same name are merged into a single dispatcher function.
 *
 * Must be called AFTER transformParenExpressions (so params have = defaults)
 * but BEFORE wrapClassDeclarations.
 *
 * function greet(name = '') { ... }
 * function greet(first = '', last = '') { ... }
 *
 * becomes:
 *
 * function greet$1(name = '') { ... }
 * function greet$2(first = '', last = '') { ... }
 * function greet(...__args) {
 *   if (__args.length === 1 && typeof __args[0] === 'string') return greet$1(__args[0])
 *   if (__args.length === 2 && ...) return greet$2(__args[0], __args[1])
 *   return __tjs.typeError('greet', 'no matching overload', __args)
 * }
 */
export function transformPolymorphicFunctions(
  source: string,
  requiredParams: Set<string>
): { source: string; polymorphicNames: Set<string> } {
  const polymorphicNames = new Set<string>()

  // Phase 1: Find all function declarations and group by name
  // Match: optional "export" + optional "async" + "function" + name + "("
  const funcPattern =
    /(?:^|(?<=[\n;{}]))\s*(export\s+)?(async\s+)?function\s+(\w+)\s*\(/gm
  const declarations = new Map<string, PolyVariant[]>()
  let match: RegExpExecArray | null

  // First pass: collect all function positions and names
  const allMatches: {
    name: string
    fullMatchStart: number
    funcKeywordStart: number
    exported: boolean
    isAsync: boolean
  }[] = []

  while ((match = funcPattern.exec(source)) !== null) {
    const exported = !!match[1]
    const isAsync = !!match[2]
    const name = match[3]
    const fullMatchStart = match.index
    // Find where "function" keyword starts (skip whitespace and export/async)
    let funcKeywordStart = fullMatchStart
    const prefix = match[0]
    const funcIdx = prefix.indexOf('function')
    if (funcIdx >= 0) funcKeywordStart = fullMatchStart + funcIdx

    allMatches.push({
      name,
      fullMatchStart,
      funcKeywordStart,
      exported,
      isAsync,
    })
  }

  // Group by name
  for (const m of allMatches) {
    if (!declarations.has(m.name)) {
      declarations.set(m.name, [])
    }
  }

  // Count occurrences — only process names that appear more than once
  const nameCounts = new Map<string, number>()
  for (const m of allMatches) {
    nameCounts.set(m.name, (nameCounts.get(m.name) || 0) + 1)
  }

  const polyNames = new Set<string>()
  for (const [name, count] of nameCounts) {
    if (count > 1) polyNames.add(name)
  }

  if (polyNames.size === 0) {
    return { source, polymorphicNames }
  }

  // Phase 2: For each polymorphic function, extract full details
  for (const m of allMatches) {
    if (!polyNames.has(m.name)) continue

    // Find the opening paren
    const afterFunc = source.indexOf('(', m.funcKeywordStart)
    if (afterFunc === -1) continue

    // Find matching closing paren
    let parenDepth = 1
    let j = afterFunc + 1
    while (j < source.length && parenDepth > 0) {
      if (source[j] === '(') parenDepth++
      if (source[j] === ')') parenDepth--
      j++
    }
    const closeParen = j - 1
    const paramStr = source.slice(afterFunc + 1, closeParen)

    // Find the opening brace of the function body
    let bodyStart = j
    while (bodyStart < source.length && source[bodyStart] !== '{') bodyStart++
    if (bodyStart >= source.length) continue

    // Find matching closing brace
    const bodyEnd = findFunctionBodyEnd(source, bodyStart)

    // Determine the real start (including leading whitespace, export, async)
    let realStart = m.fullMatchStart
    // Include leading whitespace on the same line
    while (realStart > 0 && source[realStart - 1] === ' ') realStart--

    const variants = declarations.get(m.name)!
    const params = parseParamList(paramStr, requiredParams)

    // Check for rest params
    const hasRestParam = paramStr.includes('...')
    if (hasRestParam) {
      const loc = locAt(source, m.funcKeywordStart)
      throw new SyntaxError(
        `Rest parameters are not supported in polymorphic function '${m.name}'. ` +
          `Use separate function names instead.`,
        loc
      )
    }

    variants.push({
      index: variants.length + 1,
      start: realStart,
      end: bodyEnd,
      text: source.slice(realStart, bodyEnd),
      exported: m.exported,
      isAsync: m.isAsync,
      params,
    })
  }

  // Phase 3: Validate — check for ambiguous variants
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue

    // Check async consistency
    const asyncCount = variants.filter((v) => v.isAsync).length
    if (asyncCount > 0 && asyncCount < variants.length) {
      const loc = locAt(source, variants[0].start)
      throw new SyntaxError(
        `Polymorphic function '${name}': all variants must be either sync or async, not mixed.`,
        loc
      )
    }

    // Check for ambiguous signatures (same types at same positions, differing only in required/optional)
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const a = variants[i]
        const b = variants[j]

        // Different max arity is fine
        if (a.params.length !== b.params.length) continue

        // Same arity — check if types are identical at every position
        let allSame = true
        for (let k = 0; k < a.params.length; k++) {
          const sigA = a.params[k].defaultValue
            ? typeSignatureForDefault(a.params[k].defaultValue)
            : 'any'
          const sigB = b.params[k].defaultValue
            ? typeSignatureForDefault(b.params[k].defaultValue)
            : 'any'
          if (sigA !== sigB) {
            allSame = false
            break
          }
        }

        if (allSame) {
          const loc = locAt(source, b.start)
          throw new SyntaxError(
            `Polymorphic function '${name}': variants ${i + 1} and ${
              j + 1
            } have ambiguous signatures ` +
              `(same parameter types at every position). Overloads must differ by arity or parameter types.`,
            loc
          )
        }
      }
    }
  }

  // Phase 4: Build the transformed source
  // Sort all variants by position (reverse order for safe replacement)
  const allVariants: { name: string; variant: PolyVariant }[] = []
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue
    for (const v of variants) {
      allVariants.push({ name, variant: v })
    }
  }
  allVariants.sort((a, b) => b.variant.start - a.variant.start)

  // Replace each variant in reverse order (preserves positions)
  let result = source
  for (const { name, variant } of allVariants) {
    const asyncPrefix = variant.isAsync ? 'async ' : ''
    // Rename: function greet(...) -> function greet$1(...)
    // Strip "export" from variants — only the dispatcher is exported
    // Use $$ in replacement to produce literal $ (avoid backreference interpretation)
    const renamed = variant.text.replace(
      new RegExp(
        `(?:export\\s+)?${
          asyncPrefix ? asyncPrefix.replace(/\s+$/, '\\s+') : ''
        }function\\s+${name}\\s*\\(`
      ),
      `${asyncPrefix}function ${name}$$${variant.index}(`
    )
    result =
      result.slice(0, variant.start) + renamed + result.slice(variant.end)
  }

  // Phase 5: Append dispatcher functions
  for (const [name, variants] of declarations) {
    if (variants.length < 2) continue
    polymorphicNames.add(name)

    const isAsync = variants[0].isAsync
    const isExported = variants.some((v) => v.exported)
    const asyncPrefix = isAsync ? 'async ' : ''
    const exportPrefix = isExported ? 'export ' : ''

    // Sort variants by specificity for dispatch order:
    // 1. More params first (higher arity)
    // 2. More specific types first (integer before number, object before any)
    const sorted = [...variants].sort((a, b) => {
      // Different arity: more params = more specific (checked first within same arity group)
      if (a.params.length !== b.params.length) return 0 // arity groups handled in dispatch

      // Same arity: count specificity
      let specA = 0
      let specB = 0
      for (const p of a.params) {
        const sig = p.defaultValue
          ? typeSignatureForDefault(p.defaultValue)
          : 'any'
        if (sig === 'non-negative-integer') specA += 3
        else if (sig === 'integer') specA += 2
        else if (sig !== 'any') specA += 1
      }
      for (const p of b.params) {
        const sig = p.defaultValue
          ? typeSignatureForDefault(p.defaultValue)
          : 'any'
        if (sig === 'non-negative-integer') specB += 3
        else if (sig === 'integer') specB += 2
        else if (sig !== 'any') specB += 1
      }
      return specB - specA // More specific first
    })

    // Generate dispatch branches
    const branches: string[] = []
    for (const v of sorted) {
      const checks: string[] = [`__args.length === ${v.params.length}`]
      const args: string[] = []

      for (let k = 0; k < v.params.length; k++) {
        const p = v.params[k]
        args.push(`__args[${k}]`)
        if (p.defaultValue) {
          const check = typeCheckForDefault(`__args[${k}]`, p.defaultValue)
          if (check !== 'true') checks.push(check)
        }
      }

      branches.push(
        `  if (${checks.join(' && ')}) return ${name}$${v.index}(${args.join(
          ', '
        )})`
      )
    }

    const dispatcher = `
${exportPrefix}${asyncPrefix}function ${name}(...__args) {
${branches.join('\n')}
  return __tjs.typeError('${name}', 'no matching overload', __args)
}
`
    result += dispatcher
  }

  return { source: result, polymorphicNames }
}

/**
 * Transform bare assignments to const declarations
 *
 * Foo = ... -> const Foo = ...
 *
 * Only transforms assignments at statement level (start of line or after semicolon/brace)
 * where the identifier starts with uppercase (to avoid breaking normal assignments)
 */
export function transformBareAssignments(source: string): string {
  // Match: start of line/statement, uppercase identifier, =, not ==
  // Negative lookbehind for const/let/var to avoid double-declaring
  return source.replace(
    /(?<=^|[;\n{])\s*([A-Z][a-zA-Z0-9_]*)\s*=(?!=)/gm,
    (match, name) => {
      // Check if already has const/let/var before it
      return match.replace(name, `const ${name}`)
    }
  )
}

/**
 * Parse source code into an Acorn AST
 */

export function extractAndRunTests(
  source: string,
  skipTests = false
): {
  source: string
  tests: TestBlock[]
  errors: string[]
} {
  const tests: TestBlock[] = []
  const errors: string[] = []
  let result = ''
  let i = 0

  while (i < source.length) {
    // Look for 'test' keyword followed by optional string then {
    const testMatch = source.slice(i).match(/^\btest\s+/)
    if (testMatch) {
      const start = i
      let j = i + testMatch[0].length

      // Check for optional description string
      let description: string | undefined
      const descMatch = source.slice(j).match(/^(['"`])([^]*?)\1\s*/)
      if (descMatch) {
        description = descMatch[2]
        j += descMatch[0].length
      }

      // Must have opening brace
      if (source[j] === '{') {
        const bodyStart = j + 1
        let depth = 1
        let k = bodyStart

        // Find matching closing brace
        while (k < source.length && depth > 0) {
          const char = source[k]
          if (char === '{') depth++
          else if (char === '}') depth--
          k++
        }

        if (depth === 0) {
          const body = source.slice(bodyStart, k - 1).trim()
          const end = k

          const line = (source.slice(0, start).match(/\n/g) || []).length + 1
          tests.push({ description, body, start, end, line })

          // Run the test unless skipped
          if (!skipTests) {
            try {
              // Execute test in isolated context
              // The test has access to the Types defined before it
              const testFn = new Function(body)
              testFn()
            } catch (err: any) {
              const desc = description || `test at line ${line}`
              errors.push(
                `Test failed: ${desc} (line ${line})\n  ${err.message || err}`
              )
            }
          }

          // Strip the test block from output (replace with whitespace to preserve line numbers)
          const removed = source.slice(start, end)
          const newlines = (removed.match(/\n/g) || []).length
          result += '\n'.repeat(newlines)
          i = end
          continue
        }
      }
    }

    result += source[i]
    i++
  }

  return { source: result, tests, errors }
}

/**
 * Wrap class declarations to make them callable without `new`
 *
 * Transforms:
 *   class Foo { ... }
 * To:
 *   let Foo = class Foo { ... };
 *   Foo = new Proxy(Foo, { apply(t, _, a) { return Reflect.construct(t, a) } });
 *
 * This emits standalone JS with no runtime dependencies.
 */

/**
 * Transform polymorphic constructors into static factory functions.
 *
 * When a class has multiple constructor() declarations, the first becomes
 * the real constructor and the rest become factory functions. The wrapClass
 * Proxy routes through a polymorphic dispatcher.
 *
 * class Point {
 *   constructor(x: 0.0, y: 0.0) { this.x = x; this.y = y }
 *   constructor(coords: { x: 0.0, y: 0.0 }) { this.x = coords.x; this.y = coords.y }
 * }
 *
 * becomes:
 *
 * class Point {
 *   constructor(x = 0.0, y = 0.0) { this.x = x; this.y = y }
 * }
 * function Point$ctor$2(coords = { x: 0.0, y: 0.0 }) { return new Point(coords.x, coords.y) }
 * // wrapClass Proxy dispatches through polymorphic factory
 */
export function transformPolymorphicConstructors(
  source: string,
  requiredParams: Set<string>
): { source: string; polyCtorClasses: Set<string> } {
  const polyCtorClasses = new Set<string>()

  // Find classes with multiple constructors
  const classRegex = /\bclass\s+(\w+)(\s+extends\s+\w+)?\s*\{/g
  let classMatch

  // Collect all class info first
  const classInfos: {
    className: string
    extendsClause: string
    bodyStart: number
    bodyEnd: number
    body: string
  }[] = []

  while ((classMatch = classRegex.exec(source)) !== null) {
    const className = classMatch[1]
    const extendsClause = classMatch[2]?.trim() || ''
    const bodyStart = classMatch.index + classMatch[0].length - 1

    const bodyEnd = findFunctionBodyEnd(source, bodyStart)
    const body = source.slice(bodyStart, bodyEnd)

    classInfos.push({ className, extendsClause, bodyStart, bodyEnd, body })
  }

  // Process in reverse order to preserve positions
  let result = source
  for (let ci = classInfos.length - 1; ci >= 0; ci--) {
    const { className, extendsClause, bodyStart, bodyEnd, body } =
      classInfos[ci]

    // Find all constructor declarations in the class body
    const ctorPattern = /\bconstructor\s*\(/g
    let ctorMatch
    const ctorPositions: number[] = []

    while ((ctorMatch = ctorPattern.exec(body)) !== null) {
      ctorPositions.push(ctorMatch.index)
    }

    if (ctorPositions.length < 2) continue // Not polymorphic

    polyCtorClasses.add(className)

    // Parse each constructor
    interface CtorInfo {
      index: number
      paramStr: string
      bodyText: string
      fullStart: number // relative to class body
      fullEnd: number // relative to class body
    }
    const ctors: CtorInfo[] = []

    for (let i = 0; i < ctorPositions.length; i++) {
      const pos = ctorPositions[i]

      // Find opening paren
      const parenStart = body.indexOf('(', pos)
      let parenDepth = 1
      let j = parenStart + 1
      while (j < body.length && parenDepth > 0) {
        if (body[j] === '(') parenDepth++
        if (body[j] === ')') parenDepth--
        j++
      }
      const paramStr = body.slice(parenStart + 1, j - 1)

      // Find opening brace
      let braceStart = j
      while (braceStart < body.length && body[braceStart] !== '{') braceStart++

      // Find matching closing brace
      const ctorBodyEnd = findFunctionBodyEnd(body, braceStart)
      const bodyText = body.slice(braceStart + 1, ctorBodyEnd - 1)

      ctors.push({
        index: i + 1,
        paramStr,
        bodyText,
        fullStart: pos,
        fullEnd: ctorBodyEnd,
      })
    }

    // Keep the first constructor in the class, remove the rest
    // Build new class body with only the first constructor
    let newBody = body.slice(0, ctors[0].fullEnd)
    // Skip subsequent constructors
    const afterLastCtor = ctors[ctors.length - 1].fullEnd
    newBody += body.slice(afterLastCtor)

    // But we need to remove just the extra constructors, keeping other methods
    // Better approach: remove constructors 2..N from the body
    let cleanBody = body
    for (let i = ctors.length - 1; i >= 1; i--) {
      const ctor = ctors[i]
      // Find start of this constructor (including leading whitespace)
      let start = ctor.fullStart
      while (start > 0 && cleanBody[start - 1] === ' ') start--
      if (start > 0 && cleanBody[start - 1] === '\n') start--

      cleanBody = cleanBody.slice(0, start) + cleanBody.slice(ctor.fullEnd)
    }

    // Generate factory functions for constructors 2..N
    let factories = ''
    for (let i = 1; i < ctors.length; i++) {
      const ctor = ctors[i]
      // Parse params for type checking in dispatcher
      const params = parseParamList(ctor.paramStr, requiredParams)
      const hasRest = ctor.paramStr.includes('...')
      if (hasRest) {
        const loc = locAt(source, bodyStart + ctor.fullStart)
        throw new SyntaxError(
          `Rest parameters are not supported in polymorphic constructors for '${className}'.`,
          loc
        )
      }

      // The factory function creates the object manually
      // For base classes: use Object.create + call constructor body
      // Simpler: just use new ClassName() with the first ctor's params mapped
      // Actually simplest: the factory body IS the constructor body but with
      // `this.x = ...` replaced by building an object... No, that doesn't work
      // for inheritance.
      //
      // Best approach: factory creates via new, then applies the extra ctor body
      factories += `\nfunction ${className}$ctor$${ctor.index}(${ctor.paramStr}) {`
      factories += `\n  const __obj = Object.create(${className}.prototype)`
      if (extendsClause) {
        // For derived classes, we can't easily call super() outside constructor
        // Just call the constructor body and hope it sets fields
        // Actually — the factory can just do: new ClassName(defaultArgs) then overwrite
        // Let's use a simpler approach: the factory just does new + field assignment
      }
      factories += `\n  ;(function() {${ctor.bodyText}}).call(__obj)`
      factories += `\n  return __obj`
      factories += `\n}\n`
    }

    // Generate the polymorphic dispatcher for the Proxy's apply trap
    // First constructor variant uses Reflect.construct, rest use factories
    const dispatchBranches: string[] = []

    for (let i = 0; i < ctors.length; i++) {
      const ctor = ctors[i]
      const params = parseParamList(ctor.paramStr, requiredParams)
      const checks: string[] = [`a.length === ${params.length}`]

      for (let k = 0; k < params.length; k++) {
        const p = params[k]
        if (p.defaultValue) {
          const check = typeCheckForDefault(`a[${k}]`, p.defaultValue)
          if (check !== 'true') checks.push(check)
        }
      }

      if (i === 0) {
        // First constructor — use Reflect.construct
        dispatchBranches.push(
          `    if (${checks.join(' && ')}) return Reflect.construct(t, a)`
        )
      } else {
        // Factory function
        const args = params.map((_, k) => `a[${k}]`).join(', ')
        dispatchBranches.push(
          `    if (${checks.join(' && ')}) return ${className}$ctor$${
            ctor.index
          }(${args})`
        )
      }
    }

    // Generate the dispatcher function
    factories += `\nfunction ${className}$dispatch(t, a) {\n`
    factories += dispatchBranches.join('\n') + '\n'
    factories += `    return __tjs.typeError('${className}', 'no matching constructor', a)\n`
    factories += `}\n`

    // Replace the class body and append factories
    result = result.slice(0, bodyStart) + cleanBody + result.slice(bodyEnd)

    // Insert factories after the class
    const insertPos = bodyStart + cleanBody.length
    result = result.slice(0, insertPos) + factories + result.slice(insertPos)
  }

  return { source: result, polyCtorClasses }
}

export function wrapClassDeclarations(
  source: string,
  polyCtorClasses: Set<string> = new Set()
): string {
  // Match class declarations: class Name { or class Name extends Base {
  // Capture the class name and find the full class body
  const classRegex = /\bclass\s+(\w+)(\s+extends\s+\w+)?\s*\{/g
  let result = ''
  let lastIndex = 0
  let match

  while ((match = classRegex.exec(source)) !== null) {
    const className = match[1]
    const extendsClause = match[2] || ''
    const classStart = match.index
    const bodyStart = classStart + match[0].length - 1 // position of {

    // Find matching closing brace
    let depth = 1
    let i = bodyStart + 1
    while (i < source.length && depth > 0) {
      const char = source[i]
      if (char === '{') depth++
      else if (char === '}') depth--
      i++
    }

    if (depth === 0) {
      const classEnd = i
      const classBody = source.slice(bodyStart, classEnd)

      // Emit standalone JS - no runtime dependency
      result += source.slice(lastIndex, classStart)
      result += `let ${className} = class ${className}${extendsClause} ${classBody}; `

      if (polyCtorClasses.has(className)) {
        // Polymorphic constructor: use dispatcher function for apply trap
        result += `${className} = new Proxy(${className}, { apply(t, _, a) { return ${className}$dispatch(t, a) }, construct(t, a) { return ${className}$dispatch(t, a) } });`
      } else {
        result += `${className} = new Proxy(${className}, { apply(t, _, a) { return Reflect.construct(t, a) } });`
      }
      lastIndex = classEnd
    }
  }

  result += source.slice(lastIndex)
  return result
}

/**
 * Validate that Date is not used (TjsDate mode)
 * Throws an error if Date constructor or static methods are found
 */
export function validateNoDate(source: string): string {
  // Match Date usage: new Date, Date.now, Date.parse, Date.UTC
  const datePatterns = [
    {
      pattern: /\bnew\s+Date\b/,
      message:
        'new Date() is not allowed in TjsDate mode. Use Timestamp.now() or Timestamp.from()',
    },
    {
      pattern: /\bDate\.now\b/,
      message: 'Date.now() is not allowed in TjsDate mode. Use Timestamp.now()',
    },
    {
      pattern: /\bDate\.parse\b/,
      message:
        'Date.parse() is not allowed in TjsDate mode. Use Timestamp.parse()',
    },
    {
      pattern: /\bDate\.UTC\b/,
      message:
        'Date.UTC() is not allowed in TjsDate mode. Use Timestamp.from()',
    },
  ]

  for (const { pattern, message } of datePatterns) {
    if (pattern.test(source)) {
      throw new Error(message)
    }
  }

  return source
}

/**
 * Validate that eval and Function constructor are not used (TjsNoeval mode)
 * Note: Eval and SafeFunction from TJS runtime are allowed
 */
export function validateNoEval(source: string): string {
  // Match eval() calls - but not Eval() (capital E)
  // Use negative lookbehind to avoid matching inside words
  const evalPattern = /(?<![A-Za-z_$])\beval\s*\(/
  if (evalPattern.test(source)) {
    throw new Error(
      'eval() is not allowed in TjsNoeval mode. Use Eval() from TJS runtime for safe evaluation.'
    )
  }

  // Match new Function() - but not SafeFunction or other *Function names
  const functionPattern = /\bnew\s+Function\s*\(/
  if (functionPattern.test(source)) {
    throw new Error(
      'new Function() is not allowed in TjsNoeval mode. Use SafeFunction() from TJS runtime.'
    )
  }

  return source
}
