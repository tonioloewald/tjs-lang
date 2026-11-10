<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 10, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Date Formatting (with import)

This chapter uses [date-fns](https://date-fns.org), an ordinary npm package, from a native
`.tjs` file (one with no `TjsCompat` line at the top, so every TJS rule applies). The
library knows nothing about TJS. The functions you write around it have TJS signatures,
and those signatures are where bad input is stopped.

It covers, in order: checking input at the signature, why you do not write `new Date()`,
importing an npm package with no install step, return examples that cannot be run, time
zones, and `TjsCompat` for converting a whole file.

One rule to read the code by: in a TJS signature, the value after a colon is an
**example**, not a type. `date: '2024-01-15'` accepts any string, and `days: 5` any integer.
The value after the closing parenthesis is a **return example**: calling the function with
the parameter examples should give exactly that result. [TJS Syntax](/tjs-syntax/) has the
full rules.

```tjs:inline
import { format, formatDistance, addBusinessDays, parseISO } from 'date-fns'
import { Timestamp } from 'tjs-lang'

// Reformat a 'YYYY-MM-DD' date with a date-fns pattern
function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd'): '2024-01-15' {
  return format(parseISO(date), pattern)
}

// Five working days after Monday 15 January is Monday 22 January
function addWorkdays(date: '2024-01-15', days: 5): '2024-01-22' {
  return format(addBusinessDays(parseISO(date), days), 'yyyy-MM-dd')
}

// "How long ago", measured from `now` rather than from the clock,
// so the same arguments always give the same answer
function timeAgo(date: '2024-01-15', now: '2024-01-22'): '7 days ago' {
  return formatDistance(parseISO(date), parseISO(now), { addSuffix: true })
}

// The end date is `workdays` working days after the start, skipping weekends
function describeEvent(
  event: { title: 'Meeting', startDate: '2024-01-15', workdays: 1 }
): 'Meeting: Jan 15 - Jan 16, 2024' {
  const start = parseISO(event.startDate)
  const end = addBusinessDays(start, event.workdays)
  return `${event.title}: ${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
}

console.log(formatDate('2024-01-15', 'MMMM d, yyyy'))
console.log(addWorkdays('2024-01-19', 1)) // Friday + 1 working day = Monday
console.log(timeAgo('2024-01-15', '2024-03-15'))
console.log(timeAgo('2024-01-15', Timestamp.iso(Timestamp.now())))
console.log(describeEvent({ title: 'Launch', startDate: '2024-03-01', workdays: 2 }))

// Bad calls are refused by the signature, before date-fns sees them
console.log(String(formatDate(20240115, 'yyyy')))
console.log(String(describeEvent({ title: 'Launch', startDate: '2024-03-01' })))
```

It prints (the fourth line depends on today's date):

```text
January 15, 2024
2024-01-22
2 months ago
almost 3 years ago
Launch: Mar 1 - Mar 5, 2024
MonadicError: Expected string for 'formatDate.date', got number
MonadicError: Expected integer for 'describeEvent.event.workdays', got undefined
```

(The error messages also name the file and line, which differ between the page and your
machine.) The launch runs from Mar 1 to Mar 5 because 1 March 2024 is a Friday: two working
days later is the following Tuesday.

## What to notice

**The signature checks the input.** `formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd')`
says both parameters are required strings. Called with a number, it does not throw: it
**returns** a `MonadicError`, an error value naming the parameter, and the program carries
on with the next line. That is better than handing `20240115` to date-fns and getting back
a `RangeError: Invalid time value` from somewhere inside the library. (`String(…)` is there
to print the error as one line of text; logged directly, it prints as an object with all
its fields. [Error Handling](/error-handling/) covers what to do with one.)

The object parameter of `describeEvent` is checked member by member, and because it is
declared with a colon, every member is required. A missing `workdays` is reported by its
path. The message says `integer` because `1` is an integer example; `1.0` would accept any
number.

**Only one line needs the clock.** `timeAgo` takes `now` as an argument, so the function
is pure: same inputs, same output, no reading of the clock. That is what makes its return
example true for good: `timeAgo('2024-01-15', '2024-01-22')` is `'7 days ago'` today and
next year. (Whether TJS can _run_ that example is a separate question, answered in the next
section.) The current time enters at the one call that wants it, `Timestamp.now()`, which
is milliseconds since 1970 UTC (the number `Date.now()` returns). `Timestamp.iso` turns it
into a string `parseISO` reads. `Timestamp` is imported from `'tjs-lang'`; it and its
companion `LegalDate` are documented in [Built-in Types and Dates](/built-in-types/).

**No raw `Date` is constructed.** In a native `.tjs` file, `new Date(…)` is a compile
error: the file does not transpile, and the message suggests what to write instead. The
reason is that a `Date` is mutable and most of its methods answer in the time zone of
whatever machine runs the code ([What `.tjs` Refuses](/safer-code/) has the details).
date-fns creates `Date` objects internally, and `parseISO` returns one; that is allowed.
The rule is about the syntax you write, not about values a library hands you. When you do
want a real `Date` yourself, write `LegacyDate(x)`. It needs no import, because it is the
compiler's spelling of `new Date(x)`, named so a reviewer can find it.
`LegacyDate().toISOString()` would have worked as the `now` argument above.

**The import is a bare specifier.** On this page there is no bundler and no install step:
the bare name `'date-fns'` is resolved to a CDN and cached (see
[CDN Hints](/cdn-hints/) for choosing which one). In your own project the same line
resolves through `node_modules`, as it would in JavaScript.

## Return examples that call an import

A return example is checked by exact equality: TJS calls the function with the parameter
examples and compares the result with the return example. So `''` as a return example does
not mean "returns some string"; it means "returns the empty string", and fails otherwise.
When only the type is known, `:!` in place of `:` declares it type-only, and nothing is run.

Each return example above is correct: `addWorkdays('2024-01-15', 5)` really is
`'2024-01-22'`. But none of them is **checked** when this file is transpiled. Signature
examples run in a test harness that does not load the file's imports, so a function whose
body calls date-fns cannot be evaluated. TJS records such an example as _inconclusive_,
which is neither a pass nor a failure, and the build goes on.

You can see this with the `tjs` command-line tool that comes with the package:
`tjs check <file>` transpiles a file and runs its examples, and `tjs test <file>` also
reports each example and test block. `check` prints nothing about inconclusive examples;
`test` lists each one:

```text
? Signature: addWorkdays signature example — inconclusive: Module could not be executed for testing: format is not defined
```

So write the example you mean (it documents the function, and a reader can trust it as far
as you checked it), and do not take a green `tjs check` as proof it holds.

## Time zones

`parseISO('2024-01-15')` and `new Date('2024-01-15')` read the same characters as
different instants:

- date-fns's `parseISO` reads a date with no time as **midnight where the code runs**.
- JavaScript's `Date` reads a date-only string as **midnight UTC**, but a date and time
  with no zone (`'2024-01-15T00:00'`) as local.

```tjs:inline
// The calendar day an instant falls on, in a named time zone
function dayIn(date: '2024-01-15', zone: 'UTC'): '1/15/2024' {
  return LegacyDate(date).toLocaleDateString('en-US', { timeZone: zone })
}

// Same characters, two different instants:
const utcMidnight = LegacyDate('2024-01-15') // date only: midnight UTC
const localMidnight = LegacyDate('2024-01-15T00:00') // no zone: midnight here

const hours = (localMidnight.getTime() - utcMidnight.getTime()) / 3_600_000
console.log('hours apart where you are:', hours)

console.log(dayIn('2024-01-15', 'UTC'))
console.log(dayIn('2024-01-15', 'America/New_York'))
```

The `hours apart` line prints `0` in UTC, `8` in California (Pacific Standard Time on 15
January) and `-9` in Tokyo: local midnight is that many hours after UTC midnight.
`localMidnight` is the same instant `parseISO('2024-01-15')` returns.

The last line prints `1/14/2024`. Midnight UTC on the 15th is 7 p.m. on the 14th in New
York, so a date-only value parsed as UTC and displayed in a zone west of UTC shows the
previous day. This is the most common date bug in JavaScript.

Unlike the date-fns functions, `dayIn`'s return example **is** run on every transpile:
`LegacyDate` and `toLocaleDateString` are part of the language and the platform, so they
exist when examples run, and an import does not.

The date-fns functions at the top of the page avoid the bug by staying local throughout:
`parseISO` reads local midnight, date-fns does its arithmetic in local time, and `format`
writes local time, so a date goes in and the same date comes out wherever the code runs.
Mixing the two readings is what goes wrong. If you need a fixed zone, pass `timeZone` when
you display, as `dayIn` does. Or keep a calendar date as a `LegalDate`, which is a plain
`'YYYY-MM-DD'` string with no time and no zone, until you display it; the `LegalDate`
module in [Built-in Types and Dates](/built-in-types/) does arithmetic on those strings.

## When converting a whole file: `TjsCompat`

If you are moving an existing JavaScript file over and it calls `new Date()` in many places,
you can put `TjsCompat` on its first line. That declares the file JavaScript-compatible, and
`new Date()` is accepted:

```tjs:inline
TjsCompat
import { formatDistance, parseISO } from 'date-fns'

// The answer depends on today's date, so `:!` declares a type only
function timeAgo(date: '2024-01-15'):! '' {
  return formatDistance(parseISO(date), new Date(), { addSuffix: true })
}

console.log(timeAgo('2024-01-15'))
console.log(String(timeAgo(20240115))) // parameters are still checked
console.log('5' == 5) // but == is JavaScript's again
```

It prints a relative time such as `almost 3 years ago`, then a `MonadicError` for the
number, then `true`. (This `timeAgo` reads the clock, so it has no fixed answer to write as
a return example; that is what `:!` is for.)

`TjsCompat` applies to the whole file, which is why it is the second choice. Parameters are
still validated, but return examples are no longer run as tests, and three things go back
to JavaScript's behaviour everywhere in the file. In native TJS, `'5' == 5` is `false`
(no type conversion; see [Honest Equality](/honest-equality/)), `typeof null` is `'null'`,
and an object-literal parameter default fills in each missing member, so
`f(o = {a: 1, b: 2})` called with `{a: 5}` gets `{a: 5, b: 2}`. Under `TjsCompat` those are
`true`, `'object'` and `{a: 5}`, as in JavaScript. Use it as a step in a conversion; once
the file works, remove it and write `LegacyDate` (or `Timestamp`) at the sites that need a
date.
