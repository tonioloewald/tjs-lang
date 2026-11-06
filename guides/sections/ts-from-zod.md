<!--{"parent": "TJS-FOR-TS.md", "order": 5}-->
<!-- TODO review -->

# Replacing Zod, io-ts and Ajv

A TypeScript codebase that takes input from the outside world usually has two type systems.
The interface tells the compiler what a `User` is. A Zod schema (or io-ts codec, or Ajv
JSON Schema) tells the runtime, because the compiler's version is gone by the time the
request arrives. `z.infer` exists to stop the two drifting apart.

In TJS the type is an example of the data, and the example survives to run time. There is
one declaration, and it is the one that checks. This chapter shows the replacement piece by
piece, says what Zod still does better, and ends with a recipe for converting an API handler.

If your schemas started life as TypeScript interfaces, read
[Validating JSON at the Boundary](/ts-json-boundary/) first. Code converted from TypeScript
keeps JavaScript semantics and does not check its inputs unless you opt in with
`TjsStrict`; that chapter covers it. This chapter is about native TJS: code written as
`.tjs`, where every function checks its parameters.

## One schema, side by side

Here is a typical Zod schema:

```typescript
import { z } from 'zod'

const Address = z.object({ city: z.string(), zip: z.string() })

const User = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().nonnegative(),
  email: z.string().optional(),
  nickname: z.string().nullable(),
  role: z.enum(['admin', 'member']),
  tags: z.array(z.string()),
  address: Address,
})

type User = z.infer<typeof User>
```

And the same type in TJS:

```tjs:inline
Type Address {
  example: { city: 'Springfield', zip: '12345' }
}

Type User {
  description: 'a user as the API sends it'
  example: {
    id: 'u-1',
    name: 'Ada',
    age: +0,
    email: '' | undefined,
    nickname: '' | null,
    role: 'admin' | 'member',
    tags: [''],
    address: Address,
  }
}

const ada = {
  id: 'u-1',
  name: 'Ada',
  age: 36,
  nickname: null,
  role: 'admin',
  tags: ['math'],
  address: { city: 'London', zip: 'W1' },
}

console.log(User.check(ada))                              // true
console.log(User.check({ ...ada, email: 'ada@example.com' })) // true: optional, present
console.log(User.check({ ...ada, age: -1 }))              // false: +0 is non-negative
console.log(User.check({ ...ada, age: '36' }))            // false: no coercion
console.log(User.check({ ...ada, nickname: undefined }))  // false: nullable is not optional
console.log(User.check({ ...ada, role: 'root' }))         // false: closed set
console.log(User.check({ ...ada, address: { city: 'London' } })) // false: nested
```

The `example` describes the data; it is not an object you could log. Inside it, `|` builds a
union and a name such as `Address` refers to another `Type`. Both are TJS type syntax, not
JavaScript expressions (in plain JavaScript `'admin' | 'member'` would be a bitwise OR).

Read the example member by member. The values are examples, not constraints: `'Ada'` means
"a string", not "the string Ada". What carries meaning is the kind of value you chose:

- `age: +0` is a non-negative integer. The `+` says "non-negative"; `0` without it would
  allow `-1`, and `0.0` would allow `36.5`. The digit is only an example: `+1` admits `0` too.
- `email: '' | undefined` may be absent. If present it must be a string.
- `nickname: '' | null` must be present, and may be `null`. Like Zod, nullable and optional
  are different things.
- `role: 'admin' | 'member'` is a closed set. The rule for strings is: a lone string literal
  widens to "a string"; a union made only of string literals is the set of exactly those
  values; a union with any other member (`undefined`, `null`, a `Type`) keeps each member's
  ordinary meaning. So `'' | 'x'` is the set {`''`, `'x'`}, while `'' | null` (and
  `'admin' | null`) mean "a string, or null". For a single exact string, such as a tag, see
  `Union Circle` below.
- `tags: ['']` is an array of strings, and `address: Address` refers to another `Type`.
- A `Type`'s `description` is optional. It names the type in errors and in generated docs.

