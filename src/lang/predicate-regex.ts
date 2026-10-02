/**
 * Regex literals in a compiled predicate run on the VM's linear engine, not the host's.
 *
 * `compilePredicate` turns a verified cluster into native JavaScript, and a native regex literal
 * runs on the host's backtracking engine, which no fuel can interrupt: `/a*a*c/.test(s)` took
 * seconds on a few thousand characters, inside a `$predicate` that travels as DATA (rc.2 eighth
 * re-review M5). So each regex literal in the source is lowered to `__rx(k)`, which returns a
 * fresh object (a literal evaluates to a new RegExp each time, with its own `lastIndex`) backed
 * by a program compiled once by `src/vm/regex.ts`.
 *
 * The object speaks JavaScript's RegExp protocol — `test`, `exec`, `lastIndex`, and the
 * well-known symbols `Symbol.match` / `replace` / `search` / `split` / `matchAll` — so native
 * `s.match(re)`, `s.replace(re, …)`, `s.split(re)` dispatch into the linear engine unchanged.
 * Every unit of engine work, and every byte a method builds, is charged to the predicate's fuel.
 */
import { execRegex, type GuestRegex, type RegexMatch } from '../vm/regex'
import * as stringMethods from '../vm/string-methods'

/** Predicate fuel per unit of regex work. A unit of predicate fuel is one function entry, a few
 * tens of nanoseconds; a regex step is a few nanoseconds. */
export const PREDICATE_FUEL_PER_REGEX_STEP = 0.01

type Meters = stringMethods.Meters

/** The JavaScript match array for a hit. */
function matchArray(hit: RegexMatch, s: string): any {
  const text = (c: [number, number] | undefined) =>
    c ? s.slice(c[0], c[1]) : undefined
  const out: any = hit.captures.map(text)
  out.index = hit.index
  out.input = s
  out.groups = hit.names.size
    ? Object.assign(
        Object.create(null),
        Object.fromEntries(
          [...hit.names].map(([name, g]) => [name, text(hit.captures[g])])
        )
      )
    : undefined
  return out
}

/** Every match from 0, as a global method finds them (past an empty match by one). */
function* hits(re: GuestRegex, s: string, m: Meters): Generator<RegexMatch> {
  for (let from = 0; from <= s.length; ) {
    const hit = execRegex(re, s, from, m.steps)
    if (!hit) return
    yield hit
    if (!re.global) return
    from = hit.end > hit.index ? hit.end : hit.end + 1
  }
}

/**
 * A RegExp-protocol object over a compiled VM regex, charging `m` for its work. A class, so the
 * per-evaluation cost of a literal is one small object, not a dozen closures.
 */
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
  exec(input: unknown) {
    const s = String(input)
    const stateful = this.re.global || this.re.sticky
    const from = stateful ? Math.max(0, Math.trunc(this.lastIndex) || 0) : 0
    if (from > s.length) {
      if (stateful) this.lastIndex = 0
      return null
    }
    const hit = execRegex(this.re, s, from, this.m.steps)
    if (!hit) {
      if (stateful) this.lastIndex = 0
      return null
    }
    if (stateful) this.lastIndex = hit.end
    this.m.alloc((hit.end - hit.index) * 2 + 64)
    return matchArray(hit, s)
  }
  test(input: unknown) {
    const s = String(input)
    if (this.re.global || this.re.sticky) return this.exec(s) !== null
    return execRegex(this.re, s, 0, this.m.steps) !== null
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
    return stringMethods.search(String(input), this.re, this.m)
  }
  [Symbol.split](input: unknown, limit?: number) {
    return stringMethods.split(String(input), this.re, limit, this.m)
  }
  [Symbol.replace](input: unknown, replacement: unknown) {
    const s = String(input)
    if (this.re.global) this.lastIndex = 0
    if (typeof replacement !== 'function')
      return stringMethods.replace(s, this.re, String(replacement), this.m)
    // a function replacer: called per match, in order, as JavaScript calls it
    let out = ''
    let last = 0
    for (const hit of [...hits(this.re, s, this.m)]) {
      const a = matchArray(hit, s)
      const args = [...a, hit.index, s]
      if (a.groups) args.push(a.groups)
      const piece = String(replacement(...args))
      this.m.alloc((hit.index - last + piece.length) * 2)
      out += s.slice(last, hit.index) + piece
      last = hit.end
    }
    this.m.alloc((s.length - last) * 2)
    return out + s.slice(last)
  }
  *[Symbol.matchAll](input: unknown) {
    const s = String(input)
    for (const hit of hits(this.re, s, this.m)) {
      this.m.alloc((hit.end - hit.index) * 2 + 64)
      yield matchArray(hit, s)
    }
  }
}

/** A RegExp-protocol object over a compiled VM regex, charging `m` for its work. */
export const hostRegex = (re: GuestRegex, m: Meters): object =>
  new HostRegex(re, m)
