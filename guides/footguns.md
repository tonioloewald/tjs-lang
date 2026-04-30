# JS Footguns That TJS Quietly Fixes

JavaScript has a small set of legendary, well-documented gotchas that no one
defends but that the spec will never change. Native TJS fixes them at the
language level so you don't have to remember which version of an idiom to
use in which context.

A runnable demo lives at [`examples/js-footguns-fixed.tjs`](../examples/js-footguns-fixed.tjs):

```bash
bun src/cli/tjs.ts run examples/js-footguns-fixed.tjs
```

All the fixes below are **always-on under `TjsStandard`** (the default for
native TJS files). They are **off** under `TjsCompat`, in `fromTS`-emitted
code, and in AJS/VM targets — so existing JS/TS semantics are preserved
when you opt out.

---

## 1. `Boolean(new Boolean(false))` is `true` (and friends)

A boxed primitive is an `Object`, and the spec's `ToBoolean` operation
declares any `Object` truthy. The result:

```js
Boolean(new Boolean(false))   // true   — wrong!
if (new Boolean(false)) { ... }   // enters branch — wrong!
!new Boolean(false)           // false  — wrong!
new Boolean(false) || 'x'     // Boolean { false } — wrong!
new Boolean(false) ? 'y' : 'n'  // 'y' — wrong!
```

`Symbol.toPrimitive` doesn't fire for boolean coercion, so there is no
hook to fix this in plain JS. **TJS rewrites every truthiness context**
(including `if`, `while`, `for`, `do`, `!`, `&&`, `||`, ternary, and
top-level `Boolean(x)` calls) to call `__tjs.toBool(x)`, which unwraps
boxed primitives before applying `ToBoolean`:

```tjs
Boolean(new Boolean(false))    // false  ✓
if (new Boolean(false)) ...    // does not enter  ✓
!new Boolean(false)            // true   ✓
new Boolean(false) || 'x'      // 'x'    ✓
```

The `&&` / `||` rewrites preserve JS's value-returning semantics: `a && b`
still returns `a` when `a` is falsy (after unwrapping) and `b` otherwise.
Side effects fire exactly as they would in raw JS — `inc() && inc()` calls
`inc` twice. No double-evaluation.

`??` (nullish coalescing) is intentionally **not** rewritten. Its semantics
are about `null`/`undefined` specifically, not truthiness, so boxed
primitives behave correctly already (`new Boolean(false) ?? 'fallback'`
returns the wrapper, which is what you'd want).

`===` / `!==` (identity) are also not touched — that's a different
footgun, handled by the `Is` operator (see below).

> **Why fix instead of ban?** Boxed primitives have legitimate uses
> (passing primitives by reference, attaching properties for tagging).
> Banning them with a parse error would be paternalistic. TJS lets you
> use them — and makes them work the way the name implies.

## 2. `==` is a coercion lottery; `NaN !== NaN`

Raw JS `==` coerces wildly across types:

<!-- prettier-ignore -->
```js
'5' == 5     // true
'' == false  // true
0 == ''      // true
[1] == 1     // true
```

…and `NaN` is famously unequal to itself, which makes "is this a real
number?" checks awkward.

Native TJS rewrites `==` and `!=` to **honest equality** (the `Eq` /
`NotEq` runtime functions):

```tjs
'5' == 5          // false  ✓ (different types, no coercion)
NaN == NaN        // true   ✓
null == undefined // true   (preserved — this one is actually useful)
```

Boxed primitives are unwrapped before comparison: `new Boolean(false) == false`
is `true`.

For **deep structural equality** of objects, arrays, Maps, and Sets, use
the explicit `Is` / `IsNot` operators:

```tjs
Is({a: 1}, {a: 1})    // true   ✓
Is([1, 2], [1, 2])    // true   ✓
{a: 1} Is {a: 1}      // true   ✓ (infix form)
```

Identity comparison stays available as `===` / `!==` when you really
mean "same reference."

## 3. `typeof null === 'object'`

The original JS bug, preserved forever for backward compatibility.
Under TjsEquals, `typeof` is rewritten to a runtime helper that returns
`'null'` for `null`:

```tjs
typeof null   // 'null'  ✓
typeof undefined   // 'undefined'
typeof 42     // 'number'
```

## 4. `let x` (uninitialized) silently leaves a hole

Raw JS: `let x` declares a variable bound to `undefined`. There's no
indication whether you forgot to initialize it, intend to assign it
later, or intend it to actually be undefined.

Native TJS warns under the `safe-assign-let-needs-type` linter rule:

```tjs
let x                     // ⚠ let needs initializer or type annotation
let y = undefined         // ⚠ same
let z = null              // ⚠ same
let result: ''            // ✓ type annotation, no init
let count = 0             // ✓ inferable from init
```

Once a `let` is "typed" (annotated or inferable), assigning literal
`undefined` / `null` / `void 0` to it is also flagged:

```tjs
let name = 'world'
name = undefined          // ⚠ Cannot assign undefined to typed let 'name'
```

Severity is warning by default, error under `TjsStrict`.

## 5. Classes that require `new`

Calling a class without `new` is a `TypeError` in strict mode and silently
leaks to the global object in sloppy mode. TJS wraps user classes (under
`TjsClass`, on by default) so they're callable both ways:

```tjs
class Point {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
}

Point(1, 2)       // ✓ works
new Point(1, 2)   // ⚠ flagged by no-explicit-new linter rule (also works)
```

## 6. `var` hoisting and the temporal dead zone

`TjsNoVar` (on by default) makes `var` declarations a parse error. Use
`let` and `const` exclusively, get block scoping, and avoid the entire
class of "wait, that's hoisted?" bugs.

---

## Opting out

If you have a specific file where you need raw JS semantics:

```tjs
TjsCompat
// All TJS modes off; behaves like plain JS.
```

For ts-originated code (`fromTS`), all modes default off. Add `TjsStrict`
if you want to opt back in.

For specific mode toggles, see [DOCS-TJS.md](../DOCS-TJS.md) and the
mode list in [CLAUDE-TJS-SYNTAX.md](../CLAUDE-TJS-SYNTAX.md).
