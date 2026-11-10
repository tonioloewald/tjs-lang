<!--{"parent": "tjs-examples.md", "order": 3, "book": ["default", "language"]}-->
<!-- TODO review -->

# Advanced

Three chapters on what TJS can do because its types and tests survive to runtime, things
most languages leave to separate tools. They are written for readers comfortable with
JavaScript; if you came through [Learn to Program](/learn-to-program/), finish it first.
Each chapter stands alone, and all three assume the [Basics](/tjs-basics/).

1. **[The Universal Endpoint](/the-universal-endpoint/)** builds one server endpoint that
   runs *code* sent by the client, in place of one route per operation, so the client's
   logic travels to the data. The request is an AJS program. AJS is a sandboxed subset of
   JavaScript that compiles to a JSON syntax tree and runs on a metered virtual machine,
   with a fuel limit (a work budget, so the program must stop) and only the capabilities
   you hand it (a store, `fetch`, an LLM: nothing else is reachable). This chapter assumes
   you have read [The AJS Language](/DOCS-AJS/), the first chapter of the AJS book.
2. **[Inline Tests: Test Private Functions](/inline-tests-test-private-functions/)** shows
   tests that live beside the code they test. They run when TJS converts the file to
   JavaScript and are left out of the JavaScript it produces, so they can reach functions
   the module never exports.
3. **[Predicate Types](/predicate-types/)** shows a type defined by a function rather than
   by an example value (TJS's usual `name: 'Alice'` form): a CSS colour, say, which no
   example can describe. The same predicate can be mined for autocomplete suggestions.
   The compiler checks that the predicate is pure (no side effects) and fuel-bounded (it
   cannot hang), so it is safe to run on untrusted *input*.
   It is not a sandbox for untrusted *source*: a verified predicate compiles to native
   JavaScript, so run only predicates you trust. Untrusted code belongs in the AJS VM, as
   in the first chapter.

After this section you should know how TJS and AJS fit together to move code to the data
instead of moving the data, how to test code that is not exported, and when to reach past
examples for a predicate.

<!-- prettier-ignore-start -->

<!-- toc -->
- [The Universal Endpoint](/the-universal-endpoint/)
- [Inline Tests: Test Private Functions](/inline-tests-test-private-functions/)
- [Predicate Types](/predicate-types/)
<!-- /toc -->

<!-- prettier-ignore-end -->
