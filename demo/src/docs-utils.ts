/**
 * Shared documentation generation for TJS and TS playgrounds
 */

import { generateDocs } from '../../src/lang/docs'

/**
 * Generate markdown documentation from transpiler result and source
 */
export function generateDocsMarkdown(
  source: string,
  types: Record<string, any> | undefined
): string {
  let markdown = ''

  // If we have type metadata, use it (descriptions already include /*# comments)
  if (types && Object.keys(types).length > 0) {
    // Collect descriptions that are attached to functions
    const attachedDescriptions = new Set<string>()
    for (const info of Object.values(types)) {
      if (info.description) {
        attachedDescriptions.add(info.description)
      }
    }

    // Add doc blocks that are NOT attached to functions (module-level docs)
    const docBlocks = generateDocs(source)
    for (const item of docBlocks.items) {
      if (item.type === 'doc' && !attachedDescriptions.has(item.content)) {
        markdown += item.content + '\n\n'
      }
    }

    // Add function documentation
    for (const [name, info] of Object.entries(types)) {
      markdown += `## ${name}\n\n`

      if (info.description) {
        markdown += `${info.description}\n\n`
      }

      if (info.params && Object.keys(info.params).length > 0) {
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

      if (info.returns) {
        markdown += `**Returns:** ${info.returns.kind || 'void'}\n\n`
      }
    }
  } else {
    // No type metadata - just show doc blocks
    const docBlocks = generateDocs(source)
    for (const item of docBlocks.items) {
      if (item.type === 'doc') {
        markdown += item.content + '\n\n'
      }
    }
  }

  return markdown.trim() || '*No documentation available*'
}
