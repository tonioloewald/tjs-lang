/**
 * TJS Documentation Generator
 *
 * Dead simple: walk source in order, emit what you find.
 * - Doc blocks render as markdown
 * - Function signatures render as code blocks
 * - Inline `test 'name' { ... }` blocks render as "Test Cases" section
 *   with `expect(...).toBe(...)` style assertions translated to comments
 *
 * No magic pairing. No attachment logic. The signature IS the docs.
 * Doc blocks are just editorial commentary when you need it.
 */

import { extractTests } from './tests'

/**
 * Compute brace depth at each position in source.
 * Used to filter out constructs inside function bodies.
 */
function computeBraceDepths(source: string): number[] {
  const depths: number[] = []
  let braceDepth = 0
  let inString: string | null = null

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    const prev = i > 0 ? source[i - 1] : ''

    // Handle string literals (skip braces inside strings)
    if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
      inString = ch
    } else if (inString && ch === inString && prev !== '\\') {
      inString = null
    }

    // Track braces only outside strings
    if (!inString) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }

    depths[i] = braceDepth
  }

  return depths
}

export interface DocResult {
  /** Items in document order */
  items: DocItem[]
  /** Rendered markdown */
  markdown: string
}

export type DocItem =
  | { type: 'doc'; content: string }
  | { type: 'function'; name: string; signature: string }

/**
 * Generate documentation from TJS source
 *
 * Walk source in document order. Emit doc blocks and function signatures.
 * Only extracts top-level doc blocks (outside function bodies).
 */
export function generateDocs(source: string): DocResult {
  const items: DocItem[] = []

  // Build brace depth map to identify top-level constructs
  // This filters out doc blocks inside function bodies
  const braceDepthAt = computeBraceDepths(source)

  // Find all doc blocks and functions, sort by position
  const docPattern = /\/\*#([\s\S]*?)\*\//g
  // Match TJS function syntax with return type annotations (:, :?, :!)
  // Return type can be quoted string with spaces (e.g. 'Hello, World!')
  const funcPattern =
    /function\s+(\w+)\s*\(([^)]*)\)\s*(?:(:[?!]?)\s*('[^']*'|"[^"]*"|[^\s{]+))?\s*\{/g

  type Match = { type: 'doc' | 'function'; index: number; data: any }
  const matches: Match[] = []

  let match
  while ((match = docPattern.exec(source)) !== null) {
    // Only include top-level doc blocks (brace depth 0)
    if (braceDepthAt[match.index] !== 0) {
      continue
    }

    // Dedent content
    let content = match[1]
    const lines = content.split('\n')
    const minIndent = lines
      .filter((line) => line.trim().length > 0)
      .reduce((min, line) => {
        const indent = line.match(/^(\s*)/)?.[1].length || 0
        return Math.min(min, indent)
      }, Infinity)

    if (minIndent > 0 && minIndent < Infinity) {
      content = lines.map((line) => line.slice(minIndent)).join('\n')
    }

    matches.push({
      type: 'doc',
      index: match.index,
      data: content.trim(),
    })
  }

  while ((match = funcPattern.exec(source)) !== null) {
    const name = match[1]
    const params = match[2]
    const returnMarker = match[3] || ''
    const returnType = match[4] || ''

    let signature = `function ${name}(${params})`
    if (returnMarker && returnType) {
      signature += `${returnMarker} ${returnType}`
    }

    matches.push({
      type: 'function',
      index: match.index,
      data: { name, signature },
    })
  }

  // Sort by position in source
  matches.sort((a, b) => a.index - b.index)

  // Build items
  for (const m of matches) {
    if (m.type === 'doc') {
      items.push({ type: 'doc', content: m.data })
    } else {
      items.push({
        type: 'function',
        name: m.data.name,
        signature: m.data.signature,
      })
    }
  }

  // Generate markdown
  const markdown = items
    .map((item) => {
      if (item.type === 'doc') {
        return item.content
      } else {
        return `\`\`\`tjs\n${item.signature}\n\`\`\``
      }
    })
    .join('\n\n')

  return { items, markdown }
}

/**
 * Type metadata for a function parameter
 */
export interface ParamTypeInfo {
  type?: { kind: string }
  required?: boolean
  example?: any
}

/**
 * Type metadata for a function
 */
export interface FunctionTypeInfo {
  params?: Record<string, ParamTypeInfo>
  returns?: { kind: string }
}

/**
 * Generate markdown documentation with type metadata
 *
 * Combines source-level doc blocks with runtime type information.
 * Shows everything in document order:
 * - /*# ... *\/ comments render as markdown
 * - Functions render with signature and detailed type info
 *
 * @param source - TJS or TypeScript source code
 * @param types - Type metadata from transpiler (result.types)
 * @returns Formatted markdown documentation
 *
 * @example
 * ```typescript
 * const result = tjs(source)
 * const docs = generateDocsMarkdown(source, result.types)
 * ```
 */
