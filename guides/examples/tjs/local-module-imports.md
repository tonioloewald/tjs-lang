<!--{"section":"tjs","type":"example","group":"patterns","order":10}-->

# Local Module Imports

Import from modules you save in the playground

```tjs
/*#
# Local Module Imports

You can import from modules saved in the playground!

## How it works:
1. Save a module (use the Save button, give it a name like "math")
2. Import it by name from another file

## Try it:
1. First, create and save a module named "mymath":

    export function add(a: 0, b: 0) -> 0 {
      return a + b
    }

    export function multiply(a: 0, b: 0) -> 0 {
      return a * b
    }

2. Then run this code (it imports from your saved module)
*/

// This imports from a module you saved in the playground
// Change 'mymath' to match whatever name you used when saving
import { add, multiply } from 'mymath'

function calculate(x: 0, y: 0) -> 0 {
  // (x + y) * 2
  return multiply(add(x, y), 2)
}

test 'calculate combines add and multiply' {
  expect(calculate(3, 4)).toBe(14) // (3 + 4) * 2 = 14
}

console.log('calculate(3, 4) =', calculate(3, 4))
console.log('calculate(10, 5) =', calculate(10, 5))
```
