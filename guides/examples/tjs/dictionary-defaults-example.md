<!--{"section": "tjs", "type": "example", "group": "basics", "order": 6, "parent": "tjs-basics.md"}-->

# Dictionary Defaults

An options object where **each member has its own default**, and passing a partial one fills
in the rest. JavaScript makes you write that merge by hand, every time.

```tjs:inline
/#
## The JavaScript problem

A default parameter is ATOMIC — all or nothing:

    function drawBox(opts = { x: 0, y: 0, w: 100 }) { … }

    drawBox()            // { x: 0, y: 0, w: 100 }   the default
    drawBox({ x: 5 })    // { x: 5 }                 y and w are GONE

Pass any object and the whole default is replaced. So real code writes the
merge by hand:

    function drawBox(opts) {
      const { x = 0, y = 0, w = 100 } = opts ?? {}
      …
    }

— which works, but says nothing about `opts` in the signature, so the
documentation and the validation both live in the body.

## What TJS does

`=` on an object parameter means **per-member defaults with merge-on-partial**
(WebIDL dictionary semantics):

    function drawBox(opts = { x: 0, y: 0, w: 100 }) { … }

    drawBox({ x: 5 })    // { x: 5, y: 0, w: 100 }

Four properties worth knowing, each demonstrated below:

1. **Merge, not replace** — absent members take their default.
2. **Recursive** — a nested object merges member-by-member too.
3. **Members are validated** — a wrong type is a `MonadicError` naming the
   exact path, e.g. `f.opts.x`.
4. **Excess keys pass through** — TJS is not a bouncer. (0.12 stripped them;
   0.13.0 stopped, deliberately. See `docs/dictionary-defaults.md` for the
   WebIDL divergence.) A complete payload is returned **by identity** — no
   copy, so no allocation on the hot path.

`:` means required, `=` means defaulted. Mixed shapes use separate
parameters. Native `.tjs` only — `dialect: 'js'` and `fromTS` keep atomic
JavaScript defaults, because TJS must stay a superset.
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

<!-- TODO review -->

## What to notice

The signature `drawBox(opts = { x: 0, y: 0, w: 100, label: '' })` now says everything the
hand-written merge used to hide in the body: which options exist, what type each has, and
what each defaults to. The same object is the documentation, the validation and the
defaults, so they cannot drift apart.

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

## Things that trip people up

- **A misspelled option is passed through, silently.** `connect(url, { retryz: 9 })` is
  accepted: `retryz` is an excess key, and excess keys pass through, so `retries` keeps its
  default and nothing complains at runtime. TJS's linter (`lint` from `tjs-lang/lang`) does
  flag a literal key that is not in the default, under the rule `dict-default-excess-key`.
- **`null` is a value, not an absence.** `undefined` (or leaving the argument out) gets the
  defaults; `null` is checked against the object type and rejected.
- **`:` with an object is a shape, not a dictionary.** `opts: { retries: 3 }` makes the
  argument required and every member required. Only `=` gives per-member defaults.
- **A type plus a default is atomic.** `p: Point = { x: 1, y: 2 }` is the typed-default
  form: optional, but a value you pass must be a whole `Point`. Dictionary merging belongs to
  the plain `opts = { … }` form.
- **It is native TJS only.** Code converted from TypeScript, and `.js` files compiled with
  `dialect: 'js'`, keep JavaScript's atomic defaults, because the same source must keep its
  JavaScript meaning there. The full specification is in
  [Dictionary Defaults](/dictionary-defaults/).
