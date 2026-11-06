<!--{"section": "ts", "type": "example", "group": "advanced", "order": 3, "parent": "ts-advanced.md"}-->
<!-- TODO review -->

# Classes

Classes are where TypeScript's compile-time-only features cluster: `private` that any
JavaScript caller can read anyway, and parameter types on methods that nothing checks once
the code runs. TJS can make both real. It also changes one thing a TypeScript developer
will notice at once: a class is called, not constructed with `new`.

The converter (`fromTS` in `tjs-lang/lang/from-ts`, or `tjs convert` on the command line)
turns a `.ts` file into TJS. It keeps each class, its methods, and the parameter types.
What it does with them depends on one comment, `/* @tjs TjsStrict */`, conventionally the
first line of the `.ts` file; it applies to the whole file.

- **Without it**, the converted class behaves exactly as it would after `tsc`. Nothing is
  checked and nothing changes. That is the point: you can move a file into the TJS toolchain
  first and change its behaviour later, one file at a time
  ([Converting a TypeScript Project](../../sections/ts-converting-a-project.md) walks
  through that ladder).
- **With it**, method and constructor parameters are checked each time the method is called
  (setters are the exception; see below), `private` becomes real privacy, and the class is
  called without `new`.

This chapter runs the same class both ways.

## The faithful conversion

This file has no `TjsStrict` line, so nothing is checked and nothing changes behaviour.

```ts:inline
// Classes with typed methods. The converter keeps the class, its methods and
// the parameter types. Without TjsStrict, none of them is checked.

class Calculator {
  private value: number = 0

  add(n: number) {
    this.value += n
    return this
  }

  multiply(n: number) {
    this.value *= n
    return this
  }

  getResult() {
    return this.value
  }

  reset() {
    this.value = 0
  }
}

// Use the class
const calc = new Calculator()
const result = calc.add(5).multiply(3).add(10).getResult()
console.log('5 * 3 + 10 =', result)

// Chain of operations
calc.reset()
console.log('After reset:', calc.getResult())
console.log('(2 + 3) * 4 =', calc.add(2).add(3).multiply(4).getResult())
```

It prints `25`, `0` and `20`, as the compiled TypeScript would.

- **`private` is dropped.** `value` becomes an ordinary field, which is all it ever was at
  run time.
- **`new Calculator()` is kept.** The converter writes a `/* tjs <- … */` annotation at the
  top of its output, which tells TJS the file has JavaScript's rules, and JavaScript
  requires `new` for a class.
- **Method chaining works unchanged.** `add` returns `this`, and so does the converted
  method. Under `TjsStrict` a call in the chain can return an error instead, which changes
  this; see below.

## Calling a class without `new`

`TjsStrict` makes the file native TJS, and in native TJS a class is _called_:
`Calculator()` does exactly what `new Calculator()` does and returns the same object.
`new` on a class declared in the same file is a compile error, in a `.tjs` file and in a
`.ts` file marked `TjsStrict`:

```text
`new Calculator` is not allowed in TJS — a class is CALLED, so `Calculator(…)` does
exactly what `new Calculator(…)` does and returns the same object. Drop the keyword.
```

The reverse also fails: without `TjsStrict`, `Calculator()` throws JavaScript's own
`TypeError: Cannot call a class constructor Calculator without |new|`. So turning on
`TjsStrict` and removing the `new`s is one change, not two.

Why drop it? Because once the two spellings do the same thing, `new` carries no
information, and keeping both would mean two ways to write one operation. Without it, a
class is an ordinary function as far as its callers know: you can pass it where a factory is
expected (`names.map(Tag)` builds one `Tag` per name) and swap a class for a factory
function, or back, without editing every call site. TJS only does this for the `class`
keyword, where a call without `new` had no meaning in JavaScript (it throws). Built-ins such
as `Boolean` and `Number`, and old-style constructor functions, mean something different when
called, so they are left alone. [Classes in the TJS guide](../../../DOCS-TJS.md) has the
full rule.

