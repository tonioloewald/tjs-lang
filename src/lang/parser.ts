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
 * A test block extracted from source
 *
 * Syntax:
 *   test { body }
 *   test 'description' { body }
 *
 * Tests run at transpile time and are stripped from output.
 */
export interface TestBlock {
  /** Optional description */
  description?: string
  /** The test body code */
  body: string
  /** Start position in original source */
  start: number
  /** End position in original source */
  end: number
}

/**
 * Preprocess options
 */
export interface PreprocessOptions {
  /** Skip test execution (tests still stripped from output) */
  dangerouslySkipTests?: boolean
}

/**
 * Tokenizer state for tracking context during source transformation
 */
type TokenizerState =
  | 'normal'
  | 'single-string'
  | 'double-string'
  | 'template-string'
  | 'line-comment'
  | 'block-comment'
  | 'regex'

/**
 * Structural context for tracking where we are in the code
 * This enables proper handling of class methods vs function calls
 */
type StructuralContext = 'top-level' | 'class-body' | 'function-body' | 'block'

interface ContextFrame {
  type: StructuralContext
  braceDepth: number // The brace depth when we entered this context
}

/**
 * Unified paren expression transformer using state machine tokenizer
 *
 * Model: opening paren can be ( or (? or (!, closing can be ) or )->type or )-?type or )-!type
 *
 * This unifies handling of:
 * - Function declaration params: function foo(x: type) -> returnType { }
 * - Arrow function params: (x: type) => expr
 * - Safe/unsafe markers: function foo(?) or function foo(!)
 * - Return type annotations: ) -> type or ) -? type or ) -! type
 *
 * @param source The source code to transform
 * @param ctx Context for tracking required params, safe/unsafe functions, etc.
 * @returns Transformed source and extracted metadata
 */
