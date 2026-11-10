<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 11, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Local Module Imports

Split a program across `.tjs` files with ordinary `import` and `export`. Each function still
checks its own arguments (the checks its parameter examples create), whichever file calls it.

Live examples on this site each run by themselves, with no other files around them. So this
page shows the module first, which runs here, then a program that imports it, which is shown
without running. After that comes the recipe for running both on your own machine.

## The module: `mymath.tjs`

```tjs
export function add(a: 2, b: 3): 5 {
  return a + b
}

export function multiply(a: 2, b: 3): 6 {
  return a * b
}

test 'add and multiply' {
  expect(add(10, 5)).toBe(15)
  expect(multiply(10, 5)).toBe(50)
}
```

Each signature is a worked example that TJS runs: the parameter examples are the inputs and
the return example is the expected output. So `add(a: 2, b: 3): 5` checks that `add(2, 3)`
gives `5`, and `multiply(a: 2, b: 3): 6` checks that `multiply(2, 3)` gives `6`. The `test`
block adds two more cases. The module has no imports, so all of this runs when it is
transpiled, here or anywhere else.

## The program that imports it: `main.tjs`

```tjs:static
// main.tjs
import { add, multiply } from './mymath.tjs'

function calculate(x: 3, y: 4): 14 {
  // (x + y) * 2
  return multiply(add(x, y), 2)
}

console.log('calculate(3, 4) =', calculate(3, 4))
console.log('calculate(10, 5) =', calculate(10, 5))

// A bad call into the other module is refused there, by add itself
console.log(add(1.5, 2).message)
```

Run beside `mymath.tjs` (recipe below), it prints:

```text
calculate(3, 4) = 14
calculate(10, 5) = 30
Expected integer for 'mymath.tjs:1:add.a', got number
```

## What to notice

A TJS file is an ES module. `export` and `import` mean what they mean in JavaScript, and a
function's checks go with it across the file boundary. `add` and `multiply` validate their
own inputs wherever they are called from.

That is what the last line of `main.tjs` shows. `add` returns an error object (a
`MonadicError`) instead of throwing, so `.message` can be read straight off the result.
`main.tjs` wrote no validation code; the check belongs to `add`, so every caller, in any
file, gets it.

The message says where the check lives: `mymath.tjs:1:add.a` is parameter `a` of `add`,
declared on line 1 of `mymath.tjs`. "Expected integer, got number" is because `a: 2` is an
integer example, and TJS treats integer as a narrower type than number: `1.5` is a number
but not an integer. Use `0.0` as the example to accept any number (see
[Hello TJS](/hello-tjs/)). [Error Handling](/error-handling/) shows how to test for an
error with `isMonadicError`.

`calculate`'s signature example, `(x: 3, y: 4): 14`, does not run when `main.tjs` is
checked. TJS runs a file's signature examples and `test` blocks by executing that file on its
own, without loading its imports, so anything that calls an import comes out
_inconclusive_: not a pass, not a failure. `tjs check main.tjs` accepts the file, and
`tjs test main.tjs` reports:

```text
? Signature: calculate signature example — inconclusive: Module could not be executed for testing: multiply is not defined
```

That is why the real tests belong in `mymath.tjs`, where the functions are defined. To test
`calculate` itself, see the last gotcha.

## Running it on your machine

This recipe uses Bun. Install `tjs-lang` in your project (`bun add -d tjs-lang`), put the two
files side by side, and tell Bun to load `.tjs` files through the TJS plugin with a
`bunfig.toml` in the same directory:

```text
my-project/
  bunfig.toml
  main.tjs
  mymath.tjs
```

```toml
# bunfig.toml
preload = ["tjs-lang/bun-plugin"]

[test]
preload = ["tjs-lang/bun-plugin"]
```

Then either of these runs `main.tjs` and prints the three lines shown above:

```bash
bun main.tjs
bunx tjs run main.tjs
```

`bunx tjs` runs the `tjs` command from your local `tjs-lang`. That command runs on Bun, so it
reads the same `bunfig.toml`: the first `preload` covers `bun` and `tjs run`, and the `[test]`
one covers `bun test`.

Without the preload, Bun does not read `.tjs` files as TJS, and both commands stop with a
misleading message: `Export named 'add' not found in module '…/mymath.tjs'`. The exports are
there; Bun cannot see them without the plugin.

For the full project setup (`package.json`, `tjs emit`, bundlers), see
[Running TJS](/running-tjs/).

## Gotchas

- **Write the extension.** `from './mymath.tjs'` works; `from './mymath'` fails with
  `Cannot find module './mymath'`. The import is resolved by Bun, which does not guess `.tjs`.
- **Bare names worked only in the old playground.** It could import a saved module by name
  (`from 'mymath'`). In a project, import by relative path as above.
- **To test code that calls an import, use `bun test`.** Put `calculate` in a module that only
  exports it, so importing it prints nothing:

  ```tjs:static
  // calc.tjs
  import { add, multiply } from './mymath.tjs'

  export function calculate(x: 3, y: 4): 14 {
    return multiply(add(x, y), 2)
  }
  ```

  Then test it from TypeScript. The `[test]` preload above is what lets `bun test` import a
  `.tjs` file:

  ```ts
  // calc.test.ts
  import { test, expect } from 'bun:test'
  import { calculate } from './calc.tjs'

  test('calculate', () => {
    expect(calculate(3, 4)).toBe(14)
    expect(calculate(10, 5)).toBe(30)
  })
  ```