The rule also covers a class constructing itself in its own static initializer:
`static zero = Calculator()` inside `class Calculator` works, and `Calculator.zero` is a
`Calculator`.

## The same class, with `TjsStrict`

```ts:inline
/* @tjs TjsStrict */

// In a real module: import { isMonadicError } from 'tjs-lang/runtime'
declare function isMonadicError(value: unknown): value is Error

class Calculator {
  private value: number = 0

  add(n: number) {
    this.value += n
    return this
  }

  getResult(): number {
    return this.value
  }
}

// A class is called, not constructed
// @ts-expect-error: a TJS class is called
const calc: Calculator = Calculator()
console.log('2 + 3 =', calc.add(2).add(3).getResult())

// A wrong argument is refused when the method is called
const bad: Calculator | Error = calc.add('5' as any)
if (isMonadicError(bad)) {
  console.log('add("5") is an error:', bad.message)
}
console.log('value is unchanged:', calc.getResult())

// A chain stops being safe: the second call is made on the error
try {
  calc.add('5' as any).add(1)
} catch (e) {
  console.log('chain:', (e as Error).name)
}

// `private` is now a real JavaScript private field
console.log('value from outside:', (calc as any).value, calc['value'])
console.log('instanceof still works:', calc instanceof Calculator)
```

It prints:

```text
2 + 3 = 5
add("5") is an error: Expected number for '<source>:5:Calculator.add.n', got string
value is unchanged: 5
chain: TypeError
value from outside: undefined undefined
instanceof still works: true
```

- **`add('5' as any)` returns an error instead of running.** The `as any` gets past `tsc`;
  it does not get past the check. The method body never runs, so `value` stays `5`. The
  call returns a `MonadicError`, TJS's error class: a subclass of `Error` that is returned,
  not thrown. Returning it means there is no exception to unwind: the program keeps going
  and the caller decides what to do. The message gives the expected type, where the check
  is (`Calculator.add.n`, the parameter `n` of `add`), and the type received.
- **Check for it with `isMonadicError`.** It comes from `tjs-lang/runtime` and matches only
  TJS errors; `instanceof Error` is also true of any ordinary `Error`. The example declares
  it rather than importing it only because it runs on this page, where the TJS output
  already defines it. [Runtime Validation](ts-runtime-validation.md) covers the error and
  its fields in more detail.
- **A chain is no longer safe.** `calc.add('5').add(1)` throws a `TypeError`: the first
  call returns the error, and a `MonadicError` has no `add` method. Once any call in a chain
  can receive bad data, check each result before calling on it.
- **`private value` became `#value`.** The converted field is declared `#value = 0`, a real
  JavaScript private field. Code outside the class reads `undefined`, whether it goes through
  `as any` or bracket access (`calc['value']`), the two ways TypeScript lets you reach a
  `private` member.
- **`getResult(): number` is a type, not a test.** The converter writes it as
  `getResult():! number`. In TJS a plain `:` return annotation is a worked example that is
  run as a test, and a TypeScript return type is not an example of anything, so the
  converter uses `:!`, the type-only form, and nothing is checked on the way out. Parameters
  are checked because they are where outside data enters. See
  [Multiple Functions](ts-multiple-functions.md) for what return annotations do in TJS.

## What `tsc` makes of a `TjsStrict` file

