/*#
# Store Module

Abstract storage interface with multiple backend implementations.

## Usage

```typescript
import { createMemoryStore, createIndexedDBStore } from 'tosijs/store'

// For testing
const store = createMemoryStore()

// For browser
const store = createIndexedDBStore()

// Use the store
await store.set('users', 'user123', { name: 'Alice', role: 'admin' })
const user = await store.get('users', 'user123')
const admins = await store.query('users', {
  where: [{ field: 'role', op: '==', value: 'admin' }]
})
```
*/

export type {
  Store,
  Doc,
  QueryConstraints,
  WhereClause,
  WriteResult,
  StoreFactory,
} from './interface'

export { createMemoryStore, getMemoryStore, resetMemoryStore } from './memory'
export { createIndexedDBStore, getIndexedDBStore } from './indexeddb'
