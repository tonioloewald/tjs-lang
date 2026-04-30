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
 * Build a per-character boolean indicating whether the position is inside
 * a `/* ... *​/` block comment or `// ... \n` line comment. Used so that
 * class/function patterns don't match prose text inside `/*# ... *​/` doc
 * blocks (e.g. `class Point { ... }` shown as an illustrative snippet).
 */
function computeInComment(source: string): boolean[] {
  const inComment = new Array<boolean>(source.length).fill(false)
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const n = source[i + 1]
    // Skip string literals so // and /* inside them are ignored
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === q) {
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === '/' && n === '/') {
      while (i < source.length && source[i] !== '\n') {
        inComment[i] = true
        i++
      }
      continue
    }
    if (c === '/' && n === '*') {
      const start = i
      i += 2
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) {
        i++
      }
      // include closing `*​/`
      const end = Math.min(source.length, i + 2)
      for (let k = start; k < end; k++) inComment[k] = true
      i = end
      continue
    }
    i++
  }
  return inComment
}

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
  | {
      type: 'class'
      name: string
      extendsName?: string
      members: string[] // constructor / method signatures, no bodies
    }

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
  // Track positions inside /* */ and // comments so we don't extract
  // illustrative `class Foo { ... }` / `function bar() { ... }` text
  // shown in `/*# ... */` doc blocks as real declarations.
  const isInComment = computeInComment(source)

  // Find all doc blocks, functions, and classes; sort by position
  const docPattern = /\/\*#([\s\S]*?)\*\//g
  // Match the START of a function declaration. Params (which can contain
  // nested parens like `fn = (x) => x`) are captured by balanced-paren
  // scanning below, NOT by this regex.
  const funcPattern = /\bfunction\s+(\w+)\s*\(/g
  const classPattern = /\bclass\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g

  type Match = { type: 'doc' | 'function' | 'class'; index: number; data: any }
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
    if (isInComment[match.index]) continue
    if (braceDepthAt[match.index] !== 0) continue
    const name = match[1]
    const parenOpen = match.index + match[0].length - 1 // position of `(`
    const parenClose = findMatchingParen(source, parenOpen + 1)
    if (parenClose === -1) continue
    const params = source.slice(parenOpen + 1, parenClose)
    // Optional return-type annotation between `)` and `{`:
    //   ): T  /  ):? T  /  ):! T
    // T can be: primitive (`0`, `''`), object (`{ x: 0 }`), array (`[0]`),
    // or string literal (`'Hello, World!'`). Use depth-tracking with a
    // "started" flag so the FIRST `{` inside the type opens the type
    // block (not the body) and the `{` AFTER depth returns to 0 is the body.
    let after = parenClose + 1
    let returnAnnotation = ''
    while (after < source.length && /\s/.test(source[after])) after++
    if (source[after] === ':') {
      const annoStart = after
      after++ // past `:`
      let depth = 0
      let inStr: string | null = null
      let started = false
      while (after < source.length) {
        const c = source[after]
        const prev = after > 0 ? source[after - 1] : ''
        if (inStr) {
          if (c === inStr && prev !== '\\') inStr = null
        } else if (c === '"' || c === "'" || c === '`') {
          inStr = c
          started = true
        } else if (c === '{') {
          if (depth === 0 && started) break // body opens here
          depth++
          started = true
        } else if (c === '(' || c === '[') {
          depth++
          started = true
        } else if (c === '}' || c === ')' || c === ']') {
          depth--
        } else if (!/\s/.test(c)) {
          started = true
        }
        after++
      }
      returnAnnotation = source.slice(annoStart, after).trimEnd()
    }
    const signature = `function ${name}(${params})${returnAnnotation}`
    matches.push({
      type: 'function',
      index: match.index,
      data: { name, signature },
    })
  }

  while ((match = classPattern.exec(source)) !== null) {
    if (braceDepthAt[match.index] !== 0) continue
    if (isInComment[match.index]) continue
    const name = match[1]
    const extendsName = match[2] || undefined
    const bodyStart = match.index + match[0].length // just past `{`
    const bodyEnd = findMatchingBrace(source, bodyStart - 1)
    if (bodyEnd === -1) continue
    const body = source.slice(bodyStart, bodyEnd)
    const members = extractClassMembers(body)
    matches.push({
      type: 'class',
      index: match.index,
      data: { name, extendsName, members },
    })
  }

  // Sort by position in source
  matches.sort((a, b) => a.index - b.index)

  // Build items
  for (const m of matches) {
    if (m.type === 'doc') {
      items.push({ type: 'doc', content: m.data })
    } else if (m.type === 'function') {
      items.push({
        type: 'function',
        name: m.data.name,
        signature: m.data.signature,
      })
    } else if (m.type === 'class') {
      items.push({
        type: 'class',
        name: m.data.name,
        extendsName: m.data.extendsName,
        members: m.data.members,
      })
    }
  }

  // Generate markdown
  const markdown = items
    .map((item) => {
      if (item.type === 'doc') return item.content
      if (item.type === 'function') {
        return `\`\`\`tjs\n${item.signature}\n\`\`\``
      }
      // class
      return `\`\`\`tjs\n${formatClassSignature(item)}\n\`\`\``
    })
    .join('\n\n')

  return { items, markdown }
}

