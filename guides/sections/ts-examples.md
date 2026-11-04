<!--{"parent": "TJS-FOR-TS.md", "order": 1}-->

# TypeScript Examples

TypeScript in, TJS out: each example is real TypeScript, converted and run.

<!-- TODO review -->

Every example in this section is ordinary TypeScript. The page does to it what you would do
to your own code: it converts it with `fromTS`, compiles the TJS that comes out, and runs it.
Edit an example and run it again to see what changes.

One line decides what you are looking at. Converted TypeScript keeps JavaScript's behaviour
by default, so most examples here run exactly as `tsc` output would: the types are carried
along but nothing checks them. An example that starts with `/* @tjs TjsStrict */` opts in to
full TJS, and from then on every parameter type is a check that runs on every call. The
examples that demonstrate a rejection all carry that line. Delete it and run again to see the
same bad call go through unchecked.

When a check fails, the function does not throw. It returns a `MonadicError`, a value that
says which parameter was wrong, what type it expected and what it got. Print it, test it with
`instanceof Error` or `isMonadicError`, or pass it on: a TJS function that receives an error
returns it untouched.

The sections run from the basics of conversion to the parts of TypeScript that have no
runtime meaning:

- **Introduction**: what conversion does to a function, and how TypeScript's type names
  become runtime types.
- **Validation**: the payoff. Types that are checked when the program runs, and tests that
  live in comments.
- **Patterns**: arrays, nested objects and nullable values, the shapes most real code is made
  of.
- **Advanced**: generics, async functions and classes, where TypeScript's types and the
  runtime part ways most.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Introduction](/ts-intro/)
- [Validation](/ts-validation/)
- [Patterns](/ts-patterns/)
- [Advanced](/ts-advanced/)
<!-- /toc -->

<!-- prettier-ignore-end -->
