/**
 * TJS Autocompletion Provider
 *
 * Provides context-aware completions for the TJS playground.
 * Uses __tjs metadata for rich type information.
 */

export interface Completion {
  /** The text to insert */
  label: string
  /** What kind of completion (function, variable, property, keyword) */
  kind: 'function' | 'variable' | 'property' | 'keyword' | 'type'
  /** Description shown in autocomplete popup */
  detail?: string
  /** Full documentation (markdown supported) */
  documentation?: string
  /** Text to insert (if different from label) */
  insertText?: string
  /** Snippet with tab stops: ${1:param} */
  snippet?: string
}

export interface CompletionContext {
  /** Source code being edited */
  source: string
  /** Cursor position (character offset) */
  position: number
  /** Parsed __tjs metadata from current file */
  metadata?: Record<string, TJSMetadata>
  /** Imported module metadata */
  imports?: Record<string, Record<string, TJSMetadata>>
}

export interface TJSMetadata {
  params?: Record<string, ParamInfo>
  returns?: { type: string }
  description?: string
  typeParams?: Record<string, { constraint?: string; default?: string }>
}

interface ParamInfo {
  type: string
  required: boolean
  default?: any
  description?: string
}

// TJS keywords
const TJS_KEYWORDS: Completion[] = [
  { label: 'function', kind: 'keyword', detail: 'Declare a function' },
  { label: 'const', kind: 'keyword', detail: 'Declare a constant' },
  { label: 'let', kind: 'keyword', detail: 'Declare a variable' },
  { label: 'if', kind: 'keyword', detail: 'Conditional statement' },
  { label: 'else', kind: 'keyword', detail: 'Else branch' },
  { label: 'while', kind: 'keyword', detail: 'While loop' },
  { label: 'for', kind: 'keyword', detail: 'For loop' },
  { label: 'return', kind: 'keyword', detail: 'Return from function' },
  { label: 'try', kind: 'keyword', detail: 'Try block' },
  { label: 'catch', kind: 'keyword', detail: 'Catch block' },
  { label: 'async', kind: 'keyword', detail: 'Async function' },
  { label: 'await', kind: 'keyword', detail: 'Await promise' },
  { label: 'import', kind: 'keyword', detail: 'Import module' },
  { label: 'export', kind: 'keyword', detail: 'Export declaration' },
  {
    label: 'test',
    kind: 'keyword',
    detail: 'Inline test block',
    snippet: "test('${1:description}') {\n  ${2:// test code}\n}",
  },
  {
    label: 'mock',
    kind: 'keyword',
    detail: 'Mock setup block',
    snippet: 'mock {\n  ${1:// setup code}\n}',
  },
  {
    label: 'unsafe',
    kind: 'keyword',
    detail: 'Skip type validation',
    snippet: 'unsafe {\n  ${1:// unvalidated code}\n}',
  },
]

// TJS type examples
const TJS_TYPES: Completion[] = [
  { label: "''", kind: 'type', detail: 'String type', insertText: "''" },
  { label: '0', kind: 'type', detail: 'Number type', insertText: '0' },
  { label: 'true', kind: 'type', detail: 'Boolean type', insertText: 'true' },
  { label: 'null', kind: 'type', detail: 'Null type', insertText: 'null' },
  {
    label: 'undefined',
    kind: 'type',
    detail: 'Undefined type',
    insertText: 'undefined',
  },
  {
    label: "['']",
    kind: 'type',
    detail: 'Array of strings',
    insertText: "['']",
  },
  { label: '[0]', kind: 'type', detail: 'Array of numbers', insertText: '[0]' },
  { label: '{}', kind: 'type', detail: 'Object type', insertText: '{}' },
  { label: 'any', kind: 'type', detail: 'Any type', insertText: 'any' },
]

