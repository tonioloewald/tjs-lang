/**
 * TJS Documentation Generator
 *
 * Generates documentation from TJS source:
 * - Function signatures from __tjs metadata
 * - Descriptions from JSDoc comments
 * - Usage examples from inline tests
 *
 * Output formats:
 * - Markdown for human reading
 * - JSON for programmatic use
 */

import { tjs, type TJSTypeInfo } from './index'
import { extractTests, type ExtractedTest } from './tests'
import type { TypeDescriptor } from './types'

export interface FunctionDoc {
  name: string
  description?: string
  params: ParamDoc[]
  returns?: ReturnDoc
  examples: ExampleDoc[]
}

export interface ParamDoc {
  name: string
  type: string
  required: boolean
  description?: string
  default?: any
}

export interface ReturnDoc {
  type: string
  description?: string
}

export interface ExampleDoc {
  description: string
  code: string
}

export interface DocResult {
  functions: FunctionDoc[]
  markdown: string
  json: object
}

/**
 * Generate documentation from TJS source
 */
export function generateDocs(source: string): DocResult {
  // Extract type info via TJS transpiler
  const { types } = tjs(source)

  // Extract tests for examples
  const { tests } = extractTests(source)

  // Build function documentation
  const funcDoc = buildFunctionDoc(types, tests)

  // Generate output formats
  const markdown = generateMarkdown([funcDoc])
  const json = { functions: [funcDoc] }

  return {
    functions: [funcDoc],
    markdown,
    json,
  }
}

/**
 * Build documentation for a function
 */
function buildFunctionDoc(
  types: TJSTypeInfo,
  tests: ExtractedTest[]
): FunctionDoc {
  const params: ParamDoc[] = Object.entries(types.params).map(
    ([name, param]) => ({
      name,
      type: typeToString(param.type),
      required: param.required,
      description: param.description,
      default: param.default,
    })
  )

  const returns: ReturnDoc | undefined = types.returns
    ? {
        type: typeToString(types.returns),
      }
    : undefined

  const examples: ExampleDoc[] = tests.map((t) => ({
    description: t.description,
    code: t.body.trim(),
  }))

  return {
    name: types.name,
    description: types.description,
    params,
    returns,
    examples,
  }
}

/**
 * Convert TypeDescriptor to readable string
 */
function typeToString(type: TypeDescriptor): string {
  switch (type.kind) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'any':
      return 'any'
    case 'array':
      return type.items ? `${typeToString(type.items)}[]` : 'array'
    case 'object': {
      if (!type.shape) return 'object'
      const props = Object.entries(type.shape)
        .map(([k, v]) => `${k}: ${typeToString(v)}`)
        .join(', ')
      return `{ ${props} }`
    }
    case 'union':
      return type.members?.map(typeToString).join(' | ') || 'unknown'
    default:
      return 'unknown'
  }
}

/**
 * Generate Markdown documentation
 */
function generateMarkdown(functions: FunctionDoc[]): string {
  return functions.map(funcToMarkdown).join('\n\n---\n\n')
}

function funcToMarkdown(func: FunctionDoc): string {
  const lines: string[] = []

  // Function signature
  const paramSig = func.params
    .map((p) => {
      const opt = p.required ? '' : '?'
      return `${p.name}${opt}: ${p.type}`
    })
    .join(', ')
  const retSig = func.returns ? ` -> ${func.returns.type}` : ''
  lines.push(`## ${func.name}`)
  lines.push('')
  lines.push('```typescript')
  lines.push(`function ${func.name}(${paramSig})${retSig}`)
  lines.push('```')

  // Description
  if (func.description) {
    lines.push('')
    lines.push(func.description)
  }

  // Parameters
  if (func.params.length > 0) {
    lines.push('')
    lines.push('### Parameters')
    lines.push('')
    for (const param of func.params) {
      const req = param.required ? '**required**' : 'optional'
      const desc = param.description ? ` - ${param.description}` : ''
      const def =
        param.default !== undefined ? ` (default: \`${param.default}\`)` : ''
      lines.push(`- \`${param.name}\`: ${param.type} (${req})${desc}${def}`)
    }
  }

  // Returns
  if (func.returns) {
    lines.push('')
    lines.push('### Returns')
    lines.push('')
    lines.push(`\`${func.returns.type}\``)
  }

  // Examples from tests
  if (func.examples.length > 0) {
    lines.push('')
    lines.push('### Examples')
    for (const ex of func.examples) {
      lines.push('')
      lines.push(`**${ex.description}**`)
      lines.push('')
      lines.push('```javascript')
      lines.push(ex.code)
      lines.push('```')
    }
  }

  return lines.join('\n')
}

/**
 * Questions/Notes:
 *
 * Q1: Multi-function modules?
 *     Current: Single function per source
 *     Could extend to handle multiple exports
 *
 * Q2: Nested type formatting?
 *     Deep objects could get hard to read
 *     Could add collapsible sections or type aliases
 *
 * Q3: Integration with existing docs?
 *     Could output to docs/ folder or integrate with demo site
 */