There is no `z.infer` line because there is nothing to infer from. `User` is already the
type: you write `function save(user: User)` and the parameter is checked against it.

## The map

A reference table: the rest of the chapter works through its rows, so come back to it when
you convert your own schemas. `''` stands for "your example"; it is only the string case.

| Zod                                   | TJS                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `z.object({ … })`                     | `Type User { example: { … } }`                                           |
| `z.string()`, `z.boolean()`           | an example value: `''` or `'Ada'`, `false`                               |
| `z.number()`                          | a float example: `0.0`, `9.99`                                           |
| `z.number().int()`                    | an integer example: `0`, `42`                                            |
| `z.number().int().nonnegative()`      | `+0`                                                                     |
| `z.array(Item)`                       | `[Item]`                                                                 |
| `z.unknown()`                         | `any` (a bare type name; `string`, `number`, `boolean` also work)        |
| `.optional()`                         | `<example> \| undefined`, e.g. `'' \| undefined`, `0 \| undefined`       |
| `.nullable()`                         | `<example> \| null`                                                      |
| `.nullish()`                          | `<example> \| null \| undefined`                                         |
| `z.enum(['a', 'b'])`                  | `'a' \| 'b'` inline, or `Union Name 'description' 'a' \| 'b'`            |
| `z.nativeEnum(E)`                     | `Enum Name 'description' { … }`                                          |
| `z.literal('circle')`                 | a one-member `Union Circle 'description' 'circle'`, or `Exactly('circle')` |
| `z.discriminatedUnion(…)`             | one `Type` per variant, same-name functions to dispatch (see below)      |
| `.refine(fn)`, `.superRefine(fn)`     | `predicate(x) { … }` in the `Type`                                       |
| `.default(v)`                         | a dictionary default on the parameter: `(query = { page: 1 })`           |
| `z.infer<typeof User>`                | not needed: `User` is the type                                           |
| `.parse(v)` (throws, strips)          | a gate function `f(user: User)` (returns a `MonadicError`; keeps extra keys) |
| `.safeParse(v).success`               | `User.check(v)` (returns a boolean)                                      |
| `.strip()` (Zod's default on parse)   | `User.strip(v)` (top level only)                                         |
| `zodToJsonSchema(User)`               | `User.toJSONSchema()`                                                    |
| a schema per handler, for OpenAPI     | `functionMetaToJSONSchema(fn.__tjs)` (inline shapes only today)          |
| a schema-builder API                  | `tjs-lang/schema` (tosijs-schema, with `$predicate`)                     |
| `z.record`, `z.tuple`, `z.date`       | no equivalent; see "What Zod still does better"                          |

For io-ts, a codec's `decode` is a gate or `check`; its `encode` has no equivalent (TJS does
not transform values). For Ajv, which already works in JSON Schema, `validate(value, schema)`
from `tjs-lang/schema` replaces `ajv.compile(schema)(value)` for the keywords tosijs-schema
supports (no `$ref` or `allOf`); move the schema into a `Type` when it describes data your
own code handles.

## `.parse` and `.safeParse`: a gate, or `check`

Zod's `.parse` throws on bad input; `.safeParse` returns a result object. TJS has two
equivalents, and neither throws.

`User.check(value)` (or `User(value)`; a `Type` is callable) returns `true` or `false`. Use
it where you only need the answer.

For `.parse`, write a **gate**: a function whose parameter is the type. A function in TJS
checks its parameters on every call, so a mismatched value never reaches the body. The call
returns a `MonadicError` instead, and the caller decides what to do with it. `MonadicError`
is an `Error` subclass with `message`, `path` (where the check failed), `expected` and
`actual`; it and `isMonadicError` are available in every TJS file with no import.

```tjs:inline
Type Order {
  example: { id: 'A-1', qty: +0, price: 9.99 }
}

// The gate: it returns the value, or a MonadicError if the value does not match.
function parseOrder(order: Order) {
  return order
}

for (const body of ['{"id": "A-1", "qty": 2, "price": 9.99}', '{"id": "A-2", "qty": "2", "price": 9.99}']) {
  const order = parseOrder(JSON.parse(body))
  if (isMonadicError(order)) {
    console.log('invalid:', order.message)
  } else {
    console.log('ok:', order.qty * order.price)
  }
}
// ok: 19.98
// invalid: Expected Order for '…parseOrder.order', got object
```

