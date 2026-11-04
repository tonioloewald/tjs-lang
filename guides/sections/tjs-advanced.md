<!--{"parent": "tjs-examples.md", "order": 3, "book": ["default", "language"]}-->

# Advanced

<!-- TODO review -->

Three chapters that use TJS for things a type system usually cannot do. Each stands alone,
but all three assume the Basics, and The Universal Endpoint also assumes you have met AJS.

1. **The Universal Endpoint** builds a server endpoint that runs *code* sent by the client,
   safely: the request is an AJS program, executed in a sandbox with a fuel limit and only
   the capabilities you hand it.
2. **Inline Tests: Test Private Functions** shows tests that live beside the code they test,
   run when the file is transpiled, and disappear from the output, so they can reach
   functions the module never exports.
3. **Predicate Types** shows a type defined by a function rather than an example (a CSS
   colour, say) that the compiler can verify is pure and safe to run on untrusted input,
   and that can even suggest valid values for autocomplete.

After this section you should know when to reach past examples for a predicate, how to test
code that is not exported, and how TJS and AJS fit together to move code to where the data
is instead of moving the data.

<!-- prettier-ignore-start -->

<!-- toc -->
- [The Universal Endpoint](/the-universal-endpoint/)
- [Inline Tests: Test Private Functions](/inline-tests-test-private-functions/)
- [Predicate Types](/predicate-types/)
<!-- /toc -->

<!-- prettier-ignore-end -->
