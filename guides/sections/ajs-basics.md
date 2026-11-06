<!--{"parent": "ajs-examples.md", "order": 1}-->
<!-- TODO review -->

# Basics

AJS is a subset of JavaScript for agent code: programs written by people or by language models
that a host runs safely. An **agent** is one AJS function. The **host**, the program that embeds
the AJS VM, calls it with an object of inputs, runs it under a fuel budget with only the
capabilities it chooses to grant (such as `fetch`), and gets an object back.

These seven short pages are the tutorial for the language itself, one idea per page. They
assume you know basic JavaScript. For the full list of rules in one place, see [the language
guide](/DOCS-AJS/).

- [Hello World](/hello-world/): the shape of an agent, a function that takes one object of
  inputs with defaults and returns one object.
- [Math Operations](/math-operations/): arithmetic, `Math`, and turning text into numbers.
- [Conditional Logic](/conditional-logic/): `if`, the ternary, lookups instead of `switch`, and
  falsy values.
- [Loop & Filter](/loop-filter/): `for...of`, `while`, and the array methods that take a callback.
- [String Processing](/string-processing/): the string methods.
- [JSON Processing](/json-processing/): parsing text that may not be JSON, and checking its shape.
- [Error Handling](/ajs-error-handling/): errors are values, not thrown exceptions, and which
  ones a `catch` can take.

AJS looks like JavaScript, but a few things behave differently and some are refused. Reading a
member of `null` returns `undefined` instead of throwing, and `'total: ' + [1, 2]` is an error
instead of the string `total: 1,2`. Each page says where AJS differs from the JavaScript you
know for its topic, because those differences are what trip people up.

Every agent in these pages runs live: it is editable, and the page transpiles it and runs it on
the same sandboxed VM you would embed, with no arguments and a budget of 10,000 fuel. [AJS
Examples](/ajs-examples/) describes exactly how. None of these agents needs a network or a
model.

Read them in order. After the last one you can write an agent that takes input, computes, loops,
returns an error value instead of failing on bad input, and returns a result a host can use.

If you are embedding the VM, read these to learn what your agents will look like, then see
[Embedding the AJS VM](/ajs-host/) and [Capabilities and Custom Atoms](/ajs-capabilities/).
Calling the outside world from an agent comes next, in [APIs](/ajs-api/) and [LLMs](/ajs-llm/).

<!-- prettier-ignore-start -->

<!-- toc -->
- [Hello World](/hello-world/)
- [Math Operations](/math-operations/)
- [Conditional Logic](/conditional-logic/)
- [Loop & Filter](/loop-filter/)
- [String Processing](/string-processing/)
- [JSON Processing](/json-processing/)
- [Error Handling](/ajs-error-handling/)
<!-- /toc -->

<!-- prettier-ignore-end -->
