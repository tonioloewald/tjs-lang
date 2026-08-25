function TypeOf(v){return v===null?'null':typeof v};
function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {TypeOf,toBool};
/*#
# Schema Validation

Validates data against a JSON schema.
Returns { valid: boolean, errors?: string[] }
*/

export function validateSchema(schema, data) {
  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(!__tjs.toBool(data)))(!__tjs.toBool(schema)))) return { valid: true }

  const errors = []

  if (__tjs.toBool(schema.type)) {
    const actualType = __tjs.toBool(Array.isArray(data))?('array'):(TypeOf(data))
    if (__tjs.toBool(schema.type !== actualType)) {
      errors.push(`Expected type ${schema.type}, got ${actualType}`)
    }
  }

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data !== null):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(TypeOf(data) === 'object'):__tjs__t)(schema.type === 'object')))) {
                      
    if (__tjs.toBool(schema.required)) {
      for (const field of schema.required) {
        if (__tjs.toBool(!__tjs.toBool(field in data))) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    if (__tjs.toBool(schema.properties)) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (__tjs.toBool(key in data)) {
          const propResult = validateSchema(propSchema, data[key])
          if (__tjs.toBool(!__tjs.toBool(propResult.valid))) {
            errors.push(...propResult.errors.map(e => `${key}: ${e}`))
          }
        }
      }
    }
  }

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(TypeOf(data) === 'string'):__tjs__t)(schema.type === 'string'))) {
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.length < schema.minLength):__tjs__t)(schema.minLength))) {
      errors.push(`String too short (min ${schema.minLength})`)
    }
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.length > schema.maxLength):__tjs__t)(schema.maxLength))) {
      errors.push(`String too long (max ${schema.maxLength})`)
    }
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(!__tjs.toBool(new RegExp(schema.pattern).test(data))):__tjs__t)(schema.pattern))) {
      errors.push(`String does not match pattern`)
    }
  }

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(TypeOf(data) === 'number'):__tjs__t)(schema.type === 'number'))) {
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data < schema.minimum):__tjs__t)(schema.minimum !== undefined))) {
      errors.push(`Number below minimum (${schema.minimum})`)
    }
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data > schema.maximum):__tjs__t)(schema.maximum !== undefined))) {
      errors.push(`Number above maximum (${schema.maximum})`)
    }
  }

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(Array.isArray(data)):__tjs__t)(schema.type === 'array'))) {
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.length < schema.minItems):__tjs__t)(schema.minItems))) {
      errors.push(`Array too short (min ${schema.minItems} items)`)
    }
    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.length > schema.maxItems):__tjs__t)(schema.maxItems))) {
      errors.push(`Array too long (max ${schema.maxItems} items)`)
    }
    if (__tjs.toBool(schema.items)) {
      data.forEach((item, i) => {
        const itemResult = validateSchema(schema.items, item)
        if (__tjs.toBool(!__tjs.toBool(itemResult.valid))) {
          errors.push(...itemResult.errors.map(e => `[${i}]: ${e}`))
        }
      })
    }
  }

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(!__tjs.toBool(schema.enum.includes(data))):__tjs__t)(schema.enum))) {
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
