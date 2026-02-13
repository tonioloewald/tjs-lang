/*#
# Schema Validation

Validates data against a JSON schema.
Returns { valid: boolean, errors?: string[] }
*/

export function validateSchema(schema, data) {
  if (!schema || !data) return { valid: true }

  const errors = []

  // Type check
  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data
    if (schema.type !== actualType) {
      errors.push(`Expected type ${schema.type}, got ${actualType}`)
    }
  }

  // Object validation
  if (schema.type === 'object' && typeof data === 'object' && data !== null) {
    // Required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    // Property validation
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const propResult = validateSchema(propSchema, data[key])
          if (!propResult.valid) {
            errors.push(...propResult.errors.map(e => `${key}: ${e}`))
          }
        }
      }
    }
  }

  // String validation
  if (schema.type === 'string' && typeof data === 'string') {
    if (schema.minLength && data.length < schema.minLength) {
      errors.push(`String too short (min ${schema.minLength})`)
    }
    if (schema.maxLength && data.length > schema.maxLength) {
      errors.push(`String too long (max ${schema.maxLength})`)
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(`String does not match pattern`)
    }
  }

  // Number validation
  if (schema.type === 'number' && typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`Number below minimum (${schema.minimum})`)
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`Number above maximum (${schema.maximum})`)
    }
  }

  // Array validation
  if (schema.type === 'array' && Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) {
      errors.push(`Array too short (min ${schema.minItems} items)`)
    }
    if (schema.maxItems && data.length > schema.maxItems) {
      errors.push(`Array too long (max ${schema.maxItems} items)`)
    }
    if (schema.items) {
      data.forEach((item, i) => {
        const itemResult = validateSchema(schema.items, item)
        if (!itemResult.valid) {
          errors.push(...itemResult.errors.map(e => `[${i}]: ${e}`))
        }
      })
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`Value must be one of: ${schema.enum.join(', ')}`)
  }

  return { valid: errors.length === 0, errors }
}
validateSchema.__tjs = {
  "params": {
    "schema": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "data": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "schema.tjs:8"
}
