<!--{"section": "tjs", "order": 4, "parent": "tjs-basics.md"}-->

# Array Types

Working with typed arrays

Array types use a single-element example:
- `[0]` = array of integers (`[0.0]` for any number)
- `['']` = array of strings
- `[{ x: 0 }]` = array of objects shaped like `{ x: 0 }`

```tjs:static
test 'sum adds numbers' {
  expect(sum([1, 2, 3, 4])).toBe(10)
}

test 'stats calculates correctly' {
  const s = stats([10, 20, 30])
  expect(s.min).toBe(10)
  expect(s.max).toBe(30)
  expect(s.avg).toBe(20)
}

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
    avg: average(data)
  }
}
```

<!-- TODO review -->

## What to notice

An array example is read the way an object example is: for its **element type**, not its
contents. `[3, 7]` says "an array of integers" and `[10, 20, 30]` says exactly the same
thing. The particular elements matter only to the signature test, which calls `sum([3, 7])`
and checks that the result is `10`. So a good array example does double duty: it fixes the
element type and gives the test a meaningful input.

The element type is checked element by element, so a mistake deep in a long list is reported
at its index (`total.prices[1]`), not as a vague "wrong array".

`average` and `stats` return `20.0`, not `20`. Their test result happens to be a whole
number, but an average in general is not, and the return example should describe the
general case. `20` would claim the function returns integers.

## Run it

```tjs:inline
function total(prices: [0.0]): 0.0 {
  return prices.reduce((sum, p) => sum + p, 0)
}

// The TypeScript spelling works too, and nests
function rows(grid: number[][]) {
  return grid.length
}

// A rest parameter takes an array example for its elements
function count(...ids: [0]) {
  return ids.length
}

console.log(total([9.99, 5, 0.01]))   // 15
console.log(total([]))                // 0: an empty array is still an array
console.log(total([1, '2']).message)  // names the bad element
console.log(total('1,2').message)     // a string is not an array
console.log(rows([[1], [2, 3]]))      // 2
console.log(count(1, 2, 3))           // 3
console.log(count(1, 2.5).message)    // 2.5 is not an integer
```

## Things that trip people up

- **`[0]` is an array of integers.** `total([1.5])` would fail if `total` took `[0]`. Use
  `[0.0]`, or `number[]`, for any number. (`number[]` deliberately does *not* narrow to
  integers, so pasted TypeScript keeps meaning what it meant.)
- **An empty array passes any array type.** There are no elements to check. If your
  function cannot cope with `[]`, test for it in the body, as `average` and `stats` do.
- **A mixed example is a union.** `['', 0, true]` means "each element is a string, an
  integer or a boolean", not a fixed-length tuple.
- **A rest parameter cannot have a default.** `...xs: number[] = [1]` is a compile error:
  a rest parameter is always bound (to `[]` when nothing is passed), so the default could
  never apply.
- **Checking costs a pass over the array.** Validation visits every element on every call.
  For a hot function that takes large arrays, measure, and consider an unchecked (`!`)
  inner function called by a checked outer one; see [Safety & Validation](/safety-validation/).
