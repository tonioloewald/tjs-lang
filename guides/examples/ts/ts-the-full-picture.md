<!--{"section": "ts", "type": "example", "group": "advanced", "order": 4, "parent": "ts-advanced.md"}-->

# The Full Picture

Complete example showing the TS -> TJS -> JS value proposition

<!-- TODO review -->

This is a small but complete piece of business logic: two interfaces, a validator and a
function that ties them together, the way a request handler is usually written. The
validator checks business rules (an order needs products and a customer). It assumes the
_types_ are already right, because TypeScript said so. The last call breaks that
assumption, the way real data does.

```ts:inline
/*#
## The Full Picture

TypeScript promises type safety.
TJS delivers it at RUNTIME.

This is what "TS keeps its promise" means.
*/

// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

// Define your types with standard TypeScript syntax
interface Product {
  id: number
  name: string
  price: number
}

interface Order {
  products: Product[]
  customer: string
}

// Write your business logic
function calculateTotal(order: Order): number {
  return order.products.reduce((sum, p) => sum + p.price, 0)
}

function validateOrder(order: Order): string | null {
  if (order.products.length === 0) {
    return 'Order must have at least one product'
  }
  if (!order.customer) {
    return 'Customer name is required'
  }
  return null
}

function processOrder(order: Order): { success: boolean; total?: number; error?: string } {
  const error = validateOrder(order)
  if (error) {
    return { success: false, error }
  }
  return { success: true, total: calculateTotal(order) }
}

// Test with valid data
const validOrder: Order = {
  customer: 'Alice',
  products: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 19.99 }
  ]
}
console.log('Valid order:', processOrder(validOrder))

// Test with invalid data - TypeScript would let this through!
// But TJS catches it at runtime.
const badOrder = { customer: 'Bob' } as any // Missing products
console.log('Bad order:', processOrder(badOrder))

// The value proposition:
// 1. Write normal TypeScript
// 2. TJS transpiles it with runtime checks
// 3. Bad data gets caught, not crashed on
```

<!-- TODO review -->

## What to notice

- **The bad order never reaches `validateOrder`.** `processOrder` declares an `Order`
  parameter, so the missing `products` array is caught at its door and the function
  returns a `MonadicError` instead of a result. Without `/* @tjs TjsStrict */`, the same
  call reaches `order.products.length` and throws a `TypeError`, in the middle of a
  function that was supposedly validating its input.
- **Two kinds of validation, in two places.** The type check answers "is this an order at
  all?" automatically, from the interface. `validateOrder` answers "is this order
  acceptable?", which only you can write. TypeScript leaves you to write both, or to skip
  the first; TJS writes the first from the declaration you already have.
- **Nested types are checked all the way down.** `Order` contains `Product[]`, so each
  product's `id`, `name` and `price` are checked too.

<!-- TODO review -->

## The gotcha

`processOrder`'s return type, `{ success: boolean; total?: number; error?: string }`, is a
type-only return after conversion: it documents the result but is not checked. Checks
happen where a type is a _parameter_. That is where bad data enters a function, and it is
the cheaper place to check, but it means the shape of a result is only verified when it is
passed to the next function that declares it.

The total is also worth a look: `9.99 + 19.99` prints `29.979999999999997`. That is
floating point, not TJS, and it is why money is usually counted in integer cents. In native
TJS, `price: 999` (an integer example) would say so, and a price of `9.99` would be
rejected.
