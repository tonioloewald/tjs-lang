<!--{"section": "ts", "type": "example", "group": "patterns", "order": 2, "parent": "ts-patterns.md"}-->

# Nested Objects

Nested object types work correctly

<!-- TODO review -->

Real data is objects inside objects: a person with an address, an order with line items, a
response with a payload. In TypeScript each level is an `interface` that refers to the
others by name. The converter turns each interface into a TJS `Type` and keeps the
references, so a check of the outer type reaches all the way down.

```ts:inline
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

<!-- TODO review -->

## What to notice

- **Each interface becomes a `Type` with an example.** The converter writes
  `Type Address { example: { street: '', city: '', zip: '' } }` and
  `Type Person { example: { name: '', address: Address } }`. The `Address` inside
  `Person`'s example is a reference to the other type, not a copy of its shape.
- **References are read when a value is checked**, not when the type is declared, so the
  order of declarations does not matter and a type may refer to itself
  (`next: Node | null`) for linked structures.
- **Destructuring is unchanged.** `const { name, address } = person` runs exactly as it
  would in JavaScript.

<!-- TODO review -->

## The gotcha

`zip: string` is right, and it is worth seeing why. A ZIP code looks like a number, but
`'02134'` has a leading zero that a number would lose, and nobody does arithmetic on one.
When you write TJS by hand, the example you choose is the type: `zip: '12345'` is a string,
`zip: 12345` is an integer, and the second would reject every ZIP code that arrives as
text. Pick the example that matches what the data is, not what it looks like.
