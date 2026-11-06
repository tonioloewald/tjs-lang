<!--{"section": "tjs", "order": 4, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Array Types

Typed array parameters, rest parameters and array returns

An array type in TJS is written the way every other TJS type is: as an example. `[0]` is an
example of an array of integers, `['']` of an array of strings, `[{ x: 0, y: 0 }]` of an
array of points. TJS reads the example for its **element type** and checks every element on
every call.

```tjs:inline
function sum(numbers: [3, 7]): 10 {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: [10, 30]): 20.0 {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function stats(data: [10, 20, 30]): { min: 10, max: 30, avg: 20.0 } {
  if (data.length === 0) {
    return { min: 0, max: 0, avg: 0 }
  }
  return {
    min: Math.min(...data),
    max: Math.max(...data),
    avg: average(data),
  }
}

test 'sum adds numbers' {
  expect(sum([1, 2, 3, 4])).toBe(10)
}

test 'stats calculates correctly' {
  const s = stats([10, 20, 30])
  expect(s.min).toBe(10)
  expect(s.max).toBe(30)
  expect(s.avg).toBe(20)
}

console.log(sum([1, 2, 3, 4]))           // 10
console.log(average([1, 2]))             // 1.5
console.log(stats([4, 8, 15, 16, 23]))   // { min: 4, max: 23, avg: 13.2 }
console.log(stats([]))                   // { min: 0, max: 0, avg: 0 }
console.log(sum([1, 2.5]).message)       // 2.5 is not an integer
console.log(sum('1,2').message)          // a string is not an array
```

## What to notice

**The example says "array of integers", not "these numbers".** `[3, 7]` and `[10, 20, 30]`
describe the same type: an array whose elements are integers, of any length. The particular
elements matter only to the signature test.

**The signature is a worked example, and it is run.** When the file is compiled, TJS calls
`sum([3, 7])` and checks that the answer is `10`; it calls `average([10, 30])` and checks
for `20`. Pick array examples that make a meaningful test, not just the right type. If you
want the type without the test, write `:!` before the return example.

**`average` and `stats` return `20.0`, not `20`.** The example inputs happen to average to
a whole number, but averages in general do not. A return example of `20` would claim the
function returns integers, and `average([1, 2])` would then be reported as a type error
when it returns `1.5`. Write the return example for the general case.

**An empty array is a valid argument.** `stats([])` passes the check, because there are no
elements to get wrong. The type cannot promise you a non-empty array, so `average` and
`stats` test for `length === 0` in the body.

## Every element is checked, and errors name the index

The check visits each element, so a bad value deep in a long list is reported where it is,
including the field inside an object element:

```tjs:inline
function total(prices: [0.0]): 0.0 {
  return prices.reduce((sum, p) => sum + p, 0)
}

function centroid(points: [{ x: 0.0, y: 0.0 }]): { x: 0.0, y: 0.0 } {
  const n = points.length
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  }
}

console.log(total([9.99, 5, 0.01]))       // 15
console.log(total([1, '2', 3]).message)   // ...total.prices[1], got string

console.log(centroid([{ x: 0, y: 0 }, { x: 2, y: 4 }]))   // { x: 1, y: 2 }
console.log(centroid([{ x: 0, y: 0 }, { x: 2 }]).message) // ...points[1].y, got undefined
```

A failed check does not throw. The function returns a `MonadicError` instead of running,
and its `message` carries the path (`total.prices[1]`) plus what was expected and what
arrived. [Safety & Validation](/safety-validation/) covers what you can do with that value.

## Ways to write an array type

| Example | Means |
| ------- | ----- |
| `[0]` | array of integers |
| `[0.0]` | array of numbers (any number, including `1.5`) |
| `[+0]` | array of non-negative integers |
| `['']` | array of strings |
| `[{ x: 0, y: 0 }]` | array of objects with integer `x` and `y` |
| `[[0]]` | array of arrays of integers |
| `['', 0]` | array whose elements are each a string or an integer |
| `[]` | array of anything |
| `number[]` | array of numbers, the TypeScript spelling (same as `[0.0]`) |
| `int[]` | array of integers (same as `[0]`) |
| `string[][]` | arrays nest in the suffix spelling too |

The suffix spelling exists so that TypeScript you paste in keeps working. `number[]` means
any number, not integers, because `number` has to keep meaning what it means in
TypeScript. The generic spelling `Array<number>` is not accepted: write `number[]`.

## Rest parameters

A rest parameter collects the remaining arguments into an array, and you type it with an
array example, exactly like an array parameter. The difference is only in how it is
called: with separate arguments, not one array.

```tjs:inline
function count(...ids: [1, 2, 3]): 3 {
  return ids.length
}

function label(prefix: 'item', ...parts: ['a', 'b']): 'item:a-b' {
  return prefix + ':' + parts.join('-')
}

console.log(count(10, 20, 30, 40))       // 4
console.log(count())                     // 0: no arguments gives an empty array
console.log(count(1, 2.5).message)       // ...count.ids[1], got number
console.log(label('row', 'x', 'y'))      // row:x-y
console.log(label('row'))                // row:
console.log(label('row', 'x', 7).message) // ...label.parts[1], got number
```

The signature test spreads the example too: `count(...ids: [1, 2, 3]): 3` is tested by
calling `count(1, 2, 3)` and checking for `3`.

## Arrays as return values

A return example that is an array is compared with the actual result element by element,
like any other worked example:

```tjs:inline
function doubled(xs: [1, 2]): [2, 4] {
  return xs.map((x) => x * 2)
}

console.log(doubled([5, 6, 7]))   // [ 10, 12, 14 ]
```

At compile time TJS calls `doubled([1, 2])` and requires exactly `[2, 4]`. A function whose
real output for that input differs fails the check, even if the result is "an array of
integers". To declare only the type, write `:! [0]`.

## Things that trip people up

- **`[0]` is an array of integers.** `total([1.5])` would fail if `total` took `[0]`. Use
  `[0.0]`, or `number[]`, for any number.
- **A mixed example is a union, not a tuple.** `['', 0, true]` means "every element is a
  string, an integer or a boolean", in any order and any length. It does not mean "three
  elements: a string, then an integer, then a boolean".
- **An empty array passes any array type.** If your function cannot cope with `[]`, check
  for it in the body.
- **A rest parameter cannot have a default.** `...xs: number[] = [1]` is a compile error.
  A rest parameter is always bound (to `[]` when nothing is passed), so the default could
  never apply.
- **Checking costs a pass over the array.** The check visits every element on every call,
  so its cost grows with the length of the array. For a hot function that takes large
  arrays, measure first; if it matters, check once in an outer function and do the work in
  an inner function marked `!`, which skips the checks. See
  [Safety & Validation](/safety-validation/).
