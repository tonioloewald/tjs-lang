<!--{"section": "tjs", "type": "example", "group": "basics", "order": 22, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# What `.tjs` Refuses

Four pieces of JavaScript are compile errors in every `.tjs` file: `var`, `eval(…)`,
`new Date(…)`, and `new` on a class declared in the same file. Each is a common source of bugs
or security holes, and each has a replacement that does the legitimate job without the hazard.
You do not opt in to these rules, and no directive turns them off.

A file that breaks one of them does not compile. `tjs check` fails and prints the message, and
a live example on this site shows the message instead of running. The check happens before the
program runs, so it costs nothing at run time.

The rules apply only to `.tjs` files. A `.js` file keeps plain JavaScript semantics, and so
does TypeScript converted to TJS by the converter (`fromTS`, see
[TJS for TypeScript developers](/TJS-FOR-TS/)). Existing code still compiles while you move it
over.

How much room each rule leaves you:

| Refused        | Way back                        | Why                                                  |
| -------------- | ------------------------------- | ---------------------------------------------------- |
| `var`          | none                            | `let` and `const` cover every legitimate use         |
| `eval(…)`      | none                            | the safe replacement is necessarily a different tool |
| `new Date(…)`  | `LegacyDate(x)`                 | some libraries require a real `Date`                 |
| `new MyClass`  | none needed                     | `MyClass(…)` does the same thing                     |

Each section below shows the code the compiler rejects, with the first line of its message as
a comment marked `error:`.

## `var`

<!-- tjs-doc: expect-error -->

```tjs:static
var total = 0
// error: `var` is not allowed in TJS — use `const` or `let`.
```

`var` is scoped to the whole function rather than the block it is written in, it is hoisted
(you can read it before the line that declares it, and get `undefined`), and it can be
declared twice without complaint. `let` and `const` do everything `var` is legitimately used
for, without those three behaviours.

There is no escape hatch, because none is needed: there is no program that needs `var` and
cannot be written with `let` or `const`.

## `eval(…)`

<!-- tjs-doc: expect-error -->

```tjs:static
const answer = eval('6 * 7')
// error: `eval()` is not allowed in TJS. Use `Eval()` from the TJS runtime for sandboxed
// evaluation — fuel-metered, capability-injected, and unable to reach this scope.
```

`eval` runs a string as code with your program's privileges, and it can read and write the
local variables around the call. That access to local variables is the dangerous part. A safe
replacement cannot have it, so the safe version has to be a different function, not `eval`
under another name.

That function is `Eval`, and you import it from `tjs-lang/eval`. Use it when you need to run
code you did not write: a formula a user typed, a rule loaded from a database. It runs the code
in AJS, the sandboxed subset of JavaScript that TJS uses for untrusted code (see
[AJS](/ajs/)). The code sees only the values you pass in `context`, never your variables.
`fuel` caps how much work it may do: each step costs a little fuel, so the formula below uses
about half a unit and a thousand turns of a loop use a few hundred. Code that never stops runs
out of fuel and is stopped.

`Eval` returns a promise. It never throws: the promise resolves to an object with `result` and
`fuelUsed`, plus an `error` field when something went wrong, whose `message` says what.

```tjs:inline
import { Eval } from 'tjs-lang/eval'

// A formula, with the values it may use passed in `context`
const ok = await Eval({
  code: 'price * qty',
  context: { price: 4, qty: 3 },
  fuel: 100,
})
console.log('result:', ok.result)

// Code that does not parse
const broken = await Eval({ code: 'price *', context: { price: 4 }, fuel: 100 })
console.log('broken:', broken.error.message)

// Code that never stops runs out of fuel instead
const endless = await Eval({
  code: 'let n = 0\nwhile (true) { n = n + 1 }\nreturn n',
  fuel: 100,
})
console.log('endless:', endless.error.message)
```

It prints:

```text
result: 12
broken: Unexpected token at <source>:3:0
endless: Out of Fuel
```

`new Function(…)`, the other way to run a string as code, is not refused, but the compiler
warns about it. It has no safe drop-in replacement: `SafeFunction` (also in `tjs-lang/eval`) is
sandboxed, so it cannot reach globals the way `new Function` code can.

## `new Date(…)`

<!-- tjs-doc: expect-error -->

```tjs:static
const now = new Date()
// error: `new Date()` is not allowed in TJS — the Date object is mutable and
// timezone-dependent.
```

The full message goes on to suggest `Timestamp.now()`, `performance.now()` and `LegacyDate(x)`.
One line of it is wrong: it suggests `Timestamp.from(iso)` to parse a string, but
`Timestamp.from` takes numbers (year, month, day, …) and returns `NaN` for a string. To parse
text, use `Timestamp.parse(text)`.

A `Date` is a mutable object (`d.setMonth(…)` changes it for everyone holding it), its months
count from 0, and most of its methods answer in the timezone of whatever machine runs the code.
TJS splits what `Date` tries to be into two plain values, each with a module of pure functions:

- **`Timestamp`**: a moment in time, stored as a number of milliseconds since 1970 UTC (the
  same number `Date.now()` returns). Use it for "when did this happen".
- **`LegalDate`**: a calendar date with no time and no timezone, stored as a `'YYYY-MM-DD'`
  string. Use it for birthdays, due dates and contract dates, where "the 15th" means the 15th
  everywhere.

Both are imported from `tjs-lang`. They are not built in: without the import, `Timestamp.now()`
passes the compiler and then fails when the program runs, with "Timestamp is not defined".

Because the values are a number and a string, they compare with `<` and `==`, sort, and
survive `JSON.stringify` unchanged. (A `'YYYY-MM-DD'` string is zero-padded and runs from the
largest unit to the smallest, so comparing two of them as strings gives date order.) Every
function takes a value and returns a new one; nothing is modified in place.

```tjs:inline
import { Timestamp, LegalDate } from 'tjs-lang'

// --- Timestamp: moments ---
// The fields are read as UTC. Months are 1-based: 3 is March.
const start = Timestamp.from(2024, 3, 10, 14, 0)
const end = Timestamp.addHours(start, 36)

console.log(Timestamp.iso(start))
console.log(Timestamp.iso(end))
// diffHours(a, b) is a minus b, so the later time goes first
console.log('hours apart:', Timestamp.diffHours(end, start))
console.log('end is later:', Timestamp.isAfter(end, start))
// toDate gives the UTC calendar day as a LegalDate string, not a JS Date
console.log('end as a date:', Timestamp.toDate(end))

// --- LegalDate: calendar dates ---
const signed = '2024-01-31'
console.log(LegalDate.addMonths(signed, 1)) // Jan 31 + 1 month → Feb 29 (2024 is a leap year)
console.log(LegalDate.addYears('2024-02-29', 1)) // Feb 29 + 1 year → Feb 28 (2025 is not)
// diff(a, b) is a minus b, in days
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

The name `toDate` is easy to misread now that `Date` is banned: it returns a `LegalDate`
string, not a `Date` object.

Some details worth knowing:

- `Timestamp.now()` is the current time. `Timestamp.parse(text)` throws on text it cannot read;
  `Timestamp.tryParse(text)` returns `null` instead. `LegalDate.today()` is today's date in UTC,
  and `LegalDate.todayIn('America/New_York')` is today's date in that timezone.
- Only `new Date(…)` is refused. `Date.now()`, `Date.parse()` and `Date.UTC()` already return
  numbers, so they compile, but the compiler warns and points you to `Timestamp.now()`,
  `Timestamp.parse()` and `Timestamp.from()`. For measuring how long something took, use
  `performance.now()`, which never jumps when the system clock is changed.
- **When you need a real `Date`** (to hand one to a library that requires it, say), write
  `LegacyDate(x)`. It does exactly what `new Date(x)` does, and it is built in, so it needs no
  import. The name is deliberately long and easy to search for, so the choice shows up in
  review.

```tjs:inline
const d = LegacyDate('2024-01-15T00:00:00Z')
console.log(d instanceof Date, d.getUTCFullYear())
```

It prints:

```text
true 2024
```

The modules have more than is shown here: arithmetic for every unit, `startOf…`/`endOf…`
boundaries, weekday, quarter and week-of-year extractors, and formatting in a given timezone.
[Built-in types and dates](/built-in-types/) covers them, along with the types that check a
parameter really is a `Timestamp` or a `LegalDate`.

## `new` on your own classes

<!-- tjs-doc: expect-error -->

```tjs:static
class Point {
  // `x: 0` means "x is a number, for example 0" (see /hello-tjs/)
  constructor(x: 0, y: 0) {
    this.x = x
    this.y = y
  }
}
const p = new Point(1, 2)
// error: `new Point` is not allowed in TJS — a class is CALLED, so `Point(…)` does exactly
// what `new Point(…)` does and returns the same object. Drop the keyword.
```

In plain JavaScript, calling a class without `new` throws a `TypeError`. In `.tjs`, a class
declared in the file can be called like a function: `Point(1, 2)` builds and returns the same
object `new Point(1, 2)` would, and `instanceof` still works. Since the keyword adds nothing,
TJS keeps one spelling. Every construction of your own classes reads the same way, and a
class can be passed anywhere a function is expected, such as `points.map(…)`.

The rule covers only classes declared in the same file, including subclasses declared there.
Imported classes are not checked, and neither are built-ins: `new Map()`, `new Set()` and
`new Error('…')` are unaffected. The chapter on [better classes](/better-classes/) covers what
else changes for classes in `.tjs`.

## Putting it together

Here is a small program that would have used all four, written the way `.tjs` asks for:

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
const { result } = await Eval({
  code: 'price * qty',
  context: { price: 4, qty: 3 },
  fuel: 100,
})
console.log('eval:', result)
```

It prints:

```text
total: 6
point: 1 2 true
sent + 30 days: 2024-02-14T09:30:00.000Z
due: 2024-02-29 = February 29, 2024
eval: 12
```

See also [`const!` and bang access](/const-and-bang/): `const!` makes the compiler reject
writes through a binding, a rule you ask for rather than one `.tjs` imposes.
