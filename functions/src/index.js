import { Eval, SafeFunction } from 'tjs-lang';
const __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs;
/*#
# TJS Platform Cloud Functions

Cloud Functions for the TJS Platform.
*/

import { onRequest } from 'firebase-functions/v2/https'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import * as crypto from 'crypto'

// Initialize Firebase Admin
initializeApp()

const db = getFirestore()

/*#
## Encryption Utilities

Server-side decryption using Node.js crypto module.
Must match the client-side Web Crypto API encryption.
*/

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64')
}
base64ToBuffer.__tjs = {
  "params": {
    "base64": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:25"
}

async function decrypt(encryptedBase64, keyBase64) {
  const keyBuffer = base64ToBuffer(keyBase64)
  const combined = base64ToBuffer(encryptedBase64)

  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const authTag = ciphertext.slice(-16)
  const encryptedData = ciphertext.slice(0, -16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedData)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}
decrypt.__tjs = {
  "params": {
    "encryptedBase64": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "keyBase64": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:29"
}

/*#
## Get User API Keys

Loads and decrypts the user's API keys from Firestore.
*/
async function getUserApiKeys(uid) {
  const userDoc = await db.collection('users').doc(uid).get()

  if (!userDoc.exists) {
    return {}
  }

  const userData = userDoc.data()
  const { encryptionKey, apiKeys } = userData

  if (!encryptionKey || !apiKeys) {
    return {}
  }

  const decrypted = {}

  for (const [provider, encryptedKey] of Object.entries(apiKeys)) {
    if (encryptedKey) {
      try {
        decrypted[provider] = await decrypt(encryptedKey, encryptionKey)
      } catch (e) {
        console.error(`Failed to decrypt ${provider} key:`, e.message)
      }
    }
  }

  return decrypted
}
getUserApiKeys.__tjs = {
  "params": {
    "uid": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:52"
}

/*#
## Create LLM Capability

Creates an LLM capability using the user's API keys.
*/
function createLlmCapability(apiKeys) {
  return {
    async predict(prompt, options = {}) {
      // For now, use OpenAI-compatible API
      // TODO: Support multiple providers based on options or availability
      const apiKey = apiKeys.openai || apiKeys.anthropic || apiKeys.gemini || apiKeys.deepseek

      if (!apiKey) {
        return { error: 'No LLM API key configured' }
      }

      // Determine which provider to use based on which key we have
      let endpoint, headers, body

      if (apiKeys.openai) {
        endpoint = 'https://api.openai.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.openai}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000
        }
      } else if (apiKeys.anthropic) {
        endpoint = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKeys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'claude-3-haiku-20240307',
          max_tokens: options.maxTokens || 1000,
          messages: [{ role: 'user', content: prompt }]
        }
      } else if (apiKeys.gemini) {
        // Gemini uses a different API structure
        const model = options.model || 'gemini-2.0-flash'
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`
        headers = { 'Content-Type': 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }]
        }
      } else if (apiKeys.deepseek) {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.deepseek}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000
        }
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        })

        const data = await response.json()

        // Extract text based on provider response format
        let text
        if (apiKeys.gemini) {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text
        } else if (apiKeys.anthropic) {
          text = data.content?.[0]?.text
        } else {
          text = data.choices?.[0]?.message?.content
        }

        if (typeof text !== 'string') {
          throw new Error('LLM returned unexpected format: ' + JSON.stringify(data))
        }
        return text
      } catch (error) {
        throw new Error('LLM error: ' + error.message)
      }
    }
  }
}
createLlmCapability.__tjs = {
  "params": {
    "apiKeys": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:86"
}

/*#
## Health Check

Simple endpoint to verify functions are deployed and running.
*/
export const health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '0.3.0'
  })
})

/*#
## Agent Run Endpoint

Universal AJS endpoint - accepts code, args, and fuel limit.
Executes the code in a sandboxed VM with user's API keys as capabilities.
*/

// Simple hash for payload checksum
function hashPayload(payload) {
  const str = JSON.stringify(payload)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(16)
}
hashPayload.__tjs = {
  "params": {
    "payload": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "description": "## Agent Run Endpoint\n\nUniversal AJS endpoint - accepts code, args, and fuel limit.\nExecutes the code in a sandboxed VM with user's API keys as capabilities.",
  "unsafe": true,
  "source": "index.tjs:195"
}

export const agentRun = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to run agents')
  }

  const uid = request.auth.uid
  const { code, args = {}, fuel = 1000 } = request.data

  if (!code || typeof code !== 'string') {
    throw new HttpsError('invalid-argument', 'code must be a non-empty string')
  }

  if (fuel > 10000) {
    throw new HttpsError('invalid-argument', 'fuel limit cannot exceed 10000')
  }

  const startTime = Date.now()
  let result = null
  let error = null

  try {
    // Load user's API keys
    const apiKeys = await getUserApiKeys(uid)

    // Create capabilities with user's keys
    const llm = createLlmCapability(apiKeys)
    const store = createStoreCapability(uid)

    // Safe dynamic code execution - TJS can eval untrusted code
    result = await Eval({
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store }
    })
  } catch (err) {
    console.error('Agent execution error:', err)
    error = { message: err.message || 'Execution failed' }
  }

  // Log usage to subcollection
  const fuelUsed = result?.fuelUsed || 0
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !!(error || result?.error),
    resultHash: result?.result ? hashPayload(result.result) : null
  }

  // Fire and forget - don't block response
  const usageRef = db.collection('users').doc(uid).collection('usage')

  // Add individual log entry
  usageRef.add(usageLog)
    .catch(err => console.error('Failed to log usage:', err))

  // Update running totals
  usageRef.doc('total').set({
    totalCalls: FieldValue.increment(1),
    totalFuelUsed: FieldValue.increment(fuelUsed),
    totalDuration: FieldValue.increment(duration),
    totalErrors: FieldValue.increment(error || result?.error ? 1 : 0),
    lastUpdated: Date.now()
  }, { merge: true })
    .catch(err => console.error('Failed to update totals:', err))

  if (error) {
    return { result: null, fuelUsed: 0, error }
  }

  return {
    result: result.result,
    fuelUsed: result.fuelUsed || 0,
    error: result.error || null
  }
})

/*#
## REST Agent Endpoint

Same as agentRun but as a simple POST endpoint.
Lighter weight - no Firebase callable overhead.
Auth via Bearer token (Firebase ID token).
*/
export const run = onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify auth
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const idToken = authHeader.slice(7)
  let uid
  try {
    const { getAuth } = await import('firebase-admin/auth')
    const decoded = await getAuth().verifyIdToken(idToken)
    uid = decoded.uid
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { code, args = {}, fuel = 1000 } = req.body

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'code must be a non-empty string' })
  }

  if (fuel > 10000) {
    return res.status(400).json({ error: 'fuel limit cannot exceed 10000' })
  }

  const startTime = Date.now()
  let result = null
  let error = null

  try {
    const apiKeys = await getUserApiKeys(uid)
    const llm = createLlmCapability(apiKeys)
    const store = createStoreCapability(uid)

    result = await Eval({
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm, store }
    })
  } catch (err) {
    console.error('Agent execution error:', err)
    error = { message: err.message || 'Execution failed' }
  }

  // Log usage
  const fuelUsed = result?.fuelUsed || 0
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !!(error || result?.error),
    resultHash: result?.result ? hashPayload(result.result) : null
  }

  const usageRef = db.collection('users').doc(uid).collection('usage')
  usageRef.add(usageLog).catch(err => console.error('Failed to log usage:', err))
  usageRef.doc('total').set({
    totalCalls: FieldValue.increment(1),
    totalFuelUsed: FieldValue.increment(fuelUsed),
    totalDuration: FieldValue.increment(duration),
    totalErrors: FieldValue.increment(error || result?.error ? 1 : 0),
    lastUpdated: Date.now()
  }, { merge: true }).catch(err => console.error('Failed to update totals:', err))

  if (error) {
    return res.status(200).json({ result: null, fuelUsed: 0, error })
  }

  res.json({
    result: result.result,
    fuelUsed: result.fuelUsed || 0,
    error: result.error || null
  })
})

/*#
## RBAC Security Rules

AJS-based security rules for Firestore collections.
Rules are stored in `securityRules/{collection}` and evaluated before each operation.

### Rule Context
- `_uid` - authenticated user ID (null if public)
- `_method` - 'read' | 'write' | 'delete'
- `_collection` - collection name
- `_docId` - document ID
- `doc` - existing document data (for read/write/delete)
- `newData` - incoming data (for write only)

### Rule Response
- Return `true` to allow
- Return `false` to deny
- Return `{ allow: true/false, reason: string }` for detailed response

### Performance Tracking
All rule evaluations are timed and logged for performance analysis.
*/

// Security rules cache (separate from stored functions)
const securityRulesCache = {
  data: new Map(),
  timestamp: 0,
  ttl: 60000 // 60 seconds
}

async function getSecurityRule(collection) {
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
  const doc = await db.collection('securityRules').doc(collection).get()
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
  "source": "index.tjs:420"
}

/*#
## Schema Validation

Validates data against a JSON schema.
Returns { valid: boolean, errors?: string[] }
*/
function validateSchema(schema, data) {
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
  "source": "index.tjs:448"
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
function evaluateAccessShortcut(accessRule, context) {
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
        // For new docs, check newData
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
  "source": "index.tjs:549"
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
async function evaluateSecurityRule(rule, context) {
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
  "source": "index.tjs:617"
}

/*#
## Load User Roles

Loads user roles from Firestore for RBAC context.
*/
async function loadUserRoles(uid) {
  if (!uid) return []

  try {
    const userDoc = await db.collection('users').doc(uid).get()
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
  "source": "index.tjs:719"
}

/*#
## Create Store Capability with RBAC

Wraps Firestore operations with AJS security rule evaluation.
Each operation checks the relevant security rule before proceeding.
User roles are loaded once and cached for all operations in the request.
*/
function createStoreCapability(uid) {
  // Cache for user roles (loaded lazily, once per request)
  let cachedRoles = null

  async function getRoles() {
    if (cachedRoles === null) {
      cachedRoles = await loadUserRoles(uid)
    }
    return cachedRoles
  }

  return {
    async get(collection, docId) {
      const rule = await getSecurityRule(collection)

      // No rule = deny by default (secure by default)
      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }

      // Load the document first (needed for rule context)
      const docRef = db.collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null

      // Get user roles for context
      const roles = await getRoles()

      // Evaluate rule with role context
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'read',
        _collection: collection,
        _docId: docId,
        doc
      })

      // Log timing with rule type
      console.log(`RBAC [${collection}:read] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`)

      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      return doc
    },

    async set(collection, docId, data) {
      const rule = await getSecurityRule(collection)

      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }

      // Load existing document (may not exist)
      const docRef = db.collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null

      // Get user roles for context
      const roles = await getRoles()

      // Evaluate rule
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'write',
        _collection: collection,
        _docId: docId,
        doc,
        newData: data
      })

      console.log(`RBAC [${collection}:write] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`)

      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      // Perform the write
      await docRef.set(data, { merge: true })
      return { success: true }
    },

    async delete(collection, docId) {
      const rule = await getSecurityRule(collection)

      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }

      // Load existing document
      const docRef = db.collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = docSnap.exists ? docSnap.data() : null

      if (!doc) {
        return { error: 'Document not found' }
      }

      // Get user roles for context
      const roles = await getRoles()

      // Evaluate rule
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'delete',
        _collection: collection,
        _docId: docId,
        doc
      })

      console.log(`RBAC [${collection}:delete] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`)

      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      await docRef.delete()
      return { success: true }
    },

    async query(collection, constraints = {}) {
      const rule = await getSecurityRule(collection)

      if (!rule) {
        return { error: `No security rule for collection: ${collection}` }
      }

      // Get user roles for context
      const roles = await getRoles()

      // For queries, evaluate rule with null doc (list permission)
      const ruleResult = await evaluateSecurityRule(rule, {
        _uid: uid,
        _roles: roles,
        _isAdmin: roles.includes('admin'),
        _isAuthor: roles.includes('author'),
        _method: 'read',
        _collection: collection,
        _docId: null,
        doc: null,
        _isQuery: true,
        _constraints: constraints
      })

      console.log(`RBAC [${collection}:query] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`)

      if (!ruleResult.allowed) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      // Build query
      let query = db.collection(collection)

      if (constraints.where) {
        for (const [field, op, value] of constraints.where) {
          query = query.where(field, op, value)
        }
      }
      if (constraints.orderBy) {
        query = query.orderBy(constraints.orderBy, constraints.orderDirection || 'asc')
      }
      if (constraints.limit) {
        query = query.limit(constraints.limit)
      }

      const snapshot = await query.get()
      const docs = []
      snapshot.forEach(doc => {
        docs.push({ id: doc.id, ...doc.data() })
      })

      return docs
    }
  }
}
createStoreCapability.__tjs = {
  "params": {
    "uid": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:740"
}

/*#
## URL Pattern Matching

Matches URL paths against patterns like `/user/:id` or `/api/v1/:resource/:action`.
Returns extracted parameters if match succeeds, null otherwise.
*/
function matchUrlPattern(pattern, path) {
  // Normalize paths - remove trailing slashes
  const normalizedPattern = pattern.replace(/\/+$/, '') || '/'
  const normalizedPath = path.replace(/\/+$/, '') || '/'

  const patternParts = normalizedPattern.split('/')
  const pathParts = normalizedPath.split('/')

  if (patternParts.length !== pathParts.length) {
    return null
  }

  const params = {}

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (patternPart.startsWith(':')) {
      // Parameter - extract value
      const paramName = patternPart.slice(1)
      params[paramName] = decodeURIComponent(pathPart)
    } else if (patternPart !== pathPart) {
      // Literal mismatch
      return null
    }
  }

  return params
}
matchUrlPattern.__tjs = {
  "params": {
    "pattern": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "path": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "index.tjs:932"
}

/*#
## Stored Functions Cache

Simple in-memory cache to avoid repeated Firestore reads.
Cache entries expire after 60 seconds.
*/
const storedFunctionsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000 // 60 seconds
}

async function getStoredFunctions() {
  const now = Date.now()

  if (storedFunctionsCache.data && (now - storedFunctionsCache.timestamp) < storedFunctionsCache.ttl) {
    return storedFunctionsCache.data
  }

  const snapshot = await db.collection('storedFunctions').get()
  const functions = []

  snapshot.forEach(doc => {
    functions.push({ id: doc.id, ...doc.data() })
  })

  storedFunctionsCache.data = functions
  storedFunctionsCache.timestamp = now

  return functions
}
getStoredFunctions.__tjs = {
  "params": {},
  "unsafe": true,
  "source": "index.tjs:975"
}

/*#
## Page Endpoint

Serves stored functions based on URL routing.
Matches incoming path against stored function URL patterns.
Executes matched function's AJS code and returns with appropriate content-type.

### Features
- URL pattern matching with parameters (e.g., `/user/:id`)
- Configurable content-type per function
- Public/private access control
- Query string passed as args
*/
export const page = onRequest(async (req, res) => {
  // CORS for public endpoints
  res.set('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }

  // Get the path from the request
  // Firebase functions receive path after the function name
  const path = req.path || '/'

  try {
    // Load all stored functions
    const storedFunctions = await getStoredFunctions()

    // Find matching function
    let matchedFunction = null
    let params = null

    for (const fn of storedFunctions) {
      if (!fn.urlPattern || !fn.code) continue

      const match = matchUrlPattern(fn.urlPattern, path)
      if (match !== null) {
        matchedFunction = fn
        params = match
        break
      }
    }

    if (!matchedFunction) {
      return res.status(404).json({ error: 'Not found', path })
    }

    // Check auth for non-public functions
    let uid = null
    if (!matchedFunction.public) {
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      const idToken = authHeader.slice(7)
      try {
        const { getAuth } = await import('firebase-admin/auth')
        const decoded = await getAuth().verifyIdToken(idToken)
        uid = decoded.uid
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token' })
      }
    }

    // Build args from URL params, query string, and body
    const args = {
      ...params,
      ...req.query,
      ...(req.body || {}),
      _path: path,
      _method: req.method,
      _uid: uid
    }

    // Execute the stored function's code
    const startTime = Date.now()
    let result = null
    let error = null

    try {
      // Load user's API keys if authenticated
      let llm = null
      if (uid) {
        const apiKeys = await getUserApiKeys(uid)
        llm = createLlmCapability(apiKeys)
      }

      result = await Eval({
        code: matchedFunction.code,
        context: args,
        fuel: matchedFunction.fuel || 1000,
        timeoutMs: matchedFunction.timeoutMs || 10000,
        capabilities: llm ? { llm } : {}
      })
    } catch (err) {
      console.error('Stored function execution error:', err)
      error = { message: err.message || 'Execution failed' }
    }

    if (error || result?.error) {
      const errorMessage = error?.message || result?.error?.message || 'Unknown error'
      return res.status(500).json({ error: errorMessage })
    }

    // Set content type and return result
    const contentType = matchedFunction.contentType || 'application/json'
    res.set('Content-Type', contentType)

    // For HTML/text, return raw result; for JSON, stringify
    if (contentType.includes('text/') || contentType.includes('html')) {
      return res.send(result.result)
    } else {
      return res.json(result.result)
    }

  } catch (err) {
    console.error('Page endpoint error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