export function generateDocsMarkdown(
  source: string,
  types?: Record<string, FunctionTypeInfo>
): string {
  const docs = generateDocs(source)
  let markdown = ''

  for (const item of docs.items) {
    if (item.type === 'doc') {
      markdown += item.content + '\n\n'
    } else if (item.type === 'function') {
      const info = types?.[item.name]

      markdown += `## ${item.name}\n\n`
      markdown += `\`\`\`tjs\n${item.signature}\n\`\`\`\n\n`

      if (info?.params && Object.keys(info.params).length > 0) {
        markdown += '**Parameters:**\n'
        for (const [paramName, paramInfo] of Object.entries(info.params)) {
          const required = paramInfo.required ? '' : ' *(optional)*'
          const typeStr = paramInfo.type?.kind || 'any'
          const example =
            paramInfo.example !== undefined
              ? ` (e.g. \`${JSON.stringify(paramInfo.example)}\`)`
              : ''
          markdown += `- \`${paramName}\`: ${typeStr}${required}${example}\n`
        }
        markdown += '\n'
      }

      if (info?.returns) {
        markdown += `**Returns:** ${info.returns.kind || 'void'}\n\n`
      }
    }
  }

  // Append test cases as documentation. Each test's description names
  // what it asserts; the body is rendered with expect(...).toBe(...) etc.
  // translated to inline `// → ...` comments. Anonymous tests
  // (auto-named `test 1`, `test 2`, ...) are skipped — they read as
  // smoke tests, not documentation.
  const { tests } = extractTests(source)
  for (const test of tests) {
    if (!test.description) continue
    if (/^test \d+$/.test(test.description)) continue
    markdown += `### ${test.description} (test cases)\n\n`
    markdown += '```tjs\n'
    markdown += prettifyTestBody(test.body).trim() + '\n'
    markdown += '```\n\n'
  }

  return markdown.trim() || '*No documentation available*'
}

/**
 * Translate `expect(actual).matcher(expected)` calls into inline comments
 * for documentation rendering. Other lines (setup, console.log, etc.) are
 * preserved as-is.
 *
 *   expect(x).toBe(y)         → x  // → y
 *   expect(x).toEqual(y)      → x  // ≡ y  (deep equality)
 *   expect(x).toBeTruthy()    → x  // → truthy
 *   expect(x).toBeFalsy()     → x  // → falsy
 *   expect(x).toBeNull()      → x  // → null
 *   expect(x).toBeUndefined() → x  // → undefined
 *   expect(x).toContain(y)    → x  // → contains y
 *   expect(x).toThrow()       → x  // → throws
 *   expect(x).toBeGreaterThan(n) → x  // → > n
 *   expect(x).toBeLessThan(n)    → x  // → < n
 *   expect(x).toBeNaN()       → x  // → NaN
 *
 * Uses balanced-paren scanning so nested calls (`expect(f(a, b)).toBe(c)`)
 * work correctly.
 */
export function prettifyTestBody(body: string): string {
  let i = 0
  let out = ''
  let inStr: string | null = null
  while (i < body.length) {
    const c = body[i]
    const prev = i > 0 ? body[i - 1] : ''
    // Track string-literal state so `"expect(fake).toBe(...)"` inside a
    // string is preserved verbatim.
    if (inStr) {
      out += c
      if (c === inStr && prev !== '\\') inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c
      out += c
      i++
      continue
    }

    if (body.slice(i).startsWith('expect(')) {
      const argStart = i + 'expect('.length
      const argEnd = findMatchingParen(body, argStart)
      if (argEnd > argStart) {
        const after = body.slice(argEnd + 1)
        const matcherMatch = after.match(/^\.(\w+)(\()?/)
        if (matcherMatch && matcherMatch[2] === '(') {
          const matcherStart = argEnd + 1 + matcherMatch[0].length
          const matcherEnd = findMatchingParen(body, matcherStart)
          if (matcherEnd >= matcherStart) {
            const actual = body.slice(argStart, argEnd)
            const matcherName = matcherMatch[1]
            const expected = body.slice(matcherStart, matcherEnd)
            out += renderMatcher(actual, matcherName, expected)
            i = matcherEnd + 1
            continue
          }
        }
      }
    }
    out += c
    i++
  }
  return out
}

/** Find the index of the `)` that matches the open paren at position `open-1`. */
function findMatchingParen(s: string, open: number): number {
  let depth = 1
  let i = open
  let inStr: string | null = null
  while (i < s.length) {
    const c = s[i]
    const prev = i > 0 ? s[i - 1] : ''
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null
    } else {
      if (c === '"' || c === "'" || c === '`') inStr = c
      else if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth === 0) return i
      }
    }
    i++
  }
  return -1
}

function renderMatcher(actual: string, matcher: string, expected: string): string {
  const a = actual.trim()
  const e = expected.trim()
  switch (matcher) {
    case 'toBe':
      return `${a}  // → ${e}`
    case 'toEqual':
      return `${a}  // ≡ ${e}`
    case 'toBeTruthy':
      return `${a}  // → truthy`
    case 'toBeFalsy':
      return `${a}  // → falsy`
    case 'toBeNull':
      return `${a}  // → null`
    case 'toBeUndefined':
      return `${a}  // → undefined`
    case 'toContain':
      return `${a}  // → contains ${e}`
    case 'toThrow':
      return `${a}  // → throws`
    case 'toBeGreaterThan':
      return `${a}  // → > ${e}`
    case 'toBeLessThan':
      return `${a}  // → < ${e}`
    case 'toBeNaN':
      return `${a}  // → NaN`
    default:
      return `${a}  // .${matcher}(${e})`
  }
}
