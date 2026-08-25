function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {toBool};
/*#
# Store Capability with RBAC

Wraps Firestore operations with AJS security rule evaluation.
Each operation checks the relevant security rule before proceeding.
User roles are loaded once and cached for all operations in the request.
*/

import { getFirestore } from 'firebase-admin/firestore'
import { getSecurityRule, evaluateSecurityRule, loadUserRoles } from './rbac.js'
import { updateIndexes, removeFromIndexes } from './indexes.js'

let _db = null
function db() {
  if (__tjs.toBool(!__tjs.toBool(_db))) _db = getFirestore()
  return _db
}
db.__tjs = {
  "params": {},
  "unsafe": true,
  "source": "store.tjs:14"
}

export function createStoreCapability(uid) {
                                                           
  let cachedRoles = null

  async function getRoles() {
    if (__tjs.toBool(cachedRoles === null)) {
      cachedRoles = await loadUserRoles(uid)
    }
    return cachedRoles
  }

  return {
    async get(collection, docId) {
      const rule = await getSecurityRule(collection)

      if (__tjs.toBool(!__tjs.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` }
      }

      const docRef = db().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = __tjs.toBool(docSnap.exists)?(docSnap.data()):(null)

      const roles = await getRoles()

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

      console.log(`RBAC [${collection}:read] ${ruleResult.evalTimeMs.toFixed(2)}ms, type: ${ruleResult.type}, fuel: ${ruleResult.fuelUsed}, allowed: ${ruleResult.allowed}`)

      if (__tjs.toBool(!__tjs.toBool(ruleResult.allowed))) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      return doc
    },

    async set(collection, docId, data) {
      const rule = await getSecurityRule(collection)

      if (__tjs.toBool(!__tjs.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` }
      }

      const docRef = db().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = __tjs.toBool(docSnap.exists)?(docSnap.data()):(null)

      const roles = await getRoles()

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

      if (__tjs.toBool(!__tjs.toBool(ruleResult.allowed))) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      await docRef.set(data, { merge: true })

      if (__tjs.toBool(rule.indexes)) {
        await updateIndexes(collection, docId, doc, data, rule.indexes)
      }

      return { success: true }
    },

    async delete(collection, docId) {
      const rule = await getSecurityRule(collection)

      if (__tjs.toBool(!__tjs.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` }
      }

      const docRef = db().collection(collection).doc(docId)
      const docSnap = await docRef.get()
      const doc = __tjs.toBool(docSnap.exists)?(docSnap.data()):(null)

      if (__tjs.toBool(!__tjs.toBool(doc))) {
        return { error: 'Document not found' }
      }

      const roles = await getRoles()

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

      if (__tjs.toBool(!__tjs.toBool(ruleResult.allowed))) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      if (__tjs.toBool(rule.indexes)) {
        await removeFromIndexes(collection, docId, doc, rule.indexes)
      }

      await docRef.delete()
      return { success: true }
    },

    async query(collection, constraints = {}) {
      const rule = await getSecurityRule(collection)

      if (__tjs.toBool(!__tjs.toBool(rule))) {
        return { error: `No security rule for collection: ${collection}` }
      }

      const roles = await getRoles()

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

      if (__tjs.toBool(!__tjs.toBool(ruleResult.allowed))) {
        return { error: 'Permission denied', reason: ruleResult.reason }
      }

      let query = db().collection(collection)

      if (__tjs.toBool(constraints.where)) {
        for (const [field, op, value] of constraints.where) {
          query = query.where(field, op, value)
        }
      }
      if (__tjs.toBool(constraints.orderBy)) {
        query = query.orderBy(constraints.orderBy, ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('asc'))(constraints.orderDirection))
      }
      if (__tjs.toBool(constraints.limit)) {
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
  "source": "store.tjs:19"
}
