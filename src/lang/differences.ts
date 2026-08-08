/**
 * The differences between JavaScript, TypeScript and TJS — as DATA, not prose.
 *
 * This file is the single source of truth for `docs/tjs-vs-typescript.md`, which is
 * generated from it, and for `differences.test.ts`, which **executes every row against
 * all three languages** and fails if the documented outcome is not the observed one.
 *
 * It exists because prose comparisons rot silently, and this project has measured how
 * fast: in one review cycle the docs described an arrow return syntax that was never
 * implemented, a `predicate =>` form that parsed and validated nothing, `.d.ts` "type
 * guard stubs" that were never emitted, TS annotations in `TJS-FOR-TS.md` that resolved
 * to `any`, a CodeMirror completion suggesting a form the compiler rejects, and a
 * playground doc teaching nine abolished directives. Six false claims, none caught by
 * reading — every one of them found by running something.
 *
 * So no claim goes in this table without a snippet that proves it, and the snippet is
 * run by the test rather than trusted. A row that cannot be executed does not belong.
 *
 * ADDING A ROW: write the snippet, state what each language does, run the test. If the
 * test disagrees with you, the test is reporting the language as it is — which is the
 * entire point of keeping the comparison executable.
 */

/** What a language does with a snippet. */
export type Outcome =
  /** Compiles/parses and runs. `value` is the observed result, when the row checks one. */
  | { accepts: true; value?: string }
  /** Rejected at compile time. */
  | { accepts: false }

export interface Difference {
  /** Stable slug, used as the doc anchor. */
  id: string
  /** Short heading — the thing being compared. */
  topic: string
  /**
   * The snippet, written so it is valid input for every language that has an outcome
   * below. TJS-only syntax means `ts` must be omitted (there is nothing to compare).
   */
  snippet: string
  /** Same snippet under `tsc --strict`. Omit when the snippet is not valid TS input. */
  ts?: Outcome
  /**
   * The snippet as TJS, when it must differ. TS-only syntax (`declare`, type
   * annotations that are not examples) is not valid TJS input, so a row comparing
   * behaviour sometimes needs the same PROGRAM written in each language rather than the
   * same TEXT. Omit when the shared snippet works for both.
   */
  tjsSnippet?: string
  /** Same snippet (or `tjsSnippet`) under TJS. */
  tjs: Outcome
  /** One line. Why the difference exists — not what it is. */
  why: string
  /**
   * `shipped` (default) — the row describes what the language DOES, and the test
   * asserts it.
   *
   * `proposed` — the row describes what the language SHOULD do. The test asserts it
   * does NOT yet, so a proposed row is red by design and turns green only when someone
   * builds it — at which point the test says to promote it. That inversion is the point:
   * the gap between DECIDED and BUILT is otherwise invisible, which is exactly how
   * `predicate =>` spent weeks parsing cleanly and validating nothing. A proposal with
   * no representation cannot be tracked, and a proposal that silently half-works is
   * worse than one that fails.
   */
  status?: 'shipped' | 'proposed'
}

