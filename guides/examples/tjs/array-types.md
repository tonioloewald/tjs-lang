<!--{"section": "tjs", "order": 4, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Array Types

Typed array parameters, rest parameters and array returns

An array type in TJS is written the way every other TJS type is: as an example. `[0]` is an
example of an array of integers, `['']` of an array of strings, `[{ x: 0, y: 0 }]` of an
array of points. TJS reads the example for its **element type** and checks every element on
every call.

A call that fails its check does not throw. The function returns an error value (a
`MonadicError`) instead of running, and that value has a `.message` saying what went wrong.
That is why the last two lines below read `.message` off a function's result.

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
console.log(sum([1, 2.5]).message)       // ...sum.numbers[1]', got number
console.log(sum('1,2').message)          // ...sum.numbers', got string
```

The `test '…' { }` blocks are extra tests you write yourself. They run alongside the
signature test described next; see [Test blocks](/TJS-SYNTAX/#test-blocks).

## What to notice

**The signature is a worked example, and it is run.** This is the *signature test*: when
TJS compiles the file (in the playground, on this page, or with `tjs check`), it calls
`sum([3, 7])` and checks that the answer is `10`, and it calls `average([10, 30])` and
checks for `20.0`. Pick array examples that make a meaningful test, not just the right
type.

The return example does a second job: it declares the return type, which is what the
generated docs and `.d.ts` report. A plain `:` return is not checked on every call; write
`:?` if you want each result checked as well. If you want the type without the test,
write `:!` instead of `:`:

```javascript
function sum(numbers: [3, 7]):! 0 {   // declares "returns an integer", runs no test
  return numbers.reduce((a, b) => a + b, 0)
}
```

See [Return annotations](/TJS-SYNTAX/#return-annotations) for all three.

**The example says "array of integers", not "these numbers".** `[3, 7]` and `[10, 20, 30]`
describe the same type: an array whose elements are integers, of any length. The element
*values* matter only to the signature test. The element *kinds* (integer, number,
string, …) set the type, and mixing kinds makes a union; see the table below.

**`average` returns `20.0`, not `20`, and so does `stats`'s `avg` field.** To the signature
test the two are the same value (in JavaScript `20 === 20.0`), so the test passes either
way. What differs is the type the example declares: `20` says "returns an integer", `20.0`
says "returns any number". The example inputs happen to average to a whole number, but
averages in general do not, so `20` would put the wrong type in the docs, and under `:?`,
which checks every result, `average([1, 2])` would come back as a type error because it
returns `1.5`. Write the return example for the general case. Returning `0` on the empty
path is fine: an integer is also a number.

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
  if (n === 0) return { x: 0, y: 0 }
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  }
}

console.log(total([9.99, 5, 0.01]))       // 15
console.log(total([1, '2', 3]).message)
// Expected number for '<source>:1:total.prices[1]', got string

console.log(centroid([{ x: 0, y: 0 }, { x: 2, y: 4 }]))   // { x: 1, y: 2 }
console.log(centroid([]))                                 // { x: 0, y: 0 }
console.log(centroid([{ x: 0, y: 0 }, { x: 2 }]).message) // ...points[1].y', got undefined
```

A full message says what was expected, where (the file and line, then the path such as
`total.prices[1]`), and what arrived. The comments elsewhere on this page show only the
end of the message, from the `...`. [Safety & Validation](/safety-validation/) covers what
you can do with the error value.

## Ways to write an array type

| Example | Means |
| ------- | ----- |
| `[0]` | array of integers |
| `[0.0]` | array of numbers (any number, including `1.5`) |
| `[+0]` | array of non-negative integers (`+0` is the example for "zero or more") |
| `['']` | array of strings |
| `[{ x: 0, y: 0 }]` | array of objects with integer `x` and `y` |
| `[[0]]` | array of arrays of integers |
| `['', 0]` | array whose elements are each a string or an integer |
| `[3, 7.5]` | integers and numbers mixed: in effect any number, like `[0.0]` |
| `[]` | array of anything |
| `number[]` | array of numbers, the TypeScript spelling (same as `[0.0]`) |
| `int[]` | array of integers (same as `[0]`) |
| `string[][]` | arrays nest in the suffix spelling too |

The suffix spelling exists so that TypeScript you paste in keeps working. `number[]` means
any number, not integers, because `number` has to keep meaning what it means in
TypeScript. `int` is not TypeScript: it is one of TJS's own type names, alongside `float`
and `unsigned` (see [Type names](/TJS-SYNTAX/#type-names)). The generic spelling
`Array<number>` is not accepted: it is a syntax error (`Unexpected token`) at the `<`, so
write `number[]`.

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
console.log(count(1, 2.5).message)       // Expected integer for '...count.ids[1]', got number
console.log(label('row', 'x', 'y'))      // row:x-y
console.log(label('row'))                // row:
console.log(label('row', 'x', 7).message) // ...label.parts[1]', got number
```

`count(1, 2.5)` fails because `[1, 2, 3]` is an array of integers, and `2.5` is a number
but not an integer.

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
- **A rest parameter cannot have a default.** An ordinary parameter takes a default with
  `=`, but `...xs: [0] = [1]` is a compile error. A rest parameter is always bound (to `[]`
  when nothing is passed), so the default could never apply.
- **Checking costs a pass over the array.** The check visits every element on every call,
  so its cost grows with the length of the array. For a hot function that takes large
  arrays, measure first; if it matters, check once in an outer function and do the work in
  an inner function whose parameter list starts with `!`, which skips the checks:

  ```javascript
  function sumFast(! xs: [0]) { /* no checks here */ }
  function sum(xs: [0]) { return sumFast(xs) }   // checked once, here
  ```

  See [Safety & Validation](/safety-validation/) and
  [Safety markers](/TJS-SYNTAX/#safety-markers).
