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
  /**
   * Target is the VM (AJS code).
   * When true, skips == to Is() transformation since the VM handles == correctly.
   */
  vmTarget?: boolean
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
  /**
   * Skip == to Is() transformation.
   * Set to true for AJS code that runs in the VM, which already handles == correctly.
   * Default: false (transform == to Is() for TJS code running in regular JS)
   */
  vmTarget?: boolean
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

  // Helper to get current structural context (reserved for future use)
  const _currentContext = (): StructuralContext =>
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
            /[=(!,;:{[&|?+\-*%<>~^]$/.test(before) ||
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
/** TJS mode flags for opt-in language improvements */
export interface TjsModes {
  /** TjsEquals: == and != use structural equality */
  tjsEquals: boolean
  /** TjsClass: classes callable without new, explicit new is banned */
  tjsClass: boolean
  /** TjsDate: Date is banned, use Timestamp/LegalDate */
  tjsDate: boolean
  /** TjsNoeval: eval() and new Function() are banned */
  tjsNoeval: boolean
  /** TjsStandard: newlines as statement terminators (prevents ASI footguns) */
  tjsStandard: boolean
  /** TjsSafeEval: include Eval/SafeFunction in runtime for dynamic code execution */
  tjsSafeEval: boolean
}

export function preprocess(
  source: string,
  options: PreprocessOptions = {}
): {
  source: string
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  tjsModes: TjsModes
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
  tests: TestBlock[]
  testErrors: string[]
  polymorphicNames: Set<string>
  extensions: Map<string, Set<string>>
} {
  const originalSource = source
  let moduleSafety: 'none' | 'inputs' | 'all' | undefined
  const requiredParams = new Set<string>()
  const unsafeFunctions = new Set<string>()
  const safeFunctions = new Set<string>()

  // TJS modes - all default to false (JS-compatible by default)
  const tjsModes: TjsModes = {
    tjsEquals: false,
    tjsClass: false,
    tjsDate: false,
    tjsNoeval: false,
    tjsStandard: false,
    tjsSafeEval: false,
  }

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

  // Handle TJS mode directives (can appear in any order after safety)
  // TjsStrict enables all TJS modes
  // Individual modes: TjsEquals, TjsClass, TjsDate, TjsNoeval, TjsStandard, TjsSafeEval
  const directivePattern =
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*(TjsStrict|TjsEquals|TjsClass|TjsDate|TjsNoeval|TjsStandard|TjsSafeEval)\b/

  let match
  while ((match = source.match(directivePattern))) {
    const directive = match[2]

    if (directive === 'TjsStrict') {
      // Enable all TJS modes
      tjsModes.tjsEquals = true
      tjsModes.tjsClass = true
      tjsModes.tjsDate = true
      tjsModes.tjsNoeval = true
      tjsModes.tjsStandard = true
    } else if (directive === 'TjsEquals') {
      tjsModes.tjsEquals = true
    } else if (directive === 'TjsClass') {
      tjsModes.tjsClass = true
    } else if (directive === 'TjsDate') {
      tjsModes.tjsDate = true
    } else if (directive === 'TjsNoeval') {
      tjsModes.tjsNoeval = true
    } else if (directive === 'TjsStandard') {
      tjsModes.tjsStandard = true
    } else if (directive === 'TjsSafeEval') {
      tjsModes.tjsSafeEval = true
    }

    // Remove the directive from source
    source = source.replace(
      new RegExp(
        `^(\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*)\\s*${directive}\\s*`
      ),
      '$1'
    )
  }

  // TjsStandard mode: insert semicolons to prevent ASI footguns
  // Must happen early before other transformations modify line structure
  if (tjsModes.tjsStandard) {
    source = insertAsiProtection(source)
  }

  // Transform Is/IsNot infix operators to function calls
  // a Is b -> Is(a, b)
  // a IsNot b -> IsNot(a, b)
  // These are always available for explicit structural equality
  source = transformIsOperators(source)

  // Transform == and != to structural equality (Is/IsNot)
  // Only when TjsEquals mode is enabled and not for VM targets
  // VM targets already handle == correctly at runtime
  if (tjsModes.tjsEquals && !options.vmTarget) {
    source = transformEqualityToStructural(source)
  }

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
  const {
    source: transformedSource,
    returnType,
    returnSafety,
  } = transformParenExpressions(source, {
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
  })
  source = transformedSource

  // NOTE: unsafe {} blocks removed - they provided no performance benefit because
  // the wrapper decision is made at transpile time. Use (!) on functions instead.
  // See ideas parking lot for potential future approaches.

  // Transform extend blocks: extend TypeName { methods } -> __ext_TypeName object
  // Must happen after paren expressions so method params are already transformed
  const extResult = transformExtendDeclarations(source)
  source = extResult.source

  // Handle try-without-catch: try { ... } (no catch/finally) -> monadic error handling
  // This is the idiomatic TJS way to convert exceptions to AgentError
  source = transformTryWithoutCatch(source)

  // Transform polymorphic functions: multiple declarations with same name -> dispatcher
  // Must happen after param transformation but before class wrapping and test extraction
  const polyResult = transformPolymorphicFunctions(source, requiredParams)
  source = polyResult.source

  // Extract WASM blocks: wasm(args) { ... } fallback { ... }
  const wasmBlocks = extractWasmBlocks(source)
  source = wasmBlocks.source

  // Extract and run test blocks: test 'desc'? { body }
  // Tests run at transpile time and are stripped from output
  const testResult = extractAndRunTests(source, options.dangerouslySkipTests)
  source = testResult.source

  // Transform polymorphic constructors: multiple constructor() -> factory functions
  // Must happen before wrapClassDeclarations (which needs to know about poly ctors)
  const polyCtorResult = transformPolymorphicConstructors(
    source,
    requiredParams
  )
  source = polyCtorResult.source

  // Mark $dispatch functions as unsafe (internal Proxy trap params, not user-facing)
  for (const cls of polyCtorResult.polyCtorClasses) {
    unsafeFunctions.add(`${cls}$dispatch`)
  }

  // Wrap class declarations to make them callable without `new`
  // Only when TjsClass mode is enabled
  // class Foo { } -> let Foo = class Foo { }; Foo = globalThis.__tjs?.wrapClass?.(Foo) ?? Foo;
  if (tjsModes.tjsClass) {
    source = wrapClassDeclarations(source, polyCtorResult.polyCtorClasses)
  }

  // Validate TjsDate mode - check for Date usage
  if (tjsModes.tjsDate) {
    source = validateNoDate(source)
  }

  // Validate TjsNoeval mode - check for eval/Function usage
  if (tjsModes.tjsNoeval) {
    source = validateNoEval(source)
  }

  // Rewrite extension method calls on known-type receivers
  // Must happen after all other transforms so literals are in final form
  source = transformExtensionCalls(source, extResult.extensions)

  return {
    source,
    returnType,
    returnSafety,
    moduleSafety,
    tjsModes,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks: wasmBlocks.blocks,
    tests: testResult.tests,
    testErrors: testResult.errors,
    polymorphicNames: polyResult.polymorphicNames,
    extensions: extResult.extensions,
  }
}

/**
 * Transform try blocks without catch/finally into monadic error handling
 * try { ... } (alone) -> try { ... } catch (__err) { return AgentError }
 *
 * Note: try-without-catch only makes sense inside functions (for monadic return).
 * Using it at top level will result in "'return' outside of function" error,
 * which is the correct behavior - monadic error flow requires a function context.
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
        // No catch or finally - add monadic error handler with call stack
        // In debug mode, __tjs.getStack() returns the call stack for diagnostics
        const body = source.slice(bodyStart, j - 1)
        result += `try {${body}} catch (__try_err) { return { $error: true, message: __try_err?.message || String(__try_err), op: 'try', cause: __try_err, stack: globalThis.__tjs?.getStack?.() } }`
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

  // Find all identifiers used in the body
  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  const allIdentifiers = new Set<string>()
  let match
  while ((match = identifierPattern.exec(bodyWithoutComments)) !== null) {
    allIdentifiers.add(match[1])
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
function insertAsiProtection(source: string): string {
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
function transformEqualityToStructural(source: string): string {
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
 * Extension info for a single extend block
 */
interface ExtensionInfo {
  /** The type name being extended (e.g., 'String', 'Array', 'MyClass') */
  typeName: string
  /** Method names defined in this extend block */
  methods: string[]
}

/**
 * Transform `extend TypeName { ... }` blocks into `const __ext_TypeName = { ... }` objects
 * and runtime registration calls.
 *
 * extend String {
 *   capitalize() { return this[0].toUpperCase() + this.slice(1) }
 * }
 *
 * becomes:
 *
 * const __ext_String = {
 *   capitalize: function() { return this[0].toUpperCase() + this.slice(1) }
 * }
 * if (__tjs?.registerExtension) {
 *   __tjs.registerExtension('String', 'capitalize', __ext_String.capitalize)
 * }
 */
function transformExtendDeclarations(source: string): {
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
function locAt(source: string, pos: number): { line: number; column: number } {
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
interface PolyVariant {
  /** Index (1-based) for renaming */
  index: number
  /** Start position in source */
  start: number
  /** End position in source (after closing brace) */
  end: number
  /** The full function source text */
  text: string
  /** Whether it was exported */
  exported: boolean
  /** Whether it was async */
  isAsync: boolean
  /** Parsed parameter info: [name, defaultValue][] */
  params: { name: string; defaultValue: string; required: boolean }[]
}

/**
 * Infer a type-check expression from a parameter's default value string.
 * Returns a condition that checks if an argument matches this param's type.
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
function findFunctionBodyEnd(source: string, openBracePos: number): number {
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
function transformPolymorphicFunctions(
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
  const {
    filename = '<source>',
    colonShorthand = true,
    vmTarget = false,
  } = options

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
    ? preprocess(source, { vmTarget })
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
function transformPolymorphicConstructors(
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

function wrapClassDeclarations(
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
function validateNoDate(source: string): string {
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
function validateNoEval(source: string): string {
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
