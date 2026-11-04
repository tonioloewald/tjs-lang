<!--{"parent": "tjs-examples.md", "order": 1, "book": ["default", "language"]}-->

# Basics

<!-- TODO review -->

The everyday language: how a TJS function says what it accepts and returns, and the
JavaScript behaviours a `.tjs` file quietly fixes. Every chapter is a running example you can
edit, and most end with tests you can break to see what TJS does about it.

Read them in this order; each one leans on the ones before it.

1. **Hello TJS**, **Required vs Optional**, **Object Types** and **Array Types** teach the
   central idea: the value after a parameter's colon is an *example*, not a type annotation.
   `name: 'Alice'` means "a required string, for instance `'Alice'`", and the return example
   `: 'Hello, Alice!'` is a worked example the compiler actually runs.
2. **Control Flow: given**, **Dictionary Defaults** and **const! and Bang Access** cover
   the syntax TJS adds: a `switch` that cannot fall through by accident, object defaults
   that merge member by member, immutability checked at compile time, and a null check that
   returns an error instead of throwing.
3. **Honest Equality** and **JS Footgun Fixes** are what changes when you rename a `.js`
   file to `.tjs`: `==` stops coercing, `typeof null` says `'null'`, and a boxed
   `false` is falsy.
4. **Polymorphic Functions**, **Polymorphic Constructors**, **Better Classes** and **Local
   Class Extensions** show functions and classes doing more: several signatures under one
   name, classes callable without `new`, and methods added to built-in types without
   touching their prototypes.
5. **Safety & Validation** and **Safer Code** close the section: where validation runs,
   what it costs, and how to switch it off for one function when you have measured that you
   need to; then the constructs `.tjs` refuses outright (`var`, raw `Date`, `eval`) and
   what to write instead.

After this section you should be able to write a TJS module whose signatures document,
test and validate themselves; read a `MonadicError` and know which argument caused it; and
know which JavaScript habits behave differently in a `.tjs` file.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Hello TJS](/hello-tjs/)
- [Required vs Optional](/required-vs-optional/)
- [Object Types](/object-types/)
- [Array Types](/array-types/)
- [Control Flow: given](/given-dispatch/)
- [Dictionary Defaults](/dictionary-defaults-example/)
- [const! and Bang Access](/const-and-bang/)
- [Honest Equality](/honest-equality/)
- [Polymorphic Functions](/polymorphic-functions/)
- [JS Footgun Fixes](/js-footgun-fixes/)
- [Polymorphic Constructors](/polymorphic-constructors/)
- [Safety & Validation](/safety-validation/)
- [Better Classes](/better-classes/)
- [Local Class Extensions](/local-extensions/)
- [Safer Code](/safer-code/)
<!-- /toc -->

<!-- prettier-ignore-end -->
