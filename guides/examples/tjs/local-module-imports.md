<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 11, "parent": "tjs-patterns.md"}-->

# Local Module Imports

Import from modules you save in the playground

> **Needs a second module.** This example imports a module you save in the playground (`mymath`), which a single example on this
> page cannot load. Run it in the [playground](https://tjs-platform.web.app) after saving that
> module, or locally with `tjs run` beside it.

```tjs:static
/#
# Local Module Imports

You can import from modules saved in the playground!

## How it works:
1. Save a module (use the Save button, give it a name like "math")
2. Import it by name from another file

## Try it:
1. First, create and save a module named "mymath":

    export function add(a: 0, b: 0): 0 {
      return a + b
    }

    export function multiply(a: 0, b: 0): 0 {
      return a * b
    }

2. Then run this code (it imports from your saved module)
#/

// This imports from a module you saved in the playground
// Change 'mymath' to match whatever name you used when saving
import { add, multiply } from 'mymath'

function calculate(x: 0, y: 0): 0 {
  // (x + y) * 2
  return multiply(add(x, y), 2)
}

test 'calculate combines add and multiply' {
  expect(calculate(3, 4)).toBe(14) // (3 + 4) * 2 = 14
}

console.log('calculate(3, 4) =', calculate(3, 4))
console.log('calculate(10, 5) =', calculate(10, 5))
```

<!-- TODO review -->
## What to notice

A TJS file is an ES module. `export` and `import` mean exactly what they mean in
JavaScript, and nothing about a function's types is lost on the way across: `add` and
`multiply` carry their own checks and their own `__tjs` metadata into the importing file.
`calculate` does not re-validate what `add` returns; it does not need to, because `add`
checked its inputs where it was defined.

That is the property that makes modules safe to compose. The checks live with the
function, so a caller in another file cannot skip them, and a bad call made from here
comes back as a `MonadicError` from `add` naming `add`'s parameter.

<!-- TODO review -->
## The module being imported

For reference, here is the module this example expects, as a file of its own. Save it in
the playground under the name `mymath`, or, in a project, as `mymath.tjs` beside the
importing file:

```tjs:static
export function add(a: 0, b: 0): 0 {
  return a + b
}

export function multiply(a: 0, b: 0): 0 {
  return a * b
}

test 'add and multiply' {
  expect(add(2, 3)).toBe(5)
  expect(multiply(2, 3)).toBe(6)
}
```

Its signature examples (`add(0, 0)` is `0`) and its `test` block run when that file is
transpiled, so the module tests itself; the importing file only tests what it adds.

<!-- TODO review -->
## Gotchas

- **Module names are a playground convenience.** `from 'mymath'` resolves to a module saved
  in the playground. In a project, import by relative path (`from './mymath.tjs'`), which
  Bun handles with the `tjs-lang/bun-plugin` preload, or import the emitted `.js`.
- **Tests that need an import are inconclusive at build time.** When the transpiler cannot
  load `mymath`, the `calculate` test cannot run. It is reported as inconclusive, not as a
  pass and not as a failure; run the file where the import resolves to get a real answer.
- **Integers, not numbers.** `a: 0` is an integer example, so `add(1.5, 2)` is refused. Use
  `0.0` for any number (see _Hello TJS_ for the numeric examples).
