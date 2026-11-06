<!--{"parent": "tjs-examples.md", "order": 1, "book": ["default", "language"]}-->
<!-- TODO review -->

# Basics

The everyday language: how a TJS function says what it accepts and returns, and the
JavaScript behaviours a `.tjs` file changes. Every chapter is a running example you can
edit, and most end with tests you can break to see what TJS does about it.

Here is the idea the whole section builds on, in six lines:

```tjs
function greet(name: 'Alice'): 'Hello, Alice!' {
  return `Hello, ${name}!`
}

console.log(greet('Bob'))        // Hello, Bob!

const oops = greet(42)
console.log(oops instanceof Error)                     // true
console.log(oops.path, oops.expected, oops.actual)     // …greet.name string number
```

`name: 'Alice'` is not a TypeScript literal type. It says "a required string, for instance
`'Alice'`". The return annotation `: 'Hello, Alice!'` is a worked example: when the file is
compiled, TJS calls `greet('Alice')` and checks that it really returns `'Hello, Alice!'`.
Change the example to `'Hello, Alice?'` and the file no longer compiles. And when a caller
passes a number, `greet` does not throw: it returns an error value that names the
parameter, what it expected, and what it got. (The start of `path` is the file name and
line, so it differs from page to page.)

## The chapters, in order

Each group leans on the ones before it.

1. **Hello TJS**, **Required vs Optional**, **Object Types** and **Array Types** teach
   the central idea above: the value after a colon is an *example* that stands for a type,
   and a return example is a test. Hello TJS also shows how to read the error a typed
   function returns: its `message`, `path`, `expected` and `actual`.
2. **Control Flow: given**, **Dictionary Defaults** and **const! and Bang Access** cover
   the syntax TJS adds: a dispatch that cannot fall through by accident, object defaults
   that merge member by member, immutability checked at compile time, and a null check
   that returns an error instead of throwing.
3. **Honest Equality** and **JS Footgun Fixes** are what changes when you rename a `.js`
   file to `.tjs`. Honest Equality covers `==` and `!=`, which stop converting types, and
   `Is` for comparing structure. JS Footgun Fixes is the complete list of everything else
   that changes, with the chapter that covers each item: `typeof null` is `'null'`, a boxed
   `false` is falsy, a line starting with `(`, `[` or `` ` `` starts a new statement, and a
   bare assignment to a Capitalised name declares a `const`.
4. **Polymorphic Functions**, **Better Classes**, **Polymorphic Constructors** and **Local
   Class Extensions** show functions and classes doing more: several signatures under one
   name, classes you call without `new` whose constructors check their arguments, a class
   with one constructor per way of building it, and methods added to built-in types
   without touching their prototypes.
5. **Safety & Validation** and **What `.tjs` Refuses** close the section. The first shows
   where validation runs: on every call's inputs, on return values when you write `:?`,
   and on exceptions caught by a `try` with no `catch`; and how to turn checks off for one
   function (`!`) or a whole file when you have measured that you need to. The second
   covers the four constructs that are compile errors in every `.tjs` file (`var`,
   `eval(…)`, `new Date(…)`, and `new` on a class declared in the same file) and what to
   write instead.

After this section you should be able to write a TJS module whose signatures document,
test and validate themselves; read a `MonadicError` and know which argument caused it; and
know which JavaScript habits behave differently in a `.tjs` file. Patterns, the next
section, puts these pieces to work in whole programs, including how errors travel through
one.

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
- [JS Footgun Fixes](/js-footgun-fixes/)
- [Polymorphic Functions](/polymorphic-functions/)
- [Better Classes](/better-classes/)
- [Polymorphic Constructors](/polymorphic-constructors/)
- [Local Class Extensions](/local-extensions/)
- [Safety & Validation](/safety-validation/)
- [What `.tjs` Refuses](/safer-code/)
<!-- /toc -->

<!-- prettier-ignore-end -->
