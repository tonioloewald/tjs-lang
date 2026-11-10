<!--{"section": "ts", "type": "example", "group": "intro", "order": 3, "parent": "ts-intro.md"}-->
<!-- TODO review -->

# Type Transformation

How TypeScript annotations carry over into TJS, and the second spelling TJS offers: a
sample value in place of a type name.

TypeScript's types are erased when it compiles, so nothing checks them while the program
runs. TJS turns the same annotations into checks that run on every call. You get there with
the converter, `fromTS` (on the command line, `tjs convert file.ts`). It rewrites a
TypeScript file as TJS, and the doc site runs it for you on every `ts` example on this
page.

The converter keeps TypeScript's type names (`string`, `number`, `boolean`), because TJS
checks those names as real runtime types. It changes only the spellings TJS writes
differently.

TJS also accepts a second spelling. Instead of a type name, a parameter can carry a sample
value: `name: 'Alice'` means "a string, for instance `'Alice'`". This page calls that the
**example spelling**. You never have to use it, but it is what most hand-written TJS looks
like, so you need to be able to read it.

## A converted function

```ts:inline
// Converted TypeScript keeps JavaScript's behaviour until you opt in.
// This line opts in to full TJS, so the types are checked on every call:
/* @tjs TjsStrict */

type Mode = 'on' | 'off'

function processData(
  name: string,
  count: number,
  active: boolean,
  tags: string[],
  mode: Mode
): string {
  return `${name}: ${count} items, active=${active}, tags=[${tags.join(', ')}], mode=${mode}`
}

console.log(processData('Test', 42, true, ['a', 'b', 'c'], 'on'))

// TypeScript refuses these two calls at compile time. `as any` gets them past
// the compiler, the way data from JSON.parse or a network response does.
console.log('Wrong tag:', processData('Test', 42, true, ['a', 1] as any, 'on'))
console.log('Wrong mode:', processData('Test', 42, true, ['a'], 'maybe' as any))
```

The converter writes this TJS for the `type` and the function (the `/* line N */` marker
records where the function was in the TypeScript file):

```text
Union Mode 'Mode' 'on' | 'off'

/* line 7 */
function processData(name: string, count: number, active: boolean, tags: [string], mode: Mode):! string {
    return `${name}: ${count} items, active=${active}, tags=[${tags.join(', ')}], mode=${mode}`;
}
```

The first call prints `Test: 42 items, active=true, tags=[a, b, c], mode=on`. The other two
print an error each, and the program carries on to the next line:

```text
MonadicError: Expected string for '<source>:7:processData.tags[1]', got number
MonadicError: Expected Mode for '<source>:7:processData.mode', got string
```

A rejected call does not throw. It returns a `MonadicError`, a subclass of `Error` that
says where the check failed (`path`), what was declared (`expected`) and what arrived
(`actual`). Your code tests for one with `isMonadicError(result)` from `tjs-lang/runtime`;
[Hello TypeScript](ts-hello-typescript.md) reads those fields one by one.

Delete the `/* @tjs TjsStrict */` line and run again: all three calls print a string,
exactly as the compiled TypeScript would.

## The gotcha: a sample value is not a literal type

The example spelling is the most common misreading of TJS, by people and by language
models alike. `function greet(name: 'Alice')` looks like TypeScript's string-literal type,
which accepts only `'Alice'`. In TJS it accepts any string. `name: 'Alice'`, `name: ''` and
`name: string` all mean the same thing: a required string.

A closed set of values is written as a union of literals, which TJS reads as exactly that
set:

```tjs:inline
function greet(name: 'Alice') {
  return `Hello, ${name}!`
}

function setMode(mode: 'on' | 'off') {
  return `mode is ${mode}`
}

console.log(greet('Bob'))
console.log(greet(42))

console.log(setMode('on'))
console.log(setMode('maybe'))
```

`greet('Bob')` prints `Hello, Bob!`: `'Alice'` was an example of a string, and `'Bob'` is a
string. `greet(42)` prints `MonadicError: Expected string for '<source>:1:greet.name', got
number`. `setMode('on')` prints `mode is on`, and `setMode('maybe')` prints
`MonadicError: Expected "on" | "off" for '<source>:5:setMode.mode', got string`, because
`'maybe'` is not one of the two values the union lists.

The rule: one literal is an example of its type. Two or more literals **of the same type**
(all strings, or all numbers) joined with `|` are the complete list of allowed values. The
cases around that rule:

| You want                                 | Write in TJS                    | Notes                                                    |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------- |
| Any string                               | `name: ''` or `name: string`    | `name: 'Alice'` too; the value is only an example        |
| Exactly `'Alice'` (TS literal `'Alice'`) | `name: Exactly('Alice')`        | the converter writes this for a TS single-literal type   |
| One of a fixed set                       | `mode: 'on' \| 'off'`           | literals of one type: a closed set                       |
| A string or a number                     | `v: string \| number`           | literals of different types (`'' \| 0`) mean the same    |
| A string or `null`                       | `n: string \| null`             | so does `'Alice' \| null`; `\| null` does not close a set |
| Any boolean                              | `flag: true` or `flag: boolean` | `flag: true` accepts `false`                             |

