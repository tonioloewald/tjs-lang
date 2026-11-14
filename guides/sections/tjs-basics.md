<!--{"parent": "tjs-examples.md", "order": 1, "book": ["default"]}-->
<!-- TODO review -->

# Basics

The everyday language: how a TJS function says what it accepts and returns, and the
JavaScript behaviours a `.tjs` file changes. This section assumes you know JavaScript. If
you are new to programming, start with [Learn to Program](/learn-to-program/) instead.

Every chapter is a running example you can edit. Most end with `test` blocks: change the
code so a test fails and see what TJS reports.

Here is the idea the whole section builds on:

```tjs
function greet(name: 'Alice'): 'Hello, Alice!' {
  return `Hello, ${name}!`
}

console.log(greet('Bob')) // Hello, Bob!

const oops = greet(42)
console.log(isMonadicError(oops)) // true
console.log(oops.message) // Expected string for '…:1:greet.name', got number
console.log(oops.expected, oops.actual) // string number
```

The colon gives an example value: TJS reads `name: 'Alice'` as "a string, for instance
`'Alice'`". (It is not a TypeScript literal type; `greet('Bob')` is fine.) The colon also
makes the parameter required; `name = 'Alice'` would make it optional, as
[Required vs Optional](/required-vs-optional/) shows.

The return annotation `: 'Hello, Alice!'` is a worked example, and TJS tests it. Before your
code runs, TJS transpiles it to plain JavaScript (the live examples on this site do this
every time they run), and during that step it calls `greet('Alice')` and checks that the
result really is `'Hello, Alice!'`. Change the example to `'Hello, Alice?'` and TJS reports
a failed signature test: `Expected "Hello, Alice?" at 'greet', got "Hello, Alice!"`. The
return example is checked once, at that step. At run time every call checks its inputs;
checking return values too is opt-in (`:?`, see [Safety & Validation](/safety-validation/)).

When a caller passes a number, `greet` does not throw. It returns an error value, a
`MonadicError` (which is an `Error`), naming the parameter, the type it expected and what it
got. The start of the path in `message` is the source name and line, so it differs from page
to page. A returned error is an ordinary value you can inspect: nothing unwinds the stack, so
it arrives where the call was made instead of in whichever `catch` happens to be above. Check for it with `isMonadicError`, or pass it on: a
checked function that receives an error hands the same error straight back.

## The chapters, in order

1. [Hello TJS](/hello-tjs/), [Required vs Optional](/required-vs-optional/),
   [Object Types](/object-types/) and [Array Types](/array-types/) teach the central idea
   above: the value after a colon is an *example* that stands for a type, and a return
   example is a test. Hello TJS also shows everything an error carries: `message`, `path`,
   `expected` and `actual`.
2. [Control Flow: given](/given-dispatch/), [Dictionary Defaults](/dictionary-defaults-example/)
   and [const! and Bang Access](/const-and-bang/) cover the syntax TJS adds:
   - `given`, a replacement for `switch` whose cases cannot fall through into each other by
     accident;
   - object defaults that merge member by member;
   - `const!`, immutability checked at compile time;
   - `x!.foo` (bang access), which returns an error when `x` is null or undefined instead of
     throwing.
3. [Honest Equality](/honest-equality/) and [JS Footgun Fixes](/js-footgun-fixes/) cover what
   changes when you rename a `.js` file to `.tjs`. In Honest Equality, `==` and `!=` stop
   converting types (`'5' != 5`), and `Is` compares structure. JS Footgun Fixes lists
   everything else that changes, including:
   - `typeof null` is `'null'`;
   - `new Boolean(false)` (a boxed boolean) is falsy, like `false`;
   - a line starting with `(`, `[` or `` ` `` starts a new statement, so it can no longer
     join the line above by accident;
   - `MaxRetries = 3`, with no declaration, declares `const MaxRetries` instead of creating
     a global (or, in strict code, failing).
4. [Polymorphic Functions](/polymorphic-functions/), [Better Classes](/better-classes/),
   [Polymorphic Constructors](/polymorphic-constructors/) and
   [Local Class Extensions](/local-extensions/) show functions and classes doing more:
   several signatures under one name, classes you call without `new` whose constructors check
   their arguments, a class with one constructor per way of building it, and methods added to
   built-in types without touching their prototypes.
5. [Safety & Validation](/safety-validation/) shows where validation runs: on every call's
   inputs, on return values when you write `:?`, and on exceptions inside a `try` with no
   `catch` (TJS accepts `try { … }` on its own and turns a thrown exception into a returned
   error). It also shows how to turn the checks off for one function, with a `!` at the start
   of its parameter list (unrelated to bang access), or for a whole file with `safety none`,
   once you have measured that you need to.
   [What `.tjs` Refuses](/safer-code/) covers the four constructs that are errors in every
   `.tjs` file, and what to write instead: `var`, `eval(…)`, `new Date(…)` (use the
   `Timestamp` and `LegalDate` modules) and `new` on a class declared in the same file (call
   it as a function, as Better Classes shows).
6. [Built-in Types and Dates](/built-in-types/) shows built-in types as parameter types, the
   string and number types, types built from other types, and dates: the `Timestamp` and
   `LegalDate` modules that replace `new Date(…)`, used in a date pipeline.

After this section you should be able to write a TJS module whose signatures document,
test and validate themselves; read a `MonadicError` and know which argument caused it; and
know which JavaScript habits behave differently in a `.tjs` file.
[Patterns](/tjs-patterns/), the next section, puts these pieces to work in whole programs,
including how errors travel through one.

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
- [Built-in Types and Dates](/built-in-types/)
<!-- /toc -->

<!-- prettier-ignore-end -->
