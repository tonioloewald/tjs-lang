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

    // Create LLM capability with user's keys
    const llm = createLlmCapability(apiKeys)

    // Safe dynamic code execution - TJS can eval untrusted code
    result = await Eval({
      code,
      context: args,
      fuel,
      timeoutMs: 30000,
      capabilities: { llm }
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
