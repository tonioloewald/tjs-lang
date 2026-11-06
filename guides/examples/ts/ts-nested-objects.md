<!--{"section": "ts", "type": "example", "group": "patterns", "order": 2, "parent": "ts-patterns.md"}-->
<!-- TODO review -->

# Nested Objects

Real data is objects inside objects: a person with an address, an order with line items, a
response with a payload. In TypeScript each level is an `interface` that refers to the
others by name, and `tsc` checks every level. But those checks exist only at compile time,
and only for values `tsc` can see. `JSON.parse`, a `fetch` response, a message from another
service and an `as any` cast all hand you data that nobody checked.

The TS→TJS converter (`fromTS`, which runs when the page or your build converts a `.ts`
file) turns each interface into a TJS `Type`: a type that can be checked at run time. It
keeps the references between them, so once you opt in with the `/* @tjs TjsStrict */`
comment at the top of the example, checking the outer type checks every level inside it.

This example runs in the page: edit it and the output below it updates.

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

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
  console.log('formatting', person.name)
  const { name, address } = person
  return `${name}\n${address.street}\n${address.city}, ${address.zip}`
}

const john: Person = {
  name: 'John Doe',
  address: { street: '123 Main St', city: 'Springfield', zip: '12345' },
}
console.log(formatAddress(john))

// Data tsc never sees: JSON.parse returns `any`, so this compiles.
// The outer object is fine; the mistake is one level down.
const jane = formatAddress(JSON.parse('{"name":"Jane","address":{"street":1}}'))
console.log('Bad address:', jane)

// Arrays of objects are checked element by element.
interface LineItem {
  sku: string
  qty: number
}

interface Order {
  id: string
  items: LineItem[]
}

function totalQty(order: Order): number {
  return order.items.reduce((n, item) => n + item.qty, 0)
}

const good = '{"id":"A1","items":[{"sku":"pen","qty":2},{"sku":"ink","qty":3}]}'
const bad = '{"id":"A2","items":[{"sku":"pen","qty":2},{"sku":"ink","qty":"3"}]}'
console.log('qty:', totalQty(JSON.parse(good)))
console.log('Bad order:', totalQty(JSON.parse(bad)))

// A type may refer to itself, and the check follows the chain.
interface ListNode {
  value: number
  next: ListNode | null
}

function sum(node: ListNode): number {
  return node.value + (node.next ? sum(node.next) : 0)
}

const list = { value: 1, next: { value: 2, next: { value: 3, next: null } } }
console.log('sum:', sum(list))
const badList = '{"value":1,"next":{"value":2,"next":{"value":"three","next":null}}}'
console.log('Bad list:', sum(JSON.parse(badList)))
```

It prints:

```text
formatting John Doe
John Doe
123 Main St
Springfield, 12345
Bad address: MonadicError: Expected Person for '…formatAddress.person', got object
qty: 5
Bad order: MonadicError: Expected Order for '…totalQty.order', got object
sum: 6
Bad list: MonadicError: Expected ListNode for '…sum.node', got object
```

There is no `formatting Jane`: the bad call is stopped at `formatAddress`'s parameter, and
the body never runs. Each rejected call returns a `MonadicError`, an error value the
function returns in place of its result rather than throwing. `tsc` still believes
`formatAddress` returns a `string`; at run time the caller gets the error instead, and tests
for it with `isMonadicError(result)` from `tjs-lang/runtime`. The
[runtime validation](ts-runtime-validation.md) chapter covers the error object, and
[Validating JSON at the Boundary](../../sections/ts-json-boundary.md) shows a caller
handling one.

## What to notice

- **Each interface becomes a `Type` with an example.** The converter writes:

  ```text
  Type Address {
    example: { street: '', city: '', zip: '' }
  }

  Type Person {
    example: { name: '', address: Address }
  }
  ```

  A TJS type is described by an example value: `''` means "a string", `0.0` means "a
  number". The converter picks the example from your TypeScript type, so you never write
  one yourself.
- **`address: Address` is a reference, not a copy of `Address`'s shape.** That is what lets a
  type name itself, as `ListNode` does in `next: ListNode | null`, or name a type declared
  later in the file, just as TypeScript interfaces can.
- **`| null` is checked, not ignored.** It becomes a runtime union, so the last node's
  `null` passes and anything else in `next` must be a `ListNode`. The bad list is rejected
  because of the `"three"` in its third node.
- **`LineItem[]` checks every element.** The second order fails because one item's `qty` is
  the string `"3"`.
- **Destructuring is unchanged.** `const { name, address } = person` runs exactly as it
  would in JavaScript.

Delete the `/* @tjs TjsStrict */` line and run it again to see what the checks are buying
you. Without it the converted code keeps JavaScript's behaviour: the bad call prints
`formatting Jane`, then `Jane`, `1` and `undefined, undefined`; the bad order's quantity is
the string `'23'`; and the bad list sums to the string `'12three0'`.

## The check is deep, the message is not

The error names the outer type that failed (`Expected Person`), not the member that was
wrong. `{ street: 1 }` has two faults, a number where a string belongs and no `city` or
`zip`, and either one alone is enough to reject it, but the message cannot tell you which.
The same holds for `Expected Order` and `Expected ListNode`. Its `path` field
(`formatAddress.person`) tells you which parameter to look at; finding the bad member inside
it is up to you. See [Object Validation](ts-object-validation.md) for the flat case.

## What it costs

Every call checks its whole argument, every level of it. That is cheap for one call on an
ordinary payload, but it adds up when a function calls itself: each `sum(node.next)`
re-checks the rest of the list, so summing a list of _n_ nodes does work proportional to
_n_². On a 2,000-node list that is a few hundred milliseconds.

The fix is to check once at the entry and recurse through a helper whose parameter is
`any`, which the converter leaves unchecked:

```typescript
function sum(list: ListNode): number {
  return sumUnchecked(list) // the whole list is checked once, here
}

function sumUnchecked(node: any): number {
  return node.value + (node.next ? sumUnchecked(node.next) : 0)
}
```

The same advice holds for large payloads in general: check at the boundary where the data
arrives, not in every helper it passes through. The [performance guide](../../performance.md)
has measurements.

## The gotcha: `?` does not mean `null`

An optional member, `address?: Address`, may be missing. It may not be `null`, exactly as
under `strict` in TypeScript. The difference is that `tsc` catches a literal `null` in your
code, while JSON from an API often sends `"address": null` for "no address", and nothing
looked at it until now.

```ts:inline
/* @tjs TjsStrict */

interface Address {
  street: string
  city: string
  zip: string
}

interface Contact {
  name: string
  address?: Address // may be missing, may not be null
}

interface NullableContact {
  name: string
  address?: Address | null // may be missing or null
}

function label(c: Contact): string {
  return c.name
}

function nullableLabel(c: NullableContact): string {
  return c.name
}

// Many APIs send an explicit null for "no address".
const noAddress = '{"name":"Sam","address":null}'
console.log(label(JSON.parse('{"name":"Ann"}')))
console.log(label(JSON.parse(noAddress)))
console.log(nullableLabel(JSON.parse(noAddress)))
```

The first call prints `Ann`. The second is rejected
(`Expected Contact for '…label.c', got object`), because `null` is not an `Address`. The
third prints `Sam`. If the data can send `null`, say so in the interface:
`address?: Address | null`.
