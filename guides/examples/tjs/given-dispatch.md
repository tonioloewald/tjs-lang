<!--{"section": "tjs", "type": "example", "group": "basics", "order": 5, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Control Flow: `given`

`given` picks one block of code to run, based on a value. You write the value, then a list
of **arms**: each arm is one or more values to match, followed by the block to run when the
value matches one of them. `else` runs when no arm matches.

```tjs:inline
function describe(kind: '') {
  given kind {
    'cat', 'dog' { return 'pet' }
    'lion', 'tiger' { return 'wild' }
  } else {
    return 'unknown'
  }
}

console.log('cat   ->', describe('cat'))   // pet
console.log('dog   ->', describe('dog'))   // pet
console.log('tiger ->', describe('tiger')) // wild
console.log('emu   ->', describe('emu'))   // unknown

test 'several values share one arm' {
  expect(describe('cat')).toBe('pet')
  expect(describe('dog')).toBe('pet')
}

test 'else catches every value no arm matches' {
  expect(describe('emu')).toBe('unknown')
}
```

Two pieces of TJS syntax appear here and in every example below:

- **`kind: ''`** declares a parameter whose value is a string. The value after the colon is
  an _example_, not a TypeScript literal type: `''` means "a string", `0` means "an integer",
  `[0]` means "an array of integers". See [TJS syntax](/tjs-syntax/).
- **`test '…' { … }`** is an inline test that runs alongside the example.
  `expect(x).toBe(y)` checks that `x` equals `y`.

The arms are tried from top to bottom and the first match wins. An arm's values are only
evaluated until one matches, so a later arm's values may never be evaluated.

## What `given` replaces

JavaScript already has a construct for this, `switch`, and `given` exists because `switch`
has four defects. Here is the `switch` version of the first arms above, with the bug most
people write at least once:

```tjs:inline
function withSwitch(kind: '') {
  let label = 'unknown'
  switch (kind) {
    case 'cat':
    case 'dog':
      label = 'pet'      // no break: runs on into the next case
    case 'lion':
      label = 'wild'
  }
  return label
}

console.log('switch, cat ->', withSwitch('cat')) // wild: wrong

function withGiven(kind: '') {
  let label = 'unknown'
  given kind {
    'cat', 'dog' { label = 'pet' }
    'lion' { label = 'wild' }
  }
  return label
}

console.log('given,  cat ->', withGiven('cat'))  // pet

test 'no fallthrough: the next arm does not run' {
  expect(withGiven('cat')).toBe('pet')
  expect(withGiven('lion')).toBe('wild')
}
```

TJS compiles `withSwitch` with a warning that points at `given`. The four defects:

1. **Fallthrough is the default.** When a `case` has no `break`, the next case runs too.
   That is why `'cat'` ends up `'wild'` above. In `given`, an arm's block runs and then
   control continues after the whole `given`.
2. **Several values on one arm can only be written as fallthrough.** The two stacked `case`
   labels share a block only because the first one falls into the second. In `given`, you
   list the values with commas: `'cat', 'dog'`.
3. **One shared scope.** All the cases of a `switch` declare into one block, so this is an
   error, because `label` is declared twice:

   ```javascript
   switch (lang) {
     case 'en': let label = 'Hello'; break
     case 'fr': let label = 'Bonjour'; break // SyntaxError: redeclaration
   }
   ```

   In `given`, each arm's body is its own `{ }` block, so each `let` is a separate variable.
4. **It compares with `===`.** TJS's `==` is different from JavaScript's (see below), so a
   `switch` in a `.tjs` file would compare values differently from `==` in the same file.
   `given` matches with TJS's `==`.

## How arms match

An arm matches when the value `==` the arm's value, using TJS's
[honest equality](/honest-equality/). Three rules follow from that:

- **A boxed primitive matches its plain value.** A boxed string is an object wrapped around
  a string, made with `new String('cat')`. `===` says it is not `'cat'`; TJS's `==` unwraps
  it and compares the string inside.
- **Nothing is coerced.** Coercion is JavaScript converting one type to another before
  comparing. TJS does not do that, so the number `200` does not match the string `'200'`.
- **`null` and `undefined` match each other.**

```tjs:inline
function greet(lang: '') {
  given lang {
    'en' {
      let label = 'Hello'
      return label + '!'
    }
    'fr' {
      let label = 'Bonjour'
      return label + ' !'
    }
  } else {
    return '...'
  }
}

console.log('en ->', greet('en')) // Hello!
console.log('fr ->', greet('fr')) // Bonjour !

// Local values, because `describe(kind: '')` above only accepts plain strings.
function boxedStillMatches() {
  const kind = new String('cat')
  given kind {
    'cat', 'dog' { return 'pet' }
  } else {
    return 'unknown'
  }
}

function numberVsString() {
  const code = 200
  given code {
    '200' { return 'matched' }
  } else {
    return 'no match'
  }
}

function nullVsUndefined() {
  const missing = undefined
  given missing {
    null { return 'matched null' }
  } else {
    return 'no match'
  }
}

console.log('new String("cat") ->', boxedStillMatches()) // pet
console.log('200 vs "200"      ->', numberVsString())    // no match
console.log('undefined vs null ->', nullVsUndefined())   // matched null

test 'each arm has its own scope' {
  expect(greet('en')).toBe('Hello!')
  expect(greet('fr')).toBe('Bonjour !')
}

test 'matching uses TJS ==' {
  expect(boxedStillMatches()).toBe('pet') // a switch, using ===, gives 'unknown'
  expect(numberVsString()).toBe('no match')
  expect(nullVsUndefined()).toBe('matched null')
}
```

The `else` arm is optional. Without one, a value that matches no arm does nothing, like a
`switch` with no `default`.

## Arms that do work instead of returning

An arm does not have to end with `return`. It is a block; when it finishes, control
continues after the `given`. Arm values can be any expression, including named constants,
and a `given` can sit inside an arm:

```tjs:inline
const LOW = 1
const HIGH = 3

function priority(level: 0) {
  let label = 'normal'
  given level {
    LOW { label = 'low' }
    HIGH, 4 { label = 'high' }
  }
  // no `else`: level 2 matches nothing and label stays 'normal'
  return label
}

function httpText(code: 200) {
  given code {
    200, 204 { return 'ok' }
    404 { return 'not found' }
  } else {
    given Math.floor(code / 100) {
      5 { return 'server error' }
    } else {
      return 'other'
    }
  }
}

console.log(priority(1), priority(2), priority(3), priority(4))
// low normal high high
console.log(httpText(204), httpText(404), httpText(503), httpText(302))
// ok not found server error other
```

If two arms list the same value (say `LOW` and `1`), the first one wins and the second never
runs.

## `given` inside a loop

An arm never needs `break`. If you write one anyway, it does what it does in a `switch`: it
ends the `given`, and the loop carries on. `continue` goes to the next iteration of the
loop. To leave the loop from inside an arm, give the loop a label (`scan:` below names the
`for` loop) and write `break scan`.

```tjs:inline
function collect(items: [0]) {
  const kept = []
  scan: for (const n of items) {
    given n {
      0 { continue }       // skip zeros
      -1 { break scan }    // stop the loop at the first -1
      99 { break }         // here only to show that `break` ends the given, not the loop
    }
    kept.push(n)
  }
  return kept
}

console.log(collect([1, 0, 99, 2, -1, 3])) // [1, 99, 2]
```

`99` is still kept: its `break` ends the `given`, and the loop goes on to `kept.push(n)`.

## Things that trip people up

- **`switch` still works, unchanged.** TJS accepts every JavaScript program, so a `switch`
  in a `.tjs` file keeps JavaScript's semantics exactly, fallthrough and all. It compiles,
  with a warning that points at `given`. No rule silently changes what a `switch` means,
  because that would break code pasted from JavaScript.
- **Converting a `switch` is not always a rename.** If an arm deliberately falls into the
  next one, `given` cannot express that directly. When you convert JavaScript or TypeScript
  to TJS and then make the file native TJS (this step is called graduation; see
  [Converting a project](/ts-converting-a-project/)), TJS rewrites a `switch` to `given` only
  if no arm can run into the next one: every non-empty arm except the last must leave
  (`break`, `return`, `throw` or `continue`). Where an arm genuinely falls through, it leaves
  the `switch` alone and adds a note.
- **`break` inside an arm leaves the `given`, not the loop around it.** To leave the loop,
  use a labelled `break` or `return`, as in `collect` above.
- **Arms compare values; they are not patterns.** `given` has no ranges, guards or
  destructuring. For "any 5xx code", compute the thing you want to compare, as `httpText`
  does with `Math.floor(code / 100)`, or use `if`.
- **`given` is TJS syntax.** It is not valid JavaScript, so it cannot appear in a `.js`
  file. It is also not part of [AJS](/ajs/), the sandboxed language for agent code.

## Why a new word instead of fixing `switch`

Because a silent change of meaning is the worst outcome. TJS first tried keeping the word
`switch` and changing its rules. It then measured the result by showing AI language models
the code and asking what it returned: a model reads the code the way a person skimming it
does, from its shape and from what that shape usually means.

Shown a C-style `switch` (`case` labels and colons) in a `.tjs` file, the models gave a
confident wrong answer, assuming fallthrough, in every run, on both models tested. Every new
shape that was tried produced no wrong answers at all, whatever keyword it used.

A confident wrong answer is the failure that ships bugs, so the shape had to change, and the
keyword with it. `switch` still means exactly what it means in C and JavaScript. The
measurements, including the ones that turned out to be noise, are in the
[case study on fixing `switch`](/case-study-switch/).
