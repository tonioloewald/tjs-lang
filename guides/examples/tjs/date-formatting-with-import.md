<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 10, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Date Formatting (with import)

This chapter uses [date-fns](https://date-fns.org), an ordinary npm package, from a native
`.tjs` file. The library knows nothing about TJS. The functions you write around it have
TJS signatures, and those signatures are where bad input is stopped.

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

function describeEvent(
  event: { title: 'Meeting', startDate: '2024-01-15', durationDays: 1 }
): 'Meeting: Jan 15 - Jan 16, 2024' {
  const start = parseISO(event.startDate)
  const end = addBusinessDays(start, event.durationDays)
  return `${event.title}: ${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
}

console.log(formatDate('2024-01-15', 'MMMM d, yyyy'))
console.log(addWorkdays('2024-01-19', 1))
console.log(timeAgo('2024-01-15', '2024-03-15'))
console.log(timeAgo('2024-01-15', Timestamp.iso(Timestamp.now())))
console.log(describeEvent({ title: 'Launch', startDate: '2024-03-01', durationDays: 2 }))

// Bad calls are refused at the boundary, before date-fns sees them
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
MonadicError: Expected integer for 'describeEvent.event.durationDays', got undefined
```

(The error messages also name the file and line, which differ between the page and your
machine.)

## What to notice

**The boundary is the signature.** `formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd')`
says both parameters are required strings. Called with a number, it returns a
`MonadicError` naming the parameter, instead of handing `20240115` to date-fns and getting
back a `RangeError: Invalid time value` from somewhere inside the library. The object
parameter of `describeEvent` is checked member by member, so a missing `durationDays` is
reported by its path.

**Only one line needs the clock.** `timeAgo` takes `now` as an argument, so the function
is pure: the same two dates always give the same answer, and its return example can say
exactly what that answer is. The current time enters at the one call that wants it,
`Timestamp.now()`, which is milliseconds since 1970 UTC (the number `Date.now()` returns).
`Timestamp.iso` turns it into a string `parseISO` reads. `Timestamp` and its companion
`LegalDate` are covered in [What `.tjs` Refuses](/safer-code/).

**No raw `Date` is constructed.** A native `.tjs` file refuses `new Date(…)`, because a
`Date` is mutable and most of its methods answer in the time zone of whatever machine runs
the code. date-fns creates `Date` objects internally, and `parseISO` returns one; that is
allowed. The rule is about the syntax you write, not about values a library hands you.
When you do want a real `Date` yourself, `LegacyDate(x)` is exactly `new Date(x)`, spelled
so a reviewer can find it: `LegacyDate().toISOString()` would have worked as the `now`
argument above.

**The import is a bare specifier.** On this page there is no bundler and no install step:
the bare name `'date-fns'` is resolved to a CDN and cached (see
[CDN Hints](/cdn-hints/) for choosing which one). In your own project the same line
resolves through `node_modules`, as it would in JavaScript.

## Return examples that call an import

Each return example above is a worked example, and each one is correct: `addWorkdays('2024-01-15', 5)` really is `'2024-01-22'`. But they are **not checked** when this file is
transpiled. Signature examples run before the program is loaded, without its imports, so a
function whose body calls date-fns cannot be evaluated. TJS records such an example as
_inconclusive_, which is neither a pass nor a failure, and the build goes on. `tjs check`
prints nothing about it; `tjs test` lists each one:

```text
? Signature: addWorkdays signature example — inconclusive: Module could not be executed for testing: format is not defined
```

So write the example you mean (it documents the function, and a reader can trust it as
far as you checked it), and do not take a green `tjs check` as proof it holds. A function
that does not call an import, like `dayIn` below, has its example run on every transpile.

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

The first line prints `0` in UTC, `8` in California in winter and `-9` in Tokyo:
local midnight is that many hours after UTC midnight. `localMidnight` is the same instant
`parseISO('2024-01-15')` returns.

The last line prints `1/14/2024`. Midnight UTC on the 15th is 7 p.m. on the 14th in New
York, so a date-only value parsed as UTC and displayed in a zone west of UTC shows the
previous day. This is the most common date bug in JavaScript.

The first example avoids it by staying local throughout: `parseISO` reads local midnight,
date-fns does its arithmetic in local time, and `format` writes local time, so a date goes
in and the same date comes out wherever the code runs. Mixing the two readings is what
goes wrong. If you need a fixed zone, pass `timeZone` when you display, as `dayIn` does,
or keep a calendar date as a `'YYYY-MM-DD'` string (a `LegalDate`) until you display it.

## When converting a whole file: `TjsCompat`

If you are moving an existing JavaScript file over and it calls `new Date()` in many places,
you can put `TjsCompat` on its first line. That declares the file JavaScript-compatible, and
`new Date()` is accepted:

```tjs:inline
TjsCompat
import { formatDistance, parseISO } from 'date-fns'

function timeAgo(date: '2024-01-15'): '' {
  return formatDistance(parseISO(date), new Date(), { addSuffix: true })
}

console.log(timeAgo('2024-01-15'))
console.log(String(timeAgo(20240115))) // parameters are still checked
console.log('5' == 5) // but == is JavaScript's again
```

It prints a relative time such as `almost 3 years ago`, then a `MonadicError` for the
number, then `true`.

`TjsCompat` applies to the whole file, which is why it is the second choice. Parameters are
still validated, but return examples are no longer run as tests (the `''` above would fail
as one), and `==`, `typeof` and object-literal parameter defaults go back to JavaScript's
behaviour everywhere in the file. Use it as a step in a conversion; once the file works,
remove it and write `LegacyDate` (or `Timestamp`) at the sites that need a date.