export const DIFFERENCES: Difference[] = [
  {
    id: 'dom-coercion',
    topic: 'Assigning a number to a DOM string property',
    snippet: `declare const input: HTMLInputElement\ninput.value = 42`,
    // The same PROGRAM, in TJS: a property whose setter coerces, which is exactly what
    // the DOM does and what `lib.dom.d.ts` declines to say.
    tjsSnippet: `class Input {
  constructor() { this._v = "" }
  get value() { return this._v }
  set value(x) { this._v = String(x) }
}
const input = unsafe new Input()
input.value = 42
console.log(input.value)`,
    ts: { accepts: false },
    tjs: { accepts: true, value: '42' },
    why: 'The DOM spec coerces to a string on assignment. TypeScript models `value` as a plain `string` property, so it rejects code the platform is specified to accept.',
  },
  {
    id: 'typeof-null',
    topic: '`typeof null`',
    snippet: `console.log(typeof null)`,
    ts: { accepts: true, value: 'object' },
    tjs: { accepts: true, value: 'null' },
    why: 'A 1995 bug JavaScript cannot fix without breaking the web. TypeScript inherits it; TJS reports what the value actually is.',
  },
  {
    id: 'equality-coercion',
    topic: '`==` between a string and a number',
    snippet: `console.log('5' == 5)`,
    ts: { accepts: false },
    tjs: { accepts: true, value: 'false' },
    why: 'TypeScript CATCHES this one — TS2367, "no overlap" — whenever it can see both types statically. TJS makes it `false` at runtime instead, which also covers the case where TypeScript cannot see them (next row).',
  },
  {
    id: 'equality-erased',
    topic: '`==` when the type is not statically known',
    // Deliberately `JSON.parse` rather than an `any` annotation: this is where erased
    // types actually bite, and both languages accept the same text.
    snippet: `const a = JSON.parse('"5"')\nconsole.log(a == 5)`,
    ts: { accepts: true, value: 'true' },
    tjs: { accepts: true, value: 'false' },
    why: 'The honest version of the previous row. Once a value is `any` — which is what arrives from JSON, the DOM or a network — TypeScript has nothing to compare and the coercion is back. TJS never coerces, because the check happens where the value is.',
  },
  {
    id: 'var',
    topic: '`var`',
    snippet: `var x = 1\nconsole.log(x)`,
    ts: { accepts: true, value: '1' },
    tjs: { accepts: false },
    why: 'Function-scoped hoisting is a hazard with no remaining use. `unsafe var x = 1` keeps it at a single site when a port needs it.',
  },
  {
    id: 'raw-date',
    topic: '`new Date()`',
    snippet: `const d = new Date(0)\nconsole.log(d.getTime())`,
    ts: { accepts: true, value: '0' },
    tjs: { accepts: false },
    why: '`Date` is mutable and timezone-dependent. `Timestamp` is epoch milliseconds and pure; `unsafe new Date(x)` is the per-site escape.',
  },
  {
    id: 'integer-types',
    topic: 'Distinguishing an integer from a float',
    snippet: `function f(n: int) { return n }\nconsole.log(String(f(2.5)).slice(0, 22))`,
    tjs: { accepts: true, value: 'MonadicError: Expected' },
    why: 'TypeScript has one numeric type, so "this is a count/index/id" is inexpressible and ends up policed by comments. `int`, `unsigned` and `float` name the distinction.',
  },
  {
    id: 'runtime-validation',
    topic: 'A type that survives to runtime',
    snippet: `function greet(name: '') { return 'hi ' + name }\nconsole.log(String(greet(42)).slice(0, 22))`,
    tjs: { accepts: true, value: 'MonadicError: Expected' },
    why: 'TypeScript erases annotations before the program runs, so a value arriving from JSON, the DOM or a network is unchecked. TJS checks at the boundary and returns a `MonadicError` rather than throwing.',
  },
  {
    id: 'signature-test',
    topic: 'The annotation IS a test',
    snippet: `function add(a: 2, b: 3): 5 { return a + b }\nconsole.log('ok')`,
    tjs: { accepts: true, value: 'ok' },
    why: 'A return example is a worked example, compared by deep equality at build time. `add(2, 3)` must be 5 — change the body to `a - b` and the build fails, with no test file and no runner.',
  },
  {
    id: 'signature-test-fails',
    topic: 'A wrong worked example fails the build',
    snippet: `function add(a: 2, b: 3): 6 { return a + b }`,
    tjs: { accepts: false },
    why: 'The other half of the previous row: the example is checked, not decoration. TypeScript has no equivalent — a return type cannot be wrong about a value.',
  },
  {
    id: 'open-key-types',
    topic: 'Property names that declare their own types',
    snippet: `Type Prefixed {
  example: {}
  predicate(o) {
    return Object.entries(o).every(([k, v]) =>
      k.startsWith('is') ? typeof v === 'boolean' : true
    )
  }
}
function render(p: Prefixed) { return 1 }
console.log(String(render({ isOpen: 'yes' })).slice(0, 22))`,
    tjs: { accepts: true, value: 'MonadicError: Expected' },
    why: 'An index signature forces one type across all keys and a mapped type needs them enumerated in advance, so TypeScript cannot express a convention over an OPEN key set. A predicate reads the name and decides.',
  },
  // ---------------------------------------------------------------------------------
  // PROPOSED — decided, not built. Red by design; green means "promote to shipped".
  // ---------------------------------------------------------------------------------
  {
    id: 'predicate-arrow',
    topic: 'Terse predicate: `predicate => expr`',
    snippet: `Type Even {
  example: 2
  predicate => Even % 2 === 0
}
console.log(Even.check(4), Even.check(3))`,
    tjs: { accepts: true, value: 'true false' },
    why: 'Mirrors an arrow function body: `=>` implies the return, and the type name binds to the value under test. It used to parse and accept every value, then was rejected outright rather than ignored; now it is normalised into the function form, so it inherits predicate verification and fuel bounding rather than re-implementing them.',
  },
  {
    id: 'predicate-block',
    topic: 'Block predicate: `predicate { return expr }`',
    snippet: `Type Even {
  example: 2
  predicate { return Even % 2 === 0 }
}
console.log(Even.check(4), Even.check(3))`,
    tjs: { accepts: true, value: 'true false' },
    why: 'The multi-line half of the same rule — a `{ }` body requires `return`, exactly as in JavaScript. Nothing new to learn, which is the argument for this spelling over an implicit last expression.',
  },
  {
    id: 'generic-implicit-predicate',
    topic: 'A parameterized type needs no predicate to check its parameter',
    snippet: `Type Box<T> {
  example: { value: T }
}
console.log(Box(0).check({ value: 7 }), Box(0).check({ value: 's' }))`,
    tjs: { accepts: true, value: 'true false' },
    why: 'The example already says WHERE the parameter goes, so `T` applied at that slot is derivable and writing `predicate(x, T) { return T(x.value) }` restates it. Until this was built, omitting the predicate emitted `Generic([...], () => true)` — a parameterized type that accepted every value while looking like it checked one.',
  },
  {
    id: 'generic-type-arguments',
    status: 'proposed',
    topic: 'Type arguments in an annotation: `b: Box<int>`',
    snippet: `Type Box<T> {
  predicate(x, T) { return T(x.value) }
}
function unbox(b: Box<int>) { return b.value }
console.log(String(unbox({ value: 1.5 })).slice(0, 22))`,
    tjs: { accepts: true, value: 'MonadicError: Expected' },
    why: 'The semantics are DONE: the stub no longer compares with `typeof`, and a primitive kind has a predicate representation (`typeArgumentSource`), which composes — `Box<Box<int>>` works, proven in `type-argument.test.ts`. What remains is purely mechanical: the annotation rewrite changes source length, and a later boolean-coercion pass holds offsets computed before it, so `Box<int>` currently corrupts the emitted source. Blocked on WHERE the rewrite runs, not on syntax or semantics.',
  },
  {
    id: 'overload-dispatch',
    topic: 'Two functions with the same name',
    snippet: `function area(w: number) { return w * w }
function area(w: number, h: number) { return w * h }
console.log(area(3), area(3, 4))`,
    tjsSnippet: `function area(w: 0.0) { return w * w }
function area(w: 0.0, h: 0.0) { return w * h }
console.log(area(3.0), area(3.0, 4.0))`,
    ts: { accepts: false },
    tjs: { accepts: true, value: '9 12' },
    why: 'TypeScript HAS overloads, but they are signature declarations over ONE implementation — TS2393 for a second body — and they are erased entirely, so you write the dispatch by hand. TJS merges same-name declarations into a real arity/type dispatcher, so each case is its own function.',
  },
  {
    id: 'explicit-new',
    topic: '`new` on a user class',
    snippet: `class P { constructor(x: 0) { this.x = x } }
const p = new P(1)`,
    tjs: { accepts: false },
    why: '`P(1)` and `new P(2)` produce identical objects — a TJS class is CALLED — so `new` was decoration with the look of significance. Scoped to classes declared in the file: for a built-in `new` is MANDATORY (`new Float32Array(4)` throws without it), a limit found by shipping the general rule and watching eight examples break within a minute.',
  },
  {
    id: 'call-without-new',
    topic: 'Calling a class without `new`',
    snippet: `class P { constructor(x: 0) { this.x = x } }
const p = P(1)
console.log(p.x)`,
    tjs: { accepts: true, value: '1' },
    why: 'A TJS class is called, not constructed — `new` adds nothing. In JavaScript (and TypeScript) calling a class without `new` is a TypeError, so the ceremony is mandatory even though it carries no information.',
  },
]
