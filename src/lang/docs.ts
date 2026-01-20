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
 */
export function generateDocs(source: string): DocResult {
  const items: DocItem[] = []

  // Find all doc blocks and functions, sort by position
  const docPattern = /\/\*#([\s\S]*?)\*\//g
  const funcPattern =
    /function\s+(\w+)\s*\(([^)]*)\)\s*(?:(-[>?!])\s*([^\s{]+))?\s*\{/g

  type Match = { type: 'doc' | 'function'; index: number; data: any }
  const matches: Match[] = []

  let match
  while ((match = docPattern.exec(source)) !== null) {
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

    const signature = `function ${name}(${params})${
      returnMarker ? ` ${returnMarker} ${returnType}` : ''
    }`

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
