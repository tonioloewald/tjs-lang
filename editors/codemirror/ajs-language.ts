/**
 * CodeMirror 6 Language Support for AsyncJS
 *
 * This extends the JavaScript language with custom highlighting for AsyncJS:
 * - Forbidden keywords (new, class, async, etc.) are marked as errors
 * - Standard JS syntax highlighting otherwise
 *
 * Usage:
 * ```typescript
 * import { EditorState } from '@codemirror/state'
 * import { EditorView, basicSetup } from 'codemirror'
 * import { ajs } from 'tosijs-agent/editors/codemirror/ajs-language'
 *
 * new EditorView({
 *   state: EditorState.create({
 *     doc: 'function agent(topic: "string") { ... }',
 *     extensions: [basicSetup, ajs()]
 *   }),
 *   parent: document.body
 * })
 * ```
 */

import { javascript } from '@codemirror/lang-javascript'
import {
  HighlightStyle,
  syntaxHighlighting,
  LanguageSupport,
  defaultHighlightStyle,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view'
import { Extension, RangeSetBuilder } from '@codemirror/state'
import {
  autocompletion,
  CompletionContext as CMCompletionContext,
  CompletionResult,
  Completion as CMCompletion,
  snippetCompletion,
} from '@codemirror/autocomplete'

import {
  FORBIDDEN_KEYWORDS as FORBIDDEN_LIST,
  FORBIDDEN_PATTERN,
} from '../ajs-syntax'

/**
 * Forbidden keywords in AsyncJS - these will be highlighted as errors
 */
const FORBIDDEN_KEYWORDS = new Set(FORBIDDEN_LIST)

/**
 * Decoration for forbidden keywords
 */
const forbiddenMark = Decoration.mark({
  class: 'cm-ajs-forbidden',
})

/**
 * Find all string and comment regions in the document
 * Returns array of [start, end] ranges to skip
 */
function findSkipRegions(doc: string): [number, number][] {
  const regions: [number, number][] = []
  const len = doc.length
  let i = 0

  while (i < len) {
    const ch = doc[i]
    const next = doc[i + 1]

    // Single-line comment
    if (ch === '/' && next === '/') {
      const start = i
      i += 2
      while (i < len && doc[i] !== '\n') i++
      regions.push([start, i])
      continue
    }

    // Multi-line comment
    if (ch === '/' && next === '*') {
      const start = i
      i += 2
      while (i < len - 1 && !(doc[i] === '*' && doc[i + 1] === '/')) i++
      i += 2 // skip */
      regions.push([start, i])
      continue
    }

    // Template literal - skip string parts but NOT ${...} expressions
    if (ch === '`') {
      let stringStart = i
      i++
      while (i < len) {
        if (doc[i] === '\\') {
          i += 2 // skip escaped char
          continue
        }
        if (doc[i] === '`') {
          // End of template - add final string region
          regions.push([stringStart, i + 1])
          i++
          break
        }
        if (doc[i] === '$' && doc[i + 1] === '{') {
          // Add string region before ${
          regions.push([stringStart, i])
          i += 2 // skip ${
          // Skip the expression inside ${...} (don't add to regions - it's code!)
          let braceDepth = 1
          while (i < len && braceDepth > 0) {
            if (doc[i] === '{') braceDepth++
            else if (doc[i] === '}') braceDepth--
            if (braceDepth > 0) i++
          }
          i++ // skip closing }
          stringStart = i // next string region starts here
          continue
        }
        i++
      }
      continue
    }

    // Single or double quoted string
    if (ch === '"' || ch === "'") {
      const quote = ch
      const start = i
      i++
      while (i < len) {
        if (doc[i] === '\\') {
          i += 2 // skip escaped char
          continue
        }
        if (doc[i] === quote) {
          i++
          break
        }
        if (doc[i] === '\n') break // unterminated string
        i++
      }
      regions.push([start, i])
      continue
    }

    i++
  }

  return regions
}

/**
 * Check if a position is inside any skip region
 */
function isInSkipRegion(pos: number, regions: [number, number][]): boolean {
  for (const [start, end] of regions) {
    if (pos >= start && pos < end) return true
    if (start > pos) break // regions are sorted, no need to check further
  }
  return false
}

/**
 * Plugin that highlights forbidden keywords as errors
 * (but not inside strings or comments)
 */
const forbiddenHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc.toString()
      const skipRegions = findSkipRegions(doc)

      // Match word boundaries for forbidden keywords (use fresh regex for each scan)
      const pattern = new RegExp(FORBIDDEN_PATTERN.source, 'g')

      let match
      while ((match = pattern.exec(doc)) !== null) {
        // Skip if inside string or comment
        if (!isInSkipRegion(match.index, skipRegions)) {
          builder.add(match.index, match.index + match[0].length, forbiddenMark)
        }
      }

      return builder.finish()
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

/**
 * Theme for AsyncJS - styles forbidden keywords as errors
 */
const ajsTheme = EditorView.theme({
  '.cm-ajs-forbidden': {
    color: '#dc2626',
    textDecoration: 'wavy underline #dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
})

/**
 * Custom highlight style that could be used for additional AsyncJS-specific highlighting
 */
const ajsHighlightStyle = HighlightStyle.define([
  // Standard highlighting is inherited from JavaScript
  // Add any AsyncJS-specific overrides here
])

/**
 * Autocomplete configuration
 */
export interface AutocompleteConfig {
  /** Function to get __tjs metadata from current source */
  getMetadata?: () => Record<string, any> | undefined
  /** Function to get imported module metadata */
  getImports?: () => Record<string, Record<string, any>> | undefined
}

// TJS keywords with snippets
const TJS_COMPLETIONS: CMCompletion[] = [
  { label: 'function', type: 'keyword', detail: 'Declare a function' },
  { label: 'const', type: 'keyword', detail: 'Declare a constant' },
  { label: 'let', type: 'keyword', detail: 'Declare a variable' },
  { label: 'if', type: 'keyword', detail: 'Conditional statement' },
  { label: 'else', type: 'keyword', detail: 'Else branch' },
  { label: 'while', type: 'keyword', detail: 'While loop' },
  { label: 'for', type: 'keyword', detail: 'For loop' },
  { label: 'return', type: 'keyword', detail: 'Return from function' },
  { label: 'try', type: 'keyword', detail: 'Try block' },
  { label: 'catch', type: 'keyword', detail: 'Catch block' },
  { label: 'import', type: 'keyword', detail: 'Import module' },
  { label: 'export', type: 'keyword', detail: 'Export declaration' },
  snippetCompletion("test('${description}') {\n\t${}\n}", {
    label: 'test',
    type: 'keyword',
    detail: 'Inline test block',
  }),
  snippetCompletion('mock {\n\t${}\n}', {
    label: 'mock',
    type: 'keyword',
    detail: 'Mock setup block',
  }),
  snippetCompletion('unsafe {\n\t${}\n}', {
    label: 'unsafe',
    type: 'keyword',
    detail: 'Skip type validation',
  }),
]

// Type examples for after : or ->
const TJS_TYPES: CMCompletion[] = [
  { label: "''", type: 'type', detail: 'String type' },
  { label: '0', type: 'type', detail: 'Number type' },
  { label: 'true', type: 'type', detail: 'Boolean type' },
  { label: 'null', type: 'type', detail: 'Null type' },
  { label: 'undefined', type: 'type', detail: 'Undefined type' },
  { label: "['']", type: 'type', detail: 'Array of strings' },
  { label: '[0]', type: 'type', detail: 'Array of numbers' },
  { label: '{}', type: 'type', detail: 'Object type' },
  { label: 'any', type: 'type', detail: 'Any type' },
]

// Runtime functions
const RUNTIME_COMPLETIONS: CMCompletion[] = [
  snippetCompletion('isError(${value})', {
    label: 'isError',
    type: 'function',
    detail: '(value: any) -> boolean',
    info: 'Check if a value is a TJS error',
  }),
  snippetCompletion("error('${message}')", {
    label: 'error',
    type: 'function',
    detail: '(message: string) -> TJSError',
    info: 'Create a TJS error object',
  }),
  snippetCompletion('typeOf(${value})', {
    label: 'typeOf',
    type: 'function',
    detail: '(value: any) -> string',
    info: 'Get type name (fixed typeof)',
  }),
  snippetCompletion('expect(${actual})', {
    label: 'expect',
    type: 'function',
    detail: '(actual: any) -> Matchers',
    info: 'Test assertion',
  }),
]

// JavaScript global objects and constructors
const GLOBAL_COMPLETIONS: CMCompletion[] = [
  // Console
  {
    label: 'console',
    type: 'variable',
    detail: 'Console object',
    info: 'Logging and debugging',
  },

  // Math
  {
    label: 'Math',
    type: 'variable',
    detail: 'Math object',
    info: 'Mathematical functions and constants',
  },

  // JSON
  {
    label: 'JSON',
    type: 'variable',
    detail: 'JSON object',
    info: 'JSON parse and stringify',
  },

  // Constructors / types
  {
    label: 'Array',
    type: 'class',
    detail: 'Array constructor',
    info: 'Create arrays',
  },
  {
    label: 'Object',
    type: 'class',
    detail: 'Object constructor',
    info: 'Object utilities',
  },
  {
    label: 'String',
    type: 'class',
    detail: 'String constructor',
    info: 'String utilities',
  },
  {
    label: 'Number',
    type: 'class',
    detail: 'Number constructor',
    info: 'Number utilities',
  },
  { label: 'Boolean', type: 'class', detail: 'Boolean constructor' },
  {
    label: 'Date',
    type: 'class',
    detail: 'Date constructor',
    info: 'Date and time',
  },
  {
    label: 'RegExp',
    type: 'class',
    detail: 'RegExp constructor',
    info: 'Regular expressions',
  },
  {
    label: 'Map',
    type: 'class',
    detail: 'Map constructor',
    info: 'Key-value collection',
  },
  {
    label: 'Set',
    type: 'class',
    detail: 'Set constructor',
    info: 'Unique value collection',
  },
  { label: 'WeakMap', type: 'class', detail: 'WeakMap constructor' },
  { label: 'WeakSet', type: 'class', detail: 'WeakSet constructor' },
  { label: 'Symbol', type: 'class', detail: 'Symbol constructor' },
  { label: 'BigInt', type: 'class', detail: 'BigInt constructor' },

  // Error types
  { label: 'Error', type: 'class', detail: 'Error constructor' },
  { label: 'TypeError', type: 'class', detail: 'TypeError constructor' },
  { label: 'RangeError', type: 'class', detail: 'RangeError constructor' },
  { label: 'SyntaxError', type: 'class', detail: 'SyntaxError constructor' },
  {
    label: 'ReferenceError',
    type: 'class',
    detail: 'ReferenceError constructor',
  },

  // Typed arrays
  { label: 'ArrayBuffer', type: 'class', detail: 'ArrayBuffer constructor' },
  { label: 'Uint8Array', type: 'class', detail: 'Uint8Array constructor' },
  { label: 'Int8Array', type: 'class', detail: 'Int8Array constructor' },
  { label: 'Uint16Array', type: 'class', detail: 'Uint16Array constructor' },
  { label: 'Int16Array', type: 'class', detail: 'Int16Array constructor' },
  { label: 'Uint32Array', type: 'class', detail: 'Uint32Array constructor' },
  { label: 'Int32Array', type: 'class', detail: 'Int32Array constructor' },
  { label: 'Float32Array', type: 'class', detail: 'Float32Array constructor' },
  { label: 'Float64Array', type: 'class', detail: 'Float64Array constructor' },

  // Promises (though async/await is forbidden, Promise itself may be useful)
  { label: 'Promise', type: 'class', detail: 'Promise constructor' },

  // Global functions
  { label: 'parseInt', type: 'function', detail: '(string, radix?) -> number' },
  { label: 'parseFloat', type: 'function', detail: '(string) -> number' },
  { label: 'isNaN', type: 'function', detail: '(value) -> boolean' },
  { label: 'isFinite', type: 'function', detail: '(value) -> boolean' },
  { label: 'encodeURI', type: 'function', detail: '(uri) -> string' },
  { label: 'decodeURI', type: 'function', detail: '(encodedURI) -> string' },
  {
    label: 'encodeURIComponent',
    type: 'function',
    detail: '(component) -> string',
  },
  {
    label: 'decodeURIComponent',
    type: 'function',
    detail: '(encoded) -> string',
  },

  // Global values
  { label: 'undefined', type: 'keyword', detail: 'Undefined value' },
  { label: 'null', type: 'keyword', detail: 'Null value' },
  { label: 'NaN', type: 'keyword', detail: 'Not a Number' },
  { label: 'Infinity', type: 'keyword', detail: 'Positive infinity' },
  { label: 'globalThis', type: 'variable', detail: 'Global object' },
]

// Expect matchers (after expect().
const EXPECT_MATCHERS: CMCompletion[] = [
  snippetCompletion('toBe(${expected})', {
    label: 'toBe',
    type: 'method',
    detail: '(expected: any)',
    info: 'Strict equality (===)',
  }),
  snippetCompletion('toEqual(${expected})', {
    label: 'toEqual',
    type: 'method',
    detail: '(expected: any)',
    info: 'Deep equality',
  }),
  snippetCompletion('toContain(${item})', {
    label: 'toContain',
    type: 'method',
    detail: '(item: any)',
    info: 'Array/string contains',
  }),
  { label: 'toThrow', type: 'method', detail: '()', info: 'Throws an error' },
  { label: 'toBeTruthy', type: 'method', detail: '()', info: 'Is truthy' },
  { label: 'toBeFalsy', type: 'method', detail: '()', info: 'Is falsy' },
  { label: 'toBeNull', type: 'method', detail: '()', info: 'Is null' },
  {
    label: 'toBeUndefined',
    type: 'method',
    detail: '()',
    info: 'Is undefined',
  },
]

/**
 * Extract function declarations from source
 */
function extractFunctions(source: string): CMCompletion[] {
  const completions: CMCompletion[] = []
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)/g
  let match
  while ((match = funcRegex.exec(source)) !== null) {
    const [, name, params] = match
    completions.push(
      snippetCompletion(`${name}(${params ? '${1}' : ''})`, {
        label: name,
        type: 'function',
        detail: `(${params})`,
      })
    )
  }
  return completions
}

/**
 * Extract variable declarations from source before cursor
 */
function extractVariables(source: string, position: number): CMCompletion[] {
  const completions: CMCompletion[] = []
  const before = source.slice(0, position)
  const varRegex = /(?:const|let)\s+(\w+)\s*=/g
  let match
  while ((match = varRegex.exec(before)) !== null) {
    completions.push({
      label: match[1],
      type: 'variable',
    })
  }
  return completions
}

/**
 * Curated property completions for common globals
 * These are hand-picked for usefulness with proper type signatures
 */
const CURATED_PROPERTIES: Record<string, CMCompletion[]> = {
  console: [
    snippetCompletion('log(${1:message})', {
      label: 'log',
      type: 'method',
      detail: '(...args: any[]) -> void',
      info: 'Log to console',
    }),
    snippetCompletion('error(${1:message})', {
      label: 'error',
      type: 'method',
      detail: '(...args: any[]) -> void',
      info: 'Log error',
    }),
    snippetCompletion('warn(${1:message})', {
      label: 'warn',
      type: 'method',
      detail: '(...args: any[]) -> void',
      info: 'Log warning',
    }),
    snippetCompletion('info(${1:message})', {
      label: 'info',
      type: 'method',
      detail: '(...args: any[]) -> void',
      info: 'Log info',
    }),
    snippetCompletion('debug(${1:message})', {
      label: 'debug',
      type: 'method',
      detail: '(...args: any[]) -> void',
      info: 'Log debug',
    }),
    snippetCompletion('table(${1:data})', {
      label: 'table',
      type: 'method',
      detail: '(data: any) -> void',
      info: 'Display as table',
    }),
    snippetCompletion("time('${1:label}')", {
      label: 'time',
      type: 'method',
      detail: '(label: string) -> void',
      info: 'Start timer',
    }),
    snippetCompletion("timeEnd('${1:label}')", {
      label: 'timeEnd',
      type: 'method',
      detail: '(label: string) -> void',
      info: 'End timer',
    }),
    snippetCompletion("group('${1:label}')", {
      label: 'group',
      type: 'method',
      detail: '(label?: string) -> void',
      info: 'Start group',
    }),
    {
      label: 'groupEnd',
      type: 'method',
      detail: '() -> void',
      info: 'End group',
    },
    {
      label: 'clear',
      type: 'method',
      detail: '() -> void',
      info: 'Clear console',
    },
  ],
  Math: [
    // Common operations
    snippetCompletion('floor(${1:x})', {
      label: 'floor',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Round down',
    }),
    snippetCompletion('ceil(${1:x})', {
      label: 'ceil',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Round up',
    }),
    snippetCompletion('round(${1:x})', {
      label: 'round',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Round to nearest',
    }),
    snippetCompletion('trunc(${1:x})', {
      label: 'trunc',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Remove decimals',
    }),
    snippetCompletion('abs(${1:x})', {
      label: 'abs',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Absolute value',
    }),
    snippetCompletion('sign(${1:x})', {
      label: 'sign',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Sign of number (-1, 0, 1)',
    }),
    // Min/max
    snippetCompletion('min(${1:a}, ${2:b})', {
      label: 'min',
      type: 'method',
      detail: '(...values: number[]) -> number',
      info: 'Minimum value',
    }),
    snippetCompletion('max(${1:a}, ${2:b})', {
      label: 'max',
      type: 'method',
      detail: '(...values: number[]) -> number',
      info: 'Maximum value',
    }),
    snippetCompletion('clamp(${1:x}, ${2:min}, ${3:max})', {
      label: 'clamp',
      type: 'method',
      detail: '(x, min, max) -> number',
      info: 'Clamp to range (ES2024)',
    }),
    // Powers and roots
    snippetCompletion('pow(${1:base}, ${2:exp})', {
      label: 'pow',
      type: 'method',
      detail: '(base, exp) -> number',
      info: 'Power',
    }),
    snippetCompletion('sqrt(${1:x})', {
      label: 'sqrt',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Square root',
    }),
    snippetCompletion('cbrt(${1:x})', {
      label: 'cbrt',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Cube root',
    }),
    snippetCompletion('hypot(${1:a}, ${2:b})', {
      label: 'hypot',
      type: 'method',
      detail: '(...values: number[]) -> number',
      info: 'Hypotenuse',
    }),
    // Logarithms
    snippetCompletion('log(${1:x})', {
      label: 'log',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Natural log',
    }),
    snippetCompletion('log10(${1:x})', {
      label: 'log10',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Base 10 log',
    }),
    snippetCompletion('log2(${1:x})', {
      label: 'log2',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'Base 2 log',
    }),
    snippetCompletion('exp(${1:x})', {
      label: 'exp',
      type: 'method',
      detail: '(x: number) -> number',
      info: 'e^x',
    }),
    // Trig
    snippetCompletion('sin(${1:x})', {
      label: 'sin',
      type: 'method',
      detail: '(radians: number) -> number',
    }),
    snippetCompletion('cos(${1:x})', {
      label: 'cos',
      type: 'method',
      detail: '(radians: number) -> number',
    }),
    snippetCompletion('tan(${1:x})', {
      label: 'tan',
      type: 'method',
      detail: '(radians: number) -> number',
    }),
    snippetCompletion('atan2(${1:y}, ${2:x})', {
      label: 'atan2',
      type: 'method',
      detail: '(y, x) -> number',
      info: 'Angle in radians',
    }),
    // Random
    {
      label: 'random',
      type: 'method',
      detail: '() -> number',
      info: 'Random 0-1',
    },
    // Constants
    { label: 'PI', type: 'property', detail: 'number', info: '3.14159...' },
    { label: 'E', type: 'property', detail: 'number', info: '2.71828...' },
  ],
  JSON: [
    snippetCompletion('parse(${1:text})', {
      label: 'parse',
      type: 'method',
      detail: '(text: string) -> any',
      info: 'Parse JSON string',
    }),
    snippetCompletion('stringify(${1:value})', {
      label: 'stringify',
      type: 'method',
      detail: '(value: any, replacer?, space?) -> string',
      info: 'Convert to JSON',
    }),
  ],
  Object: [
    snippetCompletion('keys(${1:obj})', {
      label: 'keys',
      type: 'method',
      detail: '(obj: object) -> string[]',
      info: 'Get property names',
    }),
    snippetCompletion('values(${1:obj})', {
      label: 'values',
      type: 'method',
      detail: '(obj: object) -> any[]',
      info: 'Get property values',
    }),
    snippetCompletion('entries(${1:obj})', {
      label: 'entries',
      type: 'method',
      detail: '(obj: object) -> [string, any][]',
      info: 'Get key-value pairs',
    }),
    snippetCompletion('fromEntries(${1:entries})', {
      label: 'fromEntries',
      type: 'method',
      detail: '(entries: [string, any][]) -> object',
      info: 'Create from entries',
    }),
    snippetCompletion('assign(${1:target}, ${2:source})', {
      label: 'assign',
      type: 'method',
      detail: '(target, ...sources) -> object',
      info: 'Copy properties',
    }),
    snippetCompletion('hasOwn(${1:obj}, ${2:prop})', {
      label: 'hasOwn',
      type: 'method',
      detail: '(obj, prop: string) -> boolean',
      info: 'Has own property',
    }),
    snippetCompletion('freeze(${1:obj})', {
      label: 'freeze',
      type: 'method',
      detail: '(obj: T) -> T',
      info: 'Make immutable',
    }),
  ],
  Array: [
    snippetCompletion('isArray(${1:value})', {
      label: 'isArray',
      type: 'method',
      detail: '(value: any) -> boolean',
      info: 'Check if array',
    }),
    snippetCompletion('from(${1:iterable})', {
      label: 'from',
      type: 'method',
      detail: '(iterable, mapFn?) -> any[]',
      info: 'Create from iterable',
    }),
    snippetCompletion('of(${1:items})', {
      label: 'of',
      type: 'method',
      detail: '(...items) -> any[]',
      info: 'Create from arguments',
    }),
  ],
  String: [
    snippetCompletion('fromCharCode(${1:code})', {
      label: 'fromCharCode',
      type: 'method',
      detail: '(...codes: number[]) -> string',
    }),
    snippetCompletion('fromCodePoint(${1:code})', {
      label: 'fromCodePoint',
      type: 'method',
      detail: '(...codes: number[]) -> string',
    }),
  ],
  Number: [
    snippetCompletion('isFinite(${1:value})', {
      label: 'isFinite',
      type: 'method',
      detail: '(value: any) -> boolean',
    }),
    snippetCompletion('isInteger(${1:value})', {
      label: 'isInteger',
      type: 'method',
      detail: '(value: any) -> boolean',
    }),
    snippetCompletion('isNaN(${1:value})', {
      label: 'isNaN',
      type: 'method',
      detail: '(value: any) -> boolean',
    }),
    snippetCompletion('parseFloat(${1:string})', {
      label: 'parseFloat',
      type: 'method',
      detail: '(string: string) -> number',
    }),
    snippetCompletion('parseInt(${1:string})', {
      label: 'parseInt',
      type: 'method',
      detail: '(string: string, radix?) -> number',
    }),
    {
      label: 'MAX_SAFE_INTEGER',
      type: 'property',
      detail: 'number',
      info: '2^53 - 1',
    },
    {
      label: 'MIN_SAFE_INTEGER',
      type: 'property',
      detail: 'number',
      info: '-(2^53 - 1)',
    },
    {
      label: 'EPSILON',
      type: 'property',
      detail: 'number',
      info: 'Smallest difference',
    },
  ],
  Date: [
    {
      label: 'now',
      type: 'method',
      detail: '() -> number',
      info: 'Current timestamp',
    },
    snippetCompletion('parse(${1:dateString})', {
      label: 'parse',
      type: 'method',
      detail: '(dateString: string) -> number',
    }),
    snippetCompletion('UTC(${1:year}, ${2:month})', {
      label: 'UTC',
      type: 'method',
      detail: '(year, month, ...) -> number',
    }),
  ],
  Promise: [
    snippetCompletion('resolve(${1:value})', {
      label: 'resolve',
      type: 'method',
      detail: '(value: T) -> Promise<T>',
    }),
    snippetCompletion('reject(${1:reason})', {
      label: 'reject',
      type: 'method',
      detail: '(reason: any) -> Promise<never>',
    }),
    snippetCompletion('all(${1:promises})', {
      label: 'all',
      type: 'method',
      detail: '(promises: Promise[]) -> Promise<any[]>',
      info: 'Wait for all',
    }),
    snippetCompletion('allSettled(${1:promises})', {
      label: 'allSettled',
      type: 'method',
      detail: '(promises: Promise[]) -> Promise<Result[]>',
      info: 'Wait for all to settle',
    }),
    snippetCompletion('race(${1:promises})', {
      label: 'race',
      type: 'method',
      detail: '(promises: Promise[]) -> Promise<any>',
      info: 'First to resolve/reject',
    }),
    snippetCompletion('any(${1:promises})', {
      label: 'any',
      type: 'method',
      detail: '(promises: Promise[]) -> Promise<any>',
      info: 'First to resolve',
    }),
  ],
}

/**
 * Known global objects that can be introspected for property completion
 * Falls back to runtime introspection if not in CURATED_PROPERTIES
 */
const INTROSPECTABLE_GLOBALS: Record<string, any> = {
  console,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date,
  RegExp,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Promise,
  Reflect,
  Proxy,
  Symbol,
  Error,
  TypeError,
  RangeError,
  SyntaxError,
  ReferenceError,
  ArrayBuffer,
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Intl,
}

/**
 * Get completions for properties of an object
 * Uses curated list if available, falls back to runtime introspection
 */
function getPropertyCompletions(objName: string): CMCompletion[] {
  // Prefer curated completions with proper type info
  if (CURATED_PROPERTIES[objName]) {
    return CURATED_PROPERTIES[objName]
  }

  // Fall back to runtime introspection for uncurated objects
  const obj = INTROSPECTABLE_GLOBALS[objName]
  if (!obj) return []

  const completions: CMCompletion[] = []
  const seen = new Set<string>()

  // Get own properties and prototype chain
  let current = obj
  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      // Skip constructor, private-ish names, and already seen
      if (key === 'constructor' || key.startsWith('_') || seen.has(key)) {
        continue
      }
      seen.add(key)

      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, key)
        const value =
          descriptor?.value ?? (descriptor?.get ? '[getter]' : undefined)
        const valueType = typeof value

        if (valueType === 'function') {
          // Try to get function signature from length
          const fn = value as Function
          const paramCount = fn.length
          const params =
            paramCount > 0
              ? Array.from(
                  { length: paramCount },
                  (_, i) => `arg${i + 1}`
                ).join(', ')
              : ''

          completions.push(
            snippetCompletion(`${key}(${paramCount > 0 ? '${1}' : ''})`, {
              label: key,
              type: 'method',
              detail: `(${params})`,
              boost: key.startsWith('to') ? -1 : 0, // Demote toString, etc.
            })
          )
        } else {
          // Property or constant
          const type =
            valueType === 'number'
              ? 'property'
              : valueType === 'string'
              ? 'property'
              : valueType === 'boolean'
              ? 'property'
              : 'property'

          completions.push({
            label: key,
            type,
            detail: valueType,
          })
        }
      } catch {
        // Some properties may throw on access - skip them
      }
    }
    current = Object.getPrototypeOf(current)
  }

  return completions
}

