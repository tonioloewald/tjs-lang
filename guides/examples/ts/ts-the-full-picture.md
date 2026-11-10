<!--{"section": "ts", "type": "example", "group": "advanced", "order": 4, "parent": "ts-advanced.md"}-->
<!-- TODO review -->

# The Full Picture: an order handler end to end

_A small order handler, written in TypeScript, with its types checked at run time._

This is a small but complete piece of business logic: two interfaces, a validator and a
function that ties them together, the way a request handler is usually written. The
validator checks business rules (an order needs products and a customer). It assumes the
_types_ are already right, because TypeScript said so. The last call breaks that
assumption, the way real data does, and then hands the result to `JSON.stringify`, standing
in for code that knows nothing about TJS.

The code below is ordinary TypeScript. The TJS converter (`fromTS` in
`tjs-lang/lang/from-ts`, or `tjs convert` on the command line) turns it into TJS, and the
page runs the result. [Converting a TypeScript Project](ts-converting-a-project.md) covers
doing the same to your own files.

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

interface Product {
  id: number
  name: string
  price: number
}

interface Order {
  products: Product[]
  customer: string
}

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

const validOrder: Order = {
  customer: 'Alice',
  products: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 19.99 }
  ]
}
console.log('Valid order:', JSON.stringify(processOrder(validOrder)))

const emptyOrder: Order = { customer: 'Carol', products: [] }
console.log('Empty order:', JSON.stringify(processOrder(emptyOrder)))

// `as any` stands in for JSON.parse or a request body: data the compiler
// never saw. This product's price is a string.
const stringPrice = {
  customer: 'Dee',
  products: [{ id: 3, name: 'Gizmo', price: '9.99' }]
} as any
console.log('String price:', JSON.stringify(processOrder(stringPrice)))

// This order has no products array at all.
const badOrder = { customer: 'Bob' } as any
const result = processOrder(badOrder)

// What a caller that knows nothing about TJS receives:
console.log('Bad order:', result)
console.log('result.success:', result.success)
```

It prints (`…` stands for a prefix naming the source and line, which varies by where the
code runs):

```text
Valid order: {"success":true,"total":29.979999999999997}
Empty order: {"success":false,"error":"Order must have at least one product"}
String price: {"path":"…:processOrder.order","expected":"Order","actual":"object","name":"MonadicError"}
Bad order: MonadicError: Expected Order for '…:processOrder.order', got object
result.success: undefined
```

The long total is ordinary floating point, not TJS; the gotchas section below comes back
to it.

## What to notice

- **The bad order never reaches `validateOrder`.** `processOrder` declares an `Order`
  parameter, so the missing `products` array is caught at its door. The function returns
  a `MonadicError` (an error object that TJS returns instead of throwing) in place of a
  result. Delete the `/* @tjs TjsStrict */` line and the same call reaches
  `order.products.length` and throws, in the middle of a function that was supposedly
  validating its input:

  ```text
  TypeError: undefined is not an object (evaluating 'order.products.length')
  ```

  (That is Bun's wording; Node and Chrome say
  `Cannot read properties of undefined (reading 'length')`.)

- **Two kinds of validation, in two places.** The type check answers "is this an order at
  all?" automatically, from the interface. `validateOrder` answers "is this order
  acceptable?", which only you can write. The empty order passes the first and fails the
  second. TypeScript leaves you to write both, or to skip the first; TJS writes the first
  from the declaration you already have.
- **Nested types are checked all the way down.** `Order` contains `Product[]`, so each
  product's `id`, `name` and `price` are checked too, and the string price is rejected at
  the same door as the missing array. Checking a parameter walks the whole value, so its
  cost grows with the size of the data; the [performance guide](performance.md) covers
  where that cost lands and when to turn it off.
- **The error says where, not what.** Both rejections report the same thing: the `order`
  parameter of `processOrder` is not an `Order`. Neither names the field that failed
  (`products` missing, `price` a string). For an array parameter the path does name the
  element, as `products[0]` in the last example shows, but not the field inside it.

`TjsStrict` does more than turn on these checks: it gives the whole file TJS's rules,
including an `==` that does not coerce types. Read
[Converting a TypeScript Project](ts-converting-a-project.md) before putting it on a file
you are migrating.

## At the boundary

The error is returned, not thrown, so nothing stops the program; the last two lines show
what that means for a caller outside TJS, such as the code that serializes a response.

`JSON.stringify` keeps the error's `path`, `expected`, `actual` and `name`. It drops
`message` (`Expected Order for '…processOrder.order', got object`), which is not an
enumerable property, so log it explicitly if you want it. And the caller's own
`result.success` is `undefined`: the declared return type says `boolean`, but the value is
not the declared shape at all. A caller that tests `if (!result.success)` treats it as a
failure by accident, then finds no `error` string to report.

So check at the boundary. TJS code uses `isMonadicError(result)` (from `tjs-lang/runtime`)
before trusting a result; a plain-JavaScript caller can test
`result.name === 'MonadicError'`. The [runtime validation](ts-runtime-validation.md)
chapter covers the error object itself.

## The gotchas

Converted return types are never checked; parameter types are. Here is what the converter
writes for the three signatures:

```text
function calculateTotal(order: Order):! number
function validateOrder(order: Order):! string | null
function processOrder(order: Order):! { success: boolean, total: number | undefined, error: string | undefined }
```

`:!` marks a return type as documentation only: the returned value is not checked against
it. (A plain `:` return annotation in TJS is a worked example the function is tested
against, which a TypeScript return type is not; that is why the converter writes `:!`.)
Optional members become `T | undefined`. So the result's
shape is only verified when it is passed to the next function that declares it as a
parameter. Checking parameters is the design: that is where outside data enters a
function, and each value is checked once on the way in rather than again on every return.

The converter also drops ordinary comments, so the converted file starts with a bare
`TjsStrict` line where the `/* @tjs TjsStrict */` directive was.

The total is the other thing worth a look: `9.99 + 19.99` prints `29.979999999999997`.
That is floating point, and it is why money is usually counted in integer cents. TypeScript
cannot say "integer", and the converter reads every `number` as "any number", so `9.99` is
accepted.

Native TJS (a hand-written `.tjs` file, as opposed to converted TypeScript) can say it. In
TJS a type is written as an example value, and TJS tells integers from other numbers: `999`
is an integer example, so a `price` must be an integer, while `9.99` would mean any number.
The [syntax reference](TJS-SYNTAX.md) has the full rules.

```tjs:static
Type Product {
  example: { id: 1, name: 'Widget', price: 999 }
}

function totalCents(products: [Product]):! 0 {
  return products.reduce((sum, p) => sum + p.price, 0)
}

const cart = [
  { id: 1, name: 'Widget', price: 999 },
  { id: 2, name: 'Gadget', price: 1999 },
]
console.log('total:', totalCents(cart))

const dollars = [{ id: 1, name: 'Widget', price: 9.99 }]
console.log('dollars:', JSON.stringify(totalCents(dollars)))
```

Three pieces of syntax are new here. `Type Product { example: … }` declares a type by its
example. `[Product]` means an array of `Product` (TypeScript's `Product[]`). `:! 0` says
the function returns an integer, as documentation only. Without the `!`, `0` would be a
worked example (this input gives exactly `0`), which is not what `totalCents` returns.

It prints:

```text
total: 2998
dollars: {"path":"…:totalCents.products[0]","expected":"Product","actual":"object","name":"MonadicError"}
```

The cart totals `2998` cents, exactly. The dollar cart is rejected: its first product is
not a `Product`, because its price is not an integer.
