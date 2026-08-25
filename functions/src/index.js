import { Eval } from 'tjs-lang';
function TypeOf(v){return v===null?'null':typeof v};
function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {TypeOf,toBool};
/*#
# TJS Platform Cloud Functions

Cloud Functions for the TJS Platform.
Modular architecture with separate concerns:
- crypto.tjs - Encryption/decryption
- llm.tjs - LLM capability (multi-provider)
- schema.tjs - JSON schema validation
- rbac.tjs - Security rules & access shortcuts
- indexes.tjs - Automatic index management
- store.tjs - Store capability with RBAC
- routing.tjs - URL pattern matching & function cache

## Future Work
- Benchmark `safety none` vs `safety inputs` - likely negligible overhead for small payloads
*/

import { onRequest } from 'firebase-functions/v2/https'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

import { decrypt } from './crypto.js'
import { createLlmCapability } from './llm.js'
import { createStoreCapability } from './store.js'
import { matchUrlPattern, getStoredFunctions } from './routing.js'

initializeApp()

const db = getFirestore()

/*#
## Get User API Keys

Loads and decrypts the user's API keys from Firestore.
*/
async function getUserApiKeys(uid) {
  const userDoc = await db.collection('users').doc(uid).get()

  if (__tjs.toBool(!__tjs.toBool(userDoc.exists))) {
    return {}
  }

  const userData = userDoc.data()
  const { encryptionKey, apiKeys } = userData

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(!__tjs.toBool(apiKeys)))(!__tjs.toBool(encryptionKey)))) {
    return {}
  }

  const decrypted = {}

  for (const [provider, encryptedKey] of Object.entries(apiKeys)) {
    if (__tjs.toBool(encryptedKey)) {
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
  "source": "index.tjs:37"
}

/*#
## Health Check

Simple endpoint to verify functions are deployed and running.
*/
export const health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '0.4.0'
  })
})

/*#
## Agent Run Endpoint

Universal AJS endpoint - accepts code, args, and fuel limit.
Executes the code in a sandboxed VM with user's API keys as capabilities.
*/

function hashPayload(payload) {
  const str = JSON.stringify(payload)
  let hash = 0
  for (let i = 0; __tjs.toBool(i < str.length); i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
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
  "unsafe": true,
  "source": "index.tjs:86"
}

export const agentRun = onCall(async (request) => {
  if (__tjs.toBool(!__tjs.toBool(request.auth))) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to run agents')
  }

  const uid = request.auth.uid
  const { code, args = {}, fuel = 1000 } = request.data

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(TypeOf(code) !== 'string'))(!__tjs.toBool(code)))) {
    throw new HttpsError('invalid-argument', 'code must be a non-empty string')
  }

  if (__tjs.toBool(fuel > 10000)) {
    throw new HttpsError('invalid-argument', 'fuel limit cannot exceed 10000')
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
    error = { message: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('Execution failed'))(err.message) }
  }

  const fuelUsed = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(result?.fuelUsed)
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !__tjs.toBool(!__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error))(error))),
    resultHash: __tjs.toBool(result?.result)?(hashPayload(result.result)):(null)
  }

  const usageRef = db.collection('users').doc(uid).collection('usage')
  usageRef.add(usageLog).catch(err => console.error('Failed to log usage:', err))
  usageRef.doc('total').set({
    totalCalls: FieldValue.increment(1),
    totalFuelUsed: FieldValue.increment(fuelUsed),
    totalDuration: FieldValue.increment(duration),
    totalErrors: FieldValue.increment(__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error))(error))?(1):(0)),
    lastUpdated: Date.now()
  }, { merge: true }).catch(err => console.error('Failed to update totals:', err))

  if (__tjs.toBool(error)) {
    return { result: null, fuelUsed: 0, error }
  }

  return {
    result: result.result,
    fuelUsed: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(result.fuelUsed),
    error: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(null))(result.error)
  }
})

