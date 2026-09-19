<!--{"section":"tjs","type":"example","group":"basics","order":6}-->

# Dictionary Defaults

An options object where **each member has its own default**, and passing a partial one fills
in the rest. JavaScript makes you write that merge by hand, every time.

```tjs
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
