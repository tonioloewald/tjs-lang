<!--{"parent": "tjs-examples.md", "order": 2, "book": ["default", "language"]}-->

<!-- TODO review -->

# Patterns

Basics shows the language one feature at a time; Patterns shows it doing ordinary work.
These chapters assume you have read Basics, or at least Hello TJS, Required vs Optional and
Safety & Validation.

0. **Running TJS: files, CLI, bundlers** comes first, because a real module lives in a
   file, not in a page. It covers `tjs check` and `tjs run` on the command line, importing
   `.tjs` files directly under Bun, and adding TJS to a bundled build.
1. **Higher-Order Functions** and **Async Functions** show that typed signatures survive
   the things JavaScript programs actually do: passing functions around, and awaiting them.
2. **Error Handling** and **Flight Recorder** belong together. Safety & Validation (in
   Basics) showed the mechanism: a typed function *returns* an error value instead of
   throwing, and a typed function handed that error returns it without running. These two
   chapters start from there. Error Handling shows how errors move through a whole program
   and where to check for them; Flight Recorder shows the runtime's record of every error
   it saw, including the ones your code dropped, because returned errors are easy to
   ignore.
3. **Schema Validation** shows that the types do not evaporate: every function carries
   its signature at runtime, so you can inspect it, validate data against it and generate
   documentation from it.
4. **Date Formatting**, **Local Module Imports** and **Lodash Utilities** show TJS using
   other code: npm packages imported by bare name with no bundler, and your own modules.
5. **Inline WASM**, **WASM SIMD**, **WASM Memory** and **WASM Functions** are a short course
   in WebAssembly from inside a TJS file, in that order: a hot loop in a `wasm { }` block,
   then four lanes at once with SIMD, then zero-copy buffers, then reusable kernels. Skip
   them until you have a loop worth speeding up.

After this section you should be able to structure a real module: handle failures as
values without losing track of them, validate input at the edges, import what you need, and
move a measured hot spot into WebAssembly while keeping a JavaScript fallback.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Higher-Order Functions](/higher-order-functions/)
- [Async Functions](/async-functions/)
- [Error Handling](/error-handling/)
- [Flight Recorder](/error-history/)
- [Schema Validation](/schema-validation/)
- [Date Formatting (with import)](/date-formatting-with-import/)
- [Local Module Imports](/local-module-imports/)
- [Lodash Utilities (with import)](/lodash-utilities-with-import/)
- [Inline WASM](/wasm-basics/)
- [WASM SIMD](/wasm-simd/)
- [WASM Memory](/wasm-memory/)
- [WASM Functions (reusable kernels)](/wasm-functions/)
<!-- /toc -->

<!-- prettier-ignore-end -->