/*#
## REST Agent Endpoint

Same as agentRun but as a simple POST endpoint.
Auth via Bearer token (Firebase ID token).
*/
export const run = onRequest(async (req, res) => {
         
  res.set('Access-Control-Allow-Origin', '*')
  if (__tjs.toBool(req.method === 'OPTIONS')) {
    res.set('Access-Control-Allow-Methods', 'POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }

  if (__tjs.toBool(req.method !== 'POST')) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (__tjs.toBool(!__tjs.toBool(authHeader?.startsWith('Bearer ')))) {
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

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(TypeOf(code) !== 'string'))(!__tjs.toBool(code)))) {
    return res.status(400).json({ error: 'code must be a non-empty string' })
  }

  if (__tjs.toBool(fuel > 10000)) {
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
    error = { message: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('Execution failed'))(err.message) }
  }

  const fuelUsed = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(result?.fuelUsed)
  const duration = Date.now() - startTime
  const usageLog = {
    timestamp: Date.now(),
    duration,
    payloadHash: hashPayload({ code, args }),
    fuelRequested: fuel,
    fuelUsed,
    hasError: !__tjs.toBool(!__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error))(error))),
    resultHash: __tjs.toBool(result?.result)?(hashPayload(result.result)):(null)
  }

  const usageRef = db.collection('users').doc(uid).collection('usage')
  usageRef.add(usageLog).catch(err => console.error('Failed to log usage:', err))
  usageRef.doc('total').set({
    totalCalls: FieldValue.increment(1),
    totalFuelUsed: FieldValue.increment(fuelUsed),
    totalDuration: FieldValue.increment(duration),
    totalErrors: FieldValue.increment(__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error))(error))?(1):(0)),
    lastUpdated: Date.now()
  }, { merge: true }).catch(err => console.error('Failed to update totals:', err))

  if (__tjs.toBool(error)) {
    return res.status(200).json({ result: null, fuelUsed: 0, error })
  }

  res.json({
    result: result.result,
    fuelUsed: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(result.fuelUsed),
    error: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(null))(result.error)
  })
})

/*#
## Page Endpoint

Serves stored functions based on URL routing.
Matches incoming path against stored function URL patterns.
Executes matched function's AJS code and returns with appropriate content-type.
*/
export const page = onRequest(async (req, res) => {
         
  res.set('Access-Control-Allow-Origin', '*')
  if (__tjs.toBool(req.method === 'OPTIONS')) {
    res.set('Access-Control-Allow-Methods', 'GET, POST')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    return res.status(204).send('')
  }

  const path = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('/'))(req.path)

  try {
    const storedFunctions = await getStoredFunctions()

    let matchedFunction = null
    let params = null

    for (const fn of storedFunctions) {
      if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(!__tjs.toBool(fn.code)))(!__tjs.toBool(fn.urlPattern)))) continue

      const match = matchUrlPattern(fn.urlPattern, path)
      if (__tjs.toBool(match !== null)) {
        matchedFunction = fn
        params = match
        break
      }
    }

    if (__tjs.toBool(!__tjs.toBool(matchedFunction))) {
      return res.status(404).json({ error: 'Not found', path })
    }

    let uid = null
    if (__tjs.toBool(!__tjs.toBool(matchedFunction.public))) {
      const authHeader = req.headers.authorization
      if (__tjs.toBool(!__tjs.toBool(authHeader?.startsWith('Bearer ')))) {
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

    const args = {
      ...params,
      ...req.query,
      ...(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:({}))(req.body)),
      _path: path,
      _method: req.method,
      _uid: uid
    }

    let result = null
    let error = null

    try {
      let llm = null
      if (__tjs.toBool(uid)) {
        const apiKeys = await getUserApiKeys(uid)
        llm = createLlmCapability(apiKeys)
      }

      result = await Eval({
        code: matchedFunction.code,
        context: args,
        fuel: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(1000))(matchedFunction.fuel),
        timeoutMs: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(10000))(matchedFunction.timeoutMs),
        capabilities: __tjs.toBool(llm)?({ llm }):({})
      })
    } catch (err) {
      console.error('Stored function execution error:', err)
      error = { message: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('Execution failed'))(err.message) }
    }

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error))(error))) {
      const errorMessage = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('Unknown error'))(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(result?.error?.message))(error?.message))
      return res.status(500).json({ error: errorMessage })
    }

    const contentType = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('application/json'))(matchedFunction.contentType)
    res.set('Content-Type', contentType)

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(contentType.includes('html')))(contentType.includes('text/')))) {
      return res.send(result.result)
    } else {
      return res.json(result.result)
    }

  } catch (err) {
    console.error('Page endpoint error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})
