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
} from './parser-types'
import { locAt } from './parser-transforms'
import {
  isRegexStart,
  findRegexEnd,
  isEscapedAt,
  maskLiterals,
} from '../strip-comments'
import {
  isTypeNameAnnotation,
  typeArgumentSource,
  typeNameExample,
} from './inference'

export function transformParenExpressions(
  source: string,
  ctx: {
    originalSource: string
    requiredParams: Set<string>
    /**
     * Optional params whose annotation was a bare TYPE NAME (`n?: number`), not an
     * example value (`n?: 0`).
     *
     * The rewrite below has to emit `n = number` so acorn can parse it and inference can
     * read the type off the identifier — but that default is a DANGLING REFERENCE at run
     * time. The emitter deletes it, and needs this set to know which defaults are
     * annotations rather than genuine JS defaults: `n?: MyThing` and `x = someVar` produce
     * byte-identical AST, and only the parser knows which is which.
     */
    typeNameOptionals: Set<string>
    /**
     * Types declared in this module (`Type X {…}`), so an annotation like `Box<int>` can
     * be recognised as an APPLICATION of one rather than a comparison.
     */
    declaredTypes?: Set<string>
    /**
     * Hoisted `const __ta_… = Box(…)` declarations produced by type arguments. The caller
     * prepends them, so an applied type is constructed ONCE per module instead of on
     * every call — and so the annotation itself stays a bare identifier, which is the
     * shape the emitter's declared-type path already handles.
     */
    hoistedTypeArgs?: HoistedTypeArg[]
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
    //
    // The name is OPTIONAL: `const f = function (n: 0) {}` is a function expression, and
    // requiring a name here meant its annotated params never reached the colon-shorthand
    // rewrite — so the file did not parse at all, while the identical arrow did. A
    // spelling should not decide whether the language accepts your code.
    // `\s+name` OR straight to `(`. Writing this as `\s*(\w*)\s*\(` instead matched
    // `functionMetaToJSONSchema(` as the keyword plus a name of `MetaToJSONSchema` —
    // an identifier that merely STARTS with the keyword. Caught by examples/json-schema.tjs.
    const funcMatch = source.slice(i).match(/^function(?:\s+(\w+))?\s*\(/)
    if (funcMatch) {
      // Keep the ORIGINAL spelling in the output — a function expression may genuinely
      // have no name, and inventing one both changes the emitted code and creates an
      // identifier the metadata then references but nothing declares.
      const declaredName = funcMatch[1]
      const funcName = declaredName || 'anonymous'
      const matchLen = funcMatch[0].length

      // Check for safety marker right after opening paren: (? or (!
      const afterParen = source[i + matchLen]
      let safetyMarker: '?' | '!' | null
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

      result += declaredName ? `function ${declaredName}(` : `function (`
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

      // Check what follows the closing paren: return type annotation (:, :?, :!)
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        let safety: 'safe' | 'unsafe' | undefined
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
          safety = colonMarker === ':?' ? 'safe' : 'unsafe'
        } else {
          j += 1
        }
        while (j < source.length && /\s/.test(source[j])) j++

        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          if (firstReturnType === undefined) {
            firstReturnType = typeResult.type
            if (safety) firstReturnSafety = safety
          }
          i = typeResult.endPos
        }
      }

      // Catch a common mistake: writing `=> {` after a function declaration's
      // return type (or after `)`), as if it were an arrow function. Without
      // this check, the `=>` would pass through to Acorn, which complains
      // with a generic "Unexpected token" at a misleading position.
      let arrowCheck = i
      while (arrowCheck < source.length && /\s/.test(source[arrowCheck]))
        arrowCheck++
      if (source[arrowCheck] === '=' && source[arrowCheck + 1] === '>') {
        throw new SyntaxError(
          "Unexpected '=>' after function declaration. " +
            'Function declarations use `function name(params) { body }`, ' +
            'not arrow syntax. Remove the `=>`.',
          locAt(ctx.originalSource, arrowCheck),
          ctx.originalSource
        )
      }
      continue
    }

    // Look for class method syntax: constructor(, methodName(, get name(, set name(
    // These appear inside class bodies and need param transformation
    // Only match if we're actually in a class body (proper context tracking)
    // Must NOT match function calls in expressions (div(), span(), etc.)
    const methodMatch = source
      .slice(i)
      .match(/^(constructor|(?:get|set)\s+\w+|async\s+\w+|\w+)\s*\(/)
    // Check that the preceding non-whitespace character indicates this is a
    // declaration, not a function call in an expression.
    // Method declarations follow: newline, {, ;, or start of file
    // Function calls follow: = => , [ ( . operators etc.
    const prevNonWs = (() => {
      for (let k = result.length - 1; k >= 0; k--) {
        if (!/\s/.test(result[k])) return result[k]
      }
      return '\n' // start of input
    })()
    // Method declarations can follow almost anything (property, }, ;, etc.)
    // Function CALLS in expressions specifically follow: = => , [ (
    const isMethodDecl =
      prevNonWs !== '=' &&
      prevNonWs !== ',' &&
      prevNonWs !== '(' &&
      prevNonWs !== '[' &&
      prevNonWs !== '>' // catches =>
    if (methodMatch && isInClassBody() && !isMethodDecl) {
      // Not a method declaration (it's a function call in an expression).
      // Skip past the identifier to prevent re-matching a suffix
      // (e.g. 'div(' → skip 'div', don't let 'iv(' match next).
      const skipLen = methodMatch[1].length
      result += source.slice(i, i + skipLen)
      i += skipLen
      continue
    }
    if (methodMatch && isInClassBody() && isMethodDecl) {
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

      // Check for return type annotation: ): type, ):! type, ):? type
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
        } else {
          j++
        }
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i = typeResult.endPos
        }
      }

      // Same `=>` check for class methods.
      let k = i
      while (k < source.length && /\s/.test(source[k])) k++
      if (source[k] === '=' && source[k + 1] === '>') {
        throw new SyntaxError(
          "Unexpected '=>' after method declaration. " +
            'Methods use `name(params) { body }`, not arrow syntax. ' +
            'Remove the `=>`.',
          locAt(ctx.originalSource, k),
          ctx.originalSource
        )
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

      // Check what follows: whitespace then `=>` (arrow function), optionally preceded
      // by a `): type` return annotation. (`arrowReturnType` = the return type OF an arrow
      // function; TJS has no arrow-shaped return syntax.)
      let j = endPos
      while (j < source.length && /\s/.test(source[j])) j++

      // Check for return type annotation on arrow function: ): type =>
      let arrowReturnType: string | undefined
      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
        } else {
          j++
        }
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
  // Trailing context OUTSIDE any literal, for telling a regex from a division. Keeps a
  // short tail rather than one character because `isRegexStart` also recognises keywords
  // (`return /re/`), which a single char cannot express.
  let sigTail = open

  while (i < source.length && depth > 0) {
    const char = source[i]

    // Handle string literals.
    //
    // Escapes are consumed FORWARD, not detected by looking back at `source[i - 1]`.
    // The lookback is wrong for an escaped backslash: in `'\\'` the closing quote IS
    // preceded by a backslash, so it read as escaped and the string never closed —
    // desyncing everything after `if (char === '\\')`, a line this codebase has in
    // several scanners.
    if (inString && char === '\\') {
      i += 2
      continue
    }
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar) {
      inString = false
    } else if (!inString) {
      // REGEX LITERALS. A `)` inside a character class — `/[)\]']/` — used to close the
      // enclosing paren, so `if (/[)\]']/.test(c))` handed the caller the fragment `/[`
      // and every function after it went untransformed. Skip the literal whole.
      if (char === '/' && isRegexStart(sigTail)) {
        const end = findRegexEnd(source, i)
        if (end !== -1) {
          i = end + 1
          sigTail = '/'
          continue
        }
      }
      if (char === open) depth++
      else if (char === close) depth--
      sigTail = (sigTail + char).slice(-24)
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
      if (source[i] === firstChar && !isEscapedAt(source, i)) {
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
      if (char === stringChar && !isEscapedAt(source, i)) {
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
      let isIntegral = true
      // Handle decimal part
      if (j < source.length && source[j] === '.' && /\d/.test(source[j + 1])) {
        isIntegral = false
        j++ // Skip decimal point
        while (j < source.length && /\d/.test(source[j])) j++
      }
      // Handle exponent (1e10, 1.5e-3)
      if (j < source.length && (source[j] === 'e' || source[j] === 'E')) {
        isIntegral = false
        j++
        if (j < source.length && (source[j] === '+' || source[j] === '-')) j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      // BigInt suffix — `0n`. Only after an integral literal, because `0.5n` and `1e3n`
      // are not valid JavaScript. Without this the return position rejected the very
      // example form `fromTS` emits for a TS `bigint`, so converted output did not parse.
      if (isIntegral && j < source.length && source[j] === 'n') j++
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

      // Identifier followed by ( — constructor/function call as return type
      // e.g. FunctionPredicate('function', { params: ... })
      if (i < source.length && source[i] === '(') {
        depth++
        i++
        continue
      }

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
 * Split a parameter list on its top-level commas.
 *
 * Scans a **literal-masked view** — same length, with string / template / regex contents
 * and whole comments blanked — and slices the boundaries out of the ORIGINAL. So a comma
 * or a brace inside a literal can never be structure, and nothing in the output is
 * rewritten: what goes in comes back out byte-identical between the split points.
 *
 * It used to hand-roll comment tracking and bracket depth and know nothing about strings,
 * which put it squarely in the literal-blindness family (`src/strip-comments.ts`). Splitting
 * `{what = 'hello,', who: 'alice'}` mid-literal and rejoining the pieces with `', '` put the
 * comma back WITH A SPACE AFTER IT, inside the string:
 *
 *   {what = 'hello,', who: 'alice'}   →   { what = 'hello, ', who = 'alice' }
 *
 * Silent — the output parses and runs and returns a plausible wrong answer — and it reached
 * the emitted `__tjs` metadata too, so the wrong default propagated into `.d.ts` and JSON
 * Schema. A regex default was worse still: `/,/` became `/, /`, which is a different regex.
 * Pinned by `src/lang/literal-blindness.test.ts`.
 */

/**
 * `Box<int>` in annotation position -> a hoisted `const`, leaving a bare identifier.
 *
 *   function unbox(b: Box<int>)
 *     -> const __ta_Box_1 = Box(Number.isInteger)
 *        function unbox(b = __ta_Box_1)
 *
 * Applying a parameterized type is a CALL at run time — `Generic` returns a function and
 * calling it yields the checked type — and a primitive argument becomes a PREDICATE, which
 * is the only representation available for something with no runtime binding (`int`
 * compiles to an inline check, so `Box(int)` would reference nothing).
 *
 * Hoisting rather than inlining the call buys two things. The type is built once per
 * module instead of once per call; and the annotation stays an identifier, so the emitter's
 * existing declared-type path handles it with no change — the alternative was teaching
 * inference and codegen about call-shaped annotations, i.e. a second mechanism for
 * something the first already does.
 *
 * Unambiguous in this position: an annotation is delimited by `,` or `)`, so `Box<int>)`
 * cannot be a comparison. The identity of the argument is irrelevant — `Box<number>` and
 * `Box<string>` are no more reserved than `int`.
 *
 * Returns the input unchanged unless the head is a type declared in this module, so
 * ordinary annotations take exactly the path they took before.
 */
function rewriteTypeArguments(
  type: string,
  ctx: {
    declaredTypes?: Set<string>
    hoistedTypeArgs?: HoistedTypeArg[]
  }
): string {
  // `T[]` -> the array-example spelling, which the array path already handles:
  //   xs: number[]     ->  xs: [0.0]
  //   xs: string[][]   ->  xs: [['']]
  // Rewriting to the existing form rather than adding a second array representation means
  // `T[]` inherits item checking, `.d.ts` emit and JSON-Schema with no new code — and it
  // makes REST params work, since `...xs: T[]` was never a rest-param gap at all: the
  // annotation simply did not parse.
  const arr = rewriteArraySuffix(type)
  if (arr !== null) return arr

  if (!ctx.declaredTypes || !ctx.hoistedTypeArgs) return type
  const expr = applyTypeArguments(type, ctx.declaredTypes)
  if (expr === null) return type
  // Named after the annotation, not `__ta_0`: this identifier IS what a type error says
  // it expected, and "Expected __ta_0" tells the reader nothing about their own code.
  const base = type
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, '_')
    .replace(/_+$/, '')
  let alias = base
  for (let n = 2; ctx.declaredTypes.has(alias); n++) alias = `${base}_${n}`
  // `head` is the type being applied. The caller places the declaration immediately after
  // THAT type's own declaration: `Box` is a `const`, so a `const __ta_0 = Box(…)` placed
  // before it hits the temporal dead zone at module evaluation.
  ctx.hoistedTypeArgs.push({
    alias,
    head: expr.slice(0, expr.indexOf('(')),
    text: `const ${alias} = ${expr}`,
  })
  // The alias is itself a declared type from here on, so the emitter checks with it.
  ctx.declaredTypes.add(alias)
  return alias
}

/** A `const __ta_N = Box(…)` to be emitted after `Box`'s own declaration. */
export interface HoistedTypeArg {
  alias: string
  /** The type being applied — determines where the declaration must go. */
  head: string
  text: string
}

/**
 * Index of a top-level `=` that is an ASSIGNMENT, or -1.
 *
 * Skips `==`/`===`/`!=`/`>=`/`<=` and the arrow of `=>`, so an annotation whose example
 * contains a comparison or a callback (`[(x) => x]`) is not mistaken for a default.
 */
function topLevelAssignment(src: string): number {
  const masked = maskLiterals(src)
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === '=' && depth === 0) {
      if (masked[i + 1] === '=' || masked[i + 1] === '>') continue
      if ('=!<>'.includes(masked[i - 1] ?? '')) continue
      return i
    }
  }
  return -1
}

/** `number[]` -> `[0.0]`, `string[][]` -> `[['']]`; `null` when not an array suffix. */
function rewriteArraySuffix(type: string): string | null {
  const t = type.trim()
  if (!t.endsWith('[]')) return null
  const inner = t.slice(0, -2).trim()
  if (!inner) return null
  const nested = rewriteArraySuffix(inner)
  if (nested !== null) return `[${nested}]`
  const example = typeNameExample(inner)
  // An unknown element type is left alone rather than guessed at — a wrong example would
  // validate against the wrong thing, which is worse than not validating.
  return example ? `[${example}]` : null
}

/** `Box<int>` -> `Box(Number.isInteger)`, or null when this is not an applied type. */
function applyTypeArguments(
  type: string,
  declaredTypes: Set<string>
): string | null {
  const m = type.trim().match(/^([A-Z][A-Za-z0-9_$]*)\s*<(.+)>$/)
  if (!m) return null
  const [, name, argsSrc] = m
  if (!declaredTypes.has(name)) return null
  // Top-level split, so `Pair<Box<int>, int>` keeps its inner arguments together.
  const args: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < argsSrc.length; i++) {
    const c = argsSrc[i]
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      args.push(argsSrc.slice(start, i))
      start = i + 1
    }
  }
  args.push(argsSrc.slice(start))
  const resolved: string[] = []
  for (const a of args) {
    const t = a.trim()
    if (!t) return null
    // Nested application resolves recursively; a declared type is already a runtime
    // binding and needs no translation.
    const nested = applyTypeArguments(t, declaredTypes)
    if (nested) {
      resolved.push(nested)
      continue
    }
    const prim = typeArgumentSource(t)
    if (prim) {
      resolved.push(prim)
      continue
    }
    if (declaredTypes.has(t)) {
      resolved.push(t)
      continue
    }
    return null // an argument we cannot represent — leave the annotation alone
  }
  return `${name}(${resolved.join(', ')})`
}