(The real message begins with the file and line where `parseOrder` is declared; it is
shortened to `…` here and below.)

The error is a value, not an exception. That matters in a handler: there is no `try` around
the validation, and an error you forget to check is still recorded by the runtime's
[Flight Recorder](/error-history/). (`__tjs` is the TJS runtime, a global, and
`__tjs.errors()` lists recent type errors. Every TJS function also carries its signature
metadata as `fn.__tjs`, which the JSON Schema section uses.)

Unlike `.parse`, the gate does not strip unknown keys: the body receives the object as it
arrived, extra keys included. The `.strip()` section below covers what to do about that.

In practice the gate is rarely an identity function. It is the function that does the work,
with the type on its parameter. The recipe at the end of this chapter is built that way.

## `.refine`: a predicate

A refinement is a rule the shape cannot express: a string that must be a slug, two fields
that must agree. In TJS that is a `predicate` in the `Type`. It runs only after the value has
matched the example's shape, so the predicate can assume the shape is right:

```tjs:inline
Type Slug {
  description: 'lowercase letters and digits, in words joined by hyphens'
  example: 'hello-world'
  predicate(x) {
    return x.length > 0 && x.length <= 64 &&
      x.split('-').every(w => w.length > 0 &&
        w.split('').every(c => 'abcdefghijklmnopqrstuvwxyz0123456789'.includes(c)))
  }
}

Type PasswordChange {
  example: { password: 'correct horse', confirm: 'correct horse' }
  predicate(x) {
    return x.password.length >= 8 && x.password == x.confirm
  }
}

console.log(Slug.check('hello-world'))   // true
console.log(Slug.check('Hello World'))   // false
console.log(Slug.check('a--b'))          // false
console.log(Slug.check('a_b!'))          // false
console.log(Slug.check(42))              // false: not a string, so the predicate never runs

console.log(PasswordChange.check({ password: 'correct horse', confirm: 'correct horse' })) // true
console.log(PasswordChange.check({ password: 'correct horse', confirm: 'correct house' })) // false
console.log(PasswordChange.check({ password: 'short', confirm: 'short' }))                 // false
```

A predicate written in the pure style (no loops, no `await`, no IO, no regex; iterate with
`every`, `some` and `map`) is verified when it is transpiled and compiled to a fuel-bounded
guard. Fuel is a step budget, so evaluation always stops: a hostile input cannot make the
check hang. Both predicates above are verified. That is why `Slug` tests characters with
`includes` instead of a regex: a native regex match is one call the budget cannot see inside.
A predicate that is not in the pure style still runs, but it is not bounded, and the
transpiler prints a warning that says so and names the construct that stopped verification.
See [Predicate Types](/predicate-types/).

## `z.enum`, `z.nativeEnum`, `z.literal`

A literal union written inline (`role: 'admin' | 'member'`) is a closed set with no name.
When you want a name, or the list of values at run time, declare it:

```tjs:inline
Union Role 'what a user may do' 'admin' | 'member' | 'guest'

Enum Plan 'billing plan' {
  Free = 'free'
  Pro = 'pro'
}

Union Circle 'the circle tag' 'circle'

function grant(role: Role, plan: Plan) {
  return `${role} on ${Plan.names[plan]}`
}

console.log(Plan.Pro)                              // pro
console.log(grant('admin', Plan.Pro))              // admin on Pro
console.log(grant('admin', 'pro'))                 // admin on Pro
console.log(isMonadicError(grant('root', 'pro')))  // true
console.log(Role.values)                           // [ "admin", "member", "guest" ]
console.log(Plan.values)                           // [ "free", "pro" ]
console.log(Circle.check('circle'), Circle.check('square'))  // true false
```

