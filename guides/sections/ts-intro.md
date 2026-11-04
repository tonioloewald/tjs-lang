<!--{"parent": "ts-examples.md", "order": 1}-->

# Introduction

<!-- TODO review -->

Start here. These three examples show what the converter does to ordinary TypeScript
functions, before any runtime checking is switched on.

The short version: a converted file keeps the TypeScript's meaning exactly, and the type
annotations travel with it. `name: string` stays `name: string`, which TJS understands as a
real runtime type; `string[]` becomes `[string]`, TJS's spelling for "an array of strings";
and a return type becomes a _type-only_ return, written `:!`, which documents the result
without running it as a test. Nothing is checked yet. The first example shows the one line
that changes that.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Hello TypeScript](/ts-hello-typescript/)
- [Multiple Functions](/ts-multiple-functions/)
- [Type Transformation](/ts-type-transformation/)
<!-- /toc -->

<!-- prettier-ignore-end -->