function transformParenExpressions(
  source: string,
  ctx: {
    originalSource: string
    requiredParams: Set<string>
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  }
): {
  source: string
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
} {
  let result = ''
  let i = 0
  let firstReturnType: string | undefined
  let firstReturnSafety: 'safe' | 'unsafe' | undefined

  // State machine for tokenizing
  let state: TokenizerState = 'normal'
  // Stack for template string interpolation depth (each entry is brace depth within that interpolation)
  const templateStack: number[] = []

  // Structural context tracking - know if we're in a class body, function body, etc.
  const contextStack: ContextFrame[] = [{ type: 'top-level', braceDepth: 0 }]
  let braceDepth = 0

  // Helper to get current structural context
  const currentContext = (): StructuralContext =>
    contextStack[contextStack.length - 1]?.type || 'top-level'

  // Helper to check if we're directly in a class body (not nested in a function/block inside it)
  const isInClassBody = (): boolean => {
    const frame = contextStack[contextStack.length - 1]
    return frame?.type === 'class-body' && braceDepth === frame.braceDepth + 1
  }

  while (i < source.length) {
    const char = source[i]
    const nextChar = source[i + 1]

    // Handle state transitions based on current state
    switch (state) {
      case 'single-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === "'") {
          state = 'normal'
        }
        i++
        continue

      case 'double-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '"') {
          state = 'normal'
        }
        i++
        continue

      case 'template-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '$' && nextChar === '{') {
          // Enter template expression
          result += nextChar
          i += 2
          templateStack.push(1) // Start with brace depth 1
          state = 'normal' // Back to normal parsing inside ${}
          continue
        }
        if (char === '`') {
          state = 'normal'
        }
        i++
        continue

      case 'line-comment':
        result += char
        if (char === '\n') {
          state = 'normal'
        }
        i++
        continue

      case 'block-comment':
        result += char
        if (char === '*' && nextChar === '/') {
          result += nextChar
          i += 2
          state = 'normal'
          continue
        }
        i++
        continue

      case 'regex':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '[') {
          // Character class - read until ]
          i++
          while (i < source.length && source[i] !== ']') {
            result += source[i]
            if (source[i] === '\\' && i + 1 < source.length) {
              result += source[i + 1]
              i += 2
            } else {
              i++
            }
          }
          if (i < source.length) {
            result += source[i]
            i++
          }
          continue
        }
        if (char === '/') {
          // End of regex, consume flags
          i++
          while (i < source.length && /[gimsuy]/.test(source[i])) {
            result += source[i]
            i++
          }
          state = 'normal'
          continue
        }
        i++
        continue

      case 'normal':
        // Handle template stack - track braces inside template expressions
        if (templateStack.length > 0) {
          if (char === '{') {
            templateStack[templateStack.length - 1]++
          } else if (char === '}') {
            templateStack[templateStack.length - 1]--
            if (templateStack[templateStack.length - 1] === 0) {
              // Exiting template expression, back to template string
              templateStack.pop()
              result += char
              i++
              state = 'template-string'
              continue
            }
          }
        }

        // Check for string/comment/regex start
        if (char === "'") {
          result += char
          i++
          state = 'single-string'
          continue
        }
        if (char === '"') {
          result += char
          i++
          state = 'double-string'
          continue
        }
        if (char === '`') {
          result += char
          i++
          state = 'template-string'
          continue
        }
        if (char === '/' && nextChar === '/') {
          result += char + nextChar
          i += 2
          state = 'line-comment'
          continue
        }
        if (char === '/' && nextChar === '*') {
          result += char + nextChar
          i += 2
          state = 'block-comment'
          continue
        }

        // Check for regex literal
        if (char === '/') {
          const before = result.trimEnd()
          const lastChar = before[before.length - 1]
          const isRegexContext =
            !lastChar ||
            /[=(!,;:{\[&|?+\-*%<>~^]$/.test(before) ||
            /\b(return|case|throw|in|of|typeof|instanceof|new|delete|void)\s*$/.test(
              before
            )
          if (isRegexContext) {
            result += char
            i++
            state = 'regex'
            continue
          }
        }

        // Now handle TJS-specific transformations in normal state
        break
    }

    // We're in normal state - look for TJS patterns

    // Track braces for structural context
    if (char === '{') {
      braceDepth++
      result += char
      i++
      continue
    }
    if (char === '}') {
      braceDepth--
      // Pop context if we're exiting it
      const frame = contextStack[contextStack.length - 1]
      if (frame && braceDepth === frame.braceDepth) {
        contextStack.pop()
      }
      result += char
      i++
      continue
    }

    // Look for class declarations: class Name { or class Name extends Base {
    const classMatch = source
      .slice(i)
      .match(/^class\s+\w+(?:\s+extends\s+\w+)?\s*\{/)
    if (classMatch) {
      // Output everything up to but not including the {
      const classHeader = classMatch[0].slice(0, -1)
      result += classHeader
      i += classHeader.length
      // Push class-body context (will be entered when we see the {)
      contextStack.push({ type: 'class-body', braceDepth })
      continue
    }

    // Look for function declarations: function name( or function name (
    const funcMatch = source.slice(i).match(/^function\s+(\w+)\s*\(/)
    if (funcMatch) {
      const funcName = funcMatch[1]
      const matchLen = funcMatch[0].length

      // Check for safety marker right after opening paren: (? or (!
      const afterParen = source[i + matchLen]
      let safetyMarker: '?' | '!' | null = null
      let paramStart = i + matchLen

      if (afterParen === '?' || afterParen === '!') {
        safetyMarker = afterParen
        paramStart++
        if (safetyMarker === '!') {
          ctx.unsafeFunctions.add(funcName)
        } else {
          ctx.safeFunctions.add(funcName)
        }
      }

      result += `function ${funcName}(`
      i = paramStart

      // Find matching ) using balanced counting
      const paramsResult = extractBalancedContent(source, i, '(', ')')
      if (!paramsResult) {
        // Unbalanced - just copy character and continue
        result += source[i]
        i++
        continue
      }

      const { content: params, endPos } = paramsResult
      i = endPos

      // Process the params (transform : to = for required params, handle nested arrows)
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'

      // Check what follows the closing paren: whitespace then -> or -? or -! (return type)
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      const returnArrow = source.slice(j, j + 2)
      if (
        returnArrow === '->' ||
        returnArrow === '-?' ||
        returnArrow === '-!'
      ) {
        // Extract return type
        j += 2
        // Skip whitespace after arrow
        while (j < source.length && /\s/.test(source[j])) j++

        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          const { type, endPos: typeEnd } = typeResult
          // Record first return type for metadata
          if (firstReturnType === undefined) {
            firstReturnType = type
            if (returnArrow === '-?') {
              firstReturnSafety = 'safe'
            } else if (returnArrow === '-!') {
              firstReturnSafety = 'unsafe'
            }
          }
          i = typeEnd
        }
      }
      continue
    }

    // Look for class method syntax: constructor(, methodName(, get name(, set name(
    // These appear inside class bodies and need param transformation
    // Only match if we're actually in a class body (proper context tracking)
    const methodMatch = source
      .slice(i)
      .match(/^(constructor|(?:get|set)\s+\w+|async\s+\w+|\w+)\s*\(/)
    if (methodMatch && isInClassBody()) {
      // We're actually in a class body - this is a method definition
      const methodPart = methodMatch[1]
      const matchLen = methodMatch[0].length
      const paramStart = i + matchLen

      result += methodPart + '('
      i = paramStart

      // Find matching )
      const paramsResult = extractBalancedContent(source, i, '(', ')')
      if (!paramsResult) {
        result += source[i]
        i++
        continue
      }

      const { content: params, endPos } = paramsResult
      i = endPos

      // Process the params (transform : to = for TJS types)
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'

      // Check for return type annotation: ) -> type or ): type
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      // Handle -> return type (TJS style)
      const returnArrow = source.slice(j, j + 2)
      if (returnArrow === '->') {
        j += 2
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i = typeResult.endPos
        }
      }
      // Handle : return type (TS style) - just strip it
      else if (source[j] === ':') {
        j++
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i = typeResult.endPos
        }
      }

      continue
    }

    // Look for arrow function params: (params) =>
    // We need to be careful to only transform when followed by =>
    if (source[i] === '(') {
      // First, find the matching ) without consuming any safety marker
      // We'll check for safety marker only if this is actually an arrow function
      const fullParamsResult = extractBalancedContent(source, i + 1, '(', ')')
      if (!fullParamsResult) {
        result += source[i]
        i++
        continue
      }

      const fullContent = fullParamsResult.content
      const endPos = fullParamsResult.endPos

      // Check what follows: whitespace then => (arrow function) or -> (return type on arrow)
      let j = endPos
      while (j < source.length && /\s/.test(source[j])) j++

      // Check for return type annotation on arrow function: ) -> type =>
      let arrowReturnType: string | undefined
      const returnArrow = source.slice(j, j + 2)
      if (
        returnArrow === '->' ||
        returnArrow === '-?' ||
        returnArrow === '-!'
      ) {
        j += 2
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          arrowReturnType = typeResult.type
          j = typeResult.endPos
          while (j < source.length && /\s/.test(source[j])) j++
        }
      }

      if (source.slice(j, j + 2) === '=>') {
        // This IS an arrow function - now check for safety marker
        let safetyMarker: '?' | '!' | null = null
        let params = fullContent

        // Check if content starts with safety marker (? or !) followed by whitespace
        const trimmedContent = fullContent.trimStart()
        if (
          trimmedContent.startsWith('?') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '?'
          params = trimmedContent.slice(1)
        } else if (
          trimmedContent.startsWith('!') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '!'
          params = trimmedContent.slice(1)
        }

        // Process the params
        const processedParams = processParamString(params, ctx, false)
        // Add safety marker as comment for arrow functions (since we can't track them by name)
        const safetyComment =
          safetyMarker === '?'
            ? '/* safe */ '
            : safetyMarker === '!'
            ? '/* unsafe */ '
            : ''
        result += `(${safetyComment}${processedParams})`
        // Skip the return type annotation (we extracted it but don't emit it)
        i = endPos
        // Skip to just before the =>
        while (i < j && /\s/.test(source[i])) {
          result += source[i]
          i++
        }
        // If there was a return type, we need to skip past it to =>
        if (arrowReturnType) {
          i = j
        }
      } else {
        // Not an arrow function - recursively transform the content for nested arrows
        // but don't process as param declarations (no colon-to-equals transform)
        const transformed = transformParenExpressions(fullContent, ctx)
        result += `(${transformed.source})`
        i = endPos
      }
      continue
    }

    result += source[i]
    i++
  }

  return {
    source: result,
    returnType: firstReturnType,
    returnSafety: firstReturnSafety,
  }
}

