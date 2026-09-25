<!--{"section": "ts", "type": "example", "group": "validation", "order": 4, "parent": "ts-validation.md"}-->

# Optional Parameters

Optional params work in TS and TJS

```ts
// Optional parameters: TS ? syntax or default values

function createGreeting(
  name: string,
  greeting?: string,
  punctuation: string = '!'
): string {
  const g = greeting ?? 'Hello'
  return `${g}, ${name}${punctuation}`
}

// All these work
console.log(createGreeting('World'))
console.log(createGreeting('World', 'Hi'))
console.log(createGreeting('World', 'Hey', '...'))

// Check the metadata
console.log('\nFunction metadata:')
console.log('  name: required')
console.log('  greeting: optional')
console.log('  punctuation: optional with default "!"')
```
