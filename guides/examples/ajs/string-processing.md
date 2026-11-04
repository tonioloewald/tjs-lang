<!--{"section": "ajs", "type": "example", "group": "basics", "order": 4, "parent": "ajs-basics.md"}-->

# String Processing

Work with text

<!-- TODO review -->
Text is what agents mostly move around: a user's question, a page they fetched, a model's
answer. The familiar string methods are here.

```ajs:inline
function processText({ text = 'Hello World' }) {
  let upper = text.toUpperCase()
  let lower = text.toLowerCase()
  let words = text.split(' ')
  let wordCount = words.length
  return { upper, lower, words, wordCount }
}
```

<!-- TODO review -->
## What to notice

- **A method may be called only if the VM knows its cost.** `toUpperCase`, `split`, `slice`,
  `trim`, `replace`, `padStart` and the rest of the everyday methods are in the VM's method table,
  which bounds what each call can allocate and charges it before it runs. A method missing from
  that table is not callable.
- **Arguments have exactly the types JavaScript documents.** `'ab'.repeat('3')` is an error
  (`repeat()'s argument 1 must be a number`), not a silent conversion.

<!-- TODO review -->
## A variation

Regular expressions work as search patterns, in `match`, `replace` and `split`:

```ajs:inline
function textStats({
  text = 'The quick brown fox jumps over the lazy dog. The dog sleeps.',
}) {
  let words = text.toLowerCase().match(/[a-z]+/g)
  let longest = words.reduce((best, w) => (w.length > best.length ? w : best), '')
  let unique = Set(words)
  let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return { wordCount: words.length, uniqueWords: unique.size, longest, slug }
}
```

`Set(words)` (no `new`) makes a set, which in AJS is simply an array of the unique items.

<!-- TODO review -->
## The gotcha

AJS regexes run on the VM's own engine, not the host's. It takes time linear in the input, so
no pattern can hang a run, and its work is charged as fuel. The price is that it has no
backreferences (`\1`) and no lookahead or lookbehind (`(?=…)`): a regex that uses them is a
transpile error pointing at the pattern. Most such patterns can be rewritten as two simpler
steps.