The quoted string after the name is the declaration's description, shown in errors and in
generated docs; `Union` and `Enum` take it in that position. An `Enum` body lists one
`Name = value` member per line, with no commas.

`Union` is the `z.enum` equivalent. `Enum` adds member names and reverse lookup
(`Plan.names['pro']` is `'Pro'`), which is what `z.nativeEnum` gives you over a TypeScript
`enum`. A member reads as its value (`Plan.Pro` is `'pro'`), so a caller may pass either
`Plan.Pro` or the raw string, which is what arrives in JSON anyway. A one-member `Union` is
`z.literal`.

One trap: a string inside a `Type` example is an example, so `kind: 'circle'` means "a
string", not "the string circle". For a literal tag, use the one-member union:
`example: { kind: Circle, radius: 1.0 }`. `Exactly('circle')` written inline does the same
check (it is what [TJS for TypeScript Programmers](/tjs-for-ts/) uses in its section on
discriminated unions), but today it comes out as `{}` in JSON Schema, while the one-member
`Union` comes out as `{"enum":["circle"]}`. If the schema leaves your process, use the
`Union`.

For `z.discriminatedUnion`, declare one `Type` per variant with its own tag and write a
same-name function per variant; the call dispatches to the variant the value matches, and a
value that matches none is an error. That section of TJS for TypeScript Programmers shows it.

## `.default`: dictionary defaults

Zod fills in missing fields during `.parse`. TJS does the same for a parameter whose default
is an object literal: a partial argument is merged with the default, member by member, and
each member is checked against its default's type:

```tjs:inline
Union Sort 'sort order' 'asc' | 'desc'

function listUsers(query = { page: 1, limit: 20, sort: 'asc' }) {
  if (!Sort.check(query.sort)) {
    return new MonadicError(`sort must be one of: ${Sort.values.join(', ')}`)
  }
  return query
}

console.log(JSON.stringify(listUsers()))              // {"page":1,"limit":20,"sort":"asc"}
console.log(JSON.stringify(listUsers({ page: 3 })))   // {"page":3,"limit":20,"sort":"asc"}
console.log(listUsers({ page: '3' }).message)         // Expected integer for '…listUsers.query.page', got string
console.log(listUsers({ sort: 'up' }).message)        // sort must be one of: asc, desc
console.log(JSON.stringify(listUsers({ page: 2, q: 'ada' }))) // {"page":2,"q":"ada","limit":20,"sort":"asc"}
```

The members of a dictionary default must be plain literals, because a default is a value,
not a type. Writing `sort: 'asc' | 'desc'` there is refused when the file is transpiled. To
get `z.enum(['asc', 'desc']).default('asc')`, default the member to a plain `'asc'` and check
it against a `Union` in the body, as above. Extra keys pass through, like `q` in the last
line.

A `Type` does not fill in missing members. It has a `.default` property, but that is the
example value as a whole, not a per-member fill-in. When you want fill-in, use a dictionary
default on the parameter. See [Dictionary Defaults](/dictionary-defaults/) for the full rules.

## `.strip()` and extra keys

`User.check` lets extra keys through, like a TypeScript interface. Zod's `.parse` strips
them by default. When extra keys could do harm (an `isAdmin` flag written straight into a
database row is the classic case), call `strip` before you store. It returns a new object
holding only the keys the example names:

```tjs:inline
import { validate } from 'tjs-lang/schema'

Type Address {
  example: { city: 'Springfield' }
}

Type Profile {
  example: { name: 'Ada', bio: '' | undefined, address: Address }
}

const incoming = { name: 'Ada', isAdmin: true, address: { city: 'London', isAdmin: true } }

console.log(Profile.check(incoming))                     // true: extra keys pass
console.log(validate(incoming, Profile.toJSONSchema()))  // false: the schema is closed
console.log(JSON.stringify(Profile.strip(incoming)))
// {"name":"Ada","address":{"city":"London","isAdmin":true}}
console.log(JSON.stringify({ ...Profile.strip(incoming), address: Address.strip(incoming.address) }))
// {"name":"Ada","address":{"city":"London"}}
```