The comment is invisible to `tsc`, but calling a class is not. `tsc` reports
`Value of type 'typeof Calculator' is not callable` on `Calculator()`, and then types
`calc` as `any`, so it checks nothing that uses it. TJS has no language server to take
over, so if you still run `tsc` (or rely on your editor's TypeScript support), mark each
call and give the result its type:

```javascript
// @ts-expect-error: a TJS class is called
const calc: Calculator = Calculator()
```

That is what the examples on this page do, and with it `tsc` accepts them.

The second gap is return types. `add` is declared to return `this`, but under `TjsStrict`
it can also return a `MonadicError`, and `tsc` cannot know that. Where a call may receive
outside data, type the result as a union, as the example does with
`const bad: Calculator | Error`. `tsc` then makes you check it before using it as a
`Calculator`.

## Subclasses, `instanceof`, getters and setters

A converted class is still a JavaScript class. Apart from being called without `new`,
`extends`, `super`, `instanceof`, getters, setters and `static` members work as they do
after `tsc`.

```ts:inline
/* @tjs TjsStrict */

// In a real module: import { isMonadicError } from 'tjs-lang/runtime'
declare function isMonadicError(value: unknown): value is Error

class Shape {
  constructor(public name: string) {}

  area(): number {
    return 0
  }

  describe(): string {
    return `${this.name}: ${this.area().toFixed(2)}`
  }
}

class Circle extends Shape {
  private r: number

  constructor(radius: number) {
    super('circle')
    this.r = radius
  }

  get radius(): number {
    return this.r
  }

  set radius(value: number) {
    this.r = value
  }

  static get sides(): number {
    return 0
  }

  area(): number {
    return Math.PI * this.r ** 2
  }
}

// @ts-expect-error: a TJS class is called
const c: Circle = Circle(2)
console.log(c.describe())
console.log('instanceof Circle:', c instanceof Circle)
console.log('instanceof Shape:', c instanceof Shape)
console.log('static getter:', Circle.sides)

// The constructor's parameters are checked like a method's
// @ts-expect-error: a TJS class is called
const bad: Circle | Error = Circle('big' as any)
if (isMonadicError(bad)) {
  console.log('Circle("big") is an error:', bad.message)
}

// A setter is not checked: the bad write goes through
c.radius = 'x' as any
console.log('radius after a bad write:', c.radius)
console.log(c.describe())
```

It prints:

```text
circle: 12.57
instanceof Circle: true
instanceof Shape: true
static getter: 0
Circle("big") is an error: Expected number for '<source>:17:Circle.constructor.radius', got string
radius after a bad write: x
circle: NaN
```

- **`instanceof` is unchanged.** `Circle(2)` returns a real `Circle`, so it is an instance
  of `Circle` and of `Shape`. The same holds with or without `TjsStrict`.
- **`private` in a subclass becomes a `#` field too.** `private r` is converted to `#r`.
- **Parameter properties are expanded.** `constructor(public name: string)` becomes a
  constructor that assigns `this.name = name`, and `name` is checked like any other
  parameter.
- **A bad constructor argument returns an error, not an instance.** `Circle('big')` gives
  back a `MonadicError`. Code that assumes it got a `Circle` will fail at the next method
  call, so check it at the point of construction.
- **Setters are not checked.** If TJS checked a setter, a bad value would have to produce an
  error, and the only way a setter can hand one back is its return value, which JavaScript
  ignores. The error would vanish and the caller would never learn the write had failed. So
  TJS does not check setters at all: `c.radius = 'x'` stores `'x'`, and the next
  `describe()` prints `circle: NaN`. If a property must be validated, expose a method
  (`setRadius(value: number)`) instead.
- **Getters, setters and `static` convert as written.** `get`, `set` and `static` (including
  `static get`) are kept as they are. A getter's return type is kept but not checked, like
  a setter's parameter.

## Classes from other files

The no-`new` rule is about classes declared in your own file. For a class you import:

- **From another TJS file** (a `.tjs` file, or a `.ts` file converted with `TjsStrict`), both
  forms work. The class was made callable where it was declared, so `Point(1)` and
  `new Point(1)` give the same instance.
- **From JavaScript, TypeScript without `TjsStrict`, a library, or the platform**, keep
  `new`: `new Map()`, `new Float32Array(4)`, `new Date()`. Those classes were never made
  callable.

When you are ready to leave TypeScript for a file, graduating it (the `graduate` function in
`tjs-lang/lang`, which turns a converted file into native TJS) removes the conversion
annotation and drops the `new` from classes declared in that file for you; see
[Converting a TypeScript Project](../../sections/ts-converting-a-project.md).
