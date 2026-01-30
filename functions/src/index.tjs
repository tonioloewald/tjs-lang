/*#
# TJS Platform Cloud Functions

Cloud Functions for the TJS Platform, written in TJS and transpiled to JavaScript.
*/

import { onRequest } from 'firebase-functions/v2/https'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

// Initialize Firebase Admin
initializeApp()

const db = getFirestore()
const auth = getAuth()

/*#
## Health Check

Simple endpoint to verify functions are deployed and running.
*/
export const health = onRequest((req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '0.1.0'
  })
})

/*#
## Agent Run Endpoint

Universal AJS endpoint - accepts code, args, and fuel limit.
Returns execution result with fuel usage.

This is the foundation for Phase 4. Currently a stub that will be
expanded to include:
- Firebase Auth token verification
- User API key retrieval and decryption
- VM execution with capability injection
- Rate limiting and audit logging
*/
export const agentRun = onCall(async (request) => {
  // Verify authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated to run agents')
  }

  const { code, args, fuel = 1000 } = request.data

  if (!code || typeof code !== 'string') {
    throw new HttpsError('invalid-argument', 'code must be a non-empty string')
  }

  // TODO: Phase 4 implementation
  // 1. Load user's encryption key from Firestore
  // 2. Decrypt user's API keys
  // 3. Create VM with capabilities (fetch, store, llm)
  // 4. Run AJS code with fuel limit
  // 5. Return result

  return {
    result: null,
    fuelUsed: 0,
    error: {
      message: 'Agent execution not yet implemented'
    }
  }
})
