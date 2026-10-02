/**
 * Regex literals in a compiled predicate run on the VM's linear engine, not the host's.
 *
 * `compilePredicate` turns a verified cluster into native JavaScript, and a native regex literal
 * runs on the host's backtracking engine, whose work no fuel can see: `/a*a*c/.test(s)` took
 * seconds on a few thousand characters, inside a `$predicate` that travels as DATA (rc.2 eighth
 * re-review M5). So each regex literal is lowered to a call that returns a fresh object (a
 * literal evaluates to a new RegExp each time, with its own `lastIndex`) over a program compiled
 * once by `src/vm/regex.ts`.
 *
 * The object speaks JavaScript's RegExp protocol — `test`, `exec`, `lastIndex` (global and sticky
 * semantics), and `Symbol.match` / `replace` / `search` / `split` / `matchAll` — so native
 * `s.match(re)` and friends dispatch into the linear engine. It keeps NO matching logic of its
 * own: every loop, match array and replacement comes from `src/vm/string-methods.ts`, which the
 * VM uses too. (It used to carry a second copy of the global-match loop, and that copy advanced
 * one code unit past an empty `u` match and looped — rc.2 ninth re-review M1, m4.) Every unit of
 * work, and every byte built, is charged to the predicate's fuel.
 */
import { type GuestRegex } from '../vm/regex'
import {
  allMatches,
  matchArray,
  prepare,
  replaceHits,
  type Meters,
} from '../vm/string-methods'
import * as stringMethods from '../vm/string-methods'

/** Predicate fuel per unit of regex work. A unit of predicate fuel is one function entry, a few
 * tens of nanoseconds; a regex step is a few nanoseconds. */
export const PREDICATE_FUEL_PER_REGEX_STEP = 0.01

/** A RegExp-protocol object over a compiled VM regex, charging `m` for its work. A class, so the
 * per-evaluation cost of a literal is one small object, not a dozen closures. */
class HostRegex {
  lastIndex = 0
  readonly hasIndices = false
  constructor(private readonly re: GuestRegex, private readonly m: Meters) {}
  get source() {
    return this.re.source
  }
  get flags() {
    return this.re.flags
  }
  get global() {
    return this.re.global
  }
  get ignoreCase() {
    return this.re.ignoreCase
  }
  get multiline() {
    return this.re.multiline
  }
  get sticky() {
    return this.re.sticky
  }
  get unicode() {
    return this.re.unicode
  }
  get dotAll() {
    return this.re.dotAll
  }
  /** RegExpBuiltinExec: global or sticky regexes start at, and update, `lastIndex`. */
  private execRaw(s: string) {
    const stateful = this.re.global || this.re.sticky
    const from = stateful ? Math.max(0, Math.trunc(this.lastIndex) || 0) : 0
    if (from > s.length) {
      if (stateful) this.lastIndex = 0
      return null
    }
    const hit = prepare(this.re, this.m).exec(s, from)
    if (stateful) this.lastIndex = hit ? hit.end : 0
    return hit
  }
  exec(input: unknown) {
    const s = String(input)
    const hit = this.execRaw(s)
    return hit ? matchArray(hit, s, this.m) : null
  }
  test(input: unknown) {
    return this.execRaw(String(input)) !== null
  }
  toString() {
    return `/${this.re.source}/${this.re.flags}`
  }
  [Symbol.match](input: unknown) {
    if (!this.re.global) return this.exec(input)
    this.lastIndex = 0
    return stringMethods.match(String(input), this.re, this.m)
  }
  [Symbol.search](input: unknown) {
    // as JavaScript does: search from 0, and leave lastIndex as it was
    return stringMethods.search(String(input), this.re, this.m)
  }
  [Symbol.split](input: unknown, limit?: number) {
    return stringMethods.split(String(input), this.re, limit, this.m)
  }
  [Symbol.replace](input: unknown, replacement: unknown) {
    const s = String(input)
    const repl =
      typeof replacement === 'function'
        ? (replacement as (...a: any[]) => unknown)
        : String(replacement)
    let hits
    if (this.re.global) {
      this.lastIndex = 0
      hits = allMatches(prepare(this.re, this.m), s, this.m)
    } else {
      const hit = this.execRaw(s)
      hits = hit ? [hit] : []
    }
    return replaceHits(s, hits, repl, this.m)
  }
  *[Symbol.matchAll](input: unknown) {
    if (!this.re.global)
      throw new TypeError('matchAll must be called with a global RegExp')
    const s = String(input)
    for (const hit of allMatches(prepare(this.re, this.m), s, this.m))
      yield matchArray(hit, s, this.m)
  }
}

/** A RegExp-protocol object over a compiled VM regex, charging `m` for its work. */
export const hostRegex = (re: GuestRegex, m: Meters): object =>
  new HostRegex(re, m)
