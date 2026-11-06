<!--{"section": "ajs", "type": "example", "group": "basics", "order": 4, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# String Processing

Text is what agents mostly move around: a user's question, a page they fetched, a model's
answer. AJS (short for AsyncJS) has JavaScript's everyday string methods, but only those whose
cost the VM can bound, and it checks their argument types strictly.

```ajs:inline
function processText({ text = '  Hello World  ' }) {
  let clean = text.trim()
  let upper = clean.toUpperCase()
  let lower = clean.toLowerCase()
  let words = clean.split(' ')
  let initials = words[0].slice(0, 1) + words[1].slice(0, 1)
  return { clean, upper, lower, words, wordCount: words.length, initials }
}
```

An agent takes one object of named inputs. The host supplies it when it runs the agent; the
`= '  Hello World  '` default is used when the caller passes no `text`, and is what the live
example on this page runs with. With it, the agent returns `clean: 'Hello World'`,
`upper: 'HELLO WORLD'`, `lower: 'hello world'`, `words: ['Hello', 'World']`, `wordCount: 2`
and `initials: 'HW'`.

## What to notice

- **A method may be called only if the VM knows its cost.** Every operation costs fuel, the
  run's work budget; when it runs out, the run stops (see [Fuel Limits](/fuel-limits/)). Each
  callable method has an entry in the VM's method table that bounds what one call can allocate,
  so the call is paid for before it runs. `trim`, `slice`, `split`, `replace`, `padStart`,
  `includes`, `startsWith` and most other string methods are in the table. A method that is
  not is refused when the source is compiled, before anything runs: `text.matchAll(/a/g)` fails
  with `Method 'matchAll' is not available in AsyncJS`. The rules per receiver type are in
  [Methods](/DOCS-AJS/#methods).
- **Arguments must already have the type the method takes.** AJS refuses where JavaScript would
  quietly convert: `'ab'.repeat('3')` returns `'ababab'` in JavaScript, but in AJS it is an error,
  `repeat()'s argument 1 must be a number`. The error happens when the call runs. It is an
  ordinary AJS error: a `try`/`catch` in the agent can catch it, and otherwise the run ends and
  the host receives it as the run's `error`. See [Error Handling](/ajs-error-handling/).

## A variation

Regex in AJS is deprecated as of 0.14 and planned to leave the core VM in 0.15. It works today;
prefer plain string methods (`split`, `includes`, `startsWith`, `slice`) where they do the job.
Where they don't, regular expressions work as search patterns in `match`, `replace`, `split`,
`replaceAll` and `search`:

```ajs:inline
function textStats({
  text = 'The quick brown fox jumps over the lazy dog. The dog sleeps.',
}) {
  let words = text.toLowerCase().match(/[a-z]+/g) ?? []
  let longest = words.reduce((best, w) => (w.length > best.length ? w : best), '')
  let unique = Set(words)
  let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return { wordCount: words.length, uniqueWords: unique.size, longest, slug }
}
```

With the default text this returns `wordCount: 12`, `uniqueWords: 9`, `longest: 'sleeps'` and
`slug: 'the-quick-brown-fox-jumps-over-the-lazy-dog-the-dog-sleeps'`.

- **`match` returns `null` when nothing matches,** as in JavaScript. Without the `?? []`, text
  with no letters (`'123 456'`) would end the run at the next line with
  `reduce: items is not an array`. With it, that text returns `wordCount: 0` and `longest: ''`.
- **Chaining string methods is fine.** AJS allows at most one callback-taking call (`map`,
  `filter`, `find`, `reduce`) per statement, and it must be the whole right-hand side, so
  `words.map(…).filter(…)` has to be split in two (see [Loop & Filter](/loop-filter/)). The
  `reduce` line follows that rule. `toLowerCase().match(…)` and the two `replace` calls take no
  callback, so they chain freely.
- **`Set(words)` makes a set of the unique words.** AJS has no `new`; builtins such as `Set`
  and `Date` are called as functions, and `new Set(words)` is refused at compile time. A set in
  AJS is an array of its unique items that also has a `size` (equal to its `length`) and set
  methods such as `has` and `union`. See [Set](/DOCS-AJS/#set).

## The gotcha

AJS regexes run on the VM's own engine, not on the regex engine of the JavaScript program that
embeds the VM (the host). A carefully built pattern can make the host's engine run for a very
long time on a short input (ReDoS); the VM's engine never backtracks, so its time is linear in
the input times the pattern's size, no pattern can hang a run, and its work is charged as fuel.

The price is that it has no backreferences (`\1`) and no lookahead or lookbehind (`(?=…)`). A
regex that uses them is rejected when the source is compiled, before anything runs, with an
error pointing at the pattern (`Lookahead and lookbehind are not supported in AsyncJS regexes`).
Most such patterns can be rewritten as two steps: match more than you need, then trim the rest.
Instead of `text.match(/\d+(?=usd)/)`, which is refused:

```ajs:inline
function price({ text = 'total: 120usd' }) {
  let found = text.match(/\d+usd/)
  let amount = found ? found[0].slice(0, -3) : null
  return { amount }
}
```

This returns `amount: '120'`, and `amount: null` for text with no price. The full list of what
the engine supports is in [Regular expressions](/DOCS-AJS/#regular-expressions).

What replaces regex is Pattern, a grammar built as data. It is not available in AJS yet, so
until it is, use string methods, or regex within the limits above. The plan is in the
[Pattern design note](/pattern/); the engine is the separate
[tosijs-pattern](https://pattern.tosijs.net) library, which is not yet on npm.
