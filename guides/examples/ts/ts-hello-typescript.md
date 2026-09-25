<!--{"section": "ts", "type": "example", "group": "intro", "order": 1, "parent": "ts-intro.md"}-->

# Hello TypeScript

See how TypeScript types become TJS example-based types

```ts
/*#
# TypeScript:

Types are compile-time only
TJS: Types become runtime validation!

Markdown doc comments in ts are supported, and
inline tests can be embedded in comment blocks.
*/

// Converted TypeScript keeps JavaScript's behaviour until you opt in. This one
// line opts in to full TJS, which turns the types into runtime checks:
/* @tjs TjsStrict */

/*test 'this is a tjs test block' {
  expect(greet('ts')).toBe('Hello, ts!')
}*/

function greet(name: string): string {
  return `Hello, ${name}!`
}

// This works - correct type
console.log(greet('World'))

// In pure TS, this would crash at runtime
// In TJS, you get a clean error object
console.log('Bad call result:', greet(42 as any))
```