Two things to know before you rely on it:

- **`strip` is shallow.** It removes extra keys at the top level only. A nested `Type`, an
  inline nested object or the elements of an array keep their extra keys, where Zod strips
  at every level. Strip nested members yourself, as in the last line, or build the stored
  row field by field.
- **`check` and the type's JSON Schema disagree about extra keys.** `toJSONSchema()` sets
  `additionalProperties: false`, so a payload with extra keys passes `Profile.check` but
  fails `validate(v, Profile.toJSONSchema())`, and fails in any other consumer of the
  exported schema (an API gateway, an LLM's structured output). If the schema leaves your
  process, strip what you send.

There is no `.strict()` equivalent on the `Type` itself. If you need extra keys to be an
error, validate against the JSON Schema as above, or check for them in a `predicate`.

## JSON Schema out

`zodToJsonSchema` is a separate package that walks a Zod schema. In TJS a `Type` produces its
own JSON Schema, and so does every function, from its signature. One limitation first: a
parameter typed with a declared `Type` (`function save(user: User)`, the usual handler
shape) comes out as `{}` in the function's schema today. Take that member's schema from
`User.toJSONSchema()`.

```tjs:inline
import { functionMetaToJSONSchema } from 'tjs-lang/lang'

Type Profile {
  example: { name: 'Ada', bio: '' | undefined }
}

console.log(JSON.stringify(Profile.toJSONSchema()))

function rename(id: 'u-1', name: 'Ada', notify = false): { id: 'u-1', name: 'Ada' } {
  return { id, name }
}

const { input, output } = functionMetaToJSONSchema(rename.__tjs)
console.log(JSON.stringify(input))
console.log(JSON.stringify(output))
```

It prints:

```text
{"type":"object","properties":{"name":{"type":"string"},"bio":{"type":"string"}},"required":["name"],"additionalProperties":false}
{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"notify":{"type":"boolean"}},"required":["id","name"]}
{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"}},"required":["id","name"],"additionalProperties":false}
```

`Profile` lists `name` as required and `bio` as optional, and closes the object.
`functionMetaToJSONSchema` returns `{ input, output }`: one object schema for the parameters
(`notify` is not required because it has a default) and one for the result. That pair is
what an OpenAPI document, an API gateway or an LLM's structured-output mode wants.

The return annotation on `rename` is a worked example, not only a type: the transpiler calls
`rename('u-1', 'Ada')` and fails the build if the result is not `{ id: 'u-1', name: 'Ada' }`.
That is why it matches the parameter examples. When you want the type without the test,
write `:!` instead of `:` (`):! { id: '', name: '' }`). See the Return types section of
[TJS for TypeScript Programmers](/tjs-for-ts/).

Predicates do not make it into the JSON Schema either. JSON Schema cannot express arbitrary
code, so a validator fed a `Type`'s schema checks the shape and nothing more.
(`tjs-lang/schema`, below, is the route for carrying a predicate in a schema.)

<!-- TODO review: measured 2026-11-06: a parameter typed with a named Type is {} in
functionMetaToJSONSchema; Exactly('x') is {} in toJSONSchema; a `{}` example accepts any
object at run time but its schema is a closed empty object; Type.strip is shallow. Each may
be a defect worth a card. -->

## `z.infer` for TypeScript callers

Inside TJS you never need it. When TypeScript code consumes a TJS module, export the type and
emit a declaration file:

```tjs
// users.tjs
export Type User {
  example: { id: 'u-1', email: '' | undefined }
}

export function save(user: User) {
  return user.id
}
```

`bunx tjs emit --dts -o build/users.js users.tjs` writes `build/users.js` and, beside it,
`build/users.d.ts` with `export type User = { id: string; email: string | undefined }` and a
declaration for `save`. The TypeScript side gets its type from the same declaration that
checks the value.

Today an optional member is written as `email: string | undefined`, a required key, rather
than `email?: string`. So TypeScript callers must write `email: undefined` explicitly when
they have no email; leaving the key out is a TypeScript error, even though TJS accepts it.

## `tjs-lang/schema`: when you want a builder

Some code is better served by a schema-builder API: schemas assembled at run time, schemas
shipped as JSON to another service, or a team that wants Zod's shape of API. `tjs-lang/schema`
is tosijs-schema (a small, JSON-Schema-first builder) with one addition: it understands the
`$predicate` keyword, so a schema can carry a predicate's source as data.

```tjs:inline
import { s, validate, trustPredicate } from 'tjs-lang/schema'

const Signup = s.object({
  email: s.email,
  age: s.integer.min(13),
  role: s.enum(['admin', 'member']),
  nickname: s.string.optional,
})

console.log(Signup.validate({ email: 'ada@example.com', age: 36, role: 'admin' }))  // true
console.log(Signup.validate({ email: 'ada@example.com', age: 9, role: 'admin' }))   // false

const Slug = {
  type: 'string',
  $predicate: trustPredicate(`
    function isSlug(v) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) }
  `),
}
console.log(validate('hello-world', Slug), validate('Hello World', Slug))  // true false
```