/**
 * Extract the object name before a dot from source
 * e.g., "console." -> "console", "Math.floor" -> "Math"
 */
function getObjectBeforeDot(source: string, dotPos: number): string | null {
  // Look backwards from the dot to find the identifier
  const before = source.slice(0, dotPos)
  const match = before.match(/(\w+)\s*$/)
  return match ? match[1] : null
}

/**
 * Get a placeholder value for a parameter based on its type info
 * Returns a sensible default that can be used in snippet placeholders
 */
function getPlaceholderForParam(name: string, info: any): string {
  // If there's an explicit default, use it
  if (info.default !== undefined) {
    const def = info.default
    if (typeof def === 'string') return `'${def}'`
    if (typeof def === 'number' || typeof def === 'boolean') return String(def)
    if (def === null) return 'null'
    if (Array.isArray(def)) return '[]'
    if (typeof def === 'object') return '{}'
    return String(def)
  }

  // Otherwise generate based on type
  const kind = info.type?.kind || info.type?.type || 'any'
  switch (kind) {
    case 'string':
      return `'${name}'`
    case 'number':
      return '0'
    case 'boolean':
      return 'true'
    case 'null':
      return 'null'
    case 'array':
      return '[]'
    case 'object':
      return '{}'
    default:
      return name
  }
}

