<!--{"parent": "tjs-examples.md", "order": 2, "book": ["default", "language"]}-->

<!-- TODO review -->

# Patterns

Basics shows the language one feature at a time. Patterns shows it doing the work of a real
module: running from files, handling failures as values, checking data at the edges,
importing other code, and moving a hot loop into WebAssembly.

This section assumes you write JavaScript. If you are new to programming, finish
[Learn to Program](/learn-to-program/) first. It also assumes you have read
[Basics](/tjs-basics/), or at least [Hello TJS](/hello-tjs/),
[Required vs Optional](/required-vs-optional/) and
[Safety & Validation](/safety-validation/).

The chapters come in six groups, in this order:

- **Running code.** [Running TJS: Files, the CLI and Bundlers](/running-tjs/) comes first,
  because a real module lives in a file, not in a page. It covers `tjs check` and `tjs run`
  on the command line, importing `.tjs` files directly under Bun, and adding TJS to a
  bundled build.
- **Functions.** Higher-Order Functions and Async Functions show that typed signatures
  survive what JavaScript programs do all the time: pass functions around, and await them.
- **Errors.** Safety & Validation showed that a typed function returns an error instead of
  throwing it, and that a typed function handed that error returns it unchanged without
  running its body. Error Handling shows how that plays out across a program and where to
  check. Flight Recorder covers the runtime's error history: a log of every error it saw,
  including the ones your code ignored.
- **Types at runtime.** TypeScript's types vanish when it compiles; TJS keeps every
  function's signature at runtime. Types at Runtime shows how to inspect a signature,
  validate data against it, and turn it into a JSON Schema (a description of what valid
  data looks like).
- **Imports.** Date Formatting, Local Module Imports and Lodash Utilities show TJS using
  other code: npm packages and your own modules. On these pages a bare import such as
  `'date-fns'` resolves from a CDN, so there is no bundler and no install step; in your own
  project it resolves through `node_modules`, and Running TJS covers the build.
- **WebAssembly.** WebAssembly (WASM) is a low-level format that browsers run at close to
  native speed. Inline WASM, WASM SIMD, WASM Memory and WASM Functions are a short course in
  using it from a TJS file: a hot loop in a `wasm { }` block, then SIMD (one instruction
  working on four numbers at once), then buffers shared with WASM without copying, then
  reusable kernels. When WASM is not available, a block runs as JavaScript instead. Skip
  these until you have measured a loop worth speeding up.

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
