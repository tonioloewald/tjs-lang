<!--{"parent": "TJS-FOR-TS.md", "order": 3}-->

# Validating JSON at the Boundary

<!-- TODO review -->

Every program has a place where untyped data becomes typed data: `await res.json()`, a
message from a worker, a row from a database, a file a user dropped on the page. In
TypeScript that place is where types stop being true. `JSON.parse` returns `any`, `as`
tells the compiler what it wants to hear, and from then on every annotation downstream is
a claim about a value nobody looked at.

The usual fix is a second type system. You write the interface for the compiler and a Zod
or Ajv schema for the runtime, and then you keep the two in step by hand. TJS has one
type, written once, and it is the one that runs.

<!-- TODO review -->

## From TypeScript: the check is where the type is an input

Converted TypeScript marked `TjsStrict` checks every parameter against its declared type.
Nothing else changes: the interface, the functions and the `as` all stay as they were.

```ts:inline
/* @tjs TjsStrict */

interface Order {
  id: string
  qty: number
}

function parseOrder(json: string): Order {
  return JSON.parse(json)
}

function ship(order: Order): string {
  return `shipping ${order.qty} of ${order.id}`
}

console.log(ship(parseOrder('{"id": "A1", "qty": 3}')))
console.log(ship(parseOrder('{"id": "A1", "qty": "three"}')))
```

Notice where the bad order is caught: in `ship`, not in `parseOrder`. A TypeScript return
type converts to a type-only return (`:!`), which documents the result but does not check
it. The check happens at the first function that takes an `Order` as a parameter. That is
usually what you want, because it puts the check next to the code that depends on it, but
it means the function that _reads_ the JSON is not the one that _validates_ it. If you want
validation in one place, make that place a function whose parameter is the type, as in the
next section.

<!-- TODO review -->

## In TJS: one type, used as a gate

In native TJS the type is an example of the data. The gate is a function that takes it as
a parameter. A bad payload does not throw; the function returns a `MonadicError`, and the
caller decides what to do with it:

```tjs:inline
Type Order {
  description: 'an order as the API sends it'
  example: { id: 'A-1', qty: +1, price: 9.99, note: '' | undefined }
}

function accept(order: Order) {
  return `${order.qty} x ${order.id} at ${order.price}`
}

const bodies = [
  '{"id": "A-1", "qty": 2, "price": 9.99}',
  '{"id": "A-2", "qty": 1, "price": 5, "note": "gift wrap"}',
  '{"id": "A-3", "qty": "2", "price": 9.99}',
  '{"id": "A-4", "qty": -1, "price": 9.99}',
  '{"id": "A-5", "price": 9.99}',
]

for (const body of bodies) {
  const result = accept(JSON.parse(body))
  console.log(isMonadicError(result) ? `rejected: ${result.message}` : result)
}
```

What the example says, member by member:

- `id: 'A-1'`: a string. The value is an example, not a constraint; any string passes.
- `qty: +1`: a non-negative integer. The `+` is what says "non-negative", so `-1` is
  rejected, and so is `"2"`, because a string is never a number in TJS.
- `price: 9.99`: any number. A decimal point means float. (Had the example been `10`, the
  member would be an integer and `9.99` would be rejected. Choose the example that says
  what you mean.)
- `note: '' | undefined`: optional. It may be absent; if present it must be a string.

<!-- TODO review -->

## Checking without calling: `check` and `strip`

A `Type` is also a value you can ask directly. `check` answers yes or no. `strip` returns
a copy with only the members the type declares:

```tjs:inline
Type Order {
  example: { id: 'A-1', qty: +1 }
}

const incoming = JSON.parse('{"id": "A-1", "qty": 2, "isAdmin": true}')

console.log(Order.check(incoming))
console.log(JSON.stringify(Order.strip(incoming)))
```

`check` is `true` here even though the payload carries a key the type never mentioned.
That is deliberate: TJS types describe what must be present, and like TypeScript's they
let extra members through. If extra members could do harm downstream (an `isAdmin` flag
written straight into a database row is the classic case), `strip` before you store.

<!-- TODO review -->

## The gotchas

**The error names the type, not the member.** When a whole object fails a named type, the
message is `Expected Order for 'accept.order', got object`. It tells you which parameter
and which type; it does not yet say which member was wrong. For an inline shape
(`function f(opts: { name: '', age: 0 })`) the path does reach the member
(`f.opts.age`).

**JSON has no `Date`.** A TypeScript interface that says `createdAt: Date` is wrong about
every value `JSON.parse` returns: the field is a string. Declare it as what arrives (a
string, or a number of milliseconds) and convert it after the check. Native TJS does not
allow `new Date()` at all; `Timestamp` is the replacement, and `LegacyDate(x)` is the
escape when a library insists on a real `Date`.

**A type-only return is not a check.** As above: `:!` on a return documents the result
and nothing more. `:?` checks the returned value at run time too, but it also runs the
signature as a test at build time, which is not what you want for a function that reads a
network.

**Converted code without `TjsStrict` checks nothing.** A converted file keeps JavaScript's
behaviour until it is graduated or marked `TjsStrict`. See
[Converting a TypeScript Project](ts-converting-a-project.md).
