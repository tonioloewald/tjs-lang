<!--{"parent": "ts-examples.md", "order": 2}-->

# Validation

<!-- TODO review -->

This is the reason to run TypeScript through TJS at all. With `/* @tjs TjsStrict */` at the
top of a file, every parameter type becomes a check that runs on every call, including calls
with data the compiler never saw: JSON, form input, anything cast with `as any`.

A failed check returns a `MonadicError` instead of throwing, so a bad value cannot crash the
caller, and it cannot slip through either: the next TJS function that receives the error
returns it unchanged. The examples here show primitive checks, object checks (members
included), optional parameters, and tests written in comments so that `tsc` ignores them and
TJS runs them.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Embedded Tests](/ts-embedded-tests/)
- [Runtime Validation](/ts-runtime-validation/)
- [Object Validation](/ts-object-validation/)
- [Optional Parameters](/ts-optional-parameters/)
<!-- /toc -->

<!-- prettier-ignore-end -->
