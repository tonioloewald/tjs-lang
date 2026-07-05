/**
 * TJS to .d.ts Emitter
 *
 * Generates TypeScript declaration files from TJS transpilation results.
 * Allows TypeScript consumers to use TJS-authored libraries with full
 * type information for functions, and helpful `any`-based stubs for
 * classes, generics, and predicate types.
 *
 * Design principle: emit enough structure for autocomplete/tooltips
 * (parameter names, object shapes) but lean on `any` where TJS types
 * can't be faithfully expressed in TS (predicate types, generics,
 * class instances). This gives developers IDE hints without false
 * lint errors from types that don't fully match.
 *
 * Handles:
 *   - Exported functions → full param/return types from TJSTypeInfo
 *   - Exported classes → callable function stub with constructor params, returns any
 *   - Exported Type declarations → type guard function stubs
 *   - Exported Generic declarations → factory function stubs
 *   - Re-exports via `export { Name }` syntax
 */

import type { TypeDescriptor } from '../types'
import type { TJSTranspileResult, TJSTypeInfo } from './js'

/**
 * Convert a TypeDescriptor to a TypeScript type string.
 *
 * Maps TJS's example-inferred types to the closest TS equivalents:
 *   integer / non-negative-integer → number (TS has no integer type)
 *   string / number / boolean / null / undefined / any → themselves
 *   array + items → T[]
 *   object + shape → { key: Type; ... }
 *   union + members → T1 | T2
 *   nullable → T | null
 */
export function typeDescriptorToTS(td: TypeDescriptor): string {
  let base: string

  switch (td.kind) {
    case 'string':
      base = 'string'
      break
    case 'number':
    case 'integer':
    case 'non-negative-integer':
      base = 'number'
      break
    case 'boolean':
      base = 'boolean'
      break
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'any':
      base = 'any'
      break
    case 'array':
      if (td.items) {
        const inner = typeDescriptorToTS(td.items)
        // Wrap union types in parens for array: (A | B)[]
        base = inner.includes('|') ? `(${inner})[]` : `${inner}[]`
      } else {
        base = 'any[]'
      }
      break
    case 'object':
      if (td.shape && Object.keys(td.shape).length > 0) {
        const fields = Object.entries(td.shape)
          .map(([k, v]) => `${k}: ${typeDescriptorToTS(v)}`)
          .join('; ')
        base = `{ ${fields} }`
      } else {
        base = 'Record<string, any>'
      }
      break
    case 'union':
      if (td.members && td.members.length > 0) {
        return td.members.map(typeDescriptorToTS).join(' | ')
      }
      base = 'any'
      break
    case 'function': {
      const params = td.params ?? []
      const returns = td.returns ? typeDescriptorToTS(td.returns) : 'any'
      const args = params
        .map((p) => `${p.name}: ${typeDescriptorToTS(p.type)}`)
        .join(', ')
      base = `(${args}) => ${returns}`
      break
    }
    default:
      base = 'any'
  }

  if (td.nullable) {
    return `${base} | null`
  }
  return base
}

/**
 * Generate a function declaration line for .d.ts
 */
function functionDeclToTS(
  name: string,
  info: TJSTypeInfo,
  exported: boolean,
  isDefault: boolean
): string {
  // DTS optionality is NOT the runtime `required` flag. Runtime `required` is a
  // *contract* check: a bare (untyped) JS param is wild-west — `required:false`
  // so the runtime doesn't reject omitting it — but it's still a required
  // *position* in the signature, not an optional *contract*. A param is emitted
  // optional only if (a) it's a DELIBERATE optional — a default value or `?`
  // marker, both of which set `default` (a bare param has no `default` at all) —
  // and (b) no required param follows it (TS forbids an optional param before a
  // required one; ts1016). Deriving optionality from `!required` leaked wild-west
  // omittability into the dts and produced INVALID TS (#11).
  const entries = Object.entries(info.params)
  const optionalFlags: boolean[] = new Array(entries.length)
  let requiredFollows = false
  for (let i = entries.length - 1; i >= 0; i--) {
    const p = entries[i][1] as (typeof entries)[number][1] & {
      default?: unknown
    }
    const deliberateOptional = !p.required && p.default !== undefined
    optionalFlags[i] = deliberateOptional && !requiredFollows
    if (!optionalFlags[i]) requiredFollows = true
  }
  const params = entries
    .map(([pName, p], i) => {
      const tsType = typeDescriptorToTS(p.type)
      return optionalFlags[i] ? `${pName}?: ${tsType}` : `${pName}: ${tsType}`
    })
    .join(', ')

  const returnType = info.returns ? typeDescriptorToTS(info.returns) : 'any'
  const prefix = exported
    ? isDefault
      ? 'export default function'
      : 'export declare function'
    : 'declare function'

  return `${prefix} ${name}(${params}): ${returnType};`
}

