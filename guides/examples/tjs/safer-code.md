<!--{"section": "tjs", "type": "example", "group": "basics", "order": 22, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# What `.tjs` Refuses

Four pieces of JavaScript are compile errors in every `.tjs` file: `var`, `eval(…)`,
`new Date(…)`, and `new` on a class declared in the same file. You do not opt in, and there is
no directive to turn the rule off. Each error message names the replacement.

The refusals happen when the file is transpiled, so they cost nothing when the program runs.
They apply only to `.tjs`: a `.js` file, and TypeScript converted with `fromTS`, keep plain
JavaScript semantics, so existing code still compiles while you move it over.

Here is a program that would have used all four, written the way `.tjs` asks for:

```tjs:inline
import { Timestamp, LegalDate } from 'tjs-lang'
import { Eval } from 'tjs-lang/eval'

// `let` and `const`, never `var`
let total = 0
for (const n of [1, 2, 3]) {
  total += n
}
console.log('total:', total)

// A class is called, not `new`ed
class Point {
  constructor(x: 0, y: 0) {
    this.x = x
    this.y = y
  }
}
const p = Point(1, 2)
console.log('point:', p.x, p.y, p instanceof Point)

// A moment in time is a number: milliseconds since 1970, UTC
const sent = Timestamp.parse('2024-01-15T09:30:00Z')
console.log('sent + 30 days:', Timestamp.iso(Timestamp.addDays(sent, 30)))

// A calendar date is a 'YYYY-MM-DD' string
const due = LegalDate.addMonths('2024-01-31', 1)
console.log('due:', due, '=', LegalDate.formatLong(due))

// Code from outside runs in a sandbox, not in your scope
Eval({ code: 'price * qty', context: { price: 4, qty: 3 }, fuel: 100 }).then(
  ({ result }) => console.log('eval:', result)
)
```

It prints:

```text
total: 6
point: 1 2 true
sent + 30 days: 2024-02-14T09:30:00.000Z
due: 2024-02-29 = February 29, 2024
eval: 12
```

The rest of this chapter takes the four refusals one at a time.

## `var`

<!-- tjs-doc: expect-error -->

```tjs:static
var total = 0 // `var` is not allowed in TJS — use `const` or `let`.
```

`var` is scoped to the whole function rather than the block it is written in, it is hoisted
(you can read it before the line that declares it, and get `undefined`), and it can be
declared twice without complaint. `let` and `const` do everything `var` is legitimately used
for, without those three behaviours.

There is no escape hatch. Strict mode removed `with` the same way: once a feature is gone, a
way back would mean it was never really gone.

## `eval(…)`

<!-- tjs-doc: expect-error -->

```tjs:static
const answer = eval('6 * 7') // `eval()` is not allowed in TJS.
```

`eval` runs a string as code with your program's privileges and can read and write the
variables around the call. That second part is what makes it dangerous, and it is also why
there is no escape hatch: any wrapper with a different name would be a different operation.

When you need to run code you did not write (a formula a user typed, a rule loaded from a
database), use `Eval` from `tjs-lang/eval`, as in the first example. It runs the code in the
AJS sandbox: values reach it only through `context`, it cannot see your variables, and `fuel`
caps how much work it may do. It returns a promise of `{ result, fuelUsed, error? }` rather
than throwing.

## `new Date(…)`

<!-- tjs-doc: expect-error -->

```tjs:static
const now = new Date() // `new Date()` is not allowed in TJS
```

A `Date` is a mutable object (`d.setMonth(…)` changes it for everyone holding it), its months
count from 0, and most of its methods answer in the timezone of whatever machine runs the code.
TJS splits what `Date` tries to be into two plain values, each with a module of pure functions:

- **`Timestamp`**: a moment in time, stored as a number of milliseconds since 1970 UTC (the
  same number `Date.now()` returns). Use it for "when did this happen".
- **`LegalDate`**: a calendar date with no time and no timezone, stored as a `'YYYY-MM-DD'`
  string. Use it for birthdays, due dates and contract dates, where "the 15th" means the 15th
  everywhere.

Both are imported from `tjs-lang`. In a `.tjs` file they are not available without the import:
`Timestamp` on its own is `Timestamp is not defined`.

Because the values are a number and a string, they compare with `<` and `==`, sort, and
survive `JSON.stringify` unchanged. Every function takes a value and returns a new one; nothing
is modified in place.

```tjs:inline
import { Timestamp, LegalDate } from 'tjs-lang'

// --- Timestamp: moments ---
const start = Timestamp.from(2024, 3, 10, 14, 0) // months are 1-based: 3 is March
const end = Timestamp.addHours(start, 36)

console.log(Timestamp.iso(start))
console.log(Timestamp.iso(end))
console.log('hours apart:', Timestamp.diffHours(end, start))
console.log('end is later:', Timestamp.isAfter(end, start))
console.log('end as a date:', Timestamp.toDate(end))

// --- LegalDate: calendar dates ---
const signed = '2024-01-31'
console.log(LegalDate.addMonths(signed, 1)) // clamps to the end of February
console.log(LegalDate.addYears('2024-02-29', 1)) // and to the end of a short year
console.log('days:', LegalDate.diff('2024-12-25', '2024-01-01'))
console.log('valid?', LegalDate.isValid('2024-02-30'))
console.log(LegalDate.formatLong('2024-07-04'))
```

It prints:

```text
2024-03-10T14:00:00.000Z
2024-03-12T02:00:00.000Z
hours apart: 36
end is later: true
end as a date: 2024-03-12
2024-02-29
2025-02-28
days: 359
valid? false
July 4, 2024
```

Some details worth knowing:

- `Timestamp.now()` is the current time. `Timestamp.parse(text)` throws on text it cannot read;
  `Timestamp.tryParse(text)` returns `null` instead. `LegalDate.today()` is today's date in UTC,
  and `LegalDate.todayIn('America/New_York')` is today's date in that timezone.
- `Date.now()` is not refused, because it already returns a number, but the compiler warns and
  points you to `Timestamp.now()`. For measuring how long something took, use
  `performance.now()`, which never jumps when the system clock is changed.
- **When you need a real `Date`** (to hand one to a library that requires it, say), write
  `LegacyDate(x)`. It does exactly what `new Date(x)` does. The name is deliberately long and
  easy to search for, so the choice shows up in review.

```tjs:inline
const d = LegacyDate('2024-01-15T00:00:00Z')
console.log(d instanceof Date, d.getUTCFullYear())
```

The modules have more than is shown here: arithmetic for every unit, `startOf…`/`endOf…`
boundaries, weekday, quarter and week-of-year extractors, and timezone-aware formatting. The
chapter on built-in types covers them, together with the validating types (`TimestampType`,
`LegalDateType`, `TEmail`, `TUrl` and the rest) that check a parameter is one of these values.

## `new` on your own classes

<!-- tjs-doc: expect-error -->

```tjs:static
class Point {
  constructor(x: 0, y: 0) {
    this.x = x
    this.y = y
  }
}
const p = new Point(1, 2) // `new Point` is not allowed in TJS
```

In `.tjs`, a class declared in the file can be called like a function: `Point(1, 2)` builds
and returns the same object `new Point(1, 2)` would, and `instanceof` still works. So `new` adds
nothing, and refusing it means every construction of your own classes reads the same way.

The rule is about classes declared in the same file. `new Map()`, `new Set()`, `new Error('…')`
and classes from other libraries are unaffected. The chapter on [better classes](/better-classes/)
covers what else changes for classes in `.tjs`.

## Immutable bindings

`const!` is the opposite kind of rule: it is something you ask for, not something `.tjs`
refuses. It makes the compiler reject writes through a binding. See
[`const!` and bang access](/const-and-bang/).
