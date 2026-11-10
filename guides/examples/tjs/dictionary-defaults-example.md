<!--{"section": "tjs", "type": "example", "group": "basics", "order": 6, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Dictionary Defaults

An options object where **each member has its own default**, and passing a partial one fills
in the rest. Browser APIs already work this way: `addEventListener(type, fn, { once: true })`
leaves `capture` and `passive` at their defaults, because the web platform's options objects
are WebIDL "dictionaries". JavaScript gives your own functions no such thing; you write the
merge by hand, every time. TJS does it from the signature.

This applies in `.tjs` files. Plain `.js` and code converted from TypeScript keep
JavaScript's behaviour (see the last trip-up below).

This chapter is the working tour. The full specification, including the design history and
where TJS departs from WebIDL, is in [Dictionary Defaults](/dictionary-defaults/).

```tjs:inline
/#
## The JavaScript problem

A default parameter is ATOMIC: all or nothing.

    function drawBox(opts = { x: 0, y: 0, w: 100 }) { … }

    drawBox()            // { x: 0, y: 0, w: 100 }   the default
    drawBox({ x: 5 })    // { x: 5 }                 y and w are GONE

Pass any object and the whole default is replaced. So real code writes the
merge by hand:

    function drawBox(opts) {
      const { x = 0, y = 0, w = 100 } = opts ?? {}
      …
    }

That works, but the signature says nothing about `opts`, so the
documentation and the validation both end up in the body.

In a `.tjs` file the first spelling does what you meant. Run this example
to see how. (The TJS version adds a `label` member to show a string member
alongside the numbers; it is not needed for the merge.)
#/

// --- 1. Merge, not replace ---
function drawBox(opts = { x: 0, y: 0, w: 100, label: '' }) {
  return `${opts.label || '(box)'} at ${opts.x},${opts.y} width ${opts.w}`
}

console.log('merge-on-partial:')
console.log('  {x:5}          ->', drawBox({ x: 5 }))        // (box) at 5,0 width 100
console.log('  {label:"hi"}   ->', drawBox({ label: 'hi' })) // hi at 0,0 width 100

// --- 2. Recursive: nested objects merge member-by-member ---
function layout(cfg = { margin: { top: 0, left: 0 }, name: '' }) {
  return `${cfg.name}: top=${cfg.margin.top} left=${cfg.margin.left}`
}

console.log('\nrecursive merge:')
// Only `top` is given — `left` still gets its default rather than vanishing.
console.log('  {margin:{top:3}} ->', layout({ margin: { top: 3 }, name: 'panel' }))
// panel: top=3 left=0

// --- 3. Members are validated, with the path in the error ---
function sized(opts = { x: 0, label: '' }) {
  return opts
}

console.log('\nvalidation:')
const bad = sized({ x: 'oops' })
console.log('  x:"oops" ->', bad.message)
// Expected integer for '…:sized.opts.x', got string

// --- 4. Excess keys pass through; complete payloads keep identity ---
console.log('\npass-through and identity:')
console.log('  extra key kept ->', JSON.stringify(sized({ x: 1, extra: 'yes' })))
// {"x":1,"extra":"yes","label":""}

const complete = { x: 9, label: 'all present' }
console.log('  same object?   ->', sized(complete) === complete) // true

test 'absent members take their default' {
  expect(drawBox({ x: 5 })).toBe('(box) at 5,0 width 100')
}

test 'a nested object merges member-by-member' {
  expect(layout({ margin: { top: 3 }, name: 'panel' })).toBe(
    'panel: top=3 left=0'
  )
}

test 'a wrong member type is a MonadicError naming the path' {
  const result = sized({ x: 'oops' })
  expect(isMonadicError(result)).toBe(true)
  expect(result.path).toContain('sized.opts.x')
}

test 'excess keys are passed through, not stripped' {
  expect(sized({ x: 1, extra: 'yes' }).extra).toBe('yes')
}

test 'a complete payload is returned by identity — no copy' {
  const payload = { x: 9, label: 'all present' }
  expect(sized(payload) === payload).toBe(true)
}
```

Two TJS constructs in that example are not part of the feature. The `/# … #/` block at the
top is a doc comment: markdown that is rendered above the code (see
[TJS Syntax](/tjs-syntax/)). The `test '…' { }` blocks at the bottom are inline tests that
run with the file, using `expect` (see [Inline Tests](/inline-tests-test-private-functions/)).

## What to notice

`=` on an object parameter means **per-member defaults with merge-on-partial**. The four
parts of the example each show one rule:

1. **Merge, not replace.** A member you leave out takes its default: `drawBox({ x: 5 })`
   gets `y: 0`, `w: 100` and `label: ''`.
2. **Recursive.** A nested object merges member by member too, so `margin: { top: 3 }`
   keeps `left: 0`.
3. **Members are validated.** Each default is also an example of its member's type, so
   `x: 'oops'` against `x: 0` fails. The failure is **returned, not thrown**: `sized` hands
   back a `MonadicError`, a value with a `message` and a `path`, and you test for it with
   `isMonadicError(result)`. The path starts with the file and line and ends with the exact
   member, `sized.opts.x`. A typed function that receives the error hands it straight back,
   so it travels to the edge of your program, where you deal with it in one place; see
   [Error Handling](/error-handling/).
4. **Excess keys pass through.** A key the default does not mention is kept, not stripped
   and not rejected. If you pass every member, you get **your own object back**
   (`sized(complete) === complete` is `true`), with no copy made. If you leave any member
   out, at any depth, you get a new, merged object instead: a complete top-level object
   with a partial `margin` inside it still comes back as a new object.

The signature `drawBox(opts = { x: 0, y: 0, w: 100, label: '' })` now says everything the
hand-written merge used to hide in the body: which options exist, what type each has, and
what each defaults to. One object is the documentation, the validation and the defaults, so
they cannot drift apart.

## Required arguments beside options

The usual shape for a real API is "the things you must say, then the things you may". Put
them in separate parameters: `:` for the required ones, `=` with an object for the options.
They have to be separate because one object cannot mix the two: an object after `=` makes
every member defaulted, and an object after `:` makes every member required.

```tjs:inline
function connect(url: 'https://example.com', opts = { retries: 3, timeout: 1000.0 }) {
  return `${url} retries=${opts.retries} timeout=${opts.timeout}`
}

console.log(connect('https://a.dev'))                      // https://a.dev retries=3 timeout=1000
console.log(connect('https://a.dev', { timeout: 250.5 }))  // https://a.dev retries=3 timeout=250.5
console.log(connect('https://a.dev', undefined))           // same as leaving it out
console.log(connect('https://a.dev', { retries: 'x' }).message)
// Expected integer for '…:connect.opts.retries', got string
console.log(connect('https://a.dev', null).message)        // null is not "absent"
// Expected object for '…:connect.opts', got null

// The caller's object is not modified
const mine = { retries: 1 }
connect('https://a.dev', mine)
console.log(JSON.stringify(mine))                          // {"retries":1}
```

The value after a colon is an **example**, not a type. `url: 'https://example.com'` means
"`url` is a required string, such as this one"; it does not mean only that URL is accepted,
which is why `'https://a.dev'` works. The same goes for the numbers: `timeout: 1000.0` is a
float example, so `250.5` is accepted, while `retries: 3` is an integer example, so
`retries` must be a whole number. Had the default said `timeout: 1000`, then `250.5` would
be rejected. [Required vs Optional](/required-vs-optional/) covers the colon in full.

The merge never touches the caller's object: `mine` is still `{"retries":1}` after the
call, because a partial argument produces a new, merged object. There is one consequence of
the identity rule to keep in mind. If your function **changes** `opts`, it changes the
caller's object when the caller passed a complete one (as in plain JavaScript), and does not
when the caller passed a partial one. Copy `opts` first if you need to modify it.

## Opting out: JavaScript's atomic default

Sometimes you want the old all-or-nothing behaviour for one parameter, for example when an
object is a single value (a point, a range) and a partial one should replace the default
rather than be completed from it. Wrap the default in `LegacyDefault`:

```tjs:inline
// JavaScript's atomic default, for this one parameter only
function atomic(opts = LegacyDefault({ retries: 3, timeout: 1000 })) {
  return JSON.stringify(opts)
}
console.log(atomic())                // {"retries":3,"timeout":1000}
console.log(atomic({ timeout: 5 }))  // {"timeout":5}: replaced, not merged
```

## `=`, `:` and a typed default are three different things

Only the plain `opts = { … }` form merges. The other two spellings that put an object in a
signature mean something else, and the difference only shows when a caller passes part of
an object.

The third spelling uses a `Type` declaration. `Type Point { example: { x: 0, y: 0 } }`
declares a named type whose values look like the example: an object with integer `x` and
`y` (see [Declarations](/declarations/)). A parameter written `p: Point = { … }` is then an
**atomic optional**: leave it out and you get the default; pass something and it must be a
whole `Point`, with nothing filled in.

```tjs:inline
// `=` with an object: per-member defaults, partial payloads merged
function merged(opts = { retries: 3, timeout: 1000 }) {
  return JSON.stringify(opts)
}

// `:` with an object: a required SHAPE, every member required.
// 3 and 1000 are examples, so any integers are accepted.
function shaped(opts: { retries: 3, timeout: 1000 }) {
  return JSON.stringify(opts)
}

// A type plus a default: optional, but what you pass must be a whole Point
Type Point {
  example: { x: 0, y: 0 }
}
function at(p: Point = { x: 1, y: 2 }) {
  return JSON.stringify(p)
}

console.log(merged({ retries: 1 }))              // {"retries":1,"timeout":1000}
console.log(shaped({ retries: 7, timeout: 50 })) // {"retries":7,"timeout":50}
console.log(shaped({ retries: 1 }).message)
// Expected integer for '…:shaped.opts.timeout', got undefined
console.log(shaped().message)
// Expected object for '…:shaped.opts', got undefined
console.log(at())                                // {"x":1,"y":2}
console.log(at({ x: 5 }).message)
// Expected Point for '…:at.p', got object
```

## Things that trip people up

- **A misspelled option is passed through, silently.** `connect(url, { retryz: 9 })` is
  accepted: `retryz` is an excess key, so `retries` keeps its default and nothing complains
  at runtime. The `dict-default-excess-key` lint rule catches the literal case; the last
  section shows how to run it.
- **`null` is a value, not an absence.** `undefined` (or leaving the argument out) gets the
  defaults; `null` is checked against the object type and rejected.
- **It is `.tjs` only.** A `.js` file, or source compiled with `tjs(source, { dialect: 'js' })`,
  keeps JavaScript's atomic defaults, and so does code converted from TypeScript, because
  the same source must keep its JavaScript meaning there. See
  [Running TJS](/running-tjs/) for how the file extension decides the language.

## Catching misspelled options

The linter warns about an unknown key in an options literal, but you will not see that
warning in the live examples on this page, and `tjs check` does not show it either:
`tjs check` validates types and runs the file's signature examples and tests, but runs no
lint rules. To see it, call `lint` from `tjs-lang/lang` on the source yourself:

```javascript
import { lint } from 'tjs-lang/lang'

const source = `
function connect(url: 'https://example.com', opts = { retries: 3, timeout: 1000.0 }) {
  return [url, opts.retries]
}
connect('https://a.dev', { retryz: 9 })
`
for (const d of lint(source).diagnostics) {
  console.log(`${d.line}:${d.column} ${d.rule}: ${d.message}`)
}
// 5:27 dict-default-excess-key: 'retryz' is not a member of connect's dictionary
//   parameter — check the spelling (it is passed through, so it will have no effect)
```

The rule sees only an object **literal** written at a call to a function declared in the
same source. A payload built elsewhere and passed as a variable, or one that contains a
spread (`{ ...base, retryz: 9 }`), is not checked.