/**
 * Format a class as a signature-only block:
 *
 *   class Color extends Hue {
 *     constructor(r: +0, g: +0, b: +0)
 *     constructor(hex: '#000000')
 *     toString()
 *   }
 */
function formatClassSignature(item: {
  name: string
  extendsName?: string
  members: string[]
}): string {
  const head = item.extendsName
    ? `class ${item.name} extends ${item.extendsName} {`
    : `class ${item.name} {`
  if (item.members.length === 0) return `${head}\n}`
  const body = item.members.map((m) => `  ${m}`).join('\n')
  return `${head}\n${body}\n}`
}

/**
 * Find the index of the `}` matching the `{` at position `open`.
 * Returns -1 if no match. Aware of strings and template literals so
 * braces inside them don't confuse the count.
 */
function findMatchingBrace(s: string, open: number): number {
  let depth = 0
  let i = open
  let inStr: string | null = null
  while (i < s.length) {
    const c = s[i]
    const prev = i > 0 ? s[i - 1] : ''
    if (inStr) {
      if (c === inStr && prev !== '\\') inStr = null
    } else {
      if (c === '"' || c === "'" || c === '`') inStr = c
      else if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) return i
      }
    }
    i++
  }
  return -1
}

/**
 * Extract member signatures from a class body. Handles:
 *   - constructors (including multiple)
 *   - regular methods: `name(params) { ... }`
 *   - async / static / get / set modifiers
 *   - private fields with `#` prefix
 *   - return-type annotations: `name(p): ReturnType { ... }`
 *
 * Returns the bare signature without the body, like
 *   `static load(path: '')`
 *   `get magnitude(): 0.0`
 */
function extractClassMembers(body: string): string[] {
  const members: string[] = []
  // Build brace depth WITHIN the body so we only pick top-level members
  const depthInBody = computeBraceDepths(body)
  // Match: optional modifier(s) + name + `(`
  // Modifiers can chain: `static async`, `static get`
  const memberPattern =
    /(?:^|\n)\s*((?:(?:static|async|get|set)\s+)*)(constructor|#?\w+)\s*\(/g
  let match
  while ((match = memberPattern.exec(body)) !== null) {
    // Skip if not at depth 0 of the body (i.e., inside a method body)
    if (depthInBody[match.index] !== 0) continue
    const modifiers = match[1].trim()
    const name = match[2]
    const parenOpen = match.index + match[0].length - 1
    const parenClose = findMatchingParen(body, parenOpen + 1)
    if (parenClose === -1) continue
    const params = body.slice(parenOpen, parenClose + 1)
    // Optional return-type annotation between `)` and `{`
    let after = parenClose + 1
    let returnAnnotation = ''
    while (after < body.length && /\s/.test(body[after])) after++
    if (body[after] === ':') {
      // Capture `: <type>` or `:?<type>` or `:!<type>` — stop at `{`
      const annoStart = after
      while (after < body.length && body[after] !== '{') after++
      returnAnnotation = body.slice(annoStart, after).trimEnd()
    }
    const prefix = modifiers ? `${modifiers} ` : ''
    members.push(`${prefix}${name}${params}${returnAnnotation}`)
  }
  return members
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
    } else if (item.type === 'class') {
      markdown += `## ${item.name}\n\n`
      const head = item.extendsName
        ? `class ${item.name} extends ${item.extendsName} {`
        : `class ${item.name} {`
      const body =
        item.members.length === 0
          ? ''
          : '\n' + item.members.map((m) => `  ${m}`).join('\n') + '\n'
      markdown += '```tjs\n' + head + body + '}\n```\n\n'
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