A schema built with `s` has a `.validate` method; a plain JSON Schema object, like `Slug`,
goes through the free function `validate(value, schema)`. Note also that most builder terms
are properties, not calls: `s.email`, `s.integer.min(13)`, `s.string.optional`.

A `$predicate` compiles to native JavaScript, so the receiving side runs it only if it
trusts that exact source. The flow is:

1. The schema carries the predicate's source as a string, so it can travel as JSON.
2. The receiving side calls `trustPredicate` on the same source, taken from its own code,
   never from the payload. (`trustPredicate` returns its argument, which is why the example
   can register and use the source in one expression.)
3. On validation, a `$predicate` whose source was registered runs. One that was not fails
   closed: validation returns `false`, with a console warning naming the cause.

Never pass user-supplied predicate source to `trustPredicate`. A validator that does not
know `$predicate` ignores it and checks the structure, so the same schema still works, more
loosely, in other tools.

See [Working with tosijs-schema](/tosijs-schema/) for the builder API.

## What Zod still does better

TJS replaces the part of Zod that answers "is this value the right shape?". Some of Zod is
not that, and TJS has no equivalent yet:

- **Transforms and coercion.** `z.coerce.number()`, `.transform()`, `.pipe()` and
  `z.preprocess()` change the value while validating it. TJS never coerces (`'2'` is not a
  number) and has no transform step. Check first, then convert in ordinary code.
- **Custom error messages.** `z.string().min(8, 'Password too short')` attaches a message to
  a rule. A TJS error message is generated, names the expected type and begins with the
  source file and line. To show users something friendlier, and to avoid sending your
  file layout to API clients, map the error in the gate.
- **Error paths into named types.** Zod's `ZodError.issues` lists every failing member with
  its path. When a value fails a named `Type`, the TJS message says which parameter and which
  type (`Expected CreateUser for '…createUser.body', got object`), not which member. An
  inline shape or a dictionary default does report the member (`…listUsers.query.page`), and
  you can call `check` on the member types yourself when you need to know.
- **Every issue at once.** Zod collects all failures; a TJS check stops at the first.
- **`.strict()`, `.partial()`, `.pick()`, `.omit()`, `.extend()`, `.brand()`.** There are no
  schema combinators. Write the second `Type` out, or build the schema with
  `tjs-lang/schema`.
- **Records, tuples and dates.** There is no `z.record` (an object whose values are all of
  one type) and no `z.tuple`: an array example such as `['', 0]` means "an array of the
  first element's kind", so it is an array of strings. TJS refuses `new Date()` in `.tjs`
  files, so there is no `z.date`; carry dates as ISO strings or epoch-millisecond numbers.
- **Async refinements.** A Zod refinement may `await` a database lookup. A TJS predicate must
  be synchronous; do the lookup in the handler.
- **Ecosystem.** tRPC, react-hook-form, and many other libraries accept a Zod schema
  directly. They do not accept a TJS `Type`, though most accept JSON Schema.

## Recipe: converting an API handler module