function splitParameters(params: string): string[] {
  const masked = maskLiterals(params)
  const result: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < masked.length; i++) {
    const char = masked[i]
    if (char === '(' || char === '{' || char === '[') depth++
    else if (char === ')' || char === '}' || char === ']') depth--
    else if (char === ',' && depth === 0) {
      result.push(params.slice(start, i))
      start = i + 1
    }
  }

  // A trailing comma leaves an empty tail, which is not a parameter.
  const tail = params.slice(start)
  if (tail.trim()) result.push(tail)

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
    typeNameOptionals: Set<string>
    // Threaded through so a type argument can be recognised and hoisted; both are
    // optional so every existing caller keeps working untouched.
    declaredTypes?: Set<string>
    hoistedTypeArgs?: HoistedTypeArg[]
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  },
  trackRequired: boolean
): string {
  // First recursively process any nested arrow functions
  const withArrows = transformParenExpressions(params, {
    originalSource: params,
    requiredParams: ctx.requiredParams,
    typeNameOptionals: ctx.typeNameOptionals,
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

    // Handle rest parameters: ...args: [0] -> ...args (strip type, JS forbids defaults on rest)
    // The type annotation is still captured by extractFunctionTypeInfo for __tjs metadata
    if (trimmed.startsWith('...')) {
      const restColonPos = findTopLevelColon(trimmed)
      if (restColonPos !== -1) {
        const restName = trimmed.slice(0, restColonPos).trim()
        // A DEFAULT on a rest param is meaningless, and silently dropping it is the
        // "looks like it does something" failure this project treats as worse than an
        // error. JS rejects `...xs = [1]` outright — but the annotated form
        // `...xs: number[] = [1]` slipped past, because the annotation is stripped here
        // and the leftover `= [1]` went with it. `f()` returned `[]`, not `[1]`.
        //
        // A rest parameter is ALWAYS bound, to `[]` when no arguments are passed, so
        // there is no absent case for a default to fill.
        const annotation = trimmed.slice(restColonPos + 1)
        const eq = topLevelAssignment(annotation)
        if (eq !== -1) {
          throw new SyntaxError(
            `A rest parameter cannot have a default. \`${restName}\` is always bound — ` +
              `to \`[]\` when no arguments are passed — so \`= ${annotation
                .slice(eq + 1)
                .trim()}\` could never apply.\n\n` +
              `  Drop it:  ${restName}: ${annotation.slice(0, eq).trim()}\n\n` +
              `JavaScript rejects \`${restName} = …\` for the same reason; only the ` +
              `annotated spelling slipped through.`,
            locAt(trimmed, 0)
          )
        }
        return restName
      }
      return param
    }

    // Handle optional param syntax: x?: type -> x = type (not required)
    const optionalMatch = trimmed.match(/^(\w+)\s*\?\s*:\s*(.+)$/)
    if (optionalMatch) {
      const [, name, type] = optionalMatch
      checkDuplicate(name)
      sawOptional = true
      // Optional params are NOT tracked as required.
      //
      // `n?: number` legitimately becomes `n = number` HERE: this string feeds the acorn
      // parse, and inference reads that identifier to learn the type. Dropping it would
      // silently degrade the param to `any` — which is why the fix is not in this file.
      //
      // The EMITTER deletes the dangling default, so the type survives inference and the
      // emitted JS is `function g(n)` — a genuinely optional parameter, which is what
      // `n?: number` means. Before that, `g()` threw `number is not defined` at call time.
      // It is recorded here rather than detected there because `n?: MyThing` and
      // `x = someVar` produce byte-identical AST; only this branch knows the difference.
      if (isTypeNameAnnotation(type)) ctx.typeNameOptionals.add(name)
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
      const type = rewriteTypeArguments(trimmed.slice(colonPos + 1).trim(), ctx)

      checkDuplicate(name)

      // Required param after optional — warn but allow.
      // TypeScript permits this, and the TS→TJS converter can produce it
      // when earlier params degrade to 'any' (bare name, no : or =).
      if (sawOptional && trackRequired && /^\w+$/.test(name)) {
        // Allow it — JavaScript handles this fine (caller passes undefined)
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
    typeNameOptionals: Set<string>
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
      if (char === stringChar && !isEscapedAt(param, i)) inString = false
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
      if (char === stringChar && !isEscapedAt(param, i)) inString = false
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