// Runtime globals
const RUNTIME_COMPLETIONS: Completion[] = [
  {
    label: 'isError',
    kind: 'function',
    detail: '(value: any) -> boolean',
    documentation: 'Check if a value is a TJS error',
    snippet: 'isError(${1:value})',
  },
  {
    label: 'error',
    kind: 'function',
    detail: '(message: string, details?: object) -> TJSError',
    documentation: 'Create a TJS error object',
    snippet: "error('${1:message}')",
  },
  {
    label: 'typeOf',
    kind: 'function',
    detail: '(value: any) -> string',
    documentation: 'Get type name (fixed typeof - handles null, arrays)',
    snippet: 'typeOf(${1:value})',
  },
  {
    label: 'wrap',
    kind: 'function',
    detail: '(fn: Function, meta: TJSMeta) -> Function',
    documentation: 'Wrap function with runtime type validation',
    snippet: 'wrap(${1:fn}, ${2:meta})',
  },
  {
    label: 'expect',
    kind: 'function',
    detail: '(actual: any) -> Matchers',
    documentation: 'Test assertion (in test blocks)',
    snippet: 'expect(${1:actual})',
  },
]

// Common assertion matchers
const EXPECT_MATCHERS: Completion[] = [
  {
    label: 'toBe',
    kind: 'function',
    detail: '(expected: any) -> void',
    documentation: 'Strict equality check (===)',
    snippet: 'toBe(${1:expected})',
  },
  {
    label: 'toEqual',
    kind: 'function',
    detail: '(expected: any) -> void',
    documentation: 'Deep equality check',
    snippet: 'toEqual(${1:expected})',
  },
  {
    label: 'toContain',
    kind: 'function',
    detail: '(item: any) -> void',
    documentation: 'Array/string contains check',
    snippet: 'toContain(${1:item})',
  },
  {
    label: 'toThrow',
    kind: 'function',
    detail: '(message?: string) -> void',
    documentation: 'Check that function throws',
    snippet: 'toThrow(${1:message})',
  },
  {
    label: 'toBeTruthy',
    kind: 'function',
    detail: '() -> void',
    documentation: 'Check value is truthy',
  },
  {
    label: 'toBeFalsy',
    kind: 'function',
    detail: '() -> void',
    documentation: 'Check value is falsy',
  },
  {
    label: 'toBeNull',
    kind: 'function',
    detail: '() -> void',
    documentation: 'Check value is null',
  },
  {
    label: 'toBeUndefined',
    kind: 'function',
    detail: '() -> void',
    documentation: 'Check value is undefined',
  },
]

/**
 * Get the word being typed at the cursor position
 */
function getWordAtPosition(
  source: string,
  position: number
): { word: string; start: number } {
  let start = position
  while (start > 0 && /[\w$]/.test(source[start - 1])) {
    start--
  }
  return {
    word: source.slice(start, position),
    start,
  }
}

/**
 * Get context around cursor (what's before the word)
 */
function getContextBefore(source: string, start: number): string {
  // Look back for context (dot, opening paren, etc.)
  let contextStart = start - 1
  while (contextStart >= 0 && /\s/.test(source[contextStart])) {
    contextStart--
  }

  // Get the previous 50 chars for context
  const contextEnd = contextStart + 1
  const contextBegin = Math.max(0, contextEnd - 50)
  return source.slice(contextBegin, contextEnd)
}

/**
 * Check if we're inside a test block
 */
function isInTestBlock(source: string, position: number): boolean {
  // Simple heuristic: look for unmatched `test(` before position
  const before = source.slice(0, position)
  const testMatches = before.match(/test\s*\([^)]*\)\s*\{/g) || []
  const closeBraces = (before.match(/\}/g) || []).length

  // Very rough: if we have more test opens than closes, we're in a test
  return testMatches.length > 0
}

/**
 * Extract function names from source
 */
function extractFunctions(source: string): Completion[] {
  const completions: Completion[] = []
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)/g

  let match
  while ((match = funcRegex.exec(source)) !== null) {
    const [, name, params] = match
    completions.push({
      label: name,
      kind: 'function',
      detail: `(${params})`,
      snippet: `${name}(${params ? '${1}' : ''})`,
    })
  }

  return completions
}

/**
 * Extract variable names from source
 */
function extractVariables(source: string, position: number): Completion[] {
  const completions: Completion[] = []
  const before = source.slice(0, position)

  // Match const/let declarations
  const varRegex = /(?:const|let)\s+(\w+)\s*=/g
  let match
  while ((match = varRegex.exec(before)) !== null) {
    completions.push({
      label: match[1],
      kind: 'variable',
    })
  }

  return completions
}

/**
 * Build completions from __tjs metadata
 */
