/**
 * Parser parameter and annotation processing
 *
 * Handles the unified paren expression transformer that converts TJS syntax
 * (colon defaults, return type annotations, safe/unsafe markers) into valid JS.
 */

import { SyntaxError } from './types'
import type {
  TokenizerState,
  StructuralContext,
  ContextFrame,
  TjsModes,
} from './parser-types'

export function transformParenExpressions(
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
export function extractJSValue(
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
