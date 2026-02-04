import { Eval, SafeFunction } from 'tjs-lang';
const __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs;
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

// Lazy initialization to ensure initializeApp() is called first
let _db = null
function db() {
  if (!_db) _db = getFirestore()
  return _db
}
db.__tjs = {
  "params": {},
  "unsafe": true,
  "source": "rbac.tjs:26"
}

// Security rules cache
const securityRulesCache = {
  data: new Map(),
  timestamp: 0,
  ttl: 60000 // 60 seconds
}

export async function getSecurityRule(collection) {
  const now = Date.now()

  // Check cache freshness
  if ((now - securityRulesCache.timestamp) >= securityRulesCache.ttl) {
    securityRulesCache.data.clear()
    securityRulesCache.timestamp = now
  }

  // Check cache
  if (securityRulesCache.data.has(collection)) {
    return securityRulesCache.data.get(collection)
  }

  // Load from Firestore
  const doc = await db().collection('securityRules').doc(collection).get()
  const rule = doc.exists ? doc.data() : null

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
  "source": "rbac.tjs:38"
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
  if (typeof accessRule !== 'string') return null

  const { _uid, _roles, doc, newData } = context

  switch (accessRule) {
    case 'none':
      return { allowed: false, reason: 'Access denied' }

    case 'all':
      return { allowed: true }

    case 'authenticated':
      return _uid
        ? { allowed: true }
        : { allowed: false, reason: 'Authentication required' }

    case 'admin':
      return _roles?.includes('admin')
        ? { allowed: true }
        : { allowed: false, reason: 'Admin role required' }

    case 'author':
      return _roles?.includes('author')
        ? { allowed: true }
        : { allowed: false, reason: 'Author role required' }

    default:
      // owner:fieldName pattern
      if (accessRule.startsWith('owner:')) {
        const field = accessRule.slice(6)
        const checkDoc = doc || newData
        if (!_uid) {
          return { allowed: false, reason: 'Authentication required' }
        }
        if (checkDoc && checkDoc[field] === _uid) {
          return { allowed: true }
        }
        if (!doc && newData && newData[field] === _uid) {
          return { allowed: true }
        }
        return { allowed: false, reason: `Must be owner (${field})` }
      }

      // role:roleName pattern
      if (accessRule.startsWith('role:')) {
        const role = accessRule.slice(5)
        return _roles?.includes(role)
          ? { allowed: true }
          : { allowed: false, reason: `Role '${role}' required` }
      }

      return null // Not a recognized shortcut
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
  "source": "rbac.tjs:75"
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
    // Determine which access rule to use based on method
    let accessRule = rule.code // Default to code for backwards compatibility

    if (_method === 'read' && rule.read !== undefined) {
      accessRule = rule.read
    } else if (_method === 'write') {
      // Distinguish create vs update
      if (!context.doc && rule.create !== undefined) {
        accessRule = rule.create
      } else if (context.doc && rule.update !== undefined) {
        accessRule = rule.update
      } else if (rule.write !== undefined) {
        accessRule = rule.write
      }
    } else if (_method === 'delete' && rule.delete !== undefined) {
      accessRule = rule.delete
    }

    // 1. Try shortcut evaluation first (fastest)
    if (typeof accessRule === 'string') {
      const shortcutResult = evaluateAccessShortcut(accessRule, context)
      if (shortcutResult) {
        const evalTimeMs = performance.now() - startTime
        return { ...shortcutResult, evalTimeMs, fuelUsed: 0, type: 'shortcut' }
      }
    }

    // 2. Schema validation for writes
    if (_method === 'write' && rule.schema && newData) {
      const schemaResult = validateSchema(rule.schema, newData)
      if (!schemaResult.valid) {
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

    // 3. Run AJS code if present
    const codeToRun = typeof accessRule === 'object' && accessRule?.code
      ? accessRule.code
      : rule.code

    if (codeToRun) {
      const fuel = (typeof accessRule === 'object' && accessRule?.fuel) || rule.fuel || 100
      const timeoutMs = (typeof accessRule === 'object' && accessRule?.timeoutMs) || rule.timeoutMs || 1000

      const result = await Eval({
        code: codeToRun,
        context,
        fuel,
        timeoutMs,
        capabilities: {} // No capabilities for security rules
      })

      const evalTimeMs = performance.now() - startTime

      // Interpret result
      let allowed = false
      let reason = null

      if (typeof result.result === 'boolean') {
        allowed = result.result
      } else if (typeof result.result === 'object' && result.result !== null) {
        allowed = !!result.result.allow
        reason = result.result.reason
      }

      return { allowed, reason, evalTimeMs, fuelUsed: result.fuelUsed, type: 'code' }
    }

    // 4. No rule matched and shortcut passed - allow (schema-only rules)
    if (rule.schema && !rule.code) {
      const evalTimeMs = performance.now() - startTime
      return { allowed: true, evalTimeMs, fuelUsed: 0, type: 'schema-only' }
    }

    // 5. No rule defined - deny by default
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
  "source": "rbac.tjs:142"
}

/*#
## Load User Roles

Loads user roles from Firestore for RBAC context.
*/
export async function loadUserRoles(uid) {
  if (!uid) return []

  try {
    const userDoc = await db().collection('users').doc(uid).get()
    if (!userDoc.exists) return []
    const userData = userDoc.data()
    return userData?.roles || []
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
  "source": "rbac.tjs:244"
}