export interface GenerateDTSOptions {
  /** Module name for ambient declarations (omit for module-mode .d.ts) */
  moduleName?: string
}

/** Info about a name detected as exported */
interface ExportInfo {
  exported: boolean
  isDefault: boolean
}

/**
 * Detect which top-level names are exported in the source.
 *
 * Returns a map of name → { exported, isDefault }.
 * Scans the original TJS source for export keywords.
 */
function detectExports(source: string): Map<string, ExportInfo> {
  const result = new Map<string, ExportInfo>()
  let m

  // export function name / export default function name
  const funcRe = /^[ \t]*export\s+(default\s+)?function\s+(\w+)/gm
  while ((m = funcRe.exec(source)) !== null) {
    result.set(m[2], { exported: true, isDefault: !!m[1] })
  }

  // export class name / export default class name
  const classRe = /^[ \t]*export\s+(default\s+)?class\s+(\w+)/gm
  while ((m = classRe.exec(source)) !== null) {
    result.set(m[2], { exported: true, isDefault: !!m[1] })
  }

  // export const/let/var name
  const varRe = /^[ \t]*export\s+(default\s+)?(?:const|let|var)\s+(\w+)/gm
  while ((m = varRe.exec(source)) !== null) {
    result.set(m[2], { exported: true, isDefault: !!m[1] })
  }

  // export Type Name
  const typeRe = /^[ \t]*export\s+Type\s+(\w+)/gm
  while ((m = typeRe.exec(source)) !== null) {
    result.set(m[1], { exported: true, isDefault: false })
  }

  // export Generic Name<...>
  const genericRe = /^[ \t]*export\s+Generic\s+(\w+)/gm
  while ((m = genericRe.exec(source)) !== null) {
    result.set(m[1], { exported: true, isDefault: false })
  }

  // export FunctionPredicate Name
  const fpRe = /^[ \t]*export\s+FunctionPredicate\s+(\w+)/gm
  while ((m = fpRe.exec(source)) !== null) {
    result.set(m[1], { exported: true, isDefault: false })
  }

  // export { Name, Name2, ... } — re-export form
  const reExportRe = /^[ \t]*export\s*\{([^}]+)\}/gm
  while ((m = reExportRe.exec(source)) !== null) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/))
    for (const parts of names) {
      const exportedName = parts.length > 1 ? parts[1] : parts[0]
      if (exportedName && /^\w+$/.test(exportedName)) {
        result.set(exportedName, { exported: true, isDefault: false })
      }
    }
  }

  return result
}

/** Info about a FunctionPredicate declaration */
interface FunctionPredicateInfo {
  params: { name: string; example: string }[]
  returns?: string
  typeParams?: string[]
}

