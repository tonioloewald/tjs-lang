<!--{"section": "ts", "type": "example", "group": "patterns", "order": 1, "parent": "ts-patterns.md"}-->

# Array Operations

Array types flow through the pipeline

<!-- TODO review -->

An array type in TypeScript, `number[]`, says something about every element, and nothing
checks any of them at run time. One stray string in a list of numbers turns `reduce` into
string concatenation and an average into `NaN`, with no error anywhere. The converter turns
`number[]` into TJS's array type, `[number]`, and once the file is full TJS the elements are
checked, not only the fact that the value is an array.

```ts:inline
// Array types are preserved

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function filterPositive(numbers: number[]): number[] {
  return numbers.filter(n => n > 0)
}

const data = [-1, 2, -3, 4, 5, -6, 7]
console.log('Data:', data)
console.log('Sum:', sum(data))
console.log('Average:', average(data))
console.log('Positive only:', filterPositive(data))
```

<!-- TODO review -->

## What to notice

- **Array methods are untouched.** `reduce`, `filter` and arrow functions convert as they
  are; only the signatures change. The bodies run exactly as they would after `tsc`.
- **Functions call functions.** `average` calls `sum`. With checking on, the array is
  checked when it enters `average` and again when it enters `sum`. That cost is real but
  small next to the work the function does; a function you call in a tight loop can skip
  checks with TJS's `!` marker once you have converted it.

<!-- TODO review -->

## The gotcha

This example has no `TjsStrict` line, so nothing is checked. Add `/* @tjs TjsStrict */` at
the top and call `sum([1, '2', 3] as any)`: the error names the element, `sum.numbers[1]`,
expected `number`, got `string`. Without the line, the same call returns the string `'123'`
(`0 + 1` is `1`, then `1 + '2'` is `'12'`, then `'12' + 3` is `'123'`), and `average` of that
list is `41`. Every element is checked, so checking a very large array costs time
proportional to its length.
