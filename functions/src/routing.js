function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {toBool};
/*#
# URL Routing

URL pattern matching and stored functions cache for the page endpoint.
*/

import { getFirestore } from 'firebase-admin/firestore'

let _db = null
function db() {
  if (__tjs.toBool(!__tjs.toBool(_db))) _db = getFirestore()
  return _db
}
db.__tjs = {
  "params": {},
  "unsafe": true,
  "source": "routing.tjs:10"
}

/*#
## URL Pattern Matching

Matches URL paths against patterns like `/user/:id` or `/api/v1/:resource/:action`.
Returns extracted parameters if match succeeds, null otherwise.
*/
export function matchUrlPattern(pattern, path) {
                                              
  const normalizedPattern = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('/'))(pattern.replace(/\/+$/, ''))
  const normalizedPath = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('/'))(path.replace(/\/+$/, ''))

  const patternParts = normalizedPattern.split('/')
  const pathParts = normalizedPath.split('/')

  if (__tjs.toBool(patternParts.length !== pathParts.length)) {
    return null
  }

  const params = {}

  for (let i = 0; __tjs.toBool(i < patternParts.length); i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (__tjs.toBool(patternPart.startsWith(':'))) {
                                  
      const paramName = patternPart.slice(1)
      params[paramName] = decodeURIComponent(pathPart)
    } else if (__tjs.toBool(patternPart !== pathPart)) {
                         
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
  "source": "routing.tjs:21"
}

/*#
## Stored Functions Cache

Simple in-memory cache to avoid repeated Firestore reads.
Cache entries expire after 60 seconds.
*/
const storedFunctionsCache = {
  data: null,
  timestamp: 0,
  ttl: 60000              
}

export async function getStoredFunctions() {
  const now = Date.now()

  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?((now - storedFunctionsCache.timestamp) < storedFunctionsCache.ttl):__tjs__t)(storedFunctionsCache.data))) {
    return storedFunctionsCache.data
  }

  const snapshot = await db().collection('storedFunctions').get()
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
  "source": "routing.tjs:64"
}
