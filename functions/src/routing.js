/*#
# URL Routing

URL pattern matching and stored functions cache for the page endpoint.
*/

import { getFirestore } from 'firebase-admin/firestore'

// Lazy initialization to ensure initializeApp() is called first
let _db = null
function db() {
  if (!_db) _db = getFirestore()
  return _db
}
db.__tjs = {
  params: {},
  unsafe: true,
  source: 'routing.tjs:11',
}

/*#
## URL Pattern Matching

Matches URL paths against patterns like `/user/:id` or `/api/v1/:resource/:action`.
Returns extracted parameters if match succeeds, null otherwise.
*/
export function matchUrlPattern(pattern, path) {
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
  params: {
    pattern: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    path: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'routing.tjs:22',
}

/*#
## Stored Functions Cache

Simple in-memory cache to avoid repeated Firestore reads.
Cache entries expire after 60 seconds.
*/
const storedFunctionsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000, // 60 seconds
}

export async function getStoredFunctions() {
  const now = Date.now()

  if (
    storedFunctionsCache.data &&
    now - storedFunctionsCache.timestamp < storedFunctionsCache.ttl
  ) {
    return storedFunctionsCache.data
  }

  const snapshot = await db().collection('storedFunctions').get()
  const functions = []

  snapshot.forEach((doc) => {
    functions.push({ id: doc.id, ...doc.data() })
  })

  storedFunctionsCache.data = functions
  storedFunctionsCache.timestamp = now

  return functions
}
getStoredFunctions.__tjs = {
  params: {},
  unsafe: true,
  source: 'routing.tjs:65',
}
