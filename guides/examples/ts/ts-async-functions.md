<!--{"section": "ts", "type": "example", "group": "advanced", "order": 2, "parent": "ts-advanced.md"}-->

# Async Functions

Async/await works naturally

```ts
// Async functions work naturally
// Promise<T> is unwrapped to T in return type

async function fetchData(url: string): Promise<string> {
  // Simulated fetch
  await new Promise(r => setTimeout(r, 100))
  return `Data from ${url}`
}

async function fetchMultiple(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(fetchData))
}

// Run the async functions
async function main() {
  console.log('Fetching single...')
  const single = await fetchData('/api/users')
  console.log('Result:', single)

  console.log('\nFetching multiple...')
  const multiple = await fetchMultiple(['/api/a', '/api/b', '/api/c'])
  console.log('Results:', multiple)
}

main()
```
