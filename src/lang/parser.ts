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
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
} {
  const originalSource = source
  let returnType: string | undefined
  const requiredParams = new Set<string>()
  const unsafeFunctions = new Set<string>()

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

  // Also handle arrow functions: (! params) => or (!) =>
  source = source.replace(/\(\s*!\s*([^)]*)\)\s*=>/g, (match, params) => {
    // Arrow functions are anonymous, mark via comment for now
    return `(/* unsafe */ ${params}) =>`
  })

  // Handle return type annotation: ) -> Type {
  // Match balanced braces for object types
  // NOTE: We capture the FIRST return type for the main function (for single-function analysis)
  // but we globally remove ALL -> Type patterns for multi-function files
  const returnTypeMatch = source.match(
    /\)\s*->\s*(\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*\{(?!\s*\w+:)/
  )
  if (returnTypeMatch) {
    returnType = returnTypeMatch[1]
  }
  // Remove ALL -> Type parts globally, keeping ) and {
  const returnTypePattern =
    /\)\s*->\s*(?:\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*(\{)(?!\s*\w+:)/g
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

  // Handle unsafe blocks: unsafe { ... } -> try { ... } catch (e) { return AgentError }
  // `unsafe` skips type checks (when we add runtime validation) and wraps in try-catch
  // since unchecked code may throw unexpectedly
  source = transformUnsafeBlocks(source)

  // Handle try-without-catch: try { ... } (no catch/finally) -> monadic error handling
  // This is the idiomatic TJS way to convert exceptions to AgentError
  source = transformTryWithoutCatch(source)

  return { source, returnType, originalSource, requiredParams, unsafeFunctions }
}

/**
 * Transform unsafe blocks with proper brace matching
 * unsafe { ... } -> try { ... } catch (__unsafe_err) { return AgentError }
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

      // Replace with try-catch
      result += `try {${body}} catch (__unsafe_err) { return { $error: true, message: 'unsafe block threw: ' + (__unsafe_err?.message || String(__unsafe_err)), op: 'unsafe', cause: __unsafe_err } }`
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
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
} {
  const { filename = '<source>', colonShorthand = true } = options

  // Preprocess for custom syntax
  const {
    source: processedSource,
    returnType,
    originalSource,
    requiredParams,
    unsafeFunctions,
  } = colonShorthand
    ? preprocess(source)
    : {
        source,
        returnType: undefined,
        originalSource: source,
        requiredParams: new Set<string>(),
        unsafeFunctions: new Set<string>(),
      }

  try {
    const ast = acorn.parse(processedSource, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })

    return { ast, returnType, originalSource, requiredParams, unsafeFunctions }
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