/**
 * Extract balanced content between delimiters
 * @param source The source string
 * @param start Position after the opening delimiter
 * @param open Opening delimiter character (for depth counting of nested structures)
 * @param close Closing delimiter character
 * @returns The content between delimiters and position after closing delimiter, or null if unbalanced
 */
function extractBalancedContent(
  source: string,
  start: number,
  open: string,
  close: string
): { content: string; endPos: number } | null {
  let depth = 1
  let i = start
  let inString = false
  let stringChar = ''

  while (i < source.length && depth > 0) {
    const char = source[i]

    // Handle string literals
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && source[i - 1] !== '\\') {
      inString = false
    } else if (!inString) {
      if (char === open) depth++
      else if (char === close) depth--
    }
    i++
  }

  if (depth !== 0) return null

  return {
    content: source.slice(start, i - 1),
    endPos: i,
  }
}

/**
 * Extract a JS value starting at a position in source.
 * Handles nested objects {}, arrays [], strings, numbers, booleans, null.
 * Uses state machine to properly track nesting.
 */
function extractJSValue(
  source: string,
  start: number
): { value: string; endPos: number } | null {
  let i = start

  // Skip leading whitespace
  while (i < source.length && /\s/.test(source[i])) i++
  if (i >= source.length) return null

  const valueStart = i
  const firstChar = source[i]

  // Handle objects and arrays with balanced parsing
  if (firstChar === '{' || firstChar === '[') {
    const close = firstChar === '{' ? '}' : ']'
    const result = extractBalancedContent(source, i + 1, firstChar, close)
    if (!result) return null
    return {
      value: source.slice(valueStart, result.endPos),
      endPos: result.endPos,
    }
  }

  // Handle strings
  if (firstChar === "'" || firstChar === '"' || firstChar === '`') {
    i++
    while (i < source.length) {
      if (source[i] === firstChar && source[i - 1] !== '\\') {
        i++
        return { value: source.slice(valueStart, i), endPos: i }
      }
      i++
    }
    return null // Unterminated string
  }

  // Handle numbers (including negative and decimals)
  if (/[-+\d]/.test(firstChar)) {
    while (i < source.length && /[\d.eE+-]/.test(source[i])) i++
    return { value: source.slice(valueStart, i), endPos: i }
  }

  // Handle keywords: true, false, null, undefined
  const keywordMatch = source.slice(i).match(/^(true|false|null|undefined)\b/)
  if (keywordMatch) {
    return {
      value: keywordMatch[1],
      endPos: i + keywordMatch[1].length,
    }
  }

  return null
}

