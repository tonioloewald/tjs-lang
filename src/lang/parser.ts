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
} {
  const originalSource = source
  let returnType: string | undefined
  const requiredParams = new Set<string>()

  // Handle return type annotation: ) -> Type {
  // Match balanced braces for object types
  const returnTypeMatch = source.match(
    /\)\s*->\s*(\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*\{(?!\s*\w+:)/
  )
  if (returnTypeMatch) {
    returnType = returnTypeMatch[1]
    // Remove the -> Type part, keeping ) and {
    const pattern =
      /\)\s*->\s*(?:\{[\s\S]*?\}|\[[^\]]*\]|'[^']*'|\d+|true|false|null|undefined)\s*(\{)(?!\s*\w+:)/
    source = source.replace(pattern, ') $1')
  }

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

  return { source, returnType, originalSource, requiredParams }
}

/**
 * Split parameter string respecting nested braces/brackets
 */
function splitParameters(params: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0

  for (const char of params) {
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
} {
  const { filename = '<source>', colonShorthand = true } = options

  // Preprocess for custom syntax
  const {
    source: processedSource,
    returnType,
    originalSource,
    requiredParams,
  } = colonShorthand
    ? preprocess(source)
    : {
        source,
        returnType: undefined,
        originalSource: source,
        requiredParams: new Set<string>(),
      }

  try {
    const ast = acorn.parse(processedSource, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })

    return { ast, returnType, originalSource, requiredParams }
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
