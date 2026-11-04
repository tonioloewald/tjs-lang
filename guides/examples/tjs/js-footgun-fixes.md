<!--{"section": "tjs", "order": 17, "parent": "tjs-basics.md"}-->

# JS Footgun Fixes

JavaScript has a small set of legendary, well-documented gotchas that no
one defends but the spec will never change. Native TJS fixes them at the
language level — always on in `.tjs`
files. Each test below names the footgun TJS quietly fixes.

## What this demonstrates

Each test below names a JavaScript footgun that native TJS quietly
fixes. The test body is the proof: in raw JS the assertion would
fail, in TJS it passes.

```tjs:static
test 'Boolean(new Boolean(false)) is false' {
  expect(Boolean(new Boolean(false))).toBe(false)
}

test '!new Boolean(false) is true' {
  expect(!new Boolean(false)).toBe(true)
}

test 'new Boolean(false) is falsy in if/while/for/?:' {
  expect((new Boolean(false)) ? 'truthy' : 'falsy').toBe('falsy')
}

test 'new Boolean(false) || x returns x (LHS unwraps to falsy)' {
  expect((new Boolean(false)) || 'fallback').toBe('fallback')
}

test "'5' == 5 is false (no silent coercion across types)" {
  expect('5' == 5).toBe(false)
}

test "'' == false is false (no silent coercion)" {
  expect('' == false).toBe(false)
}

test '0 == "" is false (no silent coercion)' {
  expect(0 == '').toBe(false)
}

test 'NaN == NaN is true (NaN equals itself)' {
  expect(NaN == NaN).toBe(true)
}

test 'null == undefined is true (preserved — useful pattern)' {
  expect(null == undefined).toBe(true)
}

test 'new String("hi") == "hi" is true (boxed primitives unwrap)' {
  expect(new String('hi') == 'hi').toBe(true)
}

test 'typeof null is "null", not "object"' {
  expect(typeof null).toBe('null')
}

test 'Is({a:1}, {a:1}) is true (deep structural equality)' {
  expect(Is({ a: 1 }, { a: 1 })).toBe(true)
}

test 'Is([1,2,3], [1,2,3]) is true (arrays compare element-wise)' {
  expect(Is([1, 2, 3], [1, 2, 3])).toBe(true)
}

test 'Is(new Set([1,2]), new Set([2,1])) is true (Sets are order-independent)' {
  expect(Is(new Set([1, 2]), new Set([2, 1]))).toBe(true)
}
```

<!-- TODO review -->
## What to notice

There are three groups of fixes here, and each is a rewrite the transpiler makes everywhere in
a `.tjs` file, not a library you call:

- **Truthiness.** `new Boolean(false)` is an object, and every object is truthy in JavaScript,
  so `if (new Boolean(false))` runs its body. TJS routes every truthiness test (`if`, `while`,
  `!`, `&&`, `||`, `? :`) through a check that unwraps boxed primitives first. `&&` and `||`
  still return one of their operands, as in JavaScript; only the decision changes.
- **Equality.** `==` no longer converts between types, so `'5' == 5`, `'' == false` and
  `0 == ''` are all false. Two conveniences stay: `null == undefined` is true (the idiomatic
  "is it missing?" test), and a boxed primitive equals its value. `NaN == NaN` is true, because
  "is this the same value?" should have one answer. `==` is **not** structural: two different
  objects are different, however alike, and that comparison stays O(1). When you want "same
  contents", say so with `Is` (and `IsNot`), which compares arrays, objects, Sets, Maps and
  Dates deeply.
- **`typeof null` is `'null'`.** JavaScript's `'object'` is a bug from 1995 that was kept for
  compatibility, and it is why `typeof x === 'object'` checks so often forget to exclude null.

What is **not** changed: `===` and `!==` keep their exact JavaScript meaning (so
`NaN === NaN` is still false), and `??` is untouched, because it already tests only for
`null`/`undefined`.

<!-- TODO review -->
## The old behaviour, when you really want it

Every fix has a named escape, spelled out at the call site so it is obvious in review and easy
to search for. The names are long on purpose:

```tjs:inline
console.log("'5' == 5:                     ", '5' == 5)
console.log("DangerousLegacyEquals('5', 5):", DangerousLegacyEquals('5', 5))

console.log('typeof null:                  ', typeof null)
console.log('LegacyTypeOf(null):           ', LegacyTypeOf(null))

console.log('NaN == NaN:                   ', NaN == NaN)
console.log('LegacyExactly(NaN, NaN):      ', LegacyExactly(NaN, NaN))

console.log('[1, 2] == [1, 2]:             ', [1, 2] == [1, 2])
console.log('Is([1, 2], [1, 2]):           ', Is([1, 2], [1, 2]))

const flag = new Boolean(false)
console.log('new Boolean(false) ? a : b:   ', flag ? 'a' : 'b')
```

The full list is `DangerousLegacyEquals` / `DangerousLegacyNot` (JavaScript's `==` / `!=`),
`LegacyExactly` / `LegacyNotExactly` (`===` / `!==`, by name), `LegacyTypeOf`, `LegacyDate`
(a raw `Date`, which `.tjs` otherwise refuses) and `LegacyDefault` (an atomic parameter
default instead of a [dictionary default](/dictionary-defaults-example/)). Truthiness has no
escape: there is no legitimate reason to want a boxed `false` to be true.

<!-- TODO review -->
## Gotchas

- **The fixes belong to `.tjs` files.** A `.js` file, or TypeScript converted with `fromTS`,
  keeps JavaScript's semantics, so the same expression can mean different things in two files
  of one project. That is deliberate: TJS must accept every JavaScript program and run it as
  JavaScript would.
- **`Is` costs what it compares.** It walks both values, so use it when you mean structural
  equality, not as a habit in hot loops.
- **Pasted JavaScript can change meaning.** Code that relied on `==` coercion (`if (input == 0)`
  to catch `''` and `'0'` as well) stops matching when moved into a `.tjs` file. Search for
  `==` when you port, and reach for `DangerousLegacyEquals` where the coercion was the point.

See [JS footguns TJS fixes](/footguns/) for the longer list, including the uninitialised
`let` and `var` hoisting.