/** Detect FunctionPredicate declarations and extract their param/return specs */
function detectFunctionPredicates(
  source: string
): Map<string, FunctionPredicateInfo> {
  const result = new Map<string, FunctionPredicateInfo>()

  // Block form: FunctionPredicate Name { ... } or FunctionPredicate Name<T> { ... }
  const blockRe =
    /^[ \t]*(?:export\s+)?FunctionPredicate\s+(\w+)\s*(?:<([^>]+)>)?\s*\{/gm
  let m
  while ((m = blockRe.exec(source)) !== null) {
    const name = m[1]
    const typeParamsRaw = m[2] // undefined if no <...>
    const blockStart = m.index + m[0].length - 1

    // Find matching closing brace
    let depth = 1
    let i = blockStart + 1
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const body = source.slice(blockStart + 1, i - 1)

    // Parse type params if present
    let typeParams: string[] | undefined
    if (typeParamsRaw) {
      typeParams = typeParamsRaw.split(',').map((tp) => tp.trim())
    }

    // Extract params object: params: { key: value, ... }
    const params: FunctionPredicateInfo['params'] = []
    const paramsMatch = body.match(/params\s*:\s*\{([^}]*)\}/)
    if (paramsMatch) {
      const paramsStr = paramsMatch[1]
      const paramEntries = splitParams(paramsStr)
      for (const entry of paramEntries) {
        const kv = entry.match(/^(\w+)\s*:\s*(.+)$/)
        if (kv) {
          params.push({ name: kv[1], example: kv[2].trim() })
        }
      }
    }

    // Extract returns value
    let returns: string | undefined
    const returnsMatch = body.match(/returns\s*:\s*(.+?)(?:\n|$)/)
    if (returnsMatch) {
      returns = returnsMatch[1].trim()
    }

    result.set(name, { params, returns, typeParams })
  }

  return result
}

/** Info about a class extracted from source */
interface ClassInfo {
  name: string
  constructorParams: string // raw param string, e.g. "x: 0.0, y: 0.0"
  methods: { name: string; params: string; returnType: string | null }[]
}

/**
 * Detect class declarations and extract constructor param names/types.
 * Scans original TJS source (before preprocessing).
 */
