/**
 * TJS Documentation Generator
 *
 * Dead simple: walk source in order, emit what you find.
 * - Doc blocks render as markdown
 * - Function signatures render as code blocks
 *
 * No magic pairing. No attachment logic. The signature IS the docs.
 * Doc blocks are just editorial commentary when you need it.
 */

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
  // Match both TJS (-> returnType) and TypeScript (: returnType) function syntax
  // Return type can be quoted string with spaces (e.g. 'Hello, World!')
  const funcPattern =
    /function\s+(\w+)\s*\(([^)]*)\)\s*(?:(-[>?!])\s*('[^']*'|"[^"]*"|[^\s{]+)|:\s*(\w+))?\s*\{/g

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
    const tjsReturnType = match[4] || ''
    const tsReturnType = match[5] || ''

    let signature = `function ${name}(${params})`
    if (returnMarker) {
      signature += ` ${returnMarker} ${tjsReturnType}`
    } else if (tsReturnType) {
      signature += `: ${tsReturnType}`
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

  return markdown.trim() || '*No documentation available*'
}