/**
 * Normalize union syntax in type strings
 * Converts single | to || for TJS consistency (needed for JS parsing)
 */
function normalizeUnionSyntax(type: string): string {
  // Replace single | (not ||) with || for proper JS parsing
  // Use negative lookbehind and lookahead to avoid matching ||
  return type.replace(/(?<!\|)\|(?!\|)/g, ' || ')
}

/**
 * Extract a return type value starting at the given position
 * Handles: simple types ('', 0, null), objects ({ }), arrays ([ ]), unions (| or ||)
 */
function extractReturnTypeValue(
  source: string,
  start: number
): { type: string; endPos: number } | null {
  let i = start
  let depth = 0
  let inString = false
  let stringChar = ''
  let sawContent = false

  // Helper to create result with normalized type
  const makeResult = (endPos: number) => ({
    type: normalizeUnionSyntax(source.slice(start, endPos).trim()),
    endPos,
  })

  while (i < source.length) {
    const char = source[i]

    // Handle string literals
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      sawContent = true
      i++
      continue
    }
    if (inString) {
      if (char === stringChar && source[i - 1] !== '\\') {
        inString = false
        i++ // Move past closing quote
        // Just finished a string at depth 0
        if (depth === 0) {
          // Check if next non-ws is function body { or union |
          let j = i
          while (j < source.length && /\s/.test(source[j])) j++
          if (source[j] === '{') {
            // Check if it's object type or function body
            const afterBrace = source.slice(j + 1).match(/^\s*(\w+)\s*:/)
            if (!afterBrace) {
              // Function body - type ends here
              return makeResult(i)
            }
          }
          if (source[j] !== '|' && source[j] !== '&') {
            // No union - type ends here
            return makeResult(i)
          }
        }
        continue
      }
      i++
      continue
    }

    // Track bracket depth
    if (char === '{' || char === '[' || char === '(') {
      depth++
      sawContent = true
      i++
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth--
      if (depth === 0) {
        i++
        // Check for union after closing bracket
        let j = i
        while (j < source.length && /\s/.test(source[j])) j++
        if (source[j] === '|' || source[j] === '&') {
          continue // More type content
        }
        return makeResult(i)
      }
      i++
      continue
    }

    // At depth 0, check for function body
    if (depth === 0 && char === '{') {
      if (sawContent) {
        return makeResult(i)
      }
      // First { - check if object type or function body
      const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/)
      if (afterBrace) {
        depth++
        sawContent = true
        i++
        continue
      }
      return makeResult(i)
    }

    // Handle union/intersection at depth 0
    if (depth === 0 && (char === '|' || char === '&')) {
      i++
      if (i < source.length && source[i] === '|') i++ // Skip second | for ||
      while (i < source.length && /\s/.test(source[i])) i++
      continue
    }

    // Handle numbers (including decimals like 14.5, -3.14)
    if (
      depth === 0 &&
      (/\d/.test(char) || (char === '-' && /\d/.test(source[i + 1])))
    ) {
      let j = i
      if (source[j] === '-') j++ // Skip negative sign
      while (j < source.length && /\d/.test(source[j])) j++
      // Handle decimal part
      if (j < source.length && source[j] === '.' && /\d/.test(source[j + 1])) {
        j++ // Skip decimal point
        while (j < source.length && /\d/.test(source[j])) j++
      }
      // Handle exponent (1e10, 1.5e-3)
      if (j < source.length && (source[j] === 'e' || source[j] === 'E')) {
        j++
        if (j < source.length && (source[j] === '+' || source[j] === '-')) j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      sawContent = true
      i = j
      // Check what's next
      while (i < source.length && /\s/.test(source[i])) i++
      if (i < source.length && source[i] === '{') {
        // Function body - type ends here
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      if (source[i] !== '|' && source[i] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }

    // Handle identifiers (null, undefined, true, false, type names)
    if (depth === 0 && /[a-zA-Z_]/.test(char)) {
      let j = i
      while (j < source.length && /\w/.test(source[j])) j++
      sawContent = true
      i = j
      // Check what's next
      while (i < source.length && /\s/.test(source[i])) i++
      if (i < source.length && source[i] === '{') {
        // Check if function body
        const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/)
        if (!afterBrace) {
          // Function body - type ends before whitespace
          let typeEnd = j
          while (typeEnd > start && /\s/.test(source[typeEnd - 1])) typeEnd--
          return {
            type: normalizeUnionSyntax(source.slice(start, typeEnd).trim()),
            endPos: j,
          }
        }
      }
      if (source[i] !== '|' && source[i] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }

    i++
  }

  // Reached end of source
  if (sawContent) {
    return makeResult(i)
  }
  return null
}

/**
 * Process a parameter string, transforming : to = for required params
 * and recursively handling nested arrow functions
 */
function processParamString(
  params: string,
  ctx: {
    requiredParams: Set<string>
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  },
  trackRequired: boolean
): string {
  // First recursively process any nested arrow functions
  const withArrows = transformParenExpressions(params, {
    originalSource: params,
    requiredParams: ctx.requiredParams,
    unsafeFunctions: ctx.unsafeFunctions,
    safeFunctions: ctx.safeFunctions,
  }).source

  // Now split and process each parameter
  const paramList = splitParameters(withArrows)
  let sawOptional = false
  const seenNames = new Set<string>()

  // Helper to check for duplicate names
  const checkDuplicate = (name: string) => {
    if (trackRequired && /^\w+$/.test(name)) {
      if (seenNames.has(name)) {
        throw new Error(`Duplicate parameter name '${name}'`)
      }
      seenNames.add(name)
    }
  }

  const processed = paramList.map((param) => {
    const trimmed = param.trim()
    if (!trimmed) return param

    // Handle destructured object parameters: { name: 'Clara', age = 30 }
    // Transform colons to equals inside the braces (recursive)
    // Order doesn't matter for objects, so don't enforce required-before-optional
    // ONLY do this when trackRequired is true - i.e., actual function parameters
    if (trackRequired && trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1)
      const processedInner = processDestructuredObjectParams(inner, ctx)
      return `{ ${processedInner} }`
    }

    // Handle destructured array parameters: [first: '', second: 0]
    // ONLY do this when trackRequired is true - i.e., actual function parameters
    if (trackRequired && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1)
      const processedInner = processDestructuredObjectParams(inner, ctx)
      return `[ ${processedInner} ]`
    }

    // Handle optional param syntax: x?: type -> x = type (not required)
    const optionalMatch = trimmed.match(/^(\w+)\s*\?\s*:\s*(.+)$/)
    if (optionalMatch) {
      const [, name, type] = optionalMatch
      checkDuplicate(name)
      sawOptional = true
      // Optional params are NOT tracked as required
      return `${name} = ${type}`
    }

    // Check if param already has a default value (x = value)
    if (!hasColonNotEquals(trimmed)) {
      // Has equals sign (default value) - this is optional
      // Extract name from "name = value" pattern
      const eqMatch = trimmed.match(/^(\w+)\s*=/)
      if (eqMatch) {
        checkDuplicate(eqMatch[1])
      }
      sawOptional = true
      return param
    }

    // Handle required param syntax: x: type -> x = type (tracked as required)
    const colonPos = findTopLevelColon(trimmed)
    if (colonPos !== -1) {
      const name = trimmed.slice(0, colonPos).trim()
      const type = trimmed.slice(colonPos + 1).trim()

      checkDuplicate(name)

      // Check for required param after optional - this is an error
      if (sawOptional && trackRequired && /^\w+$/.test(name)) {
        throw new Error(
          `Required parameter '${name}' cannot follow optional parameter`
        )
      }

      if (trackRequired && /^\w+$/.test(name)) {
        ctx.requiredParams.add(name)
      }
      return `${name} = ${type}`
    }

    return param
  })

  return processed.join(',')
}

