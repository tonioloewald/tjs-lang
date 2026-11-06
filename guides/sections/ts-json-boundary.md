<!--{"parent": "TJS-FOR-TS.md", "order": 3}-->
<!-- TODO review -->

# Validating JSON at the Boundary

Every program has a place where untyped data becomes typed data: `await res.json()`, a
message from a worker, a row from a database, a file a user dropped on the page. In
TypeScript that place is where types stop being true, and the usual fix is a second type
system (Zod, io-ts, Ajv) that you keep in step with your interfaces by hand (see
[JSON at the boundary is unchecked](typescript-good-bad-ugly.md#json-at-the-boundary-is-unchecked)).
In TJS the type is written once, and it is the one that runs.

This page has two halves. The first is for `.ts` files you keep writing as TypeScript. The
rest is native TJS: `.tjs` files, where a type is declared from an example.

## From TypeScript: the check is where the type is an input

TJS can compile your `.ts` files: `fromTS` (or `tjs convert` on the command line) turns
TypeScript into TJS, which then compiles to JavaScript. A file that went through that step
is _converted TypeScript_ (see [Converting a TypeScript Project](ts-converting-a-project.md)).
By default a converted file keeps JavaScript's behaviour and checks nothing at run time. A
comment `/* @tjs TjsStrict */` at the top of the file opts it into runtime checking: every
parameter is then checked against its declared type. Nothing else changes; the interface,
the functions and the `as` all stay as they were:

```ts:inline
/* @tjs TjsStrict */

interface Order {
  id: string
  qty: number
}

function parseOrder(json: string): Order {
  return JSON.parse(json) as Order
}

function ship(order: Order): string {
  return `shipping ${order.qty} of ${order.id}`
}

console.log(ship(parseOrder('{"id": "A1", "qty": 3}')))
console.log(ship(parseOrder('{"id": "A1", "qty": "three"}')))
```

The first call prints `shipping 3 of A1`. The second prints a `MonadicError` instead of
`shipping three of A1`, with the message `Expected Order for '…:12:ship.order', got
object` (the `…` stands for the file name, and `12` is the line of `ship`).

A `MonadicError` is a returned value, not an exception. `ship` did not throw: it returned
the error without running its body, and the caller can test for one with
`isMonadicError(result)`. The `as Order` is still a lie, exactly as it is in TypeScript;
what changed is that the lie is caught at the next function that takes an `Order`. Without
the `TjsStrict` comment the same file prints `shipping three of A1`.

Notice where the bad order is caught: in `ship`, not in `parseOrder`. A TypeScript return
type converts to a type-only return, which documents the result but does not check it (the
three kinds of return annotation are in the table further down). The check happens at the
first function that takes an `Order` as a parameter. That is usually what you want, because
it puts the check next to the code that depends on it, but it means the function that
_reads_ the JSON is not the one that _validates_ it.

To validate in one place, make that place a function whose parameter is the type. In a
`TjsStrict` file that can be a function that does nothing else:

```ts:inline
/* @tjs TjsStrict */

interface Order {
  id: string
  qty: number
}

// The gate: its only job is to take an Order as a parameter.
function validOrder(order: Order): Order {
  return order
}

function parseOrder(json: string): Order {
  return validOrder(JSON.parse(json))
}

console.log(parseOrder('{"id": "A1", "qty": 3}'))
console.log(parseOrder('{"id": "A1", "qty": "three"}'))
```

The first call prints the order. The second prints a `MonadicError` whose path ends in
`validOrder.order`, so the error now comes from the function that read the JSON.

One limit of this half: TypeScript's `number` converts to "any number", so `qty: 3.5` or
`qty: -1` passes here. Native TJS can say "non-negative integer", as the next section shows.

## In TJS: one type, used as a gate

Native TJS means a `.tjs` file. There, a `Type` block declares a named type that exists at
run time. Its `example` (required) is a sample of the data, and every member's type is read
from it; `description` is optional. The keys sit on separate lines with no commas. (The full
syntax is in the [TJS Syntax Reference](/TJS-SYNTAX/), under Declarations.)

The gate is again a function that takes the type as a parameter:

```tjs:inline
Type Order {
  description: 'an order as the API sends it'
  example: { id: 'A-1', qty: +1, price: 9.99, note: '' | undefined }
}

function accept(order: Order) {
  return `${order.id}: ${order.qty} x ${order.price} = ${order.qty * order.price}`
}

const bodies = [
  '{"id": "A-1", "qty": 2, "price": 9.99}',
  '{"id": "A-2", "qty": 0, "price": 5, "note": "back-order"}',
  '{"id": "A-3", "qty": "2", "price": 9.99}',
  '{"id": "A-4", "qty": -1, "price": 9.99}',
  '{"id": "A-5", "price": 9.99}',
]

for (const body of bodies) {
  const result = accept(JSON.parse(body))
  console.log(isMonadicError(result) ? `rejected: ${result.message}` : result)
}
```

The output:

```text
A-1: 2 x 9.99 = 19.98
A-2: 0 x 5 = 0
rejected: Expected Order for '…:6:accept.order', got object
rejected: Expected Order for '…:6:accept.order', got object
rejected: Expected Order for '…:6:accept.order', got object
```

What the example says, member by member:

- `id: 'A-1'`: a string. The value is an example, not a constraint; any string passes.
- `qty: +1`: a non-negative integer. The `+` is what says "non-negative", so `0` is
  accepted and `-1` (A-4) is rejected. So is `"2"` (A-3), because a string is never a
  number in TJS.
- `price: 9.99`: any number. A decimal point means float. (Had the example been `10`, the
  member would be an integer and `9.99` would be rejected. Choose the example that says
  what you mean.)
- `note: '' | undefined`: optional. It may be absent; if present it must be a string.

Every member is required unless its example includes `undefined`, so A-5, which has no
`qty`, is rejected too.

The example is not quite plain JavaScript. In a member's place it may hold a union
(`'' | undefined`) or the name of a type (`TimestampISO`, further down), and those are read
as types, not evaluated: `'' | undefined` is not a bitwise OR.

`isMonadicError` needs no import in a `.tjs` file.

## The shape you actually write: `fetch`

Most JSON arrives from `fetch`. The gate goes on the line that turns the response into
data. Here `fetch` is a local stand-in that returns canned bodies, so the example runs
without a network; with the real one, `loadOrder` is unchanged:

```tjs:inline
Type Order {
  example: { id: 'A-1', price: 9.99 }
}

const SHIPPING = 4.5

function accept(order: Order) {
  return `${order.id}: ${order.price} plus shipping = ${order.price + SHIPPING}`
}

// A stand-in for the network: the same `ok`, `status` and `json()` a real Response has.
const responses = {
  '/orders/A-1': '{"id": "A-1", "price": 9.99}',
  '/orders/A-2': '{"id": "A-2", "price": "9.99"}',
}
async function fetch(url) {
  const body = responses[url]
  return body
    ? { ok: true, status: 200, json: async () => JSON.parse(body) }
    : { ok: false, status: 404, json: async () => ({}) }
}

async function loadOrder(url: '/orders/X') {
  const res = await fetch(url)
  if (!res.ok) return new MonadicError(`${url}: HTTP ${res.status}`)
  return accept(await res.json())
}

for (const url of ['/orders/A-1', '/orders/A-2', '/orders/A-9']) {
  const result = await loadOrder(url)
  console.log(isMonadicError(result) ? `rejected: ${result.message}` : result)
}
```

The output:

```text
A-1: 9.99 plus shipping = 14.49
rejected: Expected Order for '…:7:accept.order', got object
rejected: /orders/A-9: HTTP 404
```

`A-2` is rejected because its price arrived as a string. With a TypeScript `as Order`, the
same code would have printed `9.994.5` as the total: `+` on a string concatenates.

`url: '/orders/X'` is an example, like every colon value in TJS: the parameter accepts any
string, not only that one.

The type check covers the parsed body and nothing else. A non-2xx status, and a body that
is not JSON at all (`res.json()` throws), are still yours to handle; the `if (!res.ok)`
line above is the first of those. A `try` block with no `catch` turns a thrown exception
into a returned `MonadicError` (see [the syntax reference](/TJS-SYNTAX/), under Errors).

## Validating the result instead: `:?`

TJS has three return annotations. Converted TypeScript always uses `:!`.

| annotation | at build time                                                       | at run time                 |
| ---------- | ------------------------------------------------------------------- | --------------------------- |
| `: x`      | a worked example: the function runs on its parameter examples and must return `x` | not checked                 |
| `:! x`     | nothing                                                             | not checked                 |
| `:? x`     | the worked example, as for `:`                                      | every result is checked     |

When the return is a named type such as `Order` rather than a literal, there is no worked
value to compare against, so the build-time column is empty for all three: `: Order` and
`:! Order` check nothing at all, and `:? Order` checks at run time only.

So if you would rather the reading function be the gate, annotate its return with
`:? Order`. A bad result then comes back as a `MonadicError` from the function that
produced it:

```tjs:inline
Type Order {
  example: { id: 'A-1', qty: +1 }
}

function parseOrder(json: '{"id": "A-1", "qty": 1}'):? Order {
  return JSON.parse(json)
}

const good = parseOrder('{"id": "A-2", "qty": 3}')
console.log(JSON.stringify(good))
const bad = parseOrder('{"id": "A-2", "qty": "three"}')
console.log(isMonadicError(bad) ? bad.message : bad)
```

The output:

```text
{"id":"A-2","qty":3}
Expected Order for '…:5:parseOrder:return', got object
```

The path ends in `parseOrder:return` (a colon, where a parameter would be `.json`), so it
names the function that read the data. With `: Order` or `:! Order` the second call returns
the bad object unchecked.

The parameter example `'{"id": "A-1", "qty": 1}'` documents the input and says it is a
string. Because the return is a named type, it is not run through the function at build
time, so a wrong example (`'{"qty": "x"}'`) would not be caught there.

## Checking without calling: `check` and `strip`

A `Type` is also a value you can ask directly. `check` answers `true` or `false`. `strip`
returns a copy with only the members the type declares:

```tjs:inline
Type Order {
  example: { id: 'A-1', qty: +1 }
}

const incoming = JSON.parse('{"id": "A-1", "qty": 2, "isAdmin": true}')

console.log(Order.check(incoming))
console.log(JSON.stringify(Order.strip(incoming)))
```

This prints `true`, then `{"id":"A-1","qty":2}`.

`check` is `true` even though the payload carries a key the type never mentioned. That is
deliberate: TJS types describe what must be present, and like TypeScript's they let extra
members through. If extra members could do harm downstream (an `isAdmin` flag written
straight into a database row is the classic case), `strip` before you store.

Use `check` where you want to branch on the answer yourself, for example to filter a list
or pick a fallback. Use a parameter gate where a bad value should stop the work and travel
back to the caller as an error.

## Handing the type to other tools: `toJSONSchema`

If you are coming from Zod or Ajv, you probably also publish your schemas: to an API
gateway, an OpenAPI document, or a service written in another language. A `Type` exports
standard JSON Schema:

```tjs:inline
Type Order {
  description: 'an order as the API sends it'
  example: { id: 'A-1', qty: +1, price: 9.99, note: '' | undefined }
}

console.log(JSON.stringify(Order.toJSONSchema()))

// The same schema, open to extra members the way Order.check is:
const open = { ...Order.toJSONSchema(), additionalProperties: true }
console.log(open.additionalProperties)
```

The first line of output, reformatted here for reading:

```text
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "qty": { "type": "integer", "minimum": 0 },
    "price": { "type": "number" },
    "note": { "type": "string" }
  },
  "required": ["id", "qty", "price"],
  "additionalProperties": false
}
```

Each member reads the way the example did: `+1` becomes an integer with `minimum: 0`, the
decimal point becomes `number`, and the optional `note` is left out of `required`. The
`description` is not part of the export; add it to the object yourself if your tools want
it.

One difference to know before you publish it: the exported schema is closed
(`additionalProperties: false`). It describes exactly the members the type declares, the
same set `strip` keeps, so a JSON Schema validator rejects the `isAdmin` payload from the
previous section, which `Order.check` accepts. There is no option to change that. If the
gateway should be as lenient as your code, override the keyword on the returned object, as
the last two lines of the example do (they print `true`).

Replacing an existing Zod schema with a `Type` is its own chapter:
[From Zod to TJS](ts-from-zod.md).

## The gotchas

**The error names the type, not the member.** When a whole object fails a named type, the
message is `Expected Order for '…accept.order', got object`. It tells you which parameter
and which type; it does not say which member was wrong. For an inline shape the path does
reach the member. When you need it, write the members inline on the gate:

```tjs:inline
Type Order {
  example: { id: 'A-1', qty: +1 }
}

function accept(order: Order) {
  return `${order.qty} of ${order.id}`
}

// Same members, written inline: the error now names the member.
function acceptShape(order: { id: 'A-1', qty: +1 }) {
  return `${order.qty} of ${order.id}`
}

const body = JSON.parse('{"id": "A-1", "qty": "2"}')
console.log(accept(body).message)
console.log(acceptShape(body).message)
```

The output:

```text
Expected Order for '…:5:accept.order', got object
Expected non-negative-integer for '…:10:acceptShape.order.qty', got string
```

Or log the payload next to the error.

**JSON has no `Date`.** A TypeScript interface that says `createdAt: Date` is wrong about
every value `JSON.parse` returns: the field is a string. Declare it as what arrives and
convert it after the check.

Native TJS does not allow `new Date()`, because a `Date` is mutable and its meaning depends
on the clock and time zone of the machine it runs on. The replacement is `Timestamp`: epoch
milliseconds, a plain number, with helpers such as `Timestamp.parse` (ISO string to
number), `Timestamp.addDays` and `Timestamp.iso` (number to ISO string). `TimestampISO` is
the type of an ISO 8601 string, which is what most APIs send. Unlike `isMonadicError`,
`Timestamp` and `TimestampISO` are imports, not globals:

```tjs:inline
import { Timestamp, TimestampISO } from 'tjs-lang'

Type Order {
  example: { id: 'A-1', placedAt: TimestampISO }
}

function accept(order: Order) {
  const placed = Timestamp.parse(order.placedAt)
  const due = Timestamp.addDays(placed, 3)
  return `${order.id} due ${Timestamp.iso(due)}`
}

const bodies = [
  '{"id": "A-1", "placedAt": "2025-11-06T09:30:00Z"}',
  '{"id": "A-2", "placedAt": "last Tuesday"}',
  '{"id": "A-3", "placedAt": 1762421400000}',
]

for (const body of bodies) {
  const result = accept(JSON.parse(body))
  console.log(isMonadicError(result) ? `rejected: ${result.message}` : result)
}
```

`A-1` is due `2025-11-09T09:30:00.000Z`. `A-2` is rejected because `"last Tuesday"` is not
an ISO timestamp, and `A-3` because a number is not a string: if your API sends epoch
milliseconds, declare the member as a number instead. When a library insists on a real
`Date`, `LegacyDate(x)` makes one; it is the named escape for `new Date(x)` (see "The rules
of `.tjs`" in the [syntax reference](/TJS-SYNTAX/)).

**A type-only return is not a check.** As in the table above: `:!` on a return documents
the result and nothing more, and so does `:` when the return is a named type. Use
`:? Order` on the function that reads the data, or pass the data to a function whose
parameter is `Order`.

**Converted code without `TjsStrict` checks nothing.** As the first section says, a
converted file keeps JavaScript's behaviour until it is marked `TjsStrict` or graduated
(turned into a native `.tjs` file, the second step in
[Converting a TypeScript Project](ts-converting-a-project.md)).
