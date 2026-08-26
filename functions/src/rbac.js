import { Eval } from 'tjs-lang';
function __ub(v){try{if(v instanceof String)return String.prototype.valueOf.call(v);if(v instanceof Number)return Number.prototype.valueOf.call(v);if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)}catch{return v}return v};
const __ac=Object.create(null);function __proj(v){if(v===null||v===undefined||typeof v!=='object')return v;let k;try{k=v.constructor&&v.constructor.name}catch{return v}let f=k&&Object.prototype.hasOwnProperty.call(__ac,k)?__ac[k]:null;if(typeof f!=='function'){try{f=v.asCompared}catch{return v}}if(typeof f!=='function')return v;let p;try{p=f.call(v)}catch{return v}const t=typeof p;return p===null||p===undefined||t==='number'||t==='string'||t==='boolean'?p:v};
function TypeOf(v){return v===null?'null':typeof v};
function toBool(v){v=__proj(v);try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {TypeOf,toBool};
const __tjsToBool = __tjs.toBool; __tjs.toBool = function(v){ return __tjsToBool(__proj(v)) };
/*#
# RBAC Security Rules

AJS-based security rules for Firestore collections.
Rules are stored in `securityRules/{collection}` and evaluated before each operation.

## Rule Context
- `_uid` - authenticated user ID (null if public)
- `_method` - 'read' | 'write' | 'delete'
- `_collection` - collection name
- `_docId` - document ID
- `doc` - existing document data (for read/write/delete)
- `newData` - incoming data (for write only)

## Rule Response
- Return `true` to allow
- Return `false` to deny
- Return `{ allow: true/false, reason: string }` for detailed response
*/

import { getFirestore } from 'firebase-admin/firestore'
import { validateSchema } from './schema.js'

let _db = null
function db() {
  if (__tjs.toBool(!__tjs.toBool(_db))) _db = getFirestore()
  return _db
}
db.__tjs = {
  "params": {},
  "unsafe": true,
  "source": "rbac.tjs:25"
}

const securityRulesCache = {
  data: new Map(),
  timestamp: 0,
  ttl: 60000              
}

export async function getSecurityRule(collection) {
  const now = Date.now()

  if (__tjs.toBool((now - securityRulesCache.timestamp) >= securityRulesCache.ttl)) {
    securityRulesCache.data.clear()
    securityRulesCache.timestamp = now
  }

  if (__tjs.toBool(securityRulesCache.data.has(collection))) {
    return securityRulesCache.data.get(collection)
  }

  const doc = await db().collection('securityRules').doc(collection).get()
  const rule = __tjs.toBool(doc.exists)?(doc.data()):(null)

  securityRulesCache.data.set(collection, rule)
  return rule
}
getSecurityRule.__tjs = {
  "params": {
    "collection": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "rbac.tjs:36"
}

/*#
## Access Rule Shortcuts

Evaluates simple access rule strings without AJS overhead.
Returns { allowed: boolean, reason?: string } or null if not a shortcut.

Shortcuts:
- 'none' - deny all
- 'all' - allow all
- 'authenticated' - must be logged in
- 'admin' - must have admin role
- 'author' - must have author role
- 'owner:fieldName' - doc[fieldName] === _uid
- 'role:roleName' - _roles.includes(roleName)
*/
export function evaluateAccessShortcut(accessRule, context) {
  if (__tjs.toBool(TypeOf(accessRule) !== 'string')) return null

  const { _uid, _roles, doc, newData } = context

  switch (accessRule) {
    case 'none':
      return { allowed: false, reason: 'Access denied' }

    case 'all':
      return { allowed: true }

    case 'authenticated':
      return __tjs.toBool(_uid)?({ allowed: true }):({ allowed: false, reason: 'Authentication required' })

    case 'admin':
      return __tjs.toBool(_roles?.includes('admin'))?({ allowed: true }):({ allowed: false, reason: 'Admin role required' })

    case 'author':
      return __tjs.toBool(_roles?.includes('author'))?({ allowed: true }):({ allowed: false, reason: 'Author role required' })

    default:
                                
      if (__tjs.toBool(accessRule.startsWith('owner:'))) {
        const field = accessRule.slice(6)
        const checkDoc = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(newData))(doc)
        if (__tjs.toBool(!__tjs.toBool(_uid))) {
          return { allowed: false, reason: 'Authentication required' }
        }
        if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(checkDoc[field] === _uid):__tjs__t)(checkDoc))) {
          return { allowed: true }
        }
        if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(newData[field] === _uid):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(newData):__tjs__t)(!__tjs.toBool(doc))))) {
          return { allowed: true }
        }
        return { allowed: false, reason: `Must be owner (${field})` }
      }

      if (__tjs.toBool(accessRule.startsWith('role:'))) {
        const role = accessRule.slice(5)
        return __tjs.toBool(_roles?.includes(role))?({ allowed: true }):({ allowed: false, reason: `Role '${role}' required` })
      }

      return null                             
  }
}
evaluateAccessShortcut.__tjs = {
  "params": {
    "accessRule": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "context": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "rbac.tjs:70"
}

/*#
## RBAC Rule Evaluation

Evaluates a security rule with timing instrumentation.
Supports (in order of evaluation):
1. Access shortcuts (none/all/authenticated/owner/role) - fastest
2. Schema validation for writes
3. AJS code evaluation - most flexible

Returns { allowed: boolean, reason?: string, evalTimeMs: number, type: string }
*/
export async function evaluateSecurityRule(rule, context) {
  const startTime = performance.now()
  const { _method, newData } = context

  try {
                                                         
    let accessRule = rule.code                                               

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(rule.read !== undefined):__tjs__t)(_method === 'read'))) {
      accessRule = rule.read
    } else if (__tjs.toBool(_method === 'write')) {
                                     
      if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(rule.create !== undefined):__tjs__t)(!__tjs.toBool(context.doc)))) {
        accessRule = rule.create
      } else if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(rule.update !== undefined):__tjs__t)(context.doc))) {
        accessRule = rule.update
      } else if (__tjs.toBool(rule.write !== undefined)) {
        accessRule = rule.write
      }
    } else if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(rule.delete !== undefined):__tjs__t)(_method === 'delete'))) {
      accessRule = rule.delete
    }

    if (__tjs.toBool(TypeOf(accessRule) === 'string')) {
      const shortcutResult = evaluateAccessShortcut(accessRule, context)
      if (__tjs.toBool(shortcutResult)) {
        const evalTimeMs = performance.now() - startTime
        return { ...shortcutResult, evalTimeMs, fuelUsed: 0, type: 'shortcut' }
      }
    }

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(newData):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(rule.schema):__tjs__t)(_method === 'write')))) {
      const schemaResult = validateSchema(rule.schema, newData)
      if (__tjs.toBool(!__tjs.toBool(schemaResult.valid))) {
        const evalTimeMs = performance.now() - startTime
        return {
          allowed: false,
          reason: 'Schema validation failed: ' + schemaResult.errors.join('; '),
          evalTimeMs,
          fuelUsed: 0,
          type: 'schema'
        }
      }
    }

    const codeToRun = __tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(accessRule?.code):__tjs__t)(TypeOf(accessRule) === 'object'))?(accessRule.code):(rule.code)

    if (__tjs.toBool(codeToRun)) {
      const fuel = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(100))(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(rule.fuel))(((__tjs__t)=>__tjs.toBool(__tjs__t)?(accessRule?.fuel):__tjs__t)(TypeOf(accessRule) === 'object')))
      const timeoutMs = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(1000))(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(rule.timeoutMs))(((__tjs__t)=>__tjs.toBool(__tjs__t)?(accessRule?.timeoutMs):__tjs__t)(TypeOf(accessRule) === 'object')))

      const result = await Eval({
        code: codeToRun,
        context,
        fuel,
        timeoutMs,
        capabilities: {}                                      
      })

      const evalTimeMs = performance.now() - startTime

      let allowed = false
      let reason = null

      if (__tjs.toBool(TypeOf(result.result) === 'boolean')) {
        allowed = result.result
      } else if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(result.result !== null):__tjs__t)(TypeOf(result.result) === 'object'))) {
        allowed = !__tjs.toBool(!__tjs.toBool(result.result.allow))
        reason = result.result.reason
      }

      return { allowed, reason, evalTimeMs, fuelUsed: result.fuelUsed, type: 'code' }
    }

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(!__tjs.toBool(rule.code)):__tjs__t)(rule.schema))) {
      const evalTimeMs = performance.now() - startTime
      return { allowed: true, evalTimeMs, fuelUsed: 0, type: 'schema-only' }
    }

    const evalTimeMs = performance.now() - startTime
    return { allowed: false, reason: 'No access rule defined', evalTimeMs, fuelUsed: 0, type: 'default' }

  } catch (err) {
    const evalTimeMs = performance.now() - startTime
    console.error('Security rule evaluation error:', err.message)
    return { allowed: false, reason: 'Rule evaluation failed: ' + err.message, evalTimeMs, error: true, type: 'error' }
  }
}
evaluateSecurityRule.__tjs = {
  "params": {
    "rule": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "context": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "rbac.tjs:136"
}

/*#
## Load User Roles

Loads user roles from Firestore for RBAC context.
*/
export async function loadUserRoles(uid) {
  if (__tjs.toBool(!__tjs.toBool(uid))) return []

  try {
    const userDoc = await db().collection('users').doc(uid).get()
    if (__tjs.toBool(!__tjs.toBool(userDoc.exists))) return []
    const userData = userDoc.data()
    return ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:([]))(userData?.roles)
  } catch (err) {
    console.error('Failed to load user roles:', err.message)
    return []
  }
}
loadUserRoles.__tjs = {
  "params": {
    "uid": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "rbac.tjs:232"
}
