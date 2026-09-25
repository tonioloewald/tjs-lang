<!--{"section": "ts", "type": "example", "group": "advanced", "order": 4, "parent": "ts-advanced.md"}-->

# The Full Picture

Complete example showing the TS -> TJS -> JS value proposition

```ts
/*#
## The Full Picture

TypeScript promises type safety.
TJS delivers it at RUNTIME.

This is what "TS keeps its promise" means.
*/

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