/**
 * Process destructured object/array parameters
 *
 * In TJS destructuring patterns:
 * - `name: 'Clara'` means required param with example (transforms to `name = 'Clara'`)
 * - `age = 30` means optional param with default (stays as `age = 30`)
 * - Nested objects like `address: { street: '9 High St', zip = '0000' }` are tricky:
 *   the inner object is a value (object literal), not a pattern, so we transform it back
 *
 * Key insight: In destructuring, `foo: value` at top level is a required param,
 * but at nested levels within an object value, `:` is normal object literal syntax.
 *
 * Order does NOT matter in objects (unlike positional function params).
 */
function processDestructuredObjectParams(
  inner: string,
  ctx: {
    requiredParams: Set<string>
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  }
): string {
  // Split on commas at the top level (respecting nested braces)
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Check for nested destructured object: name: { ... }
    // The inner { ... } is an object literal value, not a destructuring pattern
    const nestedObjectMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjectMatch) {
      const [, name, objectLiteral] = nestedObjectMatch
      ctx.requiredParams.add(name)
      // Process the inner object as an object literal (transform = to : for values)
      const processedLiteral = processObjectLiteralValue(objectLiteral)
      return `${name} = ${processedLiteral}`
    }

    // Check for nested destructured array: name: [ ... ]
    const nestedArrayMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrayMatch) {
      const [, name, arrayLiteral] = nestedArrayMatch
      ctx.requiredParams.add(name)
      // Process the inner array as an array literal
      const processedLiteral = processArrayLiteralValue(arrayLiteral)
      return `${name} = ${processedLiteral}`
    }

    // Handle simple colon syntax: name: 'value' -> name = 'value' (required)
    const colonMatch = trimmed.match(/^(\w+)\s*:\s*([\s\S]+)$/)
    if (colonMatch) {
      const [, name, value] = colonMatch
      ctx.requiredParams.add(name)
      return `${name} = ${value}`
    }

    // Handle equals syntax: name = value (optional, already valid JS)
    // Just preserve it as-is
    return part
  })

  return processed.join(', ')
}

