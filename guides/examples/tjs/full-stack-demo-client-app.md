<!--{"section":"tjs","type":"example","group":"fullstack","order":13}-->

# Full-Stack Demo: Client App

Frontend that calls the User Service - run after saving user-service!

```tjs
/**
 * # Client Application
 *
 * A frontend that calls the User Service.
 *
 * **First:** Run the "User Service" example and save it as "user-service"
 * **Then:** Run this client to see full-stack in action
 *
 * This demonstrates:
 * - Importing local TJS modules
 * - Type-safe service calls
 * - Error handling
 */

// Import from local module (saved in playground)
import { createUser, getUser, listUsers, searchUsers } from 'user-service'

// Helper to display results
function display(label: '', data: {}) {
  console.log(`\\n\${label}:`)
  console.log(JSON.stringify(data, null, 2))
}

// Main app
async function main() {
  console.log('=== Client App ===')
  console.log('Connecting to user-service...\\n')

  // Create some users
  const user1 = createUser({ name: 'Dave', email: 'dave@startup.io' })
  display('Created user', user1)

  const user2 = createUser({ name: 'Eve', email: 'eve@startup.io' })
  display('Created user', user2)

  // Fetch a user
  const fetched = getUser({ id: user1.id })
  display('Fetched user', fetched)

  // List all
  const all = listUsers({ limit: 100, offset: 0 })
  display('All users', all)

  // Search
  const results = searchUsers({ query: 'eve' })
  display('Search results for "eve"', results)

  // Type error handling
  console.log('\\n--- Type Validation Demo ---')
  const badResult = createUser({ name: 999 })
  if (badResult.$error) {
    console.log('Caught type error:', badResult.message)
  }

  console.log('\\n=== Full-Stack Demo Complete ===')
  console.log('Everything ran in the browser. No server. No build step.')
}

main()
```
