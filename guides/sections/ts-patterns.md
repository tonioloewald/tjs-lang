<!--{"parent": "ts-examples.md", "order": 3}-->

# Patterns

<!-- TODO review -->

Most real TypeScript is arrays of things, objects that contain objects, and values that may
be missing. These examples show how each of those converts. `number[]` becomes an array type
whose items are checked one by one, so a single string in a list of numbers is caught and
the error names its index. An `interface` becomes a `Type` whose example has the same shape,
nested interfaces included. And `T | null` becomes a union that accepts `null` but not
`undefined`: TJS keeps the two apart, so a missing value is not mistaken for a deliberately
empty one.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Array Operations](/ts-array-operations/)
- [Nested Objects](/ts-nested-objects/)
- [Union Types](/ts-union-types/)
<!-- /toc -->

<!-- prettier-ignore-end -->