/**
 * Create TJS/AJS completion source
 */
function tjsCompletionSource(config: AutocompleteConfig = {}) {
  return (context: CMCompletionContext): CompletionResult | null => {
    // Get word at cursor
    const word = context.matchBefore(/[\w$]*/)
    if (!word) return null

    const source = context.state.doc.toString()
    const pos = context.pos

    // Check context before cursor
    const lineStart = context.state.doc.lineAt(pos).from
    const lineBefore = source.slice(lineStart, word.from)
    const charBefore = source.slice(Math.max(0, word.from - 1), word.from)

    // Don't complete in the middle of a word unless explicit,
    // BUT always allow completion after a dot (for property access)
    if (word.from === word.to && !context.explicit && charBefore !== '.') {
      return null
    }

    let options: CMCompletion[] = []

    // After . - property completion
    if (charBefore === '.') {
      const before = source.slice(Math.max(0, word.from - 50), word.from)

      // Check for expect() matchers first
      if (/expect\s*\([^)]*\)\s*\.$/.test(before)) {
        options = EXPECT_MATCHERS
      } else {
        // Try to get object name and introspect its properties
        const objName = getObjectBeforeDot(source, word.from - 1)
        if (objName) {
          options = getPropertyCompletions(objName)
        }
      }
    }
    // After : - type context
    else if (/:\s*$/.test(lineBefore)) {
      options = TJS_TYPES
    }
    // After -> - return type context
    else if (/->\s*$/.test(lineBefore)) {
      options = TJS_TYPES
    }
    // General completions
    else {
      options = [
        ...TJS_COMPLETIONS,
        ...RUNTIME_COMPLETIONS,
        ...GLOBAL_COMPLETIONS,
        ...extractFunctions(source),
        ...extractVariables(source, pos),
      ]

      // Add metadata-based completions if available
      const metadata = config.getMetadata?.()
      if (metadata) {
        for (const [name, meta] of Object.entries(metadata)) {
          // Build parameter list with types for display
          const paramEntries = meta.params ? Object.entries(meta.params) : []
          const paramList = paramEntries
            .map(([pName, pInfo]: [string, any]) => {
              const pType = pInfo.type?.kind || pInfo.type?.type || 'any'
              const optional = !pInfo.required
              return optional ? `${pName}?: ${pType}` : `${pName}: ${pType}`
            })
            .join(', ')

          // Build snippet with example values as placeholders
          const snippetParams = paramEntries
            .map(([pName, pInfo]: [string, any], i) => {
              // Use default value or generate placeholder based on type
              const placeholder = getPlaceholderForParam(pName, pInfo)
              return `\${${i + 1}:${placeholder}}`
            })
            .join(', ')

          // Handle both { type: 'string' } and { kind: 'string' } formats
          const returnType = meta.returns?.type || meta.returns?.kind || 'void'
          options.push(
            snippetCompletion(`${name}(${snippetParams})`, {
              label: name,
              type: 'function',
              detail: `(${paramList}) -> ${returnType}`,
              info: meta.description,
              boost: 2, // Boost user-defined functions above globals
            })
          )
        }
      }
    }

    if (options.length === 0) return null

    return {
      from: word.from,
      options,
      validFor: /^[\w$]*$/,
    }
  }
}

