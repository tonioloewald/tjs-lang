<!--{"parent": "ts-examples.md", "order": 3}-->
<!-- TODO review -->

# Patterns

Three of the most common shapes in TypeScript are arrays of things, objects that contain
objects, and values that may be missing. This section shows how each one converts, and what
TJS checks once it has. Each pattern below links to its example page, where the code runs in
the page and you can edit it.

## Converting, and opting in

The converter, `fromTS` (on the command line, `tjs convert --emit-tjs file.ts`), reads your
TypeScript and writes TJS, which the TJS compiler then turns into JavaScript. The example
pages do both steps for you. [Converting a Project](/ts-converting-a-project/) covers doing
it to your own code.

Converted code keeps JavaScript's behaviour by default, so converting a working program
does not change what it does: the types are carried along and nothing checks them. To turn
them into checks, put this comment at the top of the TypeScript file, before converting it:

```typescript
/* @tjs TjsStrict */

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}
```

With the line, every parameter is checked at run time, on every call, before the function
body runs. Return types are not checked: `: number` converts to `:! number`, a type-only
return that TJS records for documentation.

A failed check does not throw. The function returns a `MonadicError` in place of its
result, an error value that names the parameter, the type it expected and what arrived.
[Runtime Validation](/ts-runtime-validation/) covers what to do with one.

Every example in this section runs with the line, and the bad call is already in the code,
so you see the check fire. Array Operations also shows the same functions without it, and
the other two say what prints when you delete it.

| TypeScript                   | Converts to                    | What TjsStrict checks                      |
| ---------------------------- | ------------------------------ | ------------------------------------------ |
| `number[]`                   | `[number]`, an array of number | every element, not only "is an array"      |
| `interface Person { … }`     | `Type Person { example: … }`   | the whole shape, nested types included     |
| `string \| null`             | the same union                 | a string or `null`; `undefined` is refused |
| `type Status = 'a' \| 'b'`   | `Union Status 'Status' …`      | one of the listed strings                  |

## Arrays

[Array Operations](/ts-array-operations/)

```typescript
/* @tjs TjsStrict */

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

const scores: number[] = JSON.parse('[1, "2", 3]')
console.log(sum(scores).message)
```

`number[]` converts to `[number]`. In TJS an array with one item in it describes an array
of that item, so `[number]` means "an array of numbers", not a one-element tuple. Each
element is checked, so one string in a list of numbers is caught, and the error names its
index:

```text
Expected number for '<source>:3:sum.numbers[1]', got string
```

The path is the source, the line where `sum` is declared, then the parameter and the index
of the first bad element. Without the `TjsStrict` line the same call returns the string
`'123'`, because `reduce` turns `+` into string concatenation as soon as it meets `'2'`.

Checking every element costs time proportional to the array's length, on every call. Check
at the boundary where data arrives; once a file is native TJS you can mark an inner
function's parameter with `!` to skip its check. Array Operations shows how, and the
[performance guide](/performance/) has measurements.

A TypeScript tuple, `[number, string]`, converts to `[0.0, '']`. TJS reads that as an array
whose items may be any of those types, not as a tuple: length and position are not checked.

## Nested objects

[Nested Objects](/ts-nested-objects/)

Each interface becomes a TJS `Type`. A TJS type is described by an example value: `''`
means "a string" and `0.0` means "a number". The converter picks the example from your
TypeScript type, so you never write one yourself. An interface that uses another one by
name keeps the name:

```typescript
interface Address {
  city: string
}

interface Person {
  name: string
  address: Address
}

function city(person: Person): string {
  return person.address.city
}
```

The two interfaces become

```text
Type Address {
  example: { city: '' }
}

Type Person {
  example: { name: '', address: Address }
}
```

At run time `address: Address` refers to the `Address` type itself, not a copy of its
shape, so checking a `Person` checks its address with `Address`. Because it is a reference,
a type can name itself (`next: ListNode | null`) or a type declared later in the file, as in
TypeScript.

The error names the outer type that failed, not the member inside it. A `Person` whose
`address.city` is `1` is rejected with:

```text
Expected Person for '…city.person', got object
```

That is how the check reports today: it is deep, the message is not. The path tells you
which parameter to look at; finding the bad member inside it is up to you. Once the file is
native TJS, `Address.check(person.address)` returns `true` or `false`, so you can test the
inner value on its own.

## Nullable values

[Union Types](/ts-union-types/)

```typescript
/* @tjs TjsStrict */

function greet(name: string | null): string {
  return name === null ? 'nobody' : 'hi ' + name
}

greet(null) // 'nobody'
greet(undefined as any) // a MonadicError
```

With `strictNullChecks`, TypeScript already keeps `null` and `undefined` apart, but only at
compile time, and only for values `tsc` can see. TJS checks it when the function is called:
`string | null` accepts a string or `null` and rejects `undefined`, including an
`undefined` that arrived from JSON or through a cast.

```text
Expected string for '<source>:3:greet.name', got undefined
```

To accept a string, `null`, or a missing argument, write `name?: string | null`. It
converts to `name: string | null | undefined`, which accepts all three.

Named literal unions (`type Status = 'active' | 'inactive'`) and unions of types
(`number | string`) are checked too. Inline literal unions and discriminated unions are not:
the first degrades to an unchecked parameter with a `TODO` comment, and the second converts
to a `Type` that accepts any value. Union Types shows how to write them so they are checked.

## Elsewhere

Optional interface members (`address?: Address`) are covered at the end of Nested Objects.
Optional parameters and defaults have their own page,
[Optional Parameters](/ts-optional-parameters/). Generics, async functions and classes are
in [Advanced](/ts-advanced/).

<!-- prettier-ignore-start -->

<!-- toc -->
- [Array Operations](/ts-array-operations/)
- [Nested Objects](/ts-nested-objects/)
- [Union Types](/ts-union-types/)
<!-- /toc -->

<!-- prettier-ignore-end -->
