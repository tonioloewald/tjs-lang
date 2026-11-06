<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 11, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Local Module Imports

Split a program across `.tjs` files with ordinary `import` and `export`; each function keeps its checks when it crosses a file boundary.

> **Static on this page.** The program below imports a second file, `mymath.tjs`, and an
> example on this page runs on its own, so it cannot load that file. Below it is the module
> itself, which does run here, and then the recipe for running both on your own machine.

```tjs:static
// main.tjs
import { add, multiply } from './mymath.tjs'

function calculate(x: 0, y: 0): 0 {
  // (x + y) * 2
  return multiply(add(x, y), 2)
}

test 'calculate combines add and multiply' {
  expect(calculate(3, 4)).toBe(14) // (3 + 4) * 2 = 14
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

## The module being imported

This is `mymath.tjs`. It has no imports, so it runs on this page: its signature examples
and its `test` block are checked when it is transpiled.

```tjs
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

The return example `: 0` is a worked example, not only a type: TJS calls `add(0, 0)` and
`multiply(0, 0)` and checks that each gives `0`. So the module tests itself, and the file
that imports it only has to test what it adds.

## What to notice

A TJS file is an ES module. `export` and `import` mean what they mean in JavaScript, and
nothing about a function's checks is lost on the way across. `add` and `multiply` validate
their own inputs wherever they are called from.

That is why the last line of `main.tjs` gets a `MonadicError` back instead of a wrong
answer. `1.5` is not an integer, and the error names the function that refused it and
where that function lives: `mymath.tjs:1:add.a` is parameter `a` of `add`, declared on line
1 of `mymath.tjs`. The caller did nothing to earn that check; it lives with the function,
so no caller in any file can skip it.

The error is returned, not thrown, which is why `.message` can be read from the result.
See _Error Handling_ for how to test for one with `isMonadicError`.

## Running it on your machine

Put the two files side by side in a project that has `tjs-lang` installed, and tell Bun to
load `.tjs` files through the TJS plugin with a `bunfig.toml` in the same directory:

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
tjs run main.tjs
```

The first `preload` covers `bun` and `tjs run`; the `[test]` one covers `bun test`. Without
the preload, Bun does not know how to load `./mymath.tjs`, and `tjs run` stops with
`Export named 'add' not found in module '…/mymath.tjs'`.

## Gotchas

- **Write the extension.** `from './mymath.tjs'` works; `from './mymath'` does not find the
  file. The import is resolved by Bun, which does not guess `.tjs`.
- **A test that calls an import is inconclusive.** TJS runs a file's `test` blocks and
  signature examples by executing that file on its own at transpile time, without loading
  its imports. So in `main.tjs`, `tjs check` and `tjs test` report the `calculate` test and
  `calculate`'s signature example as _inconclusive_: not a pass, not a failure. That is why
  the real tests belong in `mymath.tjs`, where the functions are defined. To test
  `calculate` itself, export it from a module with no top-level output and test it from
  `bun test`:

  ```javascript
  // calc.test.ts, with calculate exported from calc.tjs
  import { test, expect } from 'bun:test'
  import { calculate } from './calc.tjs'

  test('calculate', () => {
    expect(calculate(3, 4)).toBe(14)
  })
  ```

- **Integers, not numbers.** `a: 0` is an integer example, so `add(1.5, 2)` is refused. Use
  `0.0` for any number (see _Hello TJS_ for the numeric examples).
- **The old playground.** The retiring playground at
  [tjs-platform.web.app](https://tjs-platform.web.app) can save a module under a name and
  import it by that bare name (`from 'mymath'`). That is a playground feature only; in a
  project, import by relative path as above.
