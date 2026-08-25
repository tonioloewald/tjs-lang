function toBool(v){try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {toBool};
/*#
# Automatic Index Management

Maintains denormalized indexes based on rule configuration.
Indexes are stored in `{collection}_indexes/{indexName}` or
`{collection}_indexes/{indexName}/{partitionKey}` for partitioned indexes.

## Index Configuration
```javascript
indexes: [
  {
    name: 'published',           // Index name
    filter: { status: 'published' }, // Which docs to include
    fields: ['title', 'created'],    // Fields to denormalize
  },
  {
    name: 'by-author',
    partitionBy: 'authorId',     // Creates sub-indexes per author
    fields: ['title', 'status']
  },
  {
    name: 'by-tag',
    partitionByArray: 'tags',    // Creates entry in each tag's index
    filter: { status: 'published' },
    fields: ['title', 'authorId']
  }
]
```
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
  "source": "indexes.tjs:34"
}

function matchesFilter(doc, filter) {
  if (__tjs.toBool(!__tjs.toBool(filter))) return true
  for (const [key, value] of Object.entries(filter)) {
    if (__tjs.toBool(doc[key] !== value)) return false
  }
  return true
}
matchesFilter.__tjs = {
  "params": {
    "doc": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "filter": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "indexes.tjs:39"
}

function extractFields(doc, fields, docId) {
  const entry = { _id: docId, _updated: Date.now() }
  if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(fields.length === 0))(!__tjs.toBool(fields)))) {
    return { ...doc, ...entry }
  }
  for (const field of fields) {
    if (__tjs.toBool(field in doc)) {
      entry[field] = doc[field]
    }
  }
  return entry
}
extractFields.__tjs = {
  "params": {
    "doc": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "fields": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "docId": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "indexes.tjs:47"
}

function getIndexPath(collection, indexName, partitionKey = null) {
  const base = `${collection}_indexes`
  if (__tjs.toBool(partitionKey)) {
    return `${base}/${indexName}_${partitionKey}`
  }
  return `${base}/${indexName}`
}
getIndexPath.__tjs = {
  "params": {
    "collection": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "indexName": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "partitionKey": {
      "type": {
        "kind": "null"
      },
      "required": false,
      "default": null
    }
  },
  "unsafe": true,
  "source": "indexes.tjs:60"
}

export async function updateIndexes(collection, docId, oldDoc, newDoc, indexes) {
  const startTime = performance.now()
  let updated = 0

  for (const index of indexes) {
    const { name, filter, fields, partitionBy, partitionByArray } = index

    const oldMatches = __tjs.toBool(oldDoc)?(matchesFilter(oldDoc, filter)):(false)
    const newMatches = matchesFilter(newDoc, filter)

    if (__tjs.toBool(partitionByArray)) {
                                                                   
      const oldPartitions = __tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(oldMatches):__tjs__t)(oldDoc))?(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:([]))(oldDoc[partitionByArray])):([])
      const newPartitions = __tjs.toBool(newMatches)?(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:([]))(newDoc[partitionByArray])):([])

      for (const partition of oldPartitions) {
        if (__tjs.toBool(!__tjs.toBool(newPartitions.includes(partition)))) {
          const indexPath = getIndexPath(collection, name, partition)
          await db().collection(indexPath).doc(docId).delete()
          updated++
        }
      }

      for (const partition of newPartitions) {
        const indexPath = getIndexPath(collection, name, partition)
        const entry = extractFields(newDoc, fields, docId)
        await db().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else if (__tjs.toBool(partitionBy)) {
                                  
      const oldPartition = __tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(oldMatches):__tjs__t)(oldDoc))?(oldDoc[partitionBy]):(null)
      const newPartition = __tjs.toBool(newMatches)?(newDoc[partitionBy]):(null)

      if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(oldPartition !== newPartition):__tjs__t)(oldPartition))) {
        const indexPath = getIndexPath(collection, name, oldPartition)
        await db().collection(indexPath).doc(docId).delete()
        updated++
      }

      if (__tjs.toBool(newPartition)) {
        const indexPath = getIndexPath(collection, name, newPartition)
        const entry = extractFields(newDoc, fields, docId)
        await db().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else {
                                       
      const indexPath = getIndexPath(collection, name)

      if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?(!__tjs.toBool(newMatches)):__tjs__t)(oldMatches))) {
                            
        await db().collection(indexPath).doc(docId).delete()
        updated++
      } else if (__tjs.toBool(newMatches)) {
                              
        const entry = extractFields(newDoc, fields, docId)
        await db().collection(indexPath).doc(docId).set(entry)
        updated++
      }
    }
  }

  const elapsed = performance.now() - startTime
  if (__tjs.toBool(updated > 0)) {
    console.log(`INDEX [${collection}] Updated ${updated} index entries in ${elapsed.toFixed(2)}ms`)
  }
}
updateIndexes.__tjs = {
  "params": {
    "collection": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "docId": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "oldDoc": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "newDoc": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "indexes": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "indexes.tjs:68"
}

export async function removeFromIndexes(collection, docId, doc, indexes) {
  const startTime = performance.now()
  let removed = 0

  for (const index of indexes) {
    const { name, filter, partitionBy, partitionByArray } = index

    if (__tjs.toBool(!__tjs.toBool(matchesFilter(doc, filter)))) continue

    if (__tjs.toBool(partitionByArray)) {
      const partitions = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:([]))(doc[partitionByArray])
      for (const partition of partitions) {
        const indexPath = getIndexPath(collection, name, partition)
        await db().collection(indexPath).doc(docId).delete()
        removed++
      }
    } else if (__tjs.toBool(partitionBy)) {
      const partition = doc[partitionBy]
      if (__tjs.toBool(partition)) {
        const indexPath = getIndexPath(collection, name, partition)
        await db().collection(indexPath).doc(docId).delete()
        removed++
      }
    } else {
      const indexPath = getIndexPath(collection, name)
      await db().collection(indexPath).doc(docId).delete()
      removed++
    }
  }

  const elapsed = performance.now() - startTime
  if (__tjs.toBool(removed > 0)) {
    console.log(`INDEX [${collection}] Removed ${removed} index entries in ${elapsed.toFixed(2)}ms`)
  }
}
removeFromIndexes.__tjs = {
  "params": {
    "collection": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "docId": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "doc": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "indexes": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "indexes.tjs:137"
}