So `'' | 0` is not the set `{'', 0}`: it is "a string or an integer", because each side is
an example of its own type.

## The full mapping

| TypeScript                 | Converted TJS                    | Written by hand in TJS                          |
| -------------------------- | -------------------------------- | ----------------------------------------------- |
| `name: string`             | `name: string`                   | `name: ''`                                      |
| `count: number`            | `count: number`                  | `count: 0.0` or `count: float` (any number)     |
|                            |                                  | `count: 0` or `count: int` (integer)            |
|                            |                                  | `count: +0` or `count: unsigned` (alias `uint`) |
| `flag: boolean`            | `flag: boolean`                  | `flag: true`                                    |
| `items: string[]`          | `items: [string]`                | `items: ['']`                                   |
| `type Mode = 'on' \| 'off'` | `Union Mode 'Mode' 'on' \| 'off'` | the same, or inline `mode: 'on' \| 'off'`        |
| `): string`                | `):! string`                     | `):! ''`, or a worked answer (see below)        |

- **Numbers: TJS reads how the literal is written.** JavaScript treats `0.0`, `0` and `+0`
  as the same number. TJS looks at the source text instead: `0.0` (with a decimal point)
  means any number, `0` means an integer, and `+0` means a non-negative integer. Each also
  has a name: `float`, `int`, and `unsigned` (or `uint`). TypeScript has one numeric type,
  so the converter maps `number` to the widest, any number, and converted code accepts
  everything it accepted before. Narrowing to `int` or `unsigned` is a change you make by
  hand, where you know the value is a count or an index.
- **Arrays: `[string]` is not a tuple.** In TypeScript `[string]` is a one-element tuple. In
  TJS it means "an array of strings", any length, and every item is checked. `['', 0]` is
  an array whose items are each a string or an integer. TJS has no tuple type: TypeScript's
  `[string, number]` converts to `['', 0.0]`, which checks each item's type but not the
  length or which type sits in which position.
- **`Union` declares a named set.** `Union Mode 'Mode' 'on' | 'off'` has three parts: the
  name you use in signatures and error messages (`Mode`), a human-readable description
  (`'Mode'`; the converter has only the name to offer, and by hand you would write
  something like `'switch position'`), and the members (`'on' | 'off'`). It is ordinary
  TJS, so you can write it by hand as well. `mode: Mode` then checks against exactly those
  two strings.

> **Converter limitation.** TJS supports an inline union like `mode: 'on' | 'off'`, but the
> converter does not translate one yet. Written inline in a TypeScript signature, the
> parameter comes out with no check at all (`mode`, not even a string check), and the
> converter writes a comment above the function naming what it dropped:
> `/* TODO: TS types degraded — mode: 'on' | 'off' */`. Give such a union a name with `type`
> before you convert, or add the annotation back by hand afterwards.

## Return types: an answer, not a type

Parameters and return values follow different rules, and this is the most surprising one on
the page. **A parameter example stands for a type. A return example is the exact answer
expected when the function is called with the parameter examples.**

So `function add(a: 2, b: 3): 5` is a test: when the file is transpiled (for example by
`tjs check`), TJS calls `add(2, 3)` and reports a failure unless the answer is `5`. This is
the signature test, and it is what the parameter examples are for: they are its inputs.

Two other forms change that:

- `:!` is type-only. No test runs, and the return value is not checked.
- `:?` runs the test and also checks the return value's type on every call.

A TypeScript return type is a type, not an answer, so the converter writes `:!`. Its
parameters are type names like `string`, which give no input to call the function with, so
there is nothing for a test to run on anyway. `:!` says so explicitly, and keeps saying so if
you later give the parameters examples.

Here is the same function written both ways by hand. The first uses type names, so there is
nothing to test and it uses `:!`. The second gives examples, so its return annotation is a
worked answer: `share(100, 0.5, 4)` must be `12.5`, and `tjs check` fails if it is not.

```tjs:inline
function share(total: int, ratio: float, people: unsigned):! float {
  return (total * ratio) / people
}

function shareChecked(total: 100, ratio: 0.5, people: +4): 12.5 {
  return (total * ratio) / people
}

console.log(share(100, 0.5, 4))
console.log(share(100.5, 0.5, 4))
console.log(share(100, 0.5, -4))
console.log(shareChecked(100, 0.5, 4))
```

`share(100, 0.5, 4)` prints `12.5`. The second call prints
`MonadicError: Expected integer for '<source>:1:share.total', got number`, because `100.5`
is not an integer, and the third prints
`MonadicError: Expected non-negative-integer for '<source>:1:share.people', got number`,
because `-4` is negative. `shareChecked` takes the same types (`100` is an integer, `0.5`
any number, `+4` a non-negative integer) and prints `12.5`.

Which form to use by hand is partly taste. The example form gives the reader a concrete
call to look at, it shows up in generated documentation, and with a worked return answer
it gives you a test for free.
