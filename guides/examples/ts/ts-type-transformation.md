<!--{"section": "ts", "type": "example", "group": "intro", "order": 3, "parent": "ts-intro.md"}-->

# Type Transformation

See how TypeScript types become TJS examples

<!-- TODO review -->

A TypeScript annotation names a type. A TJS annotation can do that too, or it can give an
example of a value and let the type follow from it. The converter keeps TypeScript's sound
type names, because TJS checks them as real runtime types, and changes only the spellings
TJS writes differently. The comment at the top of the example lists both: what the
converter writes, and the example-based spelling you would use writing TJS by hand.

```ts:inline
// TypeScript type syntax -> TJS
//
// TypeScript:          converted TJS:        written by hand in TJS:
// name: string    ->   name: string          name: ''
// count: number   ->   count: number         count: 0.0  (or 0 for an integer)
// flag: boolean   ->   flag: boolean         flag: true
// items: string[] ->   items: [string]       items: ['']
// ): string       ->   ):! string            ):! ''      (type only, no test)

function processData(
  name: string,
  count: number,
  active: boolean,
  tags: string[]
): string {
  return `${name}: ${count} items, active=${active}, tags=[${tags.join(', ')}]`
}

console.log(processData('Test', 42, true, ['a', 'b', 'c']))
```

<!-- TODO review -->

## What to notice

- **`name: string` and `name: ''` mean the same thing in TJS.** Both are "a required
  string". The example form is not a literal type: `''` accepts every string, and so would
  `'Alice'`. The value is there to document and to test with.
- **Arrays are written as an example array.** `[string]` (or `['']`) means "an array of
  strings", and every item is checked, not only the fact that it is an array.
- **The return type gains a `!`.** In TJS a plain return annotation is a _worked
  example_: `function add(a: 2, b: 3): 5` calls `add(2, 3)` at build time and fails the
  build unless the answer is `5`. A TypeScript return type is a type, not an answer, so the
  converter writes `:!`, the type-only form, which never runs a test.

<!-- TODO review -->

## The gotcha

The example spelling is the most common misreading of TJS, by people and by language
models alike: `function greet(name: 'Alice')` looks like TypeScript's string-literal type,
which would accept only `'Alice'`. In TJS it accepts any string. If you want a closed set of
values, write a union of literals (`mode: 'on' | 'off'`), which TJS reads as exactly that
set.
