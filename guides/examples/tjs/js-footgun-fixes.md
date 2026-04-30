<!--{"section":"tjs","type":"example","group":"basics","order":16}-->

# JS Footgun Fixes

JavaScript has a small set of legendary, well-documented gotchas that no
one defends but the spec will never change. Native TJS fixes them at the
language level — always-on under `TjsStandard`, the default for `.tjs`
files. Each test below names the footgun TJS quietly fixes.

```tjs
/*#
## What this demonstrates

Each test below names a JavaScript footgun that native TJS quietly
fixes. The test body is the proof: in raw JS the assertion would
fail, in TJS it passes. The "Test Cases" section under this paragraph
shows them in plain language.
*/

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