function detectClasses(source: string): Map<string, ClassInfo> {
  const result = new Map<string, ClassInfo>()

  // Find class declarations
  const classRe =
    /^[ \t]*(?:export\s+(?:default\s+)?)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/gm
  let m
  while ((m = classRe.exec(source)) !== null) {
    const className = m[1]
    const classBodyStart = m.index + m[0].length - 1

    // Find matching closing brace
    let depth = 1
    let i = classBodyStart + 1
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const classBody = source.slice(classBodyStart + 1, i - 1)

    // Extract constructor params (handle nested parens/braces in param types)
    const ctorStart = classBody.indexOf('constructor')
    let ctorParams = ''
    if (ctorStart !== -1) {
      const parenStart = classBody.indexOf('(', ctorStart)
      if (parenStart !== -1) {
        let depth = 1
        let j = parenStart + 1
        while (j < classBody.length && depth > 0) {
          if (classBody[j] === '(') depth++
          else if (classBody[j] === ')') depth--
          j++
        }
        ctorParams = classBody.slice(parenStart + 1, j - 1).trim()
      }
    }

    // Extract methods at class body level (brace depth 0 within classBody)
    // Must skip method implementations to avoid matching if(), for(), etc.
    const methods: ClassInfo['methods'] = []
    {
      let pos = 0
      let bodyDepth = 0

      while (pos < classBody.length) {
        const ch = classBody[pos]

        // Track brace depth — only look for methods at depth 0
        if (ch === '{') {
          bodyDepth++
          pos++
          continue
        }
        if (ch === '}') {
          bodyDepth--
          pos++
          continue
        }

        // Only match method declarations at class body level (depth 0)
        if (bodyDepth === 0) {
          const methodMatch = classBody.slice(pos).match(/^(\w+)\s*\(/)
          if (methodMatch) {
            const name = methodMatch[1]
            if (name === 'constructor' || name === 'get' || name === 'set') {
              // Skip past the keyword to avoid re-matching a suffix
              pos += name.length
              continue
            } else {
              // Find matching close paren
              const parenStart = pos + methodMatch[0].length - 1
              let depth = 1
              let j = parenStart + 1
              while (j < classBody.length && depth > 0) {
                if (classBody[j] === '(') depth++
                else if (classBody[j] === ')') depth--
                j++
              }
              const params = classBody.slice(parenStart + 1, j - 1).trim()

              // Check for return type annotation: -> Type
              const afterParen = classBody.slice(j).match(/^\s*->\s*(.+?)\s*\{/)
              const returnType = afterParen ? afterParen[1].trim() : null

              methods.push({ name, params, returnType })
              pos = j
              continue
            }
          }
        }

        pos++
      }
    }

    result.set(className, {
      name: className,
      constructorParams: ctorParams,
      methods,
    })
  }

  return result
}

/**
 * Split a param string on commas, respecting nested braces/brackets.
 * "x: 0.0, y: { a: 1, b: 2 }" → ["x: 0.0", "y: { a: 1, b: 2 }"]
 */
function splitParams(paramStr: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ''
  for (const ch of paramStr) {
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--

    if (ch === ',' && depth === 0) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) result.push(current.trim())
  return result
}

/**
 * Parse a TJS constructor/method param string into TS param declarations.
 * Input:  "x: 0.0, y: 0.0"  or  "name: '', age: 0"
 * Output: "x: number, y: number"  or  "name: string, age: number"
 *
 * Uses `any` for anything we can't confidently parse.
 */
function tjsParamsToTS(paramStr: string): string {
  if (!paramStr.trim()) return ''

  return splitParams(paramStr)
    .map((trimmed) => {
      // name: value (required) or name = value (optional)
      const colonMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/)
      if (colonMatch) {
        const name = colonMatch[1]
        const tsType = inferTSTypeFromExample(colonMatch[2].trim())
        return `${name}: ${tsType}`
      }
      const eqMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
      if (eqMatch) {
        const name = eqMatch[1]
        const tsType = inferTSTypeFromExample(eqMatch[2].trim())
        return `${name}?: ${tsType}`
      }
      // Destructured or complex — fall back to any
      if (trimmed.startsWith('{')) return `options: any`
      return `${trimmed}: any`
    })
    .join(', ')
}

/** Detect Type declarations and their example values */
function detectTypeDeclarations(source: string): Map<string, string> {
  const result = new Map<string, string>()
  let m

  // Type Name = <value>  (assignment form)
  const assignRe = /^[ \t]*(?:export\s+)?Type\s+(\w+)\s*=\s*(.+)$/gm
  while ((m = assignRe.exec(source)) !== null) {
    result.set(m[1], m[2].trim())
  }

  // Type Name <value>  (simple form, not block)
  const simpleRe = /^[ \t]*(?:export\s+)?Type\s+(\w+)\s+([^{=].*)$/gm
  while ((m = simpleRe.exec(source)) !== null) {
    if (!result.has(m[1])) {
      result.set(m[1], m[2].trim())
    }
  }

  // Block: Type Name { ... example: <value> ... }
  const blockRe =
    /^[ \t]*(?:export\s+)?Type\s+(\w+)\s*\{[^}]*example\s*:\s*(.+?)(?:\n|\s*[,}])/gm
  while ((m = blockRe.exec(source)) !== null) {
    result.set(m[1], m[2].trim())
  }

  // Block with TS type body: Type Name { // TS: original type }
  const tsBodyRe =
    /^[ \t]*(?:export\s+)?Type\s+(\w+)\s*\{[^}]*\/\/\s*TS:\s*(.+?)(?:\n|\s*\})/gm
  while ((m = tsBodyRe.exec(source)) !== null) {
    if (!result.has(m[1])) {
      result.set(m[1], `__ts__:${m[2].trim()}`) // prefix marks TS passthrough
    }
  }

  // Empty block: Type Name {} (no example — degraded type, emit as any)
  const emptyBlockRe = /^[ \t]*(?:export\s+)?Type\s+(\w+)\s*\{\s*\}/gm
  while ((m = emptyBlockRe.exec(source)) !== null) {
    if (!result.has(m[1])) {
      result.set(m[1], '') // empty string signals "any"
    }
  }

  return result
}

/** Info about a Generic declaration */
interface GenericInfo {
  typeParams: string[]
  /** Raw TypeScript content from `declaration { ... }` block, if present */
  declaration?: string
}

