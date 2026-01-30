/**
 * Shared documentation generation for TJS and TS playgrounds
 *
 * Shows everything in document order:
 * - /*# ... *\/ comments render as markdown
 * - Functions render with signature and type info
 */

import { generateDocs } from '../../src/lang/docs'

/**
 * Generate markdown documentation from transpiler result and source
 *
 * Walks source in document order, showing doc blocks and function signatures
 * with type metadata where available.
 */
export function generateDocsMarkdown(
  source: string,
  types: Record<string, any> | undefined
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
        for (const [paramName, paramInfo] of Object.entries(
          info.params
        ) as any) {
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