A typical Zod handler parses the body, catches the error, and then does the work:

```typescript
import { z } from 'zod'

const CreateUser = z.object({
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
  age: z.number().int().nonnegative().optional(),
})

const users: Array<{ id: string } & z.infer<typeof CreateUser>> = []

export function handle(raw: string) {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { status: 400, body: { error: 'body is not JSON' } }
  }
  const parsed = CreateUser.safeParse(json)
  if (!parsed.success) {
    return { status: 422, body: { error: parsed.error.message } }
  }
  const user = { id: `u-${users.length + 1}`, ...parsed.data }
  users.push(user)
  return { status: 201, body: user }
}
```

The TJS version, step by step:

1. **Turn each `z.object` into a `Type`.** Replace each member's schema with an example
   value of the right kind, using the map above. Pick examples that say what you mean:
   `+0` for a count, `0.0` for a price.
2. **Turn each `.refine` (and `.email()`, `.url()`, and other string formats) into a
   `predicate`**, on a `Type` of its own if it is used in more than one place. The `Email`
   below is deliberately minimal (it accepts `'@'`); for a fuller format check, `s.email`
   in `tjs-lang/schema` is an option.
3. **Turn each `z.enum` into an inline union or a `Union`.**
4. **Delete the `z.infer` lines.** Use the `Type` name in signatures.
5. **Move the work into a gate function** whose parameter is the `Type`. The `safeParse`
   call and its `success` check become one `isMonadicError` check on the result.
6. **Call `strip` before storing**, because a TJS check, unlike `.parse`, keeps extra keys.
   `strip` is shallow, so strip any nested object members as well.
7. **Keep `JSON.parse` in a `try`.** Malformed JSON is still an exception; only the
   validation stops being one.

```tjs:inline
Union Role 'what a user may do' 'admin' | 'member'

Type Email {
  description: 'an email address'
  example: 'ada@example.com'
  predicate(x) { return x.includes('@') && x.length <= 254 }
}

Type CreateUser {
  example: { name: 'Ada', email: Email, role: Role, age: +0 | undefined }
}

const users = []

// The gate. Its parameter is the schema; its body is the handler logic.
function createUser(body: CreateUser) {
  const user = { id: `u-${users.length + 1}`, ...CreateUser.strip(body) }
  users.push(user)
  return user
}

// The transport adapter: bytes in, status and body out.
function handle(raw) {
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    return { status: 400, body: { error: 'body is not JSON' } }
  }
  const user = createUser(json)
  if (isMonadicError(user)) {
    return { status: 422, body: { error: user.message } }
  }
  return { status: 201, body: user }
}

const requests = [
  '{"name": "Ada", "email": "ada@example.com", "role": "admin", "isAdmin": true}',
  '{"name": "Grace", "email": "grace@example.com", "role": "member", "age": 85}',
  '{"name": "Eve", "email": "not-an-email", "role": "admin"}',
  '{"name": "Mallory", "email": "m@example.com", "role": "root"}',
  '{"name": ',
]
for (const raw of requests) {
  const res = handle(raw)
  console.log(res.status, JSON.stringify(res.body))
}
// 201 {"id":"u-1","name":"Ada","email":"ada@example.com","role":"admin"}
// 201 {"id":"u-2","name":"Grace","email":"grace@example.com","role":"member","age":85}
// 422 {"error":"Expected CreateUser for '…createUser.body', got object"}
// 422 {"error":"Expected CreateUser for '…createUser.body', got object"}
// 400 {"error":"body is not JSON"}
```

Ada's request is accepted and her `isAdmin` key is dropped by `strip`. Grace's optional
`age` is kept. Eve fails the `Email` predicate and Mallory fails the `Role` set; both get a
422 whose message names `CreateUser`, not the member that was wrong (the error-path
limitation above). The last request is not JSON at all and never reaches the gate.

Two things changed shape in the conversion. The handler body moved into `createUser`, so
the code that depends on a valid `CreateUser` is the code that declares it. And the module
has one description of a new user instead of a schema plus an inferred type, so there is
nothing left to keep in step.
