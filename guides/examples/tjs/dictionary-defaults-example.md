<!--{"section": "tjs", "type": "example", "group": "basics", "order": 6, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Dictionary Defaults

An options object where **each member has its own default**, and passing a partial one fills
in the rest. JavaScript makes you write that merge by hand, every time. TJS does it from the
signature.

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
to see how.
#/

// --- 1. Merge, not replace ---
function drawBox(opts = { x: 0, y: 0, w: 100, label: '' }) {
  return `${opts.label || '(box)'} at ${opts.x},${opts.y} width ${opts.w}`
}

console.log('merge-on-partial:')
console.log('  {x:5}          ->', drawBox({ x: 5 }))
console.log('  {label:"hi"}   ->', drawBox({ label: 'hi' }))

// --- 2. Recursive: nested objects merge member-by-member ---
function layout(cfg = { margin: { top: 0, left: 0 }, name: '' }) {
  return `${cfg.name}: top=${cfg.margin.top} left=${cfg.margin.left}`
}

console.log('\nrecursive merge:')
// Only `top` is given — `left` still gets its default rather than vanishing.
console.log('  {margin:{top:3}} ->', layout({ margin: { top: 3 }, name: 'panel' }))

// --- 3. Members are validated, with the path in the error ---
function sized(opts = { x: 0, label: '' }) {
  return opts
}

console.log('\nvalidation:')
console.log('  x:"oops" ->', JSON.stringify(sized({ x: 'oops' })))

// --- 4. Excess keys pass through; complete payloads keep identity ---
console.log('\npass-through and identity:')
console.log('  extra key kept ->', JSON.stringify(sized({ x: 1, extra: 'yes' })))

const complete = { x: 9, label: 'all present' }
console.log('  same object?   ->', sized(complete) === complete)

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
  expect(result.path).toContain('opts.x')
}

test 'excess keys are passed through, not stripped' {
  expect(sized({ x: 1, extra: 'yes' }).extra).toBe('yes')
}

test 'a complete payload is returned by identity — no copy' {
  const payload = { x: 9, label: 'all present' }
  expect(sized(payload) === payload).toBe(true)
}
```

## What to notice

`=` on an object parameter means **per-member defaults with merge-on-partial**. The four
parts of the example each show one rule:

1. **Merge, not replace.** A member you leave out takes its default: `drawBox({ x: 5 })`
   gets `y: 0`, `w: 100` and `label: ''`.
2. **Recursive.** A nested object merges member by member too, so `margin: { top: 3 }`
   keeps `left: 0`.
3. **Members are validated.** Each default is also an example of its member's type, so
   `x: 'oops'` against `x: 0` returns a `MonadicError` (it is not thrown), and its `path`
   names the exact member, `sized.opts.x`.
4. **Excess keys pass through.** A key the default does not mention is kept, not stripped
   and not rejected. A payload that already has every member is returned **by identity**:
   no copy is made, so a call that supplies everything costs no allocation.

The signature `drawBox(opts = { x: 0, y: 0, w: 100, label: '' })` now says everything the
hand-written merge used to hide in the body: which options exist, what type each has, and
what each defaults to. One object is the documentation, the validation and the defaults, so
they cannot drift apart.

The merge never touches the caller's object. A partial argument produces a new, merged
object; a complete one is handed back as is. In neither case does the caller see members
appear in the object they passed.

## Required arguments beside options

The usual shape for a real API is "the things you must say, then the things you may". Put
them in separate parameters: `:` for the required ones, `=` with an object for the options.
And when you need JavaScript's all-or-nothing default for one parameter, say so with
`LegacyDefault`:

```tjs:inline
function connect(url: 'https://example.com', opts = { retries: 3, timeout: 1000.0 }) {
  return `${url} retries=${opts.retries} timeout=${opts.timeout}`
}

console.log(connect('https://a.dev'))                      // all defaults
console.log(connect('https://a.dev', { timeout: 250.5 }))  // one member changed
console.log(connect('https://a.dev', undefined))           // same as leaving it out
console.log(connect('https://a.dev', { retries: 'x' }).message)
console.log(connect('https://a.dev', null).message)        // null is not "absent"

// The caller's object is not modified
const mine = { retries: 1 }
connect('https://a.dev', mine)
console.log(JSON.stringify(mine))                          // {"retries":1}

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
an object:

```tjs:inline
// `=` with an object: per-member defaults, partial payloads merged
function merged(opts = { retries: 3, timeout: 1000 }) {
  return JSON.stringify(opts)
}

// `:` with an object: a required SHAPE, every member required
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

console.log(merged({ retries: 1 }))            // {"retries":1,"timeout":1000}
console.log(shaped({ retries: 1 }).message)    // timeout is missing
console.log(shaped().message)                  // the argument is required
console.log(at())                              // {"x":1,"y":2}
console.log(at({ x: 5 }).message)              // not a whole Point
```

## Things that trip people up

- **A misspelled option is passed through, silently.** `connect(url, { retryz: 9 })` is
  accepted: `retryz` is an excess key, and excess keys pass through, so `retries` keeps its
  default and nothing complains at runtime. The linter catches this case, but neither the
  page nor `tjs check` shows it: `tjs check` type-checks and runs no lint rules. Call
  `lint` from `tjs-lang/lang` on the source yourself:

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
- **`null` is a value, not an absence.** `undefined` (or leaving the argument out) gets the
  defaults; `null` is checked against the object type and rejected.
- **It is native TJS only.** Code converted from TypeScript, and `.js` files compiled with
  `dialect: 'js'`, keep JavaScript's atomic defaults, because the same source must keep its
  JavaScript meaning there.
