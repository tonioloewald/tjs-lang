<!--{"section": "ajs", "type": "example", "group": "basics", "order": 2, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# Conditional Logic

Most agent logic is a decision: route a request, accept or reject an input, pick which model
to ask. AJS has `if`/`else`, `else if`, the ternary, and `&&`, `||` and `??`, and they behave as
they do in JavaScript, with three differences listed after this first example.

```ajs:inline
function checkAge({ age = 25 }) {
  if (age >= 18) {
    let status = 'adult'
    return { status, canVote: true }
  } else {
    let status = 'minor'
    return { status, canVote: false }
  }
}
```

An agent's one parameter is the arguments object the host passes, as in
`vm.run(ast, { age: 12 })`, and the object it returns is the run's `result`. On this site each
example runs with no arguments; [Hello World](hello-world.md) shows the host side.

With no arguments this returns `{ status: 'adult', canVote: true }`; with `{ age: 12 }` it
returns `{ status: 'minor', canVote: false }`.

## What to notice

- **`let` is block-scoped.** Each branch declares its own `status`; neither leaks out. Reading
  `status` after the `if` gives `undefined`, not an error.
- **The default is an example, and it types the input.** In AJS a default value does two jobs:
  it is the value used when the argument is missing, and its type becomes the argument's type.
  `age = 25` makes `age` an optional number. So `{ age: '18' }` is refused before the agent
  runs: `vm.run` does not throw, it resolves with `error` set to
  `Input validation failed: args do not match expected schema`. See
  [Input/Output Contract](../../../DOCS-AJS.md#inputoutput-contract).

The three differences from JavaScript:

- **`==` never coerces.** In AJS, as in TJS, `'18' == 18` is `false`. It is JavaScript's `===`,
  except that `null == undefined` and `NaN == NaN` are both `true`. Objects compare by identity:
  two arrays with the same items are not `==`. See
  [Differences from JavaScript](../../../DOCS-AJS.md#differences-from-javascript).
- **There is no `switch`.** It is a transpile error, and the message suggests an `if`/`else if`
  chain. A lookup object is often better than either; there is an example below.
- **Operators take primitives.** `<`, `+` and the rest accept strings, numbers, booleans and
  null. `arr < 5` ends the run with an error instead of comparing anything. See
  [Operators](../../../DOCS-AJS.md#operators).

## A variation

A grade from a score, with an `else if` chain, a ternary, and a lookup table read with a
computed key:

```ajs:inline
function grade({ score = 72 }) {
  let letter = 'F'
  if (score >= 90) {
    letter = 'A'
  } else if (score >= 80) {
    letter = 'B'
  } else if (score >= 70) {
    letter = 'C'
  }
  const notes = { A: 'excellent', B: 'good', C: 'fair', F: 'see me' }
  const note = notes[letter]
  const result = score >= 60 ? 'pass' : 'fail'
  return { letter, note, result }
}
```

The default returns `{ letter: 'C', note: 'fair', result: 'pass' }`. Assigning to `letter`
inside a branch changes the `letter` declared above the `if`.

Conditions combine with `&&` and `||`. Here a support ticket is routed by its text and the
customer's tier:

```ajs:inline
function route({ text = 'refund my order', tier = 'free' }) {
  const lower = text.toLowerCase()
  let queue = 'general'
  if (lower.includes('refund') || lower.includes('chargeback')) {
    queue = 'billing'
  } else if (lower.includes('password')) {
    queue = 'account'
  }
  if (tier == 'enterprise' && queue != 'general') {
    return { queue, priority: 'high' }
  }
  return { queue, priority: 'normal' }
}
```

The default returns `{ queue: 'billing', priority: 'normal' }`; with
`{ text: 'Reset PASSWORD', tier: 'enterprise' }` it returns `{ queue: 'account', priority: 'high' }`.

`toLowerCase` and `includes` are string methods AJS allows; `parseInt` and `Number.isNaN`, used
below, are builtins it allows. The VM calls only methods and builtins on its list, which is in
[Methods](../../../DOCS-AJS.md#methods) and
[Expression Builtins](../../../DOCS-AJS.md#expression-builtins).

## A lookup instead of a switch

Where JavaScript would `switch` on a value, an AJS agent can look the value up in an object:

```ajs:inline
function dispatch({ kind = 'refund' }) {
  const queues = { refund: 'billing', password: 'account' }
  let queue = 'general'
  if (Object.keys(queues).includes(kind)) {
    queue = queues[kind]
  }
  return { queue }
}
```

The default returns `{ queue: 'billing' }`, `{ kind: 'password' }` returns
`{ queue: 'account' }`, and `{ kind: 'shipping' }` returns `{ queue: 'general' }`.

The `Object.keys` check is there because `kind` comes from outside. Without it,
`{ kind: 'toString' }` would read a method rather than a missing key, and
`{ kind: 'constructor' }` a forbidden property; both end the run with an error. Checking the
table's own keys first means any other string falls through to `'general'`.

## Falsy values and fallbacks

Truthiness is JavaScript's: the falsy values are `false`, `0`, `-0`, `''`, `null`, `undefined`
and `NaN`. That matters when you pick a fallback. `||` replaces any falsy value, `??` only
`null` and `undefined`:

```ajs:inline
function pickLimit({ requested = 0 }) {
  const viaOr = requested || 10
  const viaNullish = requested ?? 10
  return { viaOr, viaNullish }
}
```

This returns `{ viaOr: 10, viaNullish: 0 }`: if `0` is a real answer, use `??`.

## The gotcha

`==` does not coerce, but `<`, `>`, `<=` and `>=` compare the way JavaScript does: a numeric
string against a number is compared as numbers, so `'18' >= 18` is `true` while `'18' == 18` is
`false`. Two strings are compared as text, so `'9' < '10'` is `false`. A string is a primitive,
so the operator rule above allows both.

The input contract keeps strings out of a number parameter, so this bites on values that arrive
as text inside the agent: a form field, a model's answer, a field of parsed JSON. Convert once,
check that the conversion worked, and compare numbers, so `==` and `>=` agree. Here the default
`'17'` makes `age` a string parameter on purpose, standing in for such a value:

```ajs:inline
function checkAgeFromText({ age = '17' }) {
  const years = parseInt(age, 10)
  if (Number.isNaN(years) || `${years}` != age) {
    return { status: 'unknown', canVote: false }
  }
  return { status: years >= 18 ? 'adult' : 'minor', canVote: years >= 18 }
}
```

The default returns `{ status: 'minor', canVote: false }`, `{ age: '18' }` returns
`{ status: 'adult', canVote: true }`, and `{ age: 'abc' }`, `{ age: '18abc' }` and
`{ age: '17.9' }` all return `{ status: 'unknown', canVote: false }`.

Both checks are needed. `parseInt` reads leading digits and stops, so `'18abc'` becomes `18`
and `'17.9'` becomes `17`; writing the number back as text and comparing it with the input
rejects anything that is not exactly a whole number. (`Number(s)` is not a function in AJS.)
Without the `Number.isNaN` check, `'abc'` would fall through as `NaN`, and every ordering
comparison (`<`, `>=`, …) with `NaN` is `false`, so it would silently read as a minor.
`Number.isNaN` is the clear way to test for `NaN`, whatever `==` does with it.
