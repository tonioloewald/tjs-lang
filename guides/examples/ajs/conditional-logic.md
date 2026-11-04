<!--{"section": "ajs", "type": "example", "group": "basics", "order": 2, "parent": "ajs-basics.md"}-->

# Conditional Logic

If/else branching

<!-- TODO review -->
Most agent logic is a decision: route a request, accept or reject an input, pick which model
to ask. AJS has `if`/`else` and the ternary, and they behave as you expect.

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

<!-- TODO review -->
## What to notice

- **`let` is block-scoped.** Each branch declares its own `status`; neither leaks out.
- **`==` never coerces.** In AJS, as in TJS, `'18' == 18` is `false` and `null == undefined` is
  `true`. It is JavaScript's `===` with the one useful exception. Objects compare by identity:
  two arrays with the same items are not `==`.
- **There is no `switch`.** It is a transpile error that suggests the `if`/`else if` chain
  below. A lookup object is often better than either.

<!-- TODO review -->
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
  const note = notes[letter] ?? 'unknown'
  const result = score >= 60 ? 'pass' : 'fail'
  return { letter, note, result }
}
```

<!-- TODO review -->
## The gotcha

`==` does not coerce, but `<`, `>`, `<=` and `>=` compare a numeric string with a number the way
JavaScript does: `'18' >= 18` is `true`. If `age` can arrive as text (a form field, a model's
answer), convert it once with `parseInt(age, 10)` and compare numbers, so `==` and `>=` agree.