/**
 * Create AsyncJS language support for CodeMirror 6
 *
 * @param config Optional configuration
 * @returns Extension array for CodeMirror
 */
export function ajsEditorExtension(
  config: {
    jsx?: boolean
    typescript?: boolean
    autocomplete?: AutocompleteConfig
  } = {}
): Extension {
  return [
    javascript({ jsx: config.jsx, typescript: config.typescript }),
    syntaxHighlighting(defaultHighlightStyle),
    forbiddenHighlighter,
    ajsTheme,
    syntaxHighlighting(ajsHighlightStyle),
    autocompletion({
      override: [tjsCompletionSource(config.autocomplete || {})],
      activateOnTyping: true,
    }),
  ]
}

// Alias for backwards compatibility
export { ajsEditorExtension as ajs }

/**
 * AsyncJS language support wrapped as LanguageSupport
 * Use this if you need access to the language object
 */
export function ajsLanguage(
  config: { jsx?: boolean; typescript?: boolean } = {}
): LanguageSupport {
  const jsLang = javascript({ jsx: config.jsx, typescript: config.typescript })
  return new LanguageSupport(jsLang.language, [
    forbiddenHighlighter,
    ajsTheme,
    syntaxHighlighting(ajsHighlightStyle),
  ])
}

export { FORBIDDEN_KEYWORDS }
