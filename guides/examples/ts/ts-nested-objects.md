<!--{"section": "ts", "type": "example", "group": "patterns", "order": 2, "parent": "ts-patterns.md"}-->

# Nested Objects

Nested object types work correctly

```ts
// Nested object types

interface Address {
  street: string
  city: string
  zip: string
}

interface Person {
  name: string
  address: Address
}

function formatAddress(person: Person): string {
  const { name, address } = person
  return `${name}\n${address.street}\n${address.city}, ${address.zip}`
}

const john: Person = {
  name: 'John Doe',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    zip: '12345'
  }
}

console.log(formatAddress(john))
```
