<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 10, "parent": "tjs-patterns.md"}-->

# Date Formatting (with import)

Uses date-fns for date formatting via ESM import

```tjs:inline
TjsCompat
/#
## Date Formatting with Imports

This example demonstrates importing an external ESM module
(date-fns) and using it with TJS type safety.
#/

import { format, formatDistance, addDays, parseISO } from 'date-fns'

// Format a date with various patterns
function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd'): '' {
  const parsed = parseISO(date)
  return format(parsed, pattern)
}

// Get human-readable relative time
function timeAgo(date: '2024-01-15'): '' {
  const parsed = parseISO(date)
  return formatDistance(parsed, new Date(), { addSuffix: true })
}

// Add days to a date
function addWorkdays(date: '2024-01-15', days: 5): '' {
  const parsed = parseISO(date)
  const result = addDays(parsed, days)
  return format(result, 'yyyy-MM-dd')
}

// Complex date operation with validation
function createEvent(input: {
  title: 'Meeting',
  startDate: '2024-01-15',
  durationDays: 1
}): { title: '', start: '', end: '', formatted: '' } {
  const start = parseISO(input.startDate)
  const end = addDays(start, input.durationDays)

  return {
    title: input.title,
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    formatted: `${input.title}: ${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
  }
}

// Try them
console.log(formatDate('2024-01-15', 'MMMM d, yyyy'))
console.log(addWorkdays('2024-01-15', 5))
console.log(createEvent({ title: 'Launch', startDate: '2024-03-01', durationDays: 2 }).formatted)
```

<!-- TODO review -->
## What to notice

The functions are ordinary TJS functions whose bodies happen to call a library. The
library knows nothing about TJS; TJS knows nothing about the library. The boundary is the
signature: `formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd')` refuses a number or a
missing pattern before date-fns ever sees it, and a bad call comes back as a
`MonadicError` rather than date-fns's `RangeError: Invalid time value`.

The import is a bare specifier (`'date-fns'`), and there is no bundler and no install step.
In the playground a service worker resolves bare imports to a CDN and caches them (see
_CDN Hints_ for choosing which CDN). In your own project the same line resolves through
`node_modules`, as it would in JavaScript.

**Why `TjsCompat`?** `timeAgo` calls `new Date()`, and a native `.tjs` file does not allow
a raw `Date`: it is mutable and silently timezone-dependent, so TJS steers you to
`Timestamp` (from `tjs-lang`) or a deliberate, greppable escape. `TjsCompat` on the first
line says "this file is JavaScript-compatible": JavaScript's `==`, `typeof` and defaults
for the whole file, and no worked-example tests (parameter checks stay on). It is the
blunt instrument; the precise one is to stay in native TJS and name the one place you want
a real `Date`.

<!-- TODO review -->
## The same without `TjsCompat`

Here is the native-TJS version of two of those helpers, with no library at all.
`LegacyDate(x)` is exactly `new Date(x)`, spelled so that a reviewer sees it:

```tjs:inline
// Native TJS: no TjsCompat. A raw Date is reached for by name.
const DAY_MS = 24 * 60 * 60 * 1000

function addDays(day: '2024-01-15', n: 5): '2024-01-20' {
  const d = LegacyDate(day)
  return LegacyDate(d.getTime() + n * DAY_MS).toISOString().slice(0, 10)
}

function longForm(day: '2024-03-01'): 'March 1, 2024' {
  return LegacyDate(day).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

console.log(addDays('2024-01-15', 5))
console.log(longForm('2024-03-01'))
console.log(String(addDays(20240115, 5)))   // still validated
```

Both return examples are worked examples: `addDays('2024-01-15', 5)` really is
`'2024-01-20'`, and that is checked every time the file is transpiled.

<!-- TODO review -->
## Gotchas

- **Under `TjsCompat`, return examples are not tests.** The file has JavaScript
  semantics, so `formatDate(...): ''` is not run as a worked example (it would fail:
  the real result is `'2024-01-15'`). Parameters are still checked. In native TJS every
  return example runs when the file is transpiled, and one that needs an import the build
  cannot load is reported as _inconclusive_ rather than failing the build.
- **Time zones.** `parseISO('2024-01-15')` is local midnight, and `new Date('2024-01-15')`
  is UTC midnight. Formatting a date-only value in a time zone west of UTC can show the
  previous day. Pass `timeZone: 'UTC'` (as `longForm` does), or keep date-only values as
  strings until you display them.
- **`TjsCompat` is all or nothing for the file.** It also turns off honest `==`, honest
  `typeof` and dictionary defaults. Prefer `LegacyDate` at the one site that needs a `Date`.