/**
 * Process an object literal value (nested inside destructuring)
 *
 * In object literals, TJS allows `=` for optional values:
 *   { street: '9 High St', zip = '0000' }
 *
 * This must become valid JS object literal syntax:
 *   { street: '9 High St', zip: '0000' }
 *
 * (The `=` is TJS shorthand indicating the value is optional/has default,
 * but in an object literal context it must use `:`)
 */
function processObjectLiteralValue(literal: string): string {
  // Remove outer braces, process content, restore braces
  const inner = literal.slice(1, -1).trim()
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Handle nested objects: key: { ... } or key = { ... }
    const nestedObjColonMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjColonMatch) {
      const [, key, nested] = nestedObjColonMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }
    const nestedObjEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\{[\s\S]*\})$/)
    if (nestedObjEqualsMatch) {
      const [, key, nested] = nestedObjEqualsMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }

    // Handle nested arrays: key: [ ... ] or key = [ ... ]
    const nestedArrColonMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrColonMatch) {
      const [, key, nested] = nestedArrColonMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }
    const nestedArrEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\[[\s\S]*\])$/)
    if (nestedArrEqualsMatch) {
      const [, key, nested] = nestedArrEqualsMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }

    // Transform equals to colon for simple values: key = value -> key: value
    const equalsMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+)$/)
    if (equalsMatch) {
      const [, key, value] = equalsMatch
      return `${key}: ${value}`
    }

    // Colon syntax is already valid: key: value
    return part
  })

  return `{ ${processed.join(', ')} }`
}

