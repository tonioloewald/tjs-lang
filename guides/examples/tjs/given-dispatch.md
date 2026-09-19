<!--{"section":"tjs","type":"example","group":"basics","order":5}-->

# Control Flow: `given`

`switch` has three footguns. `given` is the same idea with none of them — and a different
shape, so you can see at a glance which one you are reading.

```tjs
/#
## The three problems with `switch`

    switch (kind) {
      case 'cat':
      case 'dog':
        label = 'pet'          // no break — falls through!
      case 'lion':
        label = 'wild'
    }

1. **Fallthrough by default.** Forget `break` and the next arm runs too. The
   common case needs the extra keyword; the rare case gets the short spelling.
2. **One shared scope.** Every arm declares into the same block, so
   `let x` in two arms is a redeclaration error.
3. **It compares with `===`.** So a boxed `new String('cat')` misses, exactly
   the footgun TJS's `==` exists to fix.

## `given` fixes all three, and looks different

    given kind {
      'cat', 'dog' { … }       // several values on one arm
      'lion'       { … }
    } else { … }

No `case`. No colons. No implicit blocks. `else` for the remaining arm.
Each arm has **its own scope**, there is **no fallthrough**, and matching uses
**`==`** (honest equality — unwraps boxed primitives, no coercion).

## Why a new word instead of fixing `switch`

Because a silent change of meaning is the worst outcome. Measured against a
model asked what the code does:

    switch, C syntax        0/5 correct, 5 CONFIDENTLY WRONG
    switch, new syntax      0/5 correct, 0 wrong, 5 no-answer
    given,  new syntax      4/5 correct, 0 wrong

Changing the shape eliminated every confident wrong answer — which is the
failure mode that ships bugs. `switch` still means exactly what C means, and
warns, pointing here. See `docs/case-study-switch.md`.
#/

// --- Several values per arm, no fallthrough ---
function describe(kind: '') {
  given kind {
    'cat', 'dog' { return 'pet' }
    'lion', 'tiger' { return 'wild' }
  } else {
    return 'unknown'
  }
}

console.log('describe:')
console.log('  cat   ->', describe('cat'))
console.log('  dog   ->', describe('dog'))
console.log('  tiger ->', describe('tiger'))
console.log('  emu   ->', describe('emu'))

// --- Each arm has its OWN scope ---
// In a `switch`, both arms would be declaring `label` into one shared block
// and the second `let` would be a redeclaration error.
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

console.log('\nper-arm scope:')
console.log('  en ->', greet('en'))
console.log('  fr ->', greet('fr'))

// --- Matching is `==`, so a boxed primitive still matches ---
// `switch` compares with `===`, where this falls through to the default.
//
// Note it is matched against a LOCAL value here. Passing `new String('cat')` to
// `describe` above would never reach the `given` at all: the parameter is declared
// `kind: ''`, so validation rejects the object first. Two safety nets, and the outer
// one fires first — which is the point of typing the parameter.
function boxedStillMatches() {
  const kind = new String('cat')
  given kind {
    'cat', 'dog' { return 'pet' }
  } else {
    return 'unknown'
  }
}

console.log('\nboxed primitive:')
console.log('  new String("cat") ->', boxedStillMatches())

test 'several values share one arm' {
  expect(describe('cat')).toBe('pet')
  expect(describe('dog')).toBe('pet')
}

test 'no fallthrough — the next arm does not run' {
  expect(describe('lion')).toBe('wild')
}

test 'else catches the rest' {
  expect(describe('emu')).toBe('unknown')
}

test 'each arm has its own scope' {
  expect(greet('en')).toBe('Hello!')
  expect(greet('fr')).toBe('Bonjour !')
}

test 'matches with == so boxed primitives work' {
  // The `switch`/`===` version returns 'unknown' here.
  expect(boxedStillMatches()).toBe('pet')
}
```
