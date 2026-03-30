/**
 * JSON Schema generation from TJS TypeDescriptors and example values
 *
 * Converts TJS type information into standard JSON Schema (draft 2020-12).
 */

import type { TypeDescriptor } from './types'

export interface JSONSchemaObject {
  type?: string | string[]
  properties?: Record<string, JSONSchemaObject>
  items?: JSONSchemaObject | JSONSchemaObject[]
  required?: string[]
  additionalProperties?: boolean
  anyOf?: JSONSchemaObject[]
  minimum?: number
  examples?: unknown[]
  description?: string
  [key: string]: unknown
}

/**
 * Convert a TypeDescriptor to JSON Schema
 */
export function typeDescriptorToJSONSchema(
  td: TypeDescriptor
): JSONSchemaObject {
  if (td.nullable) {
    const base = typeDescriptorToJSONSchema({ ...td, nullable: false })
    return { anyOf: [base, { type: 'null' }] }
  }

  switch (td.kind) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'integer':
      return { type: 'integer' }
    case 'non-negative-integer':
      return { type: 'integer', minimum: 0 }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      return { type: 'null' }
    case 'undefined':
      return {}
    case 'any':
      return {}
    case 'array':
      if (td.items) {
        return { type: 'array', items: typeDescriptorToJSONSchema(td.items) }
      }
      return { type: 'array' }
    case 'object':
      if (td.shape) {
        const properties: Record<string, JSONSchemaObject> = {}
        const required: string[] = []
        for (const [key, fieldTd] of Object.entries(td.shape)) {
          properties[key] = typeDescriptorToJSONSchema(fieldTd)
          required.push(key)
        }
        return {
          type: 'object',
          properties,
          required,
          additionalProperties: false,
        }
      }
      return { type: 'object' }
    case 'union':
      if (td.members) {
        return { anyOf: td.members.map(typeDescriptorToJSONSchema) }
      }
      return {}
    default:
      return {}
  }
}

/**
 * Infer a JSON Schema from an example value (without going through TypeDescriptor)
 */
export function exampleToJSONSchema(value: unknown): JSONSchemaObject {
  if (value === null) return { type: 'null' }
  if (value === undefined) return {}

  switch (typeof value) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return Number.isInteger(value)
        ? { type: 'integer' }
        : { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object': {
      if (Array.isArray(value)) {
        if (value.length === 0) return { type: 'array' }
        // Infer item type from first element
        return { type: 'array', items: exampleToJSONSchema(value[0]) }
      }
      // Object
      const properties: Record<string, JSONSchemaObject> = {}
      const required: string[] = []
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        properties[key] = exampleToJSONSchema(val)
        required.push(key)
      }
      return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      }
    }
    default:
      return {}
  }
}

/**
 * Generate JSON Schema for function parameters (as an object schema)
 * and return type from __tjs metadata
 */
export function functionMetaToJSONSchema(meta: {
  params: Record<string, any>
  returns?: { type: any; example?: any }
}): { input: JSONSchemaObject; output?: JSONSchemaObject } {
  const properties: Record<string, JSONSchemaObject> = {}
  const required: string[] = []

  for (const [name, paramInfo] of Object.entries(meta.params)) {
    if (paramInfo?.type?.kind) {
      // Has TypeDescriptor
      properties[name] = typeDescriptorToJSONSchema(paramInfo.type)
    } else if (paramInfo?.example !== undefined) {
      // Has example value
      properties[name] = exampleToJSONSchema(paramInfo.example)
    } else {
      properties[name] = {}
    }
    if (paramInfo?.required !== false) {
      required.push(name)
    }
    if (paramInfo?.example !== undefined) {
      properties[name].examples = [paramInfo.example]
    }
  }

  const input: JSONSchemaObject = {
    type: 'object',
    properties,
    required,
  }

  let output: JSONSchemaObject | undefined
  if (meta.returns) {
    if (meta.returns.type?.kind) {
      output = typeDescriptorToJSONSchema(meta.returns.type)
    } else if (meta.returns.example !== undefined) {
      output = exampleToJSONSchema(meta.returns.example)
    }
  }

  return { input, output }
}
