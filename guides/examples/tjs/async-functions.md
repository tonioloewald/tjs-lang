<!--{"section":"tjs","type":"example","group":"patterns","order":6}-->

# Async Functions

Typed async/await patterns

```tjs
// Async functions work naturally

async function fetchUser(id: 'user-1') -> { name: '', email: '' } {
  // Simulated API call
  await new Promise(resolve => setTimeout(resolve, 100))
  return {
    name: 'User ' + id,
    email: id + '@example.com'
  }
}

async function fetchUsers(ids: ['']) -> [{ name: '', email: '' }] {
  return Promise.all(ids.map(id => fetchUser(id)))
}

// Run it
await fetchUsers(['alice', 'bob', 'charlie'])
```
