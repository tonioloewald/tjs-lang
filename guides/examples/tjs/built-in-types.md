<!--{"section": "tjs", "type": "example", "group": "basics", "order": 23, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Built-in Types and Dates

The `tjs-lang` package ships ready-made types for values that come up in almost every
program: email addresses, URLs, UUIDs, positive integers, non-empty strings, and dates. It
also ships two modules of functions for working with dates without a `Date` object. This
chapter covers all of them, and ends with a small date pipeline you can copy.

None of them is part of the language. A `.tjs` file sees them only after it imports them,
and they all come from the package `'tjs-lang'`:

| Import                                                    | What it is                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `TEmail`, `TUrl`, `TUuid`, `TNonEmptyString`              | types for strings                                                          |
| `TInteger`, `TPositiveInt`                                | types for numbers                                                          |
| `TimestampType`, `TimestampISO`, `LegalDateType`          | types for dates and times                                                  |
| `Nullable`, `Optional`, `TPair`, `TRecord`, `TArray`, `Union` | functions that build a new type from other types (`Union` is also a declaration form; see below) |
| `Timestamp`, `LegalDate`                                  | modules of date functions (`Timestamp.now()`, `LegalDate.addMonths(…)`, …) |

### Reading the examples

Three things hold for every example on this page.

- **A bad argument is answered, not thrown.** When an argument fails its parameter type,
  the function does not run; it returns an error value, a `MonadicError`, whose `.message`
  says what was expected. [Error Handling](/error-handling/) covers these values.
  `isMonadicError(x)` tells you whether `x` is one. It, `test` and `expect` are available
  in every `.tjs` file without an import.
- **The printed messages leave out the location.** A real message also names the file and
  line (`'invite.tjs:3:invite.email'`); the output shown here keeps only the function and
  parameter, because the location differs between this page and your machine.
- **The checks are in `test` blocks, not signature examples.** When TJS transpiles a file,
  it calls each function with the example values in its signature and compares the result
  with the return example. It does this before the file's imports are loaded, so it cannot
  run a function that uses an imported type or module; such a check is reported as
  _inconclusive_ (the [Date Formatting](/date-formatting-with-import/) chapter explains
  this). On this page the `test` blocks run with the imports loaded. From the command line,
  `tjs check` and `tjs test` cannot load them either: most of these tests come out
  inconclusive, and a test of a `Type` built from imported types can pass without checking
  anything, because the unloaded types accept every value.

## A built-in type as a parameter type

Import a type and write its name after the colon, where you would otherwise write an
example value:

```tjs:inline
import { TEmail, TPositiveInt } from 'tjs-lang'

function invite(email: TEmail, seats: TPositiveInt) {
  return `${seats} seat(s) for ${email}`
}

console.log(invite('ada@example.com', 3))
console.log(invite('ada.example.com', 3).message)
console.log(invite('ada@example.com', 0).message)

// A type is also a function you can call yourself
console.log(TEmail('ada@example.com'))
console.log(TPositiveInt(0))

test 'the parameter types are checked on every call' {
  expect(invite('ada@example.com', 3)).toBe('3 seat(s) for ada@example.com')
  expect(isMonadicError(invite('ada.example.com', 3))).toBe(true)
  expect(isMonadicError(invite('ada@example.com', 0))).toBe(true)
  expect(isMonadicError(invite('ada@example.com', 1.5))).toBe(true)
}

test 'a built-in type answers true, or the reason it failed' {
  expect(TEmail('ada@example.com')).toBe(true)
  expect(TPositiveInt(0)).toBe('0 is not positive')
}
```

It prints:

```text
3 seat(s) for ada@example.com
Expected TEmail for 'invite.email', got string
Expected TPositiveInt for 'invite.seats', got number
true
0 is not positive
```

### What to notice

- **The check happens at the call**, as for any TJS parameter. A bad argument does not
  reach the body: `invite` returns a `MonadicError` naming the parameter instead.
- **The error says what was expected, not why it failed.** `got string` names the kind of
  JavaScript value that arrived: `'ada.example.com'` is a string, just not an email. To
  find out why a value fails, call the type yourself, as the last two lines do.
- **There is no example value.** `email: TEmail` names a type, so TJS has nothing to call
  `invite` with when it transpiles the file. The `test` blocks do that job instead.
- **The string and number types answer `true` or a reason string**, never `false`.
  `TPositiveInt(0)` is `'0 is not positive'`. A non-empty string is truthy, so
  `if (TPositiveInt(n))` accepts everything; compare the result with `=== true`. (The date
  types, and every type the combinators below build, answer `true` or `false`. `=== true`
  is right for all of them.)

## The string and number types

Each of these is a function from a value to `true` or a reason string:

```tjs:inline
import { TEmail, TUrl, TUuid, TNonEmptyString, TInteger, TPositiveInt } from 'tjs-lang'

function subscribe(email: TEmail) { return `subscribed ${email}` }
function fetchFeed(url: TUrl) { return `fetching ${url}` }
function findOrder(id: TUuid) { return `order ${id}` }
function rename(title: TNonEmptyString) { return `renamed to ${title}` }
function moveBy(steps: TInteger) { return `moved ${steps}` }
function reserve(seats: TPositiveInt) { return `reserved ${seats}` }

console.log(subscribe('ada@example.com'))
console.log(fetchFeed('https://example.com/feed.xml'))
console.log(findOrder('123e4567-e89b-12d3-a456-426614174000'))
console.log(rename('Q3 report'))
console.log(moveBy(-2))
console.log(reserve(4))

// Why a value fails: call the type directly
console.log(TEmail('ada@example'))
console.log(TUrl('example.com/feed.xml'))
console.log(TUuid('123e4567e89b12d3a456426614174000'))
console.log(TNonEmptyString(''))
console.log(TInteger(2.5))
console.log(TPositiveInt(0))

test 'each type accepts its values and refuses others' {
  expect(isMonadicError(subscribe('ada lovelace@example.com'))).toBe(true)
  expect(isMonadicError(fetchFeed('not a url'))).toBe(true)
  expect(isMonadicError(findOrder('order-17'))).toBe(true)
  expect(isMonadicError(rename(''))).toBe(true)
  expect(isMonadicError(moveBy(0.5))).toBe(true)
  expect(isMonadicError(reserve(-1))).toBe(true)
}

test 'the edges, as they really are' {
  expect(TUrl('mailto:ada@example.com')).toBe(true)
  expect(TUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true)
  expect(TNonEmptyString('   ')).toBe(true)
  expect(TInteger(0)).toBe(true)
  expect(TPositiveInt(0)).toBe('0 is not positive')
}
```

It prints:

```text
subscribed ada@example.com
fetching https://example.com/feed.xml
order 123e4567-e89b-12d3-a456-426614174000
renamed to Q3 report
moved -2
reserved 4
"ada@example" is not a valid email
"example.com/feed.xml" is not a valid URL
"123e4567e89b12d3a456426614174000" is not a valid UUID
string is empty
2.5 is not an integer
0 is not positive
```

What each one accepts:

| Type              | Accepts                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `TEmail`          | a string of the form `something@something.something` with no spaces. It checks the shape, not that the address exists. |
| `TUrl`            | any string the platform's `URL` parser accepts. That needs a scheme (`https:`, `mailto:`, …), so `example.com` fails. |
| `TUuid`           | 8-4-4-4-12 hexadecimal digits with hyphens, in either case and of any version                            |
| `TNonEmptyString` | any string with at least one character. `'   '` passes; trim first if blanks should not.                 |
| `TInteger`        | a number with no fractional part, negative and zero included                                             |
| `TPositiveInt`    | an integer greater than zero. `0` fails.                                                                  |

`TString`, `TNumber` and `TBoolean` are exported too, but in a `.tjs` signature an example
says the same thing more briefly: `name: ''`, `price: 0.0`, `active: false`. Likewise
`count: 0` is an integer and `count: +0` a non-negative integer (see
[the syntax reference](/TJS-SYNTAX/)). No example value means "greater than zero", though:
`+0` allows `0`, and `TPositiveInt` refuses it. Reach for `TPositiveInt` when zero is not
allowed, and for `TInteger` when you want the type to have a name or are checking a value
outside a signature.

## Building types from other types

`Nullable`, `Optional`, `TPair` and `TRecord` take types and return a new type. To use the
result as a parameter type, give it a name with a `Type` declaration (introduced in
[Declarations](/declarations/)), whose `example` can be the call. The declaration is not
optional: the compiler resolves a parameter type only when it is imported or declared with
`Type`, `Generic`, `Union` or `Enum` in the file, so `const MaybeEmail = Nullable(TEmail)`
makes a working type, but `p: MaybeEmail` is not checked. The compiler warns that the
annotation "could not be resolved to a runtime type".

```tjs:inline
import { TEmail, TString, TNumber, TInteger, TPair, TRecord, Nullable, Optional } from 'tjs-lang'

Type ManagerEmail { example: Nullable(TEmail) }     // an email, or null
Type ReplyTo { example: Optional(TEmail) }          // an email, null, or undefined
Type Entry { example: TPair(TString, TNumber) }     // ['apples', 3]
Type Scores { example: TRecord(TInteger) }          // { ada: 3, alan: 5 }

function assign(manager: ManagerEmail) {
  return manager == null ? 'unassigned' : `managed by ${manager}`
}
function reply(to: ReplyTo) {
  return to == null ? 'no reply address' : `reply to ${to}`
}
function addLine(entry: Entry) {
  return `${entry[1]} x ${entry[0]}`
}
function best(scores: Scores) {
  return Object.keys(scores).reduce((a, b) => (scores[a] >= scores[b] ? a : b))
}

console.log(assign(null), '|', assign('grace@example.com'))
console.log(reply(undefined), '|', reply('alan@example.com'))
console.log(addLine(['apples', 3]))
console.log(best({ ada: 3, alan: 5, grace: 4 }))

test 'Nullable allows null; Optional also allows undefined' {
  expect(assign(null)).toBe('unassigned')
  expect(isMonadicError(assign(undefined))).toBe(true)
  expect(reply(undefined)).toBe('no reply address')
  expect(isMonadicError(assign('grace'))).toBe(true)
}

test 'TPair checks both slots; TRecord checks every value' {
  expect(isMonadicError(addLine([3, 'apples']))).toBe(true)
  expect(isMonadicError(addLine(['apples', 3, 'extra']))).toBe(true)
  expect(isMonadicError(best({ ada: 3, alan: 'five' }))).toBe(true)
  expect(isMonadicError(best([3, 5]))).toBe(true)
}
```

It prints:

```text
unassigned | managed by grace@example.com
no reply address | reply to alan@example.com
3 x apples
alan
```

`Nullable` allows `null` and refuses `undefined`. The type check tells the two apart even
though TJS's `==` treats them as equal, which is why `assign` can still test
`manager == null`. `TRecord` checks every value of a plain object, and refuses an array.

`TArray(T)` (an array whose every item is a `T`) and `Union(A, B, …)` (any one of several
types) work the same way. (`Union` is also a declaration form,
`Union Direction 'a direction' 'north' | 'south'`, for a named set of values; see
[Declarations](/declarations/). The imported function combines types; the declaration lists
values.) The arguments may be built-in types, types you declared, or example values, and an
example value means what it always means: `TPair('', 0.0)` is the same type as
`TPair(TString, TNumber)`, while `TPair('', 0)` accepts only an integer in its second slot.

Built-in types also work inside a `Type` example's object. That is how you describe data
that arrives from outside your program, as JSON from an API or a file, before any of your
code touches it (the pipeline at the end of this page does this):

```tjs:inline
import { TEmail, TUrl } from 'tjs-lang'

Type Profile {
  example: {
    name: 'Ada',
    email: TEmail,
    homepage: TUrl | undefined,   // may be left out
  }
}

console.log(Profile({ name: 'Ada', email: 'ada@example.com' }))
console.log(Profile({ name: 'Ada', email: 'ada' }))
console.log(Profile({ name: 'Ada', email: 'ada@example.com', homepage: 'ada.dev' }))
```

It prints:

```text
true
false
false
```

The second has no valid email, the third no valid URL. A type you declare answers `true` or
`false`, never a reason string. (This example has no `test` block on purpose: from the
command line, a test of `Profile` would run before `TEmail` and `TUrl` are loaded, and pass
or fail for reasons that have nothing to do with the data.)

## Dates: two values and three types

A `.tjs` file refuses `new Date(…)`. A `Date` is a mutable object (`d.setMonth(…)` changes
it for everyone holding it), and it mixes a moment with a calendar date and the zone of
whatever machine runs the code; [What `.tjs` Refuses](/safer-code/) has the details.
`Date.now()` is allowed, because it returns a plain number. In place of the object are two
plain values:

- A **Timestamp** is a moment: a number of milliseconds since 1970-01-01 UTC, the number
  `Date.now()` returns. Use it for "when did this happen".
- A **LegalDate** is a calendar date with no time and no zone: a `'YYYY-MM-DD'` string. Use
  it for birthdays, due dates and contract dates.

Each has a module of functions to work with it (`Timestamp`, `LegalDate`), and there are
three types to check a parameter with:

| Type            | Accepts                                                               | Example value                |
| --------------- | --------------------------------------------------------------------- | ---------------------------- |
| `TimestampType` | a finite number (milliseconds since 1970 UTC)                         | `1705311000000`              |
| `TimestampISO`  | an ISO 8601 date-and-time string, the readable form of a Timestamp    | `'2024-01-15T09:30:00.000Z'` |
| `LegalDateType` | a `'YYYY-MM-DD'` string                                               | `'2024-01-15'`               |

Note the names. `Timestamp` and `LegalDate` are the modules; the types are `TimestampType`
and `LegalDateType`. Mixing them up fails silently: `t: Timestamp` compiles with no warning
and accepts any value, because the module is not a type and has nothing to check with.
Write `t: TimestampType` and `d: LegalDateType`.

```tjs:inline
import { Timestamp, LegalDate, TimestampType, TimestampISO, LegalDateType } from 'tjs-lang'

function hoursBetween(start: TimestampType, end: TimestampType) {
  return Timestamp.diffHours(end, start)
}
function received(at: TimestampISO) {
  return Timestamp.parse(at)
}
function dueAfter(issued: LegalDateType, days: 30) {
  return LegalDate.addDays(issued, days)
}

const start = Timestamp.from(2024, 3, 10, 14, 0) // months count from 1: 3 is March
const end = Timestamp.addHours(start, 36)

console.log(start, Timestamp.iso(start))
console.log(hoursBetween(start, end))
console.log(received('2024-01-15T09:30:00Z'))
console.log(dueAfter('2024-01-15', 30))

console.log(hoursBetween('2024-03-10', end).message)
console.log(received('2024-01-15').message)
console.log(dueAfter('15/01/2024', 30).message)

test 'the date types' {
  expect(TimestampType(Timestamp.now())).toBe(true)
  expect(TimestampType(NaN)).toBe(false)
  expect(TimestampISO('2024-01-15T09:30:00.000Z')).toBe(true)
  expect(TimestampISO('2024-01-15')).toBe(false)
  expect(LegalDateType('2024-01-15')).toBe(true)
  expect(LegalDateType('2024-1-15')).toBe(false)
}
```

It prints:

```text
1710079200000 2024-03-10T14:00:00.000Z
36
1705311000000
2024-02-14
Expected TimestampType for 'hoursBetween.start', got string
Expected TimestampISO for 'received.at', got string
Expected LegalDateType for 'dueAfter.issued', got string
```

`TimestampISO` exists for values that arrive as text (from JSON, an API, a form). Inside
your program, turn it into a Timestamp with `Timestamp.parse` and work with the number.

Two functions in the tables below throw rather than return an error: `Timestamp.parse` on
text that is not a date, and `LegalDate.from` (and `LegalDate.parse`) on a day that does not
exist. They are for values you have already checked, such as an argument that passed
`TimestampISO`. For text you have not checked, use `tryParse`, which returns `null` instead.

### The `Timestamp` module

Every function takes Timestamps (numbers) and returns a new value; nothing is changed in
place. All of them work in UTC unless they take a time zone.

| Group        | Functions                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| make         | `now()`, `from(year, month, day, hour?, minute?, second?, ms?)` (month 1–12), `parse(text)` (throws on bad text), `tryParse(text)` (returns `null`) |
| add          | `addMilliseconds`, `addSeconds`, `addMinutes`, `addHours`, `addDays`, `addWeeks`, `addMonths`, `addYears`                          |
| difference   | `diff(a, b)` (milliseconds), `diffSeconds`, `diffMinutes`, `diffHours`, `diffDays`: all `a - b`, rounded down                      |
| read a part  | `year`, `month` (1–12), `day`, `hour`, `minute`, `second`, `millisecond`, `dayOfWeek` (1 = Monday, 7 = Sunday)                     |
| boundaries   | `startOfDay`, `endOfDay`, `startOfMonth`, `endOfMonth`, `startOfYear`, `endOfYear`                                                 |
| compare      | `isBefore`, `isAfter`, `isEqual`, `min`, `max` (or just `<`, `>`, `==`: they are numbers)                                          |
| display      | `iso(ts)`, `toDate(ts)` (the UTC `'YYYY-MM-DD'`), `format(ts, zone?)`, `formatDate(ts, zone?)`, `formatTime(ts, zone?)`, `toLocal(ts, zone?, options?)` |
| check        | `isValid(v)`, `isValidISO(text)`                                                                                                  |

```tjs:inline
import { Timestamp } from 'tjs-lang'

const launch = Timestamp.parse('2024-01-31T23:30:00Z')

console.log(Timestamp.iso(Timestamp.addMonths(launch, 1)))  // clamps to the end of February
console.log(Timestamp.iso(Timestamp.startOfMonth(launch)))
console.log(Timestamp.iso(Timestamp.endOfDay(launch)))
console.log(Timestamp.dayOfWeek(launch), Timestamp.hour(launch))
console.log(Timestamp.toDate(launch))

// The same moment, displayed in two zones (the wording follows your locale)
console.log(Timestamp.format(launch, 'UTC'))
console.log(Timestamp.format(launch, 'Asia/Tokyo'))

test 'Timestamp arithmetic' {
  expect(Timestamp.iso(Timestamp.addMonths(launch, 1))).toBe('2024-02-29T23:30:00.000Z')
  expect(Timestamp.diffDays(Timestamp.addDays(launch, 10), launch)).toBe(10)
  expect(Timestamp.dayOfWeek(launch)).toBe(3)
  expect(Timestamp.tryParse('next Tuesday')).toBe(null)
}
```

The first five lines print:

```text
2024-02-29T23:30:00.000Z
2024-01-01T00:00:00.000Z
2024-01-31T23:59:59.999Z
3 23
2024-01-31
```

The last two show the same moment as 31 January in UTC and as 1 February in Tokyo. In an
English (US) locale they read something like `Jan 31, 2024 at 11:30:00 PM` and
`Feb 1, 2024 at 08:30:00 AM`; the exact punctuation depends on the browser.
The formatting functions use the locale of whatever runs the code, so their output differs
between machines. So does anything that reads the clock (`now()`, `today()`) and, as the
trip-ups below explain, `parse` given a time with no zone.

### The `LegalDate` module

Every function takes and returns `'YYYY-MM-DD'` strings (or numbers, for the parts). A
LegalDate has no time and no zone, so the 15th is the 15th everywhere. Only "what is the
date today" depends on a zone, which is why there are both `today()` and `todayIn(zone)`.

| Group        | Functions                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| make         | `today()` (in UTC), `todayIn(zone)`, `from(year, month, day)` (throws on a date that does not exist), `parse(text)`, `tryParse(text)` |
| add          | `addDays`, `addWeeks`, `addMonths`, `addYears` (month and year arithmetic clamp to the end of a short month)       |
| difference   | `diff(a, b)` (days), `diffMonths(a, b)`, `diffYears(a, b)`                                                         |
| read a part  | `year`, `month`, `day`, `dayOfWeek` (1 = Monday), `weekOfYear` (ISO week), `dayOfYear`, `quarter`                  |
| calendar     | `isLeapYear(year)`, `daysInMonth(year, month)`, `daysInYear(year)`                                                 |
| boundaries   | `startOfWeek`, `endOfWeek` (Monday to Sunday), `startOfMonth`, `endOfMonth`, `startOfQuarter`, `endOfQuarter`, `startOfYear`, `endOfYear` |
| compare      | `isBefore`, `isAfter`, `isEqual`, `isBetween(date, start, end)`, `min`, `max`                                      |
| convert      | `toTimestamp(date)` (midnight UTC), `toTimestampISO(date)`, `toUnix(date)` (seconds), `fromUnix(seconds)`          |
| display      | `format(date, options?)`, `formatLong(date)`, `formatShort(date)`                                                  |
| check        | `isValid(text)`: the right shape **and** a day that exists                                                         |

```tjs:inline
import { LegalDate } from 'tjs-lang'

const signed = '2024-02-29'

console.log(LegalDate.addYears(signed, 1))          // no 29 February in 2025
console.log(LegalDate.endOfQuarter(signed), LegalDate.quarter(signed))
console.log(LegalDate.startOfWeek(signed), LegalDate.dayOfWeek(signed))
console.log(LegalDate.weekOfYear('2024-12-30'))     // ISO week 1 of 2025
console.log(LegalDate.diff('2024-12-25', signed))   // days
console.log(LegalDate.isValid('2024-02-30'), LegalDate.tryParse('2024-02-30'))
console.log(LegalDate.toTimestamp(signed))

test 'LegalDate arithmetic' {
  expect(LegalDate.addMonths('2024-01-31', 1)).toBe('2024-02-29')
  expect(LegalDate.addYears('2024-02-29', 1)).toBe('2025-02-28')
  expect(LegalDate.isBetween('2024-03-01', '2024-01-01', '2024-12-31')).toBe(true)
  expect(LegalDate.daysInMonth(2023, 2)).toBe(28)
  expect(LegalDate.isValid('2023-02-29')).toBe(false)
}
```

It prints:

```text
2025-02-28
2024-03-31 1
2024-02-26 4
1
300
false null
1709164800000
```

### When a library needs a `Date`: `LegacyDate`

Some code you call wants a real `Date`: `Intl.DateTimeFormat`, a charting library, an older
API. `LegacyDate(…)` makes one. It needs no import, because the compiler provides it in
every `.tjs` file as a function that calls `new Date(…)`. Make the `Date` at the call, hand
it over, and come back to a Timestamp with `.getTime()`:

```tjs:inline
import { Timestamp } from 'tjs-lang'

const paid = Timestamp.parse('2024-01-15T09:30:00Z')

const asDate = LegacyDate(paid)
const label = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' })
console.log(label.format(asDate))

console.log(asDate.getTime() == paid)

test 'a Date goes out and a Timestamp comes back' {
  expect(LegacyDate(paid).getTime()).toBe(paid)
}
```

It prints:

```text
15 January 2024
true
```

Keep the `Date` at the edge, as here, rather than passing it around: the reasons `.tjs`
refuses `new Date` apply to a `LegacyDate` just as much.

## A date pipeline

Here is a small program of the kind dates usually appear in. Subscriptions arrive as JSON,
with the email to notify, the plan, the date the subscription started and the moment of the
last payment. For each one we want the next renewal date, how many days away it is, and
whether the last payment is overdue.

To copy it into your own project, keep the `test` blocks in mind: from the command line they
come out inconclusive, because they need the imports (see
[Reading the examples](#reading-the-examples)). They run here, on the page.

```tjs:inline
import { Timestamp, LegalDate, TEmail, LegalDateType, TimestampISO, TimestampType } from 'tjs-lang'

Type Subscription {
  example: {
    email: TEmail,
    plan: 'monthly' | 'yearly',
    started: LegalDateType,
    lastPaid: TimestampISO,
  }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The first renewal on or after `today`. Each candidate is counted from the start
// date, so a subscription started on the 31st renews on the last day of short months
// and on the 31st again when there is one. `plan` must be exactly one of the two.
function nextRenewal(started: LegalDateType, plan: 'monthly' | 'yearly', today: LegalDateType) {
  if (!LegalDate.isValid(started)) {
    return Error(`${started} is not a date`)
  }
  const step = plan == 'monthly' ? 1 : 12
  let n = 1
  while (LegalDate.isBefore(LegalDate.addMonths(started, n * step), today)) {
    n += 1
  }
  return LegalDate.addMonths(started, n * step)
}

function renewalNotice(sub: Subscription, today: LegalDateType, now: TimestampType) {
  const renews = nextRenewal(sub.started, sub.plan, today)
  if (renews instanceof Error) {
    return renews
  }
  const days = LegalDate.diff(renews, today)
  const paidHoursAgo = Timestamp.diffHours(now, Timestamp.parse(sub.lastPaid))
  const limit = (sub.plan == 'monthly' ? 31 : 366) * 24
  return {
    to: sub.email,
    renews: `${WEEKDAYS[LegalDate.dayOfWeek(renews) - 1]} ${renews}`,
    inDays: days,
    overdue: paidHoursAgo > limit,
  }
}

const incoming = JSON.parse(`[
  { "email": "ada@example.com", "plan": "monthly", "started": "2024-01-31", "lastPaid": "2024-03-29T08:00:00Z" },
  { "email": "alan@example.com", "plan": "yearly", "started": "2023-04-02", "lastPaid": "2023-04-02T10:15:00Z" },
  { "email": "grace", "plan": "monthly", "started": "2024-02-10", "lastPaid": "2024-03-10T12:00:00Z" },
  { "email": "kay@example.com", "plan": "monthly", "started": "2024-02-30", "lastPaid": "2024-03-01T12:00:00Z" }
]`)

// The clock is read once, at the edge. Everything above takes the date as an argument.
const today = '2024-04-10'                 // in a real program: LegalDate.today()
const now = Timestamp.parse('2024-04-10T09:00:00Z') // in a real program: Timestamp.now()

for (const sub of incoming) {
  const notice = renewalNotice(sub, today, now)
  console.log(notice instanceof Error ? `skipped ${sub.email}` : JSON.stringify(notice))
}

// Why the last two were skipped
console.log(TEmail(incoming[2].email))
console.log(LegalDate.isValid(incoming[3].started))

test 'a subscription started on the 31st keeps its day where it can' {
  expect(nextRenewal('2024-01-31', 'monthly', '2024-02-10')).toBe('2024-02-29')
  expect(nextRenewal('2024-01-31', 'monthly', '2024-03-01')).toBe('2024-03-31')
  expect(nextRenewal('2024-01-31', 'monthly', '2024-04-10')).toBe('2024-04-30')
}

test 'a plan is monthly or yearly, nothing else' {
  expect(isMonadicError(nextRenewal('2024-01-31', 'quarterly', '2024-02-10'))).toBe(true)
}

test 'yearly renewals and overdue payments' {
  const alan = renewalNotice(incoming[1], today, now)
  expect(alan.renews).toBe('Wed 2025-04-02')
  expect(alan.inDays).toBe(357)
  expect(alan.overdue).toBe(true)
  expect(renewalNotice(incoming[0], today, now).overdue).toBe(false)
}

test 'bad records are refused, not processed' {
  expect(isMonadicError(renewalNotice(incoming[2], today, now))).toBe(true)
  expect(renewalNotice(incoming[3], today, now) instanceof Error).toBe(true)
}
```

It prints:

```text
{"to":"ada@example.com","renews":"Tue 2024-04-30","inDays":20,"overdue":false}
{"to":"alan@example.com","renews":"Wed 2025-04-02","inDays":357,"overdue":true}
skipped grace
skipped kay@example.com
"grace" is not a valid email
false
```

### What to notice

- **Each kind of time has its own value.** `started` is a calendar date, so it is a
  `LegalDate` string and month arithmetic happens on the calendar. `lastPaid` is a moment,
  so it arrives as an ISO string, is turned into a Timestamp with `Timestamp.parse`, and
  the gap is measured in hours. The code makes no `Date` object, so the file needs no
  `TjsCompat` (the first-line marker that gives a file JavaScript's rules, `Date` included;
  see [Date Formatting](/date-formatting-with-import/)).
- **The clock is read in one place.** `nextRenewal` and `renewalNotice` take `today` and
  `now` as arguments, so the same input always gives the same answer, and the tests can
  name exact dates. A real program passes `LegalDate.today()` and `Timestamp.now()` at the
  call, once.
- **Renewals are counted from the start date.** `LegalDate.addMonths(started, n)` for
  `n = 1, 2, 3` gives 29 February, 31 March and 30 April. Adding one month to the previous
  renewal instead would drift: 31 January, 29 February, 29 March, 29 April.
- **The record is checked once, at the boundary.** `Subscription` is declared from the
  built-in types, so a record with a bad email is refused before any date arithmetic runs.
  The error names the type, not the member (`Expected Subscription for
  'renewalNotice.sub', got object`); call `TEmail(sub.email)` yourself, as the last lines
  do, when you want to tell the user which field is wrong.
- **`'monthly' | 'yearly'` is a set of two values.** A union of example strings does not
  widen to "any string": on the parameter and inside `Subscription`, `'quarterly'` is
  refused.
- **`LegalDateType` is not the whole check.** Whether it accepts `'2024-02-30'` depends on
  the browser (see below); `LegalDate.isValid` is what reliably knows February has no 30th.
  So `nextRenewal` checks too, and returns an `Error` of its own. `Error(…)` without `new`
  is ordinary JavaScript, and `.tjs` returns errors rather than throwing them. Either way the
  record is skipped: a `MonadicError` is an `Error`, so `instanceof Error` catches the type
  error and this one alike. That is why the loop prints the email rather than the message,
  which differs between browsers for this record.

## Things that trip people up

- **`t: Timestamp` checks nothing, and says nothing.** `Timestamp` is the module of
  functions, not the type, so a parameter annotated with it accepts any value, with no
  warning. Write `t: TimestampType` (and `d: LegalDateType`, not `d: LegalDate`).
- **`LegalDateType` checks the shape; the calendar is up to the browser.** It requires
  `'YYYY-MM-DD'` and then asks the platform's own date parser, which in Chrome, Safari, Node
  and Bun rolls `'2024-02-30'` and `'2023-02-29'` over to March and so accepts them. Other
  engines may refuse them. `LegalDate.isValid` checks that the day exists, the same way
  everywhere, and `LegalDate.from` and `LegalDate.parse` throw on one that does not.
- **A string or number type's failure is a string, and strings are truthy.**
  `if (TEmail(x))` is true for every `x`. Compare with `=== true`.
- **`p: TEmail | null` on a parameter currently checks only `TEmail`**, so `null` is
  refused. Declare `Type MaybeEmail { example: Nullable(TEmail) }` and use that. Inside a
  `Type` example, `TEmail | null` works as written.
- **A combinator needs a `Type` declaration to be a parameter type.**
  `p: MaybeEmail` where `const MaybeEmail = Nullable(TEmail)` is not checked; the compiler
  warns (see [Building types from other types](#building-types-from-other-types)).
- **`Optional(T)` in an object example does not make the member optional.** It allows the
  value `undefined`, but the key must still be there. To let a caller leave a member out,
  write `T | undefined`, as `Profile` does with `homepage`.
- **A time without a zone is local time.** `TimestampISO` accepts `'2024-01-15T09:30'`, and
  `Timestamp.parse` reads it as 9:30 where the code runs, so the Timestamp differs between
  machines. Data you store or send should carry its zone (`Z` or `+01:00`).
- **`LegalDate.today()` is today in UTC.** In the evening in America it is already
  tomorrow in UTC. Use `LegalDate.todayIn('America/New_York')` (or the user's zone) for a
  date the user sees.
- **`diffMonths` and `diffYears` count calendar boundaries.**
  `LegalDate.diffMonths('2024-03-01', '2024-02-29')` is `1`, though only a day has passed.
  For elapsed time, use `LegalDate.diff` (days). The `Timestamp.diff…` functions round down,
  so a gap of minus an hour and a half is `-2` hours.
- **Signature examples cannot see imports.** A function whose signature or body uses an
  imported type or module has an _inconclusive_ signature example, and from the command
  line its tests are inconclusive too (see [Reading the examples](#reading-the-examples)).
  A test of a `Type` built from imported types is worse: it can pass while checking
  nothing.
