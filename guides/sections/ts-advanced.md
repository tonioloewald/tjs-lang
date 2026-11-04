<!--{"parent": "ts-examples.md", "order": 4}-->

# Advanced

<!-- TODO review -->

These are the places where TypeScript's type system says the most and the runtime knows the
least. A generic type parameter describes a relationship between types that no single value
can show, so TJS checks what it can (a constraint such as `T extends { id: number }`) and
lets the rest through as `any`. `Promise<T>` describes a value that does not exist yet, so
the converter annotates what an async function resolves to. Classes convert with their
methods' parameter types intact, and the last example puts all of it together in a small
order-processing program.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Generic Functions](/ts-generic-functions/)
- [Async Functions](/ts-async-functions/)
- [Classes](/ts-classes/)
- [The Full Picture](/ts-the-full-picture/)
<!-- /toc -->

<!-- prettier-ignore-end -->