/** Detect Generic declarations, their type params, and optional declaration blocks */
function detectGenerics(source: string): Map<string, GenericInfo> {
  const result = new Map<string, GenericInfo>()
  const re = /^[ \t]*(?:export\s+)?Generic\s+(\w+)\s*<([^>]+)>\s*\{/gm
  let m
  while ((m = re.exec(source)) !== null) {
    const name = m[1]
    const typeParams = m[2].split(',').map((tp) => {
      return tp.trim().split(/\s*=/)[0].trim()
    })

    // Find the full Generic block body via brace matching
    const blockStart = m.index + m[0].length - 1
    let depth = 1
    let i = blockStart + 1
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    const blockBody = source.slice(blockStart + 1, i - 1)

    // Look for declaration { ... } within the block body
    let declaration: string | undefined
    const declMatch = blockBody.match(/\bdeclaration\s*\{/)
    if (declMatch && declMatch.index !== undefined) {
      const declStart = declMatch.index + declMatch[0].length - 1
      let dDepth = 1
      let j = declStart + 1
      while (j < blockBody.length && dDepth > 0) {
        if (blockBody[j] === '{') dDepth++
        else if (blockBody[j] === '}') dDepth--
        j++
      }
      declaration = blockBody.slice(declStart + 1, j - 1).trim()
    }

    result.set(name, { typeParams, declaration })
  }
  return result
}

/** Info about a const/let/var declaration */
interface VarDeclInfo {
  name: string
  value: string
  kind: 'const' | 'let' | 'var'
}

/** Detect exported const/let/var declarations and their initializer values */
function detectVarDeclarations(source: string): VarDeclInfo[] {
  const result: VarDeclInfo[] = []
  const re =
    /^[ \t]*export\s+(?:default\s+)?(const|let|var)\s+(\w+)\s*(?::\s*\w+\s*)?=\s*(.+)/gm
  let m
  while ((m = re.exec(source)) !== null) {
    // Get the value — may span multiple lines for objects/arrays
    let value = m[3].trim()
    // Strip trailing semicolons
    if (value.endsWith(';')) value = value.slice(0, -1).trim()
    result.push({ name: m[2], value, kind: m[1] as 'const' | 'let' | 'var' })
  }
  return result
}

/** Infer a TS type from a const initializer value */
function inferConstType(value: string): string {
  // String literal
  if (/^['"]/.test(value)) return 'string'
  // Template literal
  if (value.startsWith('`')) return 'string'
  // Boolean
  if (value === 'true' || value === 'false') return 'boolean'
  // Number
  if (/^[+-]?\d+(\.\d+)?$/.test(value)) return 'number'
  // Symbol
  if (value.startsWith('Symbol(') || value.startsWith('Symbol.'))
    return 'symbol'
  // Array
  if (value.startsWith('[')) return 'any[]'
  // new Map/Set/WeakMap etc.
  if (value.startsWith('new WeakMap')) return 'WeakMap<any, any>'
  if (value.startsWith('new Map')) return 'Map<any, any>'
  if (value.startsWith('new Set')) return 'Set<any>'
  if (value.startsWith('new ')) return 'any'
  // Object/Record
  if (value.startsWith('{')) return 'Record<string, any>'
  // null/undefined
  if (value === 'null') return 'null'
  if (value === 'undefined') return 'undefined'
  return 'any'
}

/**
 * Generate a .d.ts string from TJS transpilation output.
 *
 * @param result - The TJSTranspileResult from tjs()
 * @param source - The original TJS source (needed to detect exports)
 * @param options - Generation options
 * @returns The .d.ts file content as a string
 */
export function generateDTS(
  result: TJSTranspileResult,
  source: string,
  options: GenerateDTSOptions = {}
): string {
  const lines: string[] = []
  const exports = detectExports(source)
  const typeDecls = detectTypeDeclarations(source)
  const classes = detectClasses(source)
  const generics = detectGenerics(source)

  // If no exports detected, treat all top-level declarations as exported
  // (CommonJS / script-mode files)
  const hasAnyExport = exports.size > 0

  // Track names we've already emitted
  const emitted = new Set<string>()

  // Emit function declarations (from transpiler metadata — best type info)
  for (const [name, info] of Object.entries(result.types)) {
    // Skip polymorphic variants (name$0, name$1, etc.)
    if (name.includes('$')) continue

    const exportInfo = exports.get(name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    const isDefault = exportInfo?.isDefault ?? false

    if (!isExported) continue

    if (info.description) {
      lines.push(`/** ${info.description} */`)
    }

    lines.push(functionDeclToTS(name, info, true, isDefault))
    emitted.add(name)
  }

  // Emit class declarations as callable functions returning any.
  // TJS wraps classes to be callable without `new`, so this matches
  // the actual runtime API. Returning `any` means TS won't fight
  // the developer on instance property access.
  for (const [name, classInfo] of classes) {
    if (emitted.has(name)) continue

    const exportInfo = exports.get(name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    if (!isExported) continue

    const tsParams = classInfo.constructorParams
      ? tjsParamsToTS(classInfo.constructorParams)
      : ''

    // Emit as callable function (matches TJS wrapClass behavior)
    lines.push(`export declare function ${name}(${tsParams}): any;`)

    // Also emit as a class with `new` for the rare case someone uses it
    if (tsParams || classInfo.methods.length > 0) {
      lines.push(`export declare class ${name} {`)
      if (classInfo.constructorParams) {
        lines.push(`  constructor(${tsParams});`)
      }
      for (const method of classInfo.methods) {
        const mParams = method.params ? tjsParamsToTS(method.params) : ''
        lines.push(`  ${method.name}(${mParams}): any;`)
      }
      lines.push(`}`)
    }

    emitted.add(name)
  }

  // Emit Type declarations as type guard functions.
  // Type('Name', example) returns an object with .check(), .default, etc.
  // For TS consumers, the useful thing is knowing it's a callable type guard.
  for (const [name, exampleStr] of typeDecls) {
    if (emitted.has(name)) continue

    const exportInfo = exports.get(name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    if (!isExported) continue

    if (exampleStr.startsWith('__ts__:')) {
      // Preserved TS type body — emit verbatim as type alias
      const tsBody = exampleStr.slice(7)
      lines.push(`export type ${name} = ${tsBody};`)
    } else if (exampleStr === '') {
      // Empty Type {} — degraded from TS type alias, emit as type = any
      lines.push(`export type ${name} = any;`)
    } else {
      const tsType = inferTSTypeFromExample(exampleStr)
      lines.push(
        `export declare const ${name}: {` +
          ` check(value: any): boolean;` +
          ` default: ${tsType};` +
          ` (value: any): boolean;` +
          ` };`
      )
    }
    emitted.add(name)
  }

  // Emit Generic declarations.
  // If a declaration block is present, emit a proper TS interface.
  // Otherwise, emit an any-based factory stub.
  for (const [name, info] of generics) {
    if (emitted.has(name)) continue

    const exportInfo = exports.get(name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    if (!isExported) continue

    const typeParamStr =
      info.typeParams.length > 0 ? `<${info.typeParams.join(', ')}>` : ''

    if (info.declaration) {
      const declContent = info.declaration.trim()

      // Check if this is a verbatim TS type (conditional, mapped, etc.)
      // These start with "// TS:" and should be emitted as `export type`
      const tsMatch = declContent.match(/^\/\/\s*TS:\s*(.+)$/s)
      if (tsMatch) {
        lines.push(`export type ${name}${typeParamStr} = ${tsMatch[1].trim()};`)
      } else {
        // Structured declaration — emit as interface
        const declLines = declContent
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .map((l) => `  ${l}`)
          .join('\n')
        lines.push(`export interface ${name}${typeParamStr} {\n${declLines}\n}`)
      }
    } else {
      // No declaration block — emit any-based factory stub
      lines.push(
        `export declare function ${name}(` +
          `...args: any[]` +
          `): { check(value: any): boolean; (value: any): boolean; };`
      )
    }
    emitted.add(name)
  }

  // Emit FunctionPredicate declarations as TS function types.
  // FunctionPredicate Callback { params: { x: 0 } returns: '' }
  // → export type Callback = (x: number) => string;
  const funcPreds = detectFunctionPredicates(source)
  for (const [name, fpInfo] of funcPreds) {
    if (emitted.has(name)) continue

    const exportInfo = exports.get(name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    if (!isExported) continue

    // Collect type param names for passthrough (don't convert T to any)
    const tpNames = new Set(
      fpInfo.typeParams?.map((tp) => tp.split('=')[0].trim()) ?? []
    )
    const typeParamStr = fpInfo.typeParams
      ? `<${fpInfo.typeParams.join(', ')}>`
      : ''

    const tsParams = fpInfo.params
      .map((p, idx) => {
        // Array example [X] on the LAST param → rest param ...name: X[]
        // Non-last array params are regular array params
        const isLast = idx === fpInfo.params.length - 1
        if (p.example.startsWith('[') && p.example.endsWith(']') && isLast) {
          const inner = p.example.slice(1, -1).trim()
          const innerType =
            !inner || inner === 'null'
              ? 'any'
              : tpNames.has(inner)
              ? inner
              : inferTSTypeFromExample(inner)
          return `...${p.name}: ${innerType}[]`
        }
        // Non-last array param → regular array type
        if (p.example.startsWith('[') && p.example.endsWith(']')) {
          const inner = p.example.slice(1, -1).trim()
          const innerType =
            !inner || inner === 'null'
              ? 'any'
              : tpNames.has(inner)
              ? inner
              : inferTSTypeFromExample(inner)
          return `${p.name}: ${innerType}[]`
        }
        // In FunctionPredicate params, null means "any" (not literal null)
        const tsType =
          p.example === 'null'
            ? 'any'
            : tpNames.has(p.example)
            ? p.example
            : inferTSTypeFromExample(p.example)
        return `${p.name}: ${tsType}`
      })
      .join(', ')
    const tsReturn =
      fpInfo.returns !== undefined
        ? fpInfo.returns === 'null'
          ? 'any'
          : tpNames.has(fpInfo.returns)
          ? fpInfo.returns
          : inferTSTypeFromExample(fpInfo.returns)
        : 'void'
    lines.push(
      `export type ${name}${typeParamStr} = (${tsParams}) => ${tsReturn};`
    )
    emitted.add(name)
  }

  // Emit exported const/let/var declarations
  const varDecls = detectVarDeclarations(source)
  for (const decl of varDecls) {
    if (emitted.has(decl.name)) continue

    const exportInfo = exports.get(decl.name)
    const isExported = hasAnyExport ? !!exportInfo?.exported : true
    if (!isExported) continue

    const tsType = inferConstType(decl.value)
    lines.push(`export declare const ${decl.name}: ${tsType};`)
    emitted.add(decl.name)
  }

  if (options.moduleName) {
    const indented = lines.map((l) => `  ${l}`).join('\n')
    return `declare module '${options.moduleName}' {\n${indented}\n}\n`
  }

  return lines.join('\n') + '\n'
}

/**
 * Best-effort TS type inference from an example value string.
 * Used for Type declarations and constructor params where we only
 * have the raw source text, not a parsed TypeDescriptor.
 */
function inferTSTypeFromExample(example: string): string {
  const s = example.trim()

  // Unions first: "'' | 0 | null" → "string | number | null"
  // Only split on | that's outside quotes/braces/brackets
  if (hasTopLevelPipe(s)) {
    const members = splitOnPipe(s).map((m) => inferTSTypeFromExample(m.trim()))
    return [...new Set(members)].join(' | ')
  }

  // String literals
  if (/^['"]/.test(s)) return 'string'

  // Boolean
  if (s === 'true' || s === 'false') return 'boolean'

  // Null / undefined
  if (s === 'null') return 'null'
  if (s === 'undefined') return 'undefined'

  // Numbers
  if (/^[+-]?\d+\.\d+$/.test(s)) return 'number'
  if (/^[+-]?\d+$/.test(s)) return 'number'

  // Arrays
  if (s.startsWith('[')) return 'any[]'

  // Objects
  if (s.startsWith('{')) return 'Record<string, any>'

  return 'any'
}

/** Check if a string has a top-level | (not inside quotes/braces) */
function hasTopLevelPipe(s: string): boolean {
  let depth = 0
  let inStr: string | null = null
  for (const ch of s) {
    if (inStr) {
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--
    else if (ch === '|' && depth === 0) return true
  }
  return false
}

/** Split on top-level | characters */
function splitOnPipe(s: string): string[] {
  const result: string[] = []
  let depth = 0
  let inStr: string | null = null
  let current = ''
  for (const ch of s) {
    if (inStr) {
      current += ch
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch
      current += ch
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++
    else if (ch === '}' || ch === ']' || ch === ')') depth--

    if (ch === '|' && depth === 0) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) result.push(current)
  return result
}