/**
 * Process an array literal value (nested inside destructuring)
 * Similar to processObjectLiteralValue but for arrays
 */
function processArrayLiteralValue(literal: string): string {
  // Remove outer brackets, process content, restore brackets
  const inner = literal.slice(1, -1).trim()
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Handle nested objects
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return processObjectLiteralValue(trimmed)
    }

    // Handle nested arrays
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return processArrayLiteralValue(trimmed)
    }

    // Array elements are just values, no transformation needed
    return part
  })

  return `[ ${processed.join(', ')} ]`
}

/**
 * Check if param has a top-level colon but no top-level equals
 * This distinguishes x: type from x = type and handles nested structures
 */
function hasColonNotEquals(param: string): boolean {
  let depth = 0
  let hasColon = false
  let hasEquals = false
  let inString = false
  let stringChar = ''

  for (let i = 0; i < param.length; i++) {
    const char = param[i]

    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && param[i - 1] !== '\\') inString = false
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0) {
      if (char === ':') hasColon = true
      if (char === '=' && param[i + 1] !== '>') hasEquals = true // Ignore =>
    }
  }

  return hasColon && !hasEquals
}

/**
 * Find the position of the first top-level colon in a param
 */
function findTopLevelColon(param: string): number {
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < param.length; i++) {
    const char = param[i]

    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && param[i - 1] !== '\\') inString = false
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0 && char === ':') {
      return i
    }
  }

  return -1
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
export function preprocess(
  source: string,
  options: PreprocessOptions = {}
): {
  source: string
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
  tests: TestBlock[]
  testErrors: string[]
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

  // Transform Is/IsNot infix operators to function calls
  // a Is b -> Is(a, b)
  // a IsNot b -> IsNot(a, b)
  source = transformIsOperators(source)

  // NOTE: Auto-transforming == and != to Is/IsNot is too risky with regex
  // because we can't reliably identify expression boundaries (e.g., x % 2 == 0)
  // Users should use the explicit Is/IsNot syntax for structural equality
  // Future: when we have a full parser, we can revisit == transformation

  // Transform Type, Generic, Union, and Enum declarations
  // Type Foo { ... } -> const Foo = Type(...)
  // Generic Bar<T, U> { ... } -> const Bar = Generic(...)
  // Union Dir 'up' | 'down' -> const Dir = Union(...)
  // Enum Status { Pending, Active, Done } -> const Status = Enum(...)
  source = transformTypeDeclarations(source)
  source = transformGenericDeclarations(source)
  source = transformUnionDeclarations(source)
  source = transformEnumDeclarations(source)

  // Transform bare assignments to const declarations
  // Foo = ... -> const Foo = ...
  source = transformBareAssignments(source)

  // Unified paren expression transformer
  // Handles: function params, arrow params, return types, safe/unsafe markers
  // Model: open paren can be ( or (? or (!, close can be ) or )-> or )-? or )-!
  const transformResult = transformParenExpressions(source, {
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
  })
  source = transformResult.source
  returnType = transformResult.returnType
  returnSafety = transformResult.returnSafety

  // NOTE: unsafe {} blocks removed - they provided no performance benefit because
  // the wrapper decision is made at transpile time. Use (!) on functions instead.
  // See ideas parking lot for potential future approaches.

  // Handle try-without-catch: try { ... } (no catch/finally) -> monadic error handling
  // This is the idiomatic TJS way to convert exceptions to AgentError
  source = transformTryWithoutCatch(source)

  // Extract WASM blocks: wasm(args) { ... } fallback { ... }
  const wasmBlocks = extractWasmBlocks(source)
  source = wasmBlocks.source

  // Extract and run test blocks: test 'desc'? { body }
  // Tests run at transpile time and are stripped from output
  const testResult = extractAndRunTests(source, options.dangerouslySkipTests)
  source = testResult.source

  // Wrap class declarations to make them callable without `new`
  // class Foo { } -> let Foo = class Foo { }; Foo = globalThis.__tjs?.wrapClass?.(Foo) ?? Foo;
  source = wrapClassDeclarations(source)

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
    tests: testResult.tests,
    testErrors: testResult.errors,
  }
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

    // Handle line comments - preserve them in output
    if (!inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true
      current += '//'
      i += 2
      continue
    }

    // Handle block comments - preserve them in output
    if (!inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true
      current += '/*'
      i += 2
      continue
    }

    // End of line comment
    if (inLineComment && char === '\n') {
      inLineComment = false
      current += char
      i++
      continue
    }

    // End of block comment - preserve closing
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false
      current += '*/'
      i += 2
      continue
    }

    // Inside comments - preserve the content
    if (inLineComment || inBlockComment) {
      current += char
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
 * Transform Is/IsNot infix operators to function calls
 *
 * Syntax:
 *   a Is b      -> Is(a, b)
 *   a IsNot b   -> IsNot(a, b)
 *
 * This enables structural equality with a clean syntax.
 * Goal: Is/IsNot are stepping stones to eventually making == and != work correctly.
 */
function transformIsOperators(source: string): string {
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
function transformTypeDeclarations(source: string): string {
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
function transformGenericDeclarations(source: string): string {
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
function transformUnionDeclarations(source: string): string {
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
function transformEnumDeclarations(source: string): string {
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
 * Transform bare assignments to const declarations
 *
 * Foo = ... -> const Foo = ...
 *
 * Only transforms assignments at statement level (start of line or after semicolon/brace)
 * where the identifier starts with uppercase (to avoid breaking normal assignments)
 */
function transformBareAssignments(source: string): string {
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
  tests: TestBlock[]
  testErrors: string[]
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
    tests,
    testErrors,
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
        tests: [] as TestBlock[],
        testErrors: [] as string[],
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
      tests,
      testErrors,
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
 * Extract TDoc comment from before a function
 *
 * TJS doc comments use /*# ... * / syntax and preserve full markdown content.
 * Legacy JSDoc (/** ... * /) is supported as a fallback.
 */
export function extractTDoc(
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

  const beforeFunc = source.substring(0, func.start)

  // First, check for TJS doc comment: /*# ... */
  // This preserves full markdown content
  // Find the LAST /*# ... */ block and verify it immediately precedes the function
  // (only whitespace and line comments allowed between)
  const allDocBlocks = [...beforeFunc.matchAll(/\/\*#([\s\S]*?)\*\//g)]
  if (allDocBlocks.length > 0) {
    const lastBlock = allDocBlocks[allDocBlocks.length - 1]
    const afterBlock = beforeFunc.substring(
      lastBlock.index! + lastBlock[0].length
    )

    // Only attach if nothing but whitespace and line comments between doc and function
    if (/^(?:\s|\/\/[^\n]*)*$/.test(afterBlock)) {
      // Extract content, trim leading/trailing whitespace, preserve internal formatting
      let content = lastBlock[1]

      // Remove common leading whitespace (like dedent)
      const lines = content.split('\n')
      // Find minimum indentation (ignoring empty lines)
      const minIndent = lines
        .filter((line) => line.trim().length > 0)
        .reduce((min, line) => {
          const indent = line.match(/^(\s*)/)?.[1].length || 0
          return Math.min(min, indent)
        }, Infinity)

      // Remove that indentation from all lines
      if (minIndent > 0 && minIndent < Infinity) {
        content = lines.map((line) => line.slice(minIndent)).join('\n')
      }

      result.description = content.trim()
      return result
    }
  }

  // Fall back to JSDoc: /** ... */
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

/**
 * Extract and run test blocks from source
 *
 * Syntax:
 *   test { body }
 *   test 'description' { body }
 *
 * Tests are executed at transpile time and stripped from output.
 * If any test fails, the error is collected (transpilation continues).
 */
function extractAndRunTests(
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

          tests.push({ description, body, start, end })

          // Run the test unless skipped
          if (!skipTests) {
            try {
              // Execute test in isolated context
              // The test has access to the Types defined before it
              const testFn = new Function(body)
              testFn()
            } catch (err: any) {
              const desc = description || `test at position ${start}`
              errors.push(`Test failed: ${desc}\n  ${err.message || err}`)
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
function wrapClassDeclarations(source: string): string {
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
      result += `${className} = new Proxy(${className}, { apply(t, _, a) { return Reflect.construct(t, a) } });`
      lastIndex = classEnd
    }
  }

  result += source.slice(lastIndex)
  return result
}