function completionsFromMetadata(
  metadata: Record<string, TJSMetadata>
): Completion[] {
  const completions: Completion[] = []

  for (const [name, meta] of Object.entries(metadata)) {
    const params = meta.params ? Object.keys(meta.params).join(', ') : ''
    const returnType = meta.returns?.type || 'void'

    completions.push({
      label: name,
      kind: 'function',
      detail: `(${params}) -> ${returnType}`,
      documentation: meta.description,
      snippet: params
        ? `${name}(${Object.keys(meta.params || {})
            .map((p, i) => `\${${i + 1}:${p}}`)
            .join(', ')})`
        : `${name}()`,
    })
  }

  return completions
}

/**
 * Get autocompletions for the current context
 */
export function getCompletions(ctx: CompletionContext): Completion[] {
  const { source, position, metadata, imports } = ctx
  const { word, start } = getWordAtPosition(source, position)
  const contextBefore = getContextBefore(source, start)

  let completions: Completion[] = []

  // After a dot - property/method access
  if (contextBefore.endsWith('.')) {
    // Check if it's expect().
    if (/expect\s*\([^)]*\)\s*\.$/.test(contextBefore)) {
      completions = [...EXPECT_MATCHERS]
    }
    // Could add more dot-completion contexts here
  }
  // After : in function params - type context
  else if (/:\s*$/.test(contextBefore)) {
    completions = [...TJS_TYPES]
  }
  // After -> return type
  else if (/->\s*$/.test(contextBefore)) {
    completions = [...TJS_TYPES]
  }
  // General completions
  else {
    completions = [
      ...TJS_KEYWORDS,
      ...RUNTIME_COMPLETIONS,
      ...extractFunctions(source),
      ...extractVariables(source, position),
    ]

    // Add metadata-based completions
    if (metadata) {
      completions.push(...completionsFromMetadata(metadata))
    }

    // Add import-based completions
    if (imports) {
      for (const [moduleName, moduleMeta] of Object.entries(imports)) {
        completions.push(...completionsFromMetadata(moduleMeta))
      }
    }

    // Add test-specific completions if in test block
    if (isInTestBlock(source, position)) {
      completions.push({
        label: 'expect',
        kind: 'function',
        detail: '(actual: any) -> Matchers',
        documentation: 'Create test assertion',
        snippet: 'expect(${1:actual}).toBe(${2:expected})',
      })
    }
  }

  // Filter by prefix
  if (word) {
    const lowerWord = word.toLowerCase()
    completions = completions.filter((c) =>
      c.label.toLowerCase().startsWith(lowerWord)
    )
  }

  // Sort: exact match first, then by kind, then alphabetically
  completions.sort((a, b) => {
    // Exact match first
    if (a.label === word) return -1
    if (b.label === word) return 1

    // Then by kind priority
    const kindPriority: Record<string, number> = {
      function: 0,
      variable: 1,
      property: 2,
      keyword: 3,
      type: 4,
    }
    const aPriority = kindPriority[a.kind] ?? 5
    const bPriority = kindPriority[b.kind] ?? 5
    if (aPriority !== bPriority) return aPriority - bPriority

    // Then alphabetically
    return a.label.localeCompare(b.label)
  })

  return completions
}

/**
 * Get signature help for function calls
 */
export function getSignatureHelp(
  ctx: CompletionContext
): { signature: string; activeParam: number; params: string[] } | null {
  const { source, position, metadata } = ctx

  // Find the function call we're in
  const before = source.slice(0, position)
  const callMatch = before.match(/(\w+)\s*\(([^)]*)$/)

  if (!callMatch) return null

  const [, funcName, argsSoFar] = callMatch

  // Count commas to determine active parameter
  const activeParam = (argsSoFar.match(/,/g) || []).length

  // Look up function metadata
  const meta = metadata?.[funcName]
  if (meta?.params) {
    const params = Object.entries(meta.params).map(([name, info]) => {
      const req = info.required ? '' : '?'
      return `${name}${req}: ${info.type}`
    })

    return {
      signature: `${funcName}(${params.join(', ')})`,
      activeParam,
      params,
    }
  }

  // Check runtime functions
  const runtimeFunc = RUNTIME_COMPLETIONS.find((c) => c.label === funcName)
  if (runtimeFunc?.detail) {
    return {
      signature: `${funcName}${runtimeFunc.detail}`,
      activeParam,
      params: [],
    }
  }

  return null
}
