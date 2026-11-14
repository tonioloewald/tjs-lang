<!--{"parent": "writing-agents.md", "order": 2}-->
<!-- TODO review -->

# Values and Expressions

AJS is a JavaScript subset. At the level of a single expression it reads like the JavaScript you
know: `let` and `const`, arithmetic, comparisons, template strings, `trim` and `slice` and
`push`. This chapter covers what a value can be, how variables and assignment work, and which
operators, methods and builtins exist.

Three differences from JavaScript matter most, and each has its own section:

- **An object or array is never converted to a primitive behind your back.** `'tags: ' + tags`
  is an error, not `'tags: a,b'`. See [No hidden conversions](#no-hidden-conversions).
- **You cannot write into an object or array.** `o.a = 1` and `xs[0] = v` are refused; you
  build a new value instead. See [Assignment](#assignment-writes-a-variable-never-a-member).
- **Reading a member never throws.** `user.address.city` with no address gives `undefined`. See
  [Member access is null-safe](#member-access-is-null-safe).

Smaller differences (no `new`, a closed list of methods, a 1-based month) are flagged where they
come up, and the [last table](#refused-and-what-to-write-instead) collects them.

Every runnable example is a small agent. It takes no input (or uses the defaults it declares)
and returns an object, so running it shows you the values. Snippets in a plain `javascript`
block are fragments, usually code AJS refuses; they are there to read, not to run.

**Refused** in this chapter always says when: **at transpile time** means the agent never
starts and the error points at the line; **when the line runs** means the agent starts and fails
at that line, as an ordinary error a `try` can catch ([When Things Fail](/ajs-errors/)).

## Values are data

A value in AJS is data: a number, a string, a boolean, `null` or `undefined`, an array, or a
plain object. Sets and dates are data too.

```ajs:inline
function values() {
  const count = 3
  const price = 2.5
  const name = 'Ada'
  const active = true
  const nothing = null
  const tags = ['new', 'sale']
  const item = { name, price, tags }
  const unique = Set(['a', 'b', 'a'])
  const when = Date('2024-01-15T10:00:00Z')
  return { count, price, name, active, nothing, tags, item, unique, when }
}
```

`unique` comes back as `['a', 'b']`: a set **is** an array of its items. `when` comes back as a
plain object of UTC fields, starting `{ value: '2024-01-15T10:00:00.000Z', timestamp:
1705312800000, year: 2024, month: 1, … }`. While the agent runs, the VM remembers that these
values are a set and a date and gives them methods; see [Set](#set) and [Date](#date) below.

Two details about the empty values:

- A `let x` with no value starts as `null`, not `undefined` as in JavaScript.
- A result field whose value is `undefined` is **left out** of what the host receives, as
  `JSON.stringify` would leave it out; an `undefined` inside an array becomes `null`.

A function or a namespace is never a value. You call it; you cannot hold it. Each of these is
refused at transpile time:

```javascript
const m = Math              // a builtin namespace is not a value
const f = text.trim         // 'trim' is a method: call it, text.trim()
items.map(parseInt)         // pass an arrow: items.map((x) => parseInt(x))
```

The last one fails with `Method 'map' is not available in AsyncJS`, which reads as if `map` did
not exist. It does; the message means "pass an arrow, not a function name".

The reason for the rule: everything an agent holds can be copied, printed and counted against
the run's budgets, and a function can be none of those. (Every run has a budget for work,
called fuel, and one for memory; the VM charges each operation against them before doing it.
[Your First Agent](/ajs-first-agent/#running-it-from-a-host) introduced fuel, and
[Limits](/ajs-limits/) covers the budgets.)

## No hidden conversions

This is the main difference from JavaScript. In JavaScript, `'tags: ' + tags` with an array
quietly calls the array's `toString` and gives `'tags: a,b'`. In AJS the same line is an error.
So are these:

```javascript
'tags: ' + tags      // '+' needs a string, number, boolean or null, not an array
`tags: ${tags}`      // the same error, also naming '+'
tags < 5             // '<' needs a string, number, boolean or null, not an array
obj[tags]            // a computed key needs a string, number, boolean or null, not an array
Math.max(tags)       // max()'s argument 1 must be a number
```

Operators, template interpolation, computed keys and most method arguments take primitives. An
object or array where a primitive belongs is an error, not a silent conversion.

Primitives still mix as they do in JavaScript: `'item ' + 7` is `'item 7'`, `'5' + 1` is `'51'`,
`'5' < 6` is true and `true + 1` is 2. So does `undefined`: `'Hi ' + user.nmae`, where the
field is missing, gives `'Hi undefined'`, in a template too. The rule is narrow on purpose: AJS
never turns an object or array into a primitive.

The reason: turning an array or object into a string is an allocation whose size depends on the
data, and an implicit one happens where the VM cannot charge for it before it is made. Rather
than guess, AJS refuses, and you write the conversion yourself, where it is visible and paid for.

The fix is to say which string you mean:

```ajs:inline
function explicit({ tags = ['a', 'b'], scores = [3, 9, 4], order = { id: 7, total: 12 } }) {
  return {
    joined: 'tags: ' + tags.join(','), // 'tags: a,b'
    listed: `tags: ${tags.join(', ')}`, // 'tags: a, b'
    json: 'order ' + JSON.stringify(order), // 'order {"id":7,"total":12}'
    count: 'tags: ' + tags.length, // 'tags: 2'
    biggest: Math.max(scores[0], scores[1], scores[2]), // 9
  }
}
```

`Math.max` takes numbers, so pass it numbers. For the largest item of an array of any length,
`reduce` does the job; it is covered in [Decisions, Loops and Helpers](/ajs-control-flow/).

Two things to know about the error when you hit it:

- **It is refused when the line runs, not at transpile time.** The transpiler does not know
  that `tags` holds an array. If nothing catches the error, the run ends and the host receives
  it as the run's `error`.
- **The message names `'+'` even for a template string.** `` `tags: ${tags}` `` fails with
  `'+' needs a string, number, boolean or null, not an array`, because a template is built by
  concatenation. If you see a `'+'` error on a line with no plus sign, look for an interpolated
  array or object.

## Variables

Declare a variable with `let` (it may be reassigned) or `const` (it may not). A name must be
declared before it is read, and variables are block-scoped, as in modern JavaScript:

```ajs:inline
function counters() {
  let total = 10
  total += 5
  total *= 2
  total -= 6
  let visits = 0
  visits++
  visits++
  let note = 'outer'
  if (total > 20) {
    let note = 'inner' // a different variable, alive only inside these braces
    total = total + 1
  }
  return { total, visits, note }
}
```

This returns `{ total: 25, visits: 2, note: 'outer' }`. The `total = total + 1` inside the `if`
writes the outer `total`; the inner `let note` is a new variable that disappears at the closing
brace.

Reading a name that was never declared is refused at transpile time, and the error names it, so
a misspelled name you **read** is caught before anything runs:

```javascript
let count = 0
return { n: cuont }
// 'cuont' is not defined. Declare it with let or const, or take it as a parameter.
```

A misspelled name you **assign to** is refused the same way. `totl = 5`, meant for `total`, would
otherwise create a new variable `totl` and leave `total` unchanged:

```javascript
let total = 0
totl = 5
// 'totl' is not declared, so assigning to it would create a new variable silently.
// Declare it with let (let totl = …), or check the spelling.
```

Reassigning a `const` is refused when the line runs, with `Cannot reassign const variable 'c'`,
and a `try` can catch it. The transpiler could see this one too; today it leaves it to the VM.

Give a variable one kind of value for its whole life: a count stays a number, a label stays a
string. Nothing enforces this; it is advice, because a variable that changes kind is hard to
read. When you need a value of another kind, declare another variable.

### Assignment writes a variable, never a member

> **Works differently, silently: `Object.assign`.** In JavaScript, `Object.assign(user, extra)`
> changes `user`. In AJS it **returns a new object and leaves `user` alone**, and nothing warns
> you. When you mean to change `user`, assign the result: `user = Object.assign(user, extra)`
> (with `let user`), or `user = { ...user, ...extra }`.

Every compound operator works (`+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `??=`, `||=`, `&&=`), and so
do `++` and `--` as statements of their own. `++` used as a value, as in `let y = x++`, is
refused at transpile time. Split it into two lines in the order you mean: `let y = x` then
`x++` for `y = x++` (y gets the old value), or `x++` then `let y = x` for `y = ++x` (y gets the
new one).

What you cannot do is write into an object or array. `o.a = 1` and `xs[0] = v` are refused at
transpile time with `Only simple variable assignment is supported`. Build a new value instead:
spread for an object, `with` to replace one item of an array, or a method that changes the array
in place, such as `push`:

```ajs:inline
function update() {
  let user = { name: 'Ada', role: 'user' }
  const promoted = { ...user, role: 'admin' }
  let scores = [3, 5, 8]
  scores = scores.with(0, 4) // replace item 0
  const tags = ['a']
  tags.push('b') // in place
  const more = [...tags, 'c']
  const merged = Object.assign(user, { team: 'core' })
  return { user, promoted, scores, tags, more, merged }
}
```

This returns `user: { name: 'Ada', role: 'user' }`, `promoted: { name: 'Ada', role: 'admin' }`,
`scores: [4, 5, 8]`, `tags: ['a', 'b']`, `more: ['a', 'b', 'c']` and `merged: { name: 'Ada',
role: 'user', team: 'core' }`. Note that `user` is unchanged: that is the `Object.assign`
difference above.

**Which methods change their array?** The same ones as in JavaScript: `push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill` and `copyWithin` change the array they are called
on, even through a `const`. `const` stops you assigning the name, not changing the array, as in
JavaScript. The others, including `with`, `toSorted`, `toReversed`, `toSpliced`, `slice` and
`concat`, return a new array and leave the original alone. The one exception to "as in
JavaScript" is `Object.assign`.

## Operators

Arithmetic and comparison work as in JavaScript on numbers, strings and booleans:

```ajs:inline
function arithmetic({ a = 7, b = 2 }) {
  return {
    sum: a + b, // 9
    quotient: a / b, // 3.5
    remainder: a % b, // 1
    power: a ** b, // 49
    bigger: a > b, // true
    joined: 'item ' + a, // 'item 7'
    alphabetical: 'apple' < 'banana', // true
  }
}
```

### Equality

`==` is `===`, with two exceptions: `null == undefined` is true, and `NaN == NaN` is true. `===`
and `!==` are JavaScript's own, with no exceptions: `null === undefined` and `NaN === NaN` are
both false. Neither operator ever coerces (`'1' == 1` is false), and objects and arrays compare
by identity, not by contents:

```ajs:inline
function equality() {
  const a = { id: 1 }
  const b = a
  return {
    noCoercion: '1' == 1, // false
    nullish: null == undefined, // true
    nan: NaN == NaN, // true
    sameObject: a == b, // true: the same object
    notStructural: [1, 2] == [1, 2], // false: two distinct arrays
    sameContents: JSON.stringify(a) == JSON.stringify({ id: 1 }), // true
  }
}
```

To compare contents, compare the fields you care about (`a.id == c.id`), or compare
`JSON.stringify` of both sides when their keys are in the same order. Use `==` unless you need to
tell `null` from `undefined`.

### Logical operators and the ternary

`&&`, `||`, `??` and `cond ? x : y` behave as in JavaScript. Notice the difference between `||`
and `??` on an empty string:

```ajs:inline
function logic({ name = '', count = 0 }) {
  return {
    orFallback: name || 'anonymous', // 'anonymous': '' is falsy
    nullishFallback: name ?? 'anonymous', // '': only null and undefined fall through
    zeroKept: count ?? 10, // 0
    status: count > 0 ? 'some' : 'none', // 'none'
    both: count > 0 && name != '', // false
  }
}
```

Use `??` for "a default when missing" and `||` only when every falsy value (`''`, `0`, `false`)
should be replaced.

## Member access is null-safe

Agents work on data from outside: API responses, model output, stored records. A field is often
missing, and a crash on the first absent one would turn every agent into a pile of checks. So
every member read behaves like optional chaining: reading a property of `null` or `undefined`
gives `undefined` instead of throwing.

```ajs:inline
function lookup({ user = { name: 'Ada', address: null }, key = 'name' }) {
  const city = user.address.city // user.address is null: city is undefined
  const value = user[key] // computed access with a variable
  const initial = user.name[0] // an index into a string
  return { city, value, initial }
}
```

This returns `{ value: 'Ada', initial: 'A' }`. There is no `city` in the result: it was
`undefined`, and an `undefined` field is left out.

The cost is real: a typo such as `user.nmae` also reads as `undefined` instead of failing, and
`'Hi ' + user.nmae` quietly gives `'Hi undefined'`. Use names carefully, and let the agent's
declared inputs and result catch some of these at the edges; see [Contracts](/ajs-contracts/).

Computed access, `items[i]` or `user[key]`, works with literals and variables alike. The key must
be a primitive; an `undefined` key is read as the key `'undefined'`, as in JavaScript. `?.` is
accepted, but adds nothing: every read is already null-safe.

## Template strings

Template strings work as in JavaScript, as long as every interpolated value is a primitive:

```ajs:inline
function templates({ name = 'Ada', count = 3, done = false }) {
  const line = `${name} has ${count} items`
  const flag = `done: ${done}`
  const asText = `${count}` // the way to turn a number into a string
  return { line, flag, asText }
}
```

This returns `{ line: 'Ada has 3 items', flag: 'done: false', asText: '3' }`.

## Methods

Strings, numbers, arrays and objects have a **closed** list of methods: the ones in the
[Methods table](/DOCS-AJS/#methods). Anything not on the list is refused, and the error names the
method. `text.matchAll(/a/g)` is refused because `matchAll` is not on the list.

```ajs:inline
function methods({ text = '  Hello World  ', nums = [3, 1, 2] }) {
  const clean = text.trim()
  const words = clean.split(' ')
  const shout = clean.toUpperCase()
  const padded = '7'.padStart(3, '0')
  const sorted = nums.toSorted() // a new array; nums is unchanged
  const has = nums.includes(2)
  const firstTwo = nums.slice(0, 2)
  const labels = ['b', 'a', 'c']
  labels.sort() // in place
  const backwards = labels.toReversed()
  return { clean, words, shout, padded, nums, sorted, has, firstTwo, labels, backwards }
}
```

This returns `clean: 'Hello World'`, `words: ['Hello', 'World']`, `shout: 'HELLO WORLD'`,
`padded: '007'`, `nums: [3, 1, 2]`, `sorted: [1, 2, 3]`, `has: true`, `firstTwo: [3, 1]`,
`labels: ['a', 'b', 'c']` and `backwards: ['c', 'b', 'a']`.

**Sorting has two traps.** First, `sort()` and `toSorted()` compare items **as text**, exactly
as JavaScript's default sort does, so `[10, 9, 1]` sorts to `[1, 10, 9]`. The `[3, 1, 2]` above
only looks numeric because every item has one digit. Second, there is no comparator:
`xs.toSorted((a, b) => a - b)` is refused at transpile time with the unhelpful
`Unsupported expression type in condition: ArrowFunctionExpression`. So sorting strings, and
reversing with `toReversed()` for descending order, works. Sorting numbers by value, or objects
by a field (an array of objects is refused when the line runs), has no built-in way today; it
takes a loop, written with the tools in [Decisions, Loops and Helpers](/ajs-control-flow/).

Two rules apply to every call. Both are checked when the line runs:

- **Exactly the arguments the method takes, with exactly the types it reads.**
  `'x'.repeat('3')` is an error (`repeat()'s argument 1 must be a number`), and so is
  `text.slice(0, 1, 2)` (`slice() takes at most 2 argument(s)`). JavaScript would have
  converted the `'3'` or ignored the extra argument.
- **Arguments are primitives, unless the method stores, searches for or copies the argument
  itself.** `xs.includes(item)`, `xs.indexOf(item)`, `xs.push(item)`, `xs.with(0, item)`,
  `xs.concat(other)` and `Object.keys(obj)` take objects and arrays, because the object is the
  thing they work with. `'abc'.includes(['a'])` is an error: a string search needs a string.

Why the list is closed: every method on it has a declared bound on what one call may allocate,
so the VM can charge the run's budget for the call before it runs. A method with no such bound
is not on the list.

`map`, `filter`, `find` and `reduce` take a callback, and they have rules of their own. They
belong to [Decisions, Loops and Helpers](/ajs-control-flow/).

[String Processing](/string-processing/) has more string examples.

## Builtins

Expressions have a fixed set of builtins. Like methods, they are called, never held.

### Math, JSON and the statics

```ajs:inline
function builtins() {
  return {
    floor: Math.floor(3.7), // 3
    biggest: Math.max(4, 9, 2), // 9
    root: Math.sqrt(16), // 4
    parsed: JSON.parse('{"a": 1}'), // { a: 1 }
    text: JSON.stringify({ a: [1, 2] }), // '{"a":[1,2]}'
    isList: Array.isArray([1, 2]), // true
    keys: Object.keys({ a: 1, b: 2 }), // ['a', 'b']
    pairs: Object.fromEntries([['x', 1]]), // { x: 1 }
    letter: String.fromCharCode(65), // 'A'
    int: parseInt('42px'), // 42
    float: parseFloat('3.5'), // 3.5
    query: encodeURIComponent('a b&c'), // 'a%20b%26c'
  }
}
```

All of JavaScript's `Math` is there, including `Math.random()`, which reads a random source the
host grants; see [time and randomness](#time-and-randomness) below. `parseInt`, `parseFloat` and
`encodeURIComponent` are plain functions, and `Number.parseInt` and `Number.parseFloat` work
too. `JSON.parse` on text that is not JSON is refused when the line runs, as an ordinary
catchable error. The full list of statics on `Array`, `Object`, `String` and `Number` is under
[Expression Builtins](/DOCS-AJS/#expression-builtins); [Math Operations](/math-operations/) and
[JSON Processing](/json-processing/) are worked examples.

**`String(n)` and `Number(s)` do not exist.** To turn a number into a string, write
`` `${n}` ``; to read a number from a string, write `parseFloat(s)` or `parseInt(s)`. `Set` and
`Date` can be called like this because AJS defines them as its own builtins; `String` and
`Number` are only namespaces for their statics (`String.fromCharCode`, `Number.isInteger`).

`let s = String(n)` is refused at transpile time with a confusing message:
`'String' takes named arguments`. The transpiler treats a call to a name it does not know as a
call to an **atom**, an operation the host provides (the [next chapter](/ajs-calling-atoms/)
covers them), and atoms take named arguments. Read it as "`String` is not available".

### Set

`Set(items)` makes a set of unique items. Write it without `new`; AJS has no `new`, and
`new Set(xs)` is refused at transpile time.

```ajs:inline
function sets() {
  const tags = Set(['a', 'b', 'b']) // ['a', 'b']
  tags.add('c') // in place
  tags.remove('a') // remove, not delete
  const stored = JSON.parse(JSON.stringify(tags)) // back to a plain array
  const again = Set(stored)
  return {
    tags, // ['b', 'c']
    has: tags.has('b'), // true
    size: tags.size, // 2
    first: tags[0], // 'b'
    diff: tags.diff(['b']), // ['c']: diff, not difference
    union: tags.union(['d']), // ['b', 'c', 'd']
    asArray: tags.toArray().join('+'), // 'b+c'
    againHas: again.has('c'), // true
  }
}
```

A set is not JavaScript's `Set`. It is an array of its items that the VM marks as a set for the
rest of the run, and the marked array gets set methods instead of array methods:

- **What still works as on an array:** `length`, reading by index (`tags[0]`), `map`, `filter`,
  `find` and `reduce`, and `Array.isArray` (true).
- **Set methods:** `add`, `remove`, `clear`, `has`, `size`, `union`, `intersection`, `diff` and
  `toArray`. The names are AJS's own, so `remove` and `diff`, not JavaScript's `delete` and
  `difference`. The rest are under [Set](/DOCS-AJS/#set).
- **Array methods are not there.** `push`, `slice`, `join` and the rest fail when the line runs,
  with `'push' is not a function`. Call `toArray()` to get a plain array when you need one.

The JavaScript names fail in different ways, so the messages are worth recognising.
`tags.delete('a')` is refused at transpile time with `Method 'delete' is not available in
AsyncJS`. `tags.difference(['b'])` is refused when the line runs with `Security Error: method
'difference' is not callable in AsyncJS`; despite the wording, that only means the method is not
on the list.

`JSON.stringify`, a store or a capability sees a set as a plain array. After a round trip through
any of them it is a plain array again, without set methods; call `Set(x)` on it to get them back.

### Date

A date is made by calling `Date` without `new` (`new Date(s)` is refused at transpile time):

- `Date(text)` from an ISO string. Text that does not parse is refused when the line runs, with
  `Invalid date: 'nope' does not parse`, and a `try` can catch it.
- `Date(ms)` from a number of milliseconds since 1970.
- `Date(stored)` from a date that went through JSON, a store or a capability (see below).
- `Date()` with no argument: now, read from the clock the host grants. `Date.now()` is now as a
  number of milliseconds. See [time and randomness](#time-and-randomness).

```ajs:inline
function dates() {
  const d = Date('2024-01-15T10:00:00Z')
  const later = d.add({ days: 10 }) // a new date; d is unchanged
  const stored = JSON.parse(JSON.stringify({ d })).d // what a store would give back
  const restored = Date(stored)
  return {
    year: d.year, // 2024
    month: d.month, // 1: January is 1, not 0
    day: d.day, // 15, the day of the month
    weekday: d.dayOfWeek, // 1: Monday (Sunday is 0)
    hours: d.hours, // 10, in UTC
    iso: later.value, // '2024-01-25T10:00:00.000Z'
    days: later.diff(d, 'days'), // 10
    formatted: later.format('YYYY-MM-DD'), // '2024-01-25'
    sameMoment: restored.timestamp == d.timestamp, // true
  }
}
```

What to know about a date:

- **It is a data object** with the fields `value` (the ISO string), `timestamp` (milliseconds),
  `year`, `month`, `day`, `hours`, `minutes`, `seconds` and `dayOfWeek`.
- **Every field is in UTC**, so an agent gives the same answer on every host.
- **`month` runs from 1 to 12**, unlike JavaScript's 0 to 11. `dayOfWeek` runs from 0 (Sunday)
  to 6, as in JavaScript. `day` is the day of the month.
- **You cannot change a field.** `add` makes a new date.
- **After JSON, a store or a capability, a date is a plain object.** `Date(stored)` turns it
  back into one with methods.

The rest of the API (`isBefore`, `format` keywords) is under [Date](/DOCS-AJS/#date).

### Time and randomness

An agent has no clock and no random number generator of its own. `Date()` with no argument,
`Date.now()`, `Math.random()`, and the `random()` and `uuid()` atoms read a clock and a random
source the host grants, as it grants `fetch`, and without them those calls are refused. The
examples on this site run with the real ones. A host can also grant a fixed clock or a seeded
random source, so the same run gives the same answer every time; see
[The Sandbox](/ajs-sandbox/#time-and-randomness-are-capabilities).

In logic you want to check or replay, you often do not need them at all: use fixed dates like the
ones above, and when the answer depends on the time, take "now" as an argument from the caller.

### Regular expressions

A regex literal is a value: you can write it inline or keep it in a variable
(`const dash = /-/`). It works as a search pattern in `replace`, `replaceAll`, `split`, `match`
and `search`, with the flags `g`, `i`, `m`, `s`, `u` and `y`:

- `'a-b c'.split(/[- ]/)` gives `['a', 'b', 'c']`.
- `'aba'.replace(/a/g, 'x')` gives `'xbx'`.

A regex has no methods of its own: `re.test(text)` is refused when the line runs. Write
`text.search(re) != -1` instead. The VM's regex engine supports no backreferences and no
lookaround; a pattern using them is refused at transpile time. The details are under
[Regular expressions](/DOCS-AJS/#regular-expressions).

Use regex today where a plain string method will not do. It is deprecated in AJS in favour of
[Pattern](/pattern/), which will replace it but is not in the VM yet.

### Schema

`Schema` builds JSON schemas, and like everything else in an agent, a schema is data. It belongs
to [Contracts](/ajs-contracts/).

## Refused, and what to write instead

The constructs from this chapter that AJS refuses, and the one that silently differs:

| Instead of                                      | Write                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `const m = Math`, `const f = text.trim`         | call it: `Math.max(a, b)`, `text.trim()`                    |
| `items.map(parseInt)`                           | `items.map((x) => parseInt(x))`                             |
| `let y = x++`                                   | `let y = x`, then `x++`                                     |
| `let y = ++x`                                   | `x++`, then `let y = x`                                     |
| `o.a = 1`                                       | `o = { ...o, a: 1 }`                                        |
| `xs[0] = v`                                     | `xs = xs.with(0, v)`                                        |
| `Object.assign(o, extra)` to change `o` (runs, but leaves `o` alone) | `o = Object.assign(o, extra)` or `o = { ...o, ...extra }` |
| `'tags: ' + tags`, `` `${tags}` ``              | `tags.join(',')`                                            |
| `'order ' + order`                              | `JSON.stringify(order)`                                     |
| `arr < 5`, `obj[arr]`                           | compare or index with a primitive (`arr.length < 5`)        |
| `Math.max(arr)`                                 | `Math.max(a, b)` with numbers, or `reduce` over the array   |
| `xs.sort((a, b) => a - b)`                      | `sort()` for text; a loop for numbers or fields             |
| `'x'.repeat('3')`, `text.slice(0, 1, 2)`        | the exact arguments: `'x'.repeat(3)`, `text.slice(0, 1)`    |
| `String(n)`, `Number(s)`                        | `` `${n}` ``, `parseFloat(s)`                               |
| `new Set(xs)`, `new Date(s)`                    | `Set(xs)`, `Date(s)`                                        |
| `tags.delete(x)`, `tags.difference(ys)`, `tags.push(x)` on a set | `tags.remove(x)`, `tags.diff(ys)`, `tags.add(x)` |
| `re.test(text)`                                 | `text.search(re) != -1`                                     |
| `[1, 2] == [1, 2]` to compare contents          | compare fields, or `JSON.stringify` both sides              |

The full list for the language is the [What's Forbidden](/DOCS-AJS/#whats-forbidden) table, and
[What to Write Instead](/patterns/#what-to-write-instead) collects the rewrites. The next chapter
calls atoms: the operations, such as fetching a URL or asking a model, that reach outside the
agent.
