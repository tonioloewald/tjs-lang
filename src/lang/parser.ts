/**
 * TJS Parser — Orchestration Layer
 *
 * This module contains the main entry points: preprocess() and parse().
 * Transform functions are in parser-transforms.ts, param processing in parser-params.ts.
 */

import * as acorn from 'acorn'
import type { Program, FunctionDeclaration } from 'acorn'
import { SyntaxError } from './types'

// Re-export types so external callers don't need to change imports
export type {
  ParseOptions,
  WasmBlock,
  TestBlock,
  PreprocessOptions,
  TjsModes,
} from './parser-types'

import type {
  ParseOptions,
  WasmBlock,
  TestBlock,
  PreprocessOptions,
  TjsModes,
} from './parser-types'

import { transformParenExpressions } from './parser-params'

import {
  transformTryWithoutCatch,
  extractWasmBlocks,
  transformIsOperators,
  insertAsiProtection,
  transformEqualityToStructural,
  transformTypeDeclarations,
  transformGenericDeclarations,
  transformUnionDeclarations,
  transformEnumDeclarations,
  transformExtendDeclarations,
  transformPolymorphicFunctions,
  transformPolymorphicConstructors,
  wrapClassDeclarations,
  transformBareAssignments,
  extractAndRunTests,
  validateNoDate,
  validateNoEval,
  transformExtensionCalls,
} from './parser-transforms'

// Re-export transformExtensionCalls for js.ts
export { transformExtensionCalls } from './parser-transforms'

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
 * TJS doc comments use /\*# ... \*\/ syntax and preserve full markdown content.
 * Legacy JSDoc (/\*\* ... \*\/) is supported as a fallback.
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
