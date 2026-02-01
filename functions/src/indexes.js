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

const db = getFirestore()

// Check if document matches filter criteria
function matchesFilter(doc, filter) {
  if (!filter) return true
  for (const [key, value] of Object.entries(filter)) {
    if (doc[key] !== value) return false
  }
  return true
}
matchesFilter.__tjs = {
  params: {
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    filter: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:36',
}

// Extract specified fields from document
function extractFields(doc, fields, docId) {
  const entry = { _id: docId, _updated: Date.now() }
  if (!fields || fields.length === 0) {
    return { ...doc, ...entry }
  }
  for (const field of fields) {
    if (field in doc) {
      entry[field] = doc[field]
    }
  }
  return entry
}
extractFields.__tjs = {
  params: {
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    fields: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:45',
}

// Get the index collection path
function getIndexPath(collection, indexName, partitionKey = null) {
  const base = `${collection}_indexes`
  if (partitionKey) {
    return `${base}/${indexName}_${partitionKey}`
  }
  return `${base}/${indexName}`
}
getIndexPath.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexName: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    partitionKey: {
      type: {
        kind: 'null',
      },
      required: false,
      default: null,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:59',
}

// Update indexes after a document write
export async function updateIndexes(
  collection,
  docId,
  oldDoc,
  newDoc,
  indexes
) {
  const startTime = performance.now()
  let updated = 0

  for (const index of indexes) {
    const { name, filter, fields, partitionBy, partitionByArray } = index

    const oldMatches = oldDoc ? matchesFilter(oldDoc, filter) : false
    const newMatches = matchesFilter(newDoc, filter)

    if (partitionByArray) {
      // Array partitioning: handle each element as a partition key
      const oldPartitions =
        oldDoc && oldMatches ? oldDoc[partitionByArray] || [] : []
      const newPartitions = newMatches ? newDoc[partitionByArray] || [] : []

      // Remove from old partitions no longer applicable
      for (const partition of oldPartitions) {
        if (!newPartitions.includes(partition)) {
          const indexPath = getIndexPath(collection, name, partition)
          await db.collection(indexPath).doc(docId).delete()
          updated++
        }
      }

      // Add/update in new partitions
      for (const partition of newPartitions) {
        const indexPath = getIndexPath(collection, name, partition)
        const entry = extractFields(newDoc, fields, docId)
        await db.collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else if (partitionBy) {
      // Single field partitioning
      const oldPartition = oldDoc && oldMatches ? oldDoc[partitionBy] : null
      const newPartition = newMatches ? newDoc[partitionBy] : null

      // Remove from old partition if changed
      if (oldPartition && oldPartition !== newPartition) {
        const indexPath = getIndexPath(collection, name, oldPartition)
        await db.collection(indexPath).doc(docId).delete()
        updated++
      }

      // Add/update in new partition
      if (newPartition) {
        const indexPath = getIndexPath(collection, name, newPartition)
        const entry = extractFields(newDoc, fields, docId)
        await db.collection(indexPath).doc(docId).set(entry)
        updated++
      }
    } else {
      // Simple index (no partitioning)
      const indexPath = getIndexPath(collection, name)

      if (oldMatches && !newMatches) {
        // Remove from index
        await db.collection(indexPath).doc(docId).delete()
        updated++
      } else if (newMatches) {
        // Add/update in index
        const entry = extractFields(newDoc, fields, docId)
        await db.collection(indexPath).doc(docId).set(entry)
        updated++
      }
    }
  }

  const elapsed = performance.now() - startTime
  if (updated > 0) {
    console.log(
      `INDEX [${collection}] Updated ${updated} index entries in ${elapsed.toFixed(
        2
      )}ms`
    )
  }
}
updateIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    oldDoc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    newDoc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexes: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:68',
}

// Remove document from all indexes (on delete)
export async function removeFromIndexes(collection, docId, doc, indexes) {
  const startTime = performance.now()
  let removed = 0

  for (const index of indexes) {
    const { name, filter, partitionBy, partitionByArray } = index

    if (!matchesFilter(doc, filter)) continue

    if (partitionByArray) {
      const partitions = doc[partitionByArray] || []
      for (const partition of partitions) {
        const indexPath = getIndexPath(collection, name, partition)
        await db.collection(indexPath).doc(docId).delete()
        removed++
      }
    } else if (partitionBy) {
      const partition = doc[partitionBy]
      if (partition) {
        const indexPath = getIndexPath(collection, name, partition)
        await db.collection(indexPath).doc(docId).delete()
        removed++
      }
    } else {
      const indexPath = getIndexPath(collection, name)
      await db.collection(indexPath).doc(docId).delete()
      removed++
    }
  }

  const elapsed = performance.now() - startTime
  if (removed > 0) {
    console.log(
      `INDEX [${collection}] Removed ${removed} index entries in ${elapsed.toFixed(
        2
      )}ms`
    )
  }
}
removeFromIndexes.__tjs = {
  params: {
    collection: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    docId: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    doc: {
      type: {
        kind: 'any',
      },
      required: false,
    },
    indexes: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'indexes.tjs:142',
}
