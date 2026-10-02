/**
 * The VM's own regular-expression engine: a Pike VM, linear in input × pattern, every unit of
 * whose work is metered.
 *
 * Guest regexes never run on the host's engine. JavaScript's RegExp backtracks, and backtracking
 * is opaque to the fuel counter: a synchronous `match` cannot be interrupted, and patterns like
 * `/(a+)+$/` (exponential) or `/a*a*c/` (polynomial) run for seconds to hours on short inputs. A
 * screen can only refuse the shapes it recognises — the rc.2 reviews found both kinds past it
 * (docs/reviews/0.14.0-rc.2-rereview-6.md B4, -7.md B8). This engine removes the class instead:
 * threads advance in lockstep, one input position at a time, and are deduplicated per position,
 * so a match costs O(input × program) whatever the pattern, and every step is charged as fuel.
 *
 * Supported: literals and escapes (`\d \w \s` and negations, `\t \n \r \v \f \0`, `\xHH`,
 * `\uHHHH`, `\u{…}` with `u`), classes with ranges and negation, `.`, `^ $` (multiline with `m`),
 * `\b \B`, groups (capturing, non-capturing `(?:)`, named `(?<n>)`), alternation, and the
 * quantifiers `* + ? {n} {n,} {n,m}`, greedy and lazy. Flags: `g i m s u y`.
 *
 * Refused (a TranspileError-free, clear refusal at compile time): backreferences, lookahead and
 * lookbehind, `\p{…}`, and the `d`/`v` flags — the features that need backtracking or tables this
 * engine does not carry. Matching follows JavaScript's leftmost, priority-ordered semantics, held
 * to the native engine by a differential test (`regex.test.ts`).
 *
 * Indices are UTF-16 code units, as JavaScript's are; with the `u` flag a character class or `.`
 * consumes a whole surrogate pair.
 *
 * METERED BY CONSTRUCTION (rc.2 eighth re-review B1–B3, M3). Linear is not bounded unless the
 * work is CHARGED. The first version charged one step per thread per position; the work it did
 * not see — following zero-width instructions, copying capture arrays, testing a class of 400k
 * single characters, expanding `(?:){1e12}` at compile time, re-allocating per call — ran for
 * seconds on a few fuel. Now every instruction visited, every capture copy (in proportion to its
 * width), every class probe (a binary search over merged ranges), every compiled instruction and
 * every quantifier iteration (empty or not) goes through `charge`, and every size that grows with
 * the pattern is capped: counts, nesting depth, program size, compile work, capture slots. The
 * caller charges the worst-case thread memory once per operation (`threadBytes`).
 */

import { FOLDS_I, FOLDS_IU } from './regex-folds'

/** A program may not exceed this many instructions (`a{1000}{1000}` would be a million). */
export const MAX_REGEX_PROGRAM = 20_000
/** `{n}` / `{n,m}` above this is refused. JavaScript allows 2^53; a count is compile work even
 * when the body is empty and emits nothing (`(?:){1e12}` — B2). */
export const MAX_REGEX_COUNT = 10_000
/** Groups nested deeper than this are refused (the parser and compiler recurse). */
export const MAX_REGEX_DEPTH = 200
/** Compile work (instructions emitted plus quantifier iterations) for ONE regex above this is
 * refused (~20ms). Across a source, `RegexCompiler` adds a budget proportional to its length. */
export const MAX_REGEX_COMPILE_WORK = 1_000_000
/** Capture slots plus empty-check registers per thread. */
export const MAX_REGEX_SLOTS = 512
/** Closure states (see `stateBase`) a program may have: Σ over instructions of 2^(optional
 * quantifiers enclosing it). Bounds the dedup table and the closure's work at one position. */
export const MAX_REGEX_STATES = 200_000
/** Fuel per unit of engine work: an instruction visited, a class probe, 8 capture slots copied. */
export const REGEX_FUEL_PER_STEP = 0.00002

export class RegexError extends Error {}

/** Where the engine's work is charged. Throws to stop the engine. */
export type Charge = (steps: number) => void
const noCharge: Charge = () => {}

// ---------------------------------------------------------------- characters

type Range = [number, number]
const MAX_CP = 0x10ffff

const isWordChar = (c: number) =>
  (c >= 48 && c <= 57) ||
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  c === 95
const isDigit = (c: number) => c >= 48 && c <= 57
const isLeadSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff
const isTrailSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff
const isLineTerminator = (c: number) =>
  c === 10 || c === 13 || c === 0x2028 || c === 0x2029

const DIGIT: Range[] = [[48, 57]]
const WORD: Range[] = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122],
]
/** WordCharacters with `i` and `u`: the characters that CANONICALIZE into WORD join it. */
const WORD_IU: Range[] = [...WORD, [0x17f, 0x17f], [0x212a, 0x212a]]
const isWordCharIU = (c: number) => isWordChar(c) || c === 0x17f || c === 0x212a
/** JavaScript's WhiteSpace and LineTerminator, which `\s` matches. */
const SPACE: Range[] = [
  [9, 13],
  [32, 32],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
]
const LINE_TERMINATORS: Range[] = [
  [10, 10],
  [13, 13],
  [0x2028, 0x2029],
]

function complement(ranges: Range[]): Range[] {
  const out: Range[] = []
  let next = 0
  for (const [lo, hi] of normalize(ranges)) {
    if (lo > next) out.push([next, lo - 1])
    next = Math.max(next, hi + 1)
  }
  if (next <= MAX_CP) out.push([next, MAX_CP])
  return out
}

/** Sorted and merged, so a class of 400k `a`s is ONE range (B3). */
function normalize(ranges: Range[]): Range[] {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0])
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** Decode a generated fold table (`regex-folds.ts`; encoded by `scripts/build-regex-folds.ts`). */
export const decodeFolds = (text: string): number[][] => {
  let prev = 0
  return text.split(';').map((cls) => {
    const ds = cls.split(',').map((d) => parseInt(d, 36))
    const out = [prev + ds[0]]
    for (let i = 1; i < ds.length; i++) out.push(out[i - 1] + ds[i])
    prev = out[0]
    return out
  })
}

/**
 * JavaScript's Canonicalize for `i`, as equivalence classes: each character maps to every
 * character it matches case-insensitively. Derived from the host engine at build time rather than
 * approximated (hand-written rules missed ǅ ~ Ǆ, ᲀ ~ в, ΐ ~ ΐ and dotless ı). Built on first use.
 */
const foldTables: Array<Map<number, number[]> | undefined> = []
function foldsOf(unicode: boolean): Map<number, number[]> {
  const k = unicode ? 1 : 0
  let table = foldTables[k]
  if (!table) {
    table = new Map()
    for (const cls of decodeFolds(unicode ? FOLDS_IU : FOLDS_I))
      for (const x of cls) table.set(x, cls)
    foldTables[k] = table
  }
  return table
}

/** A character test, as data: merged ranges (binary-searched), maybe negated, maybe folded. */
interface CharClass {
  ranges: Range[]
  negate: boolean
  fold: boolean
  unicode: boolean
}

/** Class probes since the counter was last read. Module state, because the engine is synchronous
 * and never re-entered; returning a tuple per probe was the hot path's largest allocation. */
let classWork = 0

/** Binary search, counting its probes into `classWork`. */
function inRanges(ranges: Range[], c: number): boolean {
  let lo = 0
  let hi = ranges.length - 1
  classWork++
  while (lo <= hi) {
    classWork++
    const mid = (lo + hi) >> 1
    if (c < ranges[mid][0]) hi = mid - 1
    else if (c > ranges[mid][1]) lo = mid + 1
    else return true
  }
  return false
}

/** Does `c` belong to the class? Its work is counted into `classWork`. */
function classTest(k: CharClass, c: number): boolean {
  let hit = inRanges(k.ranges, c)
  if (!hit && k.fold) {
    const equivalents = foldsOf(k.unicode).get(c)
    if (equivalents)
      for (const e of equivalents) {
        classWork++
        if (e !== c && inRanges(k.ranges, e)) {
          hit = true
          break
        }
      }
  }
  return k.negate ? !hit : hit
}

// ---------------------------------------------------------------- parse

type Node =
  | { t: 'char'; cls: CharClass }
  | { t: 'seq'; items: Node[] }
  | { t: 'alt'; options: Node[] }
  | { t: 'group'; index: number | null; body: Node }
  | { t: 'rep'; body: Node; min: number; max: number; lazy: boolean }
  | { t: 'assert'; kind: '^' | '$' | 'b' | 'B' }

interface ParseState {
  src: string
  i: number
  depth: number
  groups: number
  names: Map<string, number>
  flags: Flags
}

interface Flags {
  global: boolean
  ignoreCase: boolean
  multiline: boolean
  dotAll: boolean
  unicode: boolean
  sticky: boolean
}

const charNode = (st: ParseState, ranges: Range[], negate = false): Node => ({
  t: 'char',
  cls: {
    ranges: normalize(ranges),
    negate,
    fold: st.flags.ignoreCase,
    unicode: st.flags.unicode,
  },
})

/** Bounded lookahead for the small regexes the parser applies (never a slice to the end). */
const ahead = (st: ParseState, from: number, n: number) =>
  st.src.slice(from, from + n)

function parse(
  src: string,
  flags: Flags
): { node: Node; groups: number; names: Map<string, number> } {
  const st: ParseState = {
    src,
    i: 0,
    depth: 0,
    groups: 0,
    names: new Map(),
    flags,
  }
  const node = parseAlt(st)
  if (st.i < src.length)
    throw new RegexError(`Unexpected '${src[st.i]}' in /${src}/`)
  return { node, groups: st.groups, names: st.names }
}

function parseAlt(st: ParseState): Node {
  if (++st.depth > MAX_REGEX_DEPTH)
    throw new RegexError(
      `Regex nested too deeply (over ${MAX_REGEX_DEPTH} levels)`
    )
  const options = [parseSeq(st)]
  while (st.src[st.i] === '|') {
    st.i++
    options.push(parseSeq(st))
  }
  st.depth--
  return options.length === 1 ? options[0] : { t: 'alt', options }
}

function parseSeq(st: ParseState): Node {
  const items: Node[] = []
  while (st.i < st.src.length && st.src[st.i] !== '|' && st.src[st.i] !== ')') {
    let atom = parseAtom(st)
    atom = parseQuantifier(st, atom)
    items.push(atom)
  }
  return items.length === 1 ? items[0] : { t: 'seq', items }
}

function parseQuantifier(st: ParseState, atom: Node): Node {
  const c = st.src[st.i]
  let min: number
  let max: number
  if (c === '*') [min, max] = [0, Infinity]
  else if (c === '+') [min, max] = [1, Infinity]
  else if (c === '?') [min, max] = [0, 1]
  else if (c === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(ahead(st, st.i, 64))
    if (!m) return atom // a literal '{', as JavaScript reads it without `u`
    min = Number(m[1])
    max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3])
    if (min > MAX_REGEX_COUNT || (max !== Infinity && max > MAX_REGEX_COUNT))
      throw new RegexError(
        `Regex count too large (over ${MAX_REGEX_COUNT}) in /${st.src}/`
      )
    if (max < min)
      throw new RegexError(`Numbers out of order in {} in /${st.src}/`)
    st.i += m[0].length - 1
  } else return atom
  if (atom.t === 'assert')
    throw new RegexError(`Nothing to repeat in /${st.src}/`)
  st.i++
  let lazy = false
  if (st.src[st.i] === '?') {
    lazy = true
    st.i++
  }
  return { t: 'rep', body: atom, min, max, lazy }
}

function parseAtom(st: ParseState): Node {
  const c = st.src[st.i]
  if (c === '(') return parseGroup(st)
  if (c === '[') return parseClass(st)
  if (c === '.') {
    st.i++
    return st.flags.dotAll
      ? charNode(st, [[0, MAX_CP]])
      : charNode(st, LINE_TERMINATORS, true)
  }
  if (c === '^' || c === '$') {
    st.i++
    return { t: 'assert', kind: c }
  }
  if (c === '\\') return parseEscape(st, false)
  if (
    c === '*' ||
    c === '+' ||
    c === '?' ||
    (c === '{' && /^\{\d+(,\d*)?\}/.test(ahead(st, st.i, 64)))
  )
    throw new RegexError(`Nothing to repeat in /${st.src}/`)
  if (c === ')' || (c === ']' && st.flags.unicode))
    throw new RegexError(`Unmatched '${c}' in /${st.src}/`)
  st.i++
  const cp = st.flags.unicode ? codePointAt(st, st.i - 1) : c.charCodeAt(0)
  return charNode(st, [[cp, cp]])
}

/** With `u`, a surrogate pair in the PATTERN is one character. */
function codePointAt(st: ParseState, at: number): number {
  const cp = st.src.codePointAt(at)!
  if (cp > 0xffff) st.i = at + 2
  return cp
}

function parseGroup(st: ParseState): Node {
  st.i++ // (
  let index: number | null = null
  if (st.src[st.i] === '?') {
    const next = st.src[st.i + 1]
    if (next === ':') st.i += 2
    else if (
      next === '<' &&
      st.src[st.i + 2] !== '=' &&
      st.src[st.i + 2] !== '!'
    ) {
      const m = /^\?<([A-Za-z_$][\w$]*)>/.exec(ahead(st, st.i, 260))
      if (!m) throw new RegexError(`Invalid group name in /${st.src}/`)
      index = ++st.groups
      if (st.names.has(m[1]))
        throw new RegexError(`Duplicate group name '${m[1]}'`)
      st.names.set(m[1], index)
      st.i += m[0].length
    } else
      throw new RegexError(
        `Lookahead and lookbehind are not supported in AsyncJS regexes (/${st.src}/)`
      )
  } else index = ++st.groups
  const body = parseAlt(st)
  if (st.src[st.i] !== ')')
    throw new RegexError(`Unterminated group in /${st.src}/`)
  st.i++
  return { t: 'group', index, body }
}

/** A class escape's ranges (`\d` …), or null if `c` is not one. */
function classEscape(c: string, flags: Flags): Range[] | null {
  const word = flags.ignoreCase && flags.unicode ? WORD_IU : WORD
  switch (c) {
    case 'd':
      return DIGIT
    case 'D':
      return complement(DIGIT)
    case 'w':
      return word
    case 'W':
      return complement(word)
    case 's':
      return SPACE
    case 'S':
      return complement(SPACE)
  }
  return null
}

/** A character escape's code point (`\n` …), consuming it; after the backslash. */
function charEscape(st: ParseState, inClass: boolean): number {
  const c = st.src[st.i]
  st.i++
  switch (c) {
    case 't':
      return 9
    case 'n':
      return 10
    case 'v':
      return 11
    case 'f':
      return 12
    case 'r':
      return 13
    case '0':
      if (isDigit(st.src.charCodeAt(st.i)))
        throw new RegexError(
          `Backreferences are not supported in AsyncJS regexes (/${st.src}/)`
        )
      return 0
    case 'b':
      if (inClass) return 8 // [\b] is backspace
      break
    case 'x': {
      const m = /^[0-9a-fA-F]{2}/.exec(ahead(st, st.i, 2))
      if (!m) return 'x'.charCodeAt(0)
      st.i += 2
      return parseInt(m[0], 16)
    }
    case 'u': {
      if (st.src[st.i] === '{' && st.flags.unicode) {
        const m = /^\{([0-9a-fA-F]{1,6})\}/.exec(ahead(st, st.i, 8))
        if (!m || parseInt(m[1], 16) > MAX_CP)
          throw new RegexError(`Invalid unicode escape in /${st.src}/`)
        st.i += m[0].length
        return parseInt(m[1], 16)
      }
      const m = /^[0-9a-fA-F]{4}/.exec(ahead(st, st.i, 4))
      if (!m) return 'u'.charCodeAt(0)
      st.i += 4
      return parseInt(m[0], 16)
    }
    case 'c': {
      const l = st.src.charCodeAt(st.i)
      if ((l >= 65 && l <= 90) || (l >= 97 && l <= 122)) {
        st.i++
        return l % 32
      }
      st.i--
      return 92 // a lone backslash, as JavaScript reads `\c` without a letter
    }
  }
  if (c === 'p' || c === 'P')
    throw new RegexError(
      `Unicode property escapes are not supported in AsyncJS regexes (/${st.src}/)`
    )
  if (c === 'k')
    throw new RegexError(
      `Backreferences are not supported in AsyncJS regexes (/${st.src}/)`
    )
  if (c !== undefined && /[1-9]/.test(c))
    throw new RegexError(
      `Backreferences are not supported in AsyncJS regexes (/${st.src}/)`
    )
  if (c === undefined) throw new RegexError(`\\ at end of /${st.src}/`)
  return c.charCodeAt(0) // an identity escape: \. \/ \\ \[ …
}

function parseEscape(st: ParseState, inClass: boolean): Node {
  st.i++ // backslash
  const c = st.src[st.i]
  const ranges = classEscape(c, st.flags)
  if (ranges) {
    st.i++
    return charNode(st, ranges)
  }
  if (!inClass && (c === 'b' || c === 'B')) {
    st.i++
    return { t: 'assert', kind: c }
  }
  const cp = charEscape(st, inClass)
  return charNode(st, [[cp, cp]])
}

function parseClass(st: ParseState): Node {
  st.i++ // [
  let negate = false
  if (st.src[st.i] === '^') {
    negate = true
    st.i++
  }
  const ranges: Range[] = []
  const one = (): { cp: number } | { ranges: Range[] } => {
    if (st.src[st.i] === '\\') {
      st.i++
      const r = classEscape(st.src[st.i], st.flags)
      if (r) {
        st.i++
        return { ranges: r }
      }
      return { cp: charEscape(st, true) }
    }
    const cp = st.flags.unicode
      ? codePointAt(st, st.i)
      : st.src.charCodeAt(st.i)
    if (cp <= 0xffff || !st.flags.unicode) st.i++
    return { cp }
  }
  while (st.i < st.src.length && st.src[st.i] !== ']') {
    const a = one()
    if ('ranges' in a) {
      ranges.push(...a.ranges)
      continue
    }
    if (
      st.src[st.i] === '-' &&
      st.src[st.i + 1] !== ']' &&
      st.i + 1 < st.src.length
    ) {
      st.i++
      const b = one()
      if ('ranges' in b) {
        // `[\d-z]`: the '-' is literal
        ranges.push([a.cp, a.cp], [45, 45], ...b.ranges)
        continue
      }
      if (b.cp < a.cp)
        throw new RegexError(
          `Range out of order in character class in /${st.src}/`
        )
      ranges.push([a.cp, b.cp])
    } else ranges.push([a.cp, a.cp])
  }
  if (st.src[st.i] !== ']')
    throw new RegexError(`Unterminated character class in /${st.src}/`)
  st.i++
  return charNode(st, ranges, negate)
}

// ---------------------------------------------------------------- compile

type Instr =
  | { op: 'char'; cls: CharClass }
  | { op: 'split'; x: number; y: number } // x preferred
  | { op: 'jmp'; x: number }
  | { op: 'save'; n: number }
  | { op: 'assert'; kind: '^' | '$' | 'b' | 'B' }
  | { op: 'reset'; groups: number[] } // a quantifier iteration clears its groups' captures
  | { op: 'mark'; r: number } // where an optional iteration started
  | { op: 'progress'; r: number } // …which must not end where it started (JavaScript's empty check)
  | { op: 'match' }

/** The capture groups inside a node (cleared at each iteration of a quantifier around it). */
function groupsOf(node: Node, out: number[] = []): number[] {
  switch (node.t) {
    case 'group':
      if (node.index !== null) out.push(node.index)
      groupsOf(node.body, out)
      break
    case 'seq':
      node.items.forEach((n) => groupsOf(n, out))
      break
    case 'alt':
      node.options.forEach((n) => groupsOf(n, out))
      break
    case 'rep':
      groupsOf(node.body, out)
      break
  }
  return out
}

interface CompileState {
  /** empty-check registers allocated */
  regs: number
  /** ONE register per quantifier NODE: its iterations are sequential within a thread, so each
   * iteration's mark overwrites the last. (One per iteration made `(x?){0,1500}` a 1500-slot
   * array copied at every step — B1.) A node expanded several times shares its register. */
  regOf: Map<Node, number>
  /** registers of the optional iterations enclosing the instruction being emitted */
  live: number[]
  liveOf: number[][]
  groupsOf: Map<Node, number[]>
  work: number
  charge: Charge
  /** bytes the program retains so far, each charged through `alloc` as it is built */
  bytes: number
  alloc: Charge
}

/** Charge compile work, and refuse past the cap even when nothing is metering (transpile time). */
function compileWork(cs: CompileState, n: number): void {
  cs.work += n
  if (cs.work > MAX_REGEX_COMPILE_WORK)
    throw new RegexError(
      `Regex too large to compile (over ${MAX_REGEX_COMPILE_WORK} steps)`
    )
  cs.charge(n)
}

function emit(prog: Instr[], ins: Instr, cs: CompileState): void {
  if (prog.length >= MAX_REGEX_PROGRAM)
    throw new RegexError(
      `Regex too large (over ${MAX_REGEX_PROGRAM} instructions)`
    )
  compileWork(cs, 1)
  // charged BEFORE the instruction exists (I1): its slot, its live-register list, and its
  // character table or reset list
  const bytes =
    64 +
    cs.live.length * 8 +
    (ins.op === 'char'
      ? 48 + ins.cls.ranges.length * 40
      : ins.op === 'reset'
      ? ins.groups.length * 8
      : 0)
  cs.alloc(bytes)
  cs.bytes += bytes
  prog.push(ins)
  cs.liveOf.push(cs.live)
}

function compileNode(node: Node, prog: Instr[], cs: CompileState): void {
  switch (node.t) {
    case 'char':
      emit(prog, { op: 'char', cls: node.cls }, cs)
      return
    case 'assert':
      emit(prog, { op: 'assert', kind: node.kind }, cs)
      return
    case 'seq':
      for (const n of node.items) compileNode(n, prog, cs)
      return
    case 'group':
      if (node.index !== null) emit(prog, { op: 'save', n: node.index * 2 }, cs)
      compileNode(node.body, prog, cs)
      if (node.index !== null)
        emit(prog, { op: 'save', n: node.index * 2 + 1 }, cs)
      return
    case 'alt': {
      const jumps: Array<{ op: 'jmp'; x: number }> = []
      for (let k = 0; k < node.options.length; k++) {
        if (k < node.options.length - 1) {
          const split = { op: 'split' as const, x: prog.length + 1, y: -1 }
          emit(prog, split, cs)
          compileNode(node.options[k], prog, cs)
          const j = { op: 'jmp' as const, x: -1 }
          emit(prog, j, cs)
          jumps.push(j)
          split.y = prog.length
        } else compileNode(node.options[k], prog, cs)
      }
      for (const j of jumps) j.x = prog.length
      return
    }
    case 'rep': {
      // JavaScript clears a group's captures at the start of each iteration of a quantifier
      let inner = cs.groupsOf.get(node)
      if (!inner) cs.groupsOf.set(node, (inner = groupsOf(node.body)))
      let r = cs.regOf.get(node)
      if (r === undefined && node.max > node.min)
        cs.regOf.set(node, (r = cs.regs++))
      // An OPTIONAL iteration (past the minimum) that consumes nothing fails, as JavaScript's
      // RepeatMatcher does — so `(a?)?` on "" leaves group 1 undefined, not "".
      const iteration = (optional: boolean) => {
        compileWork(cs, 1) // an empty body emits nothing; the iteration is still work (B2)
        if (optional) emit(prog, { op: 'mark', r: r! }, cs)
        const outer = cs.live
        if (optional) cs.live = [...outer, r!]
        if (inner!.length) emit(prog, { op: 'reset', groups: inner! }, cs)
        compileNode(node.body, prog, cs)
        if (optional) emit(prog, { op: 'progress', r: r! }, cs)
        cs.live = outer
      }
      for (let k = 0; k < node.min; k++) iteration(false)
      if (node.max === Infinity) {
        const loop = prog.length
        const split = { op: 'split' as const, x: -1, y: -1 }
        emit(prog, split, cs)
        iteration(true)
        emit(prog, { op: 'jmp', x: loop }, cs)
        const exit = prog.length
        if (node.lazy) [split.x, split.y] = [exit, loop + 1]
        else [split.x, split.y] = [loop + 1, exit]
      } else {
        const splits: Array<{
          split: { op: 'split'; x: number; y: number }
          body: number
        }> = []
        for (let k = node.min; k < node.max; k++) {
          const split = { op: 'split' as const, x: -1, y: -1 }
          emit(prog, split, cs)
          splits.push({ split, body: prog.length })
          iteration(true)
        }
        const exit = prog.length
        for (const { split, body } of splits) {
          if (node.lazy) [split.x, split.y] = [exit, body]
          else [split.x, split.y] = [body, exit]
        }
      }
      return
    }
  }
}

// ---------------------------------------------------------------- the regex object

const PROGRAM = Symbol('tjs.regexProgram')

const regexToString = Object.freeze(function toString(this: GuestRegex) {
  return `/${this.source}/${this.flags}`
})

/** A guest regex: data the guest may hold and pass to string methods; the program is hidden. */
export interface GuestRegex {
  readonly source: string
  readonly flags: string
  readonly global: boolean
  readonly ignoreCase: boolean
  readonly multiline: boolean
  readonly sticky: boolean
  readonly unicode: boolean
  readonly dotAll: boolean
  readonly [PROGRAM]: Compiled
}

interface Compiled {
  prog: Instr[]
  regs: number
  groups: number
  names: Map<string, number>
  flags: Flags
  /** the pattern begins with `^` (without `m`): it can only match where the scan starts, so no
   * new attempt is begun at later positions */
  anchored: boolean
  /** registers whose "started at this position" bit is part of each instruction's state */
  liveOf: number[][]
  /** where each instruction's 2^live states begin in `mark` */
  stateBase: Int32Array
  /** What this compiled program holds for as long as the regex lives: charged as heap where the
   * regex is created and counted by the heap walk wherever it is held (rc.2 ninth re-review B1). */
  bytes: number
}

/**
 * The visited-state table for matching, owned by ONE OPERATION, never by the regex. Keeping it
 * on the regex (to stop re-allocating it per call) turned transient memory into retained memory
 * the heap never saw: 1000 held regexes kept ~690MB under an 8MB ceiling (B1). An operation that
 * calls `execRegex` many times (split, global replace) makes one and passes it to each call; it
 * is part of `threadBytes`, which the operation charges up front.
 */
export interface RegexScratch {
  mark: Int32Array
  generation: number
}

export function regexScratch(re: GuestRegex): RegexScratch {
  const { stateBase, prog } = re[PROGRAM]
  return {
    mark: new Int32Array(stateBase[prog.length]).fill(-1),
    generation: 0,
  }
}

/** Bytes a compiled regex retains: its program, its state layout and its character tables.
 * Every cost of a regex is a function of its program size (charged here, once) and of the input
 * it is run on (charged per match). */
export function regexBytes(re: GuestRegex): number {
  return re[PROGRAM].bytes
}

export function isGuestRegex(x: unknown): x is GuestRegex {
  return !!x && typeof x === 'object' && PROGRAM in x
}

/**
 * Compile a pattern, charging the work to `charge`. Throws RegexError (a clear message) on
 * anything unsupported or over a cap — with or without a meter, so a pattern validated at
 * transpile time cannot hang the transpiler either.
 */
export function compileRegex(
  source: string,
  flagText = '',
  charge: Charge = noCharge,
  alloc: Charge = noCharge
): GuestRegex {
  if (typeof source !== 'string')
    throw new RegexError('A regex pattern must be a string')
  if (
    !/^[gimsuy]*$/.test(flagText) ||
    new Set(flagText).size !== flagText.length
  )
    throw new RegexError(
      `Unsupported regex flags '${flagText}' (AsyncJS supports g i m s u y)`
    )
  const flags: Flags = {
    global: flagText.includes('g'),
    ignoreCase: flagText.includes('i'),
    multiline: flagText.includes('m'),
    dotAll: flagText.includes('s'),
    unicode: flagText.includes('u'),
    sticky: flagText.includes('y'),
  }
  charge(source.length) // the parser reads each character a bounded number of times
  // The parse tree and the unmerged class ranges are transient, and a constant per source
  // character: a 400k-character class builds 400k range pairs before they are merged.
  alloc(64 + source.length * PARSE_BYTES_PER_CHAR)
  const { node, groups, names } = parse(source, flags)
  const cs: CompileState = {
    regs: 0,
    regOf: new Map(),
    live: [],
    liveOf: [],
    groupsOf: new Map(),
    work: 0,
    charge,
    bytes: 64 + source.length * 2,
    alloc,
  }
  const prog: Instr[] = []
  emit(prog, { op: 'save', n: 0 }, cs)
  compileNode(node, prog, cs)
  emit(prog, { op: 'save', n: 1 }, cs)
  emit(prog, { op: 'match' }, cs)
  alloc((prog.length + 1) * 4)
  cs.bytes += (prog.length + 1) * 4
  const stateBase = new Int32Array(prog.length + 1)
  for (let pc = 0; pc < prog.length; pc++) {
    if (cs.liveOf[pc].length > 16 || stateBase[pc] > MAX_REGEX_STATES)
      throw new RegexError(
        `Regex has too many nested optional quantifiers (over ${MAX_REGEX_STATES} states)`
      )
    stateBase[pc + 1] = stateBase[pc] + 2 ** cs.liveOf[pc].length
  }
  if (stateBase[prog.length] > MAX_REGEX_STATES)
    throw new RegexError(
      `Regex has too many nested optional quantifiers (over ${MAX_REGEX_STATES} states)`
    )
  compileWork(cs, prog.length)
  if ((groups + 1) * 2 + cs.regs > MAX_REGEX_SLOTS)
    throw new RegexError(
      `Regex has too many groups or quantifiers (over ${MAX_REGEX_SLOTS} slots)`
    )
  const re = {
    source,
    flags: [...'gimsuy'].filter((f) => flagText.includes(f)).join(''),
    global: flags.global,
    ignoreCase: flags.ignoreCase,
    multiline: flags.multiline,
    sticky: flags.sticky,
    unicode: flags.unicode,
    dotAll: flags.dotAll,
  }
  Object.defineProperty(re, PROGRAM, {
    value: {
      prog,
      regs: cs.regs,
      groups,
      names,
      flags,
      anchored:
        prog[1]?.op === 'assert' && prog[1].kind === '^' && !flags.multiline,
      liveOf: cs.liveOf,
      stateBase,
      bytes: cs.bytes,
    } satisfies Compiled,
  })
  // prints as JavaScript prints a RegExp: one shared, frozen function, not a closure per regex
  Object.defineProperty(re, 'toString', { value: regexToString })
  return Object.freeze(re) as GuestRegex
}

/** Transient parse memory per source character (tree nodes, unmerged class ranges). */
const PARSE_BYTES_PER_CHAR = 64

/** Compile work a SOURCE may spend on its regex literals, per byte of source (with a floor).
 * A per-regex cap alone let 100 literals in 3KB cost seconds at transpile and verify time, past
 * the source-size admission cap (rc.2 ninth re-review M2). Compilation is ~50 units per µs, so
 * this is a few milliseconds per KB at most. */
export const REGEX_COMPILE_WORK_PER_SOURCE_BYTE = 200
export const REGEX_COMPILE_WORK_FLOOR = 50_000

/**
 * Compiles the regex literals of ONE source against a budget proportional to its length, and
 * compiles each distinct literal once. Used where regexes are compiled before any run has a fuel
 * budget: the AJS transpiler (validating literals) and the predicate verifier and compiler.
 */
export class RegexCompiler {
  private used = 0
  private readonly limit: number
  private readonly cache = new Map<string, GuestRegex>()
  constructor(sourceLength: number) {
    this.limit = Math.max(
      REGEX_COMPILE_WORK_FLOOR,
      sourceLength * REGEX_COMPILE_WORK_PER_SOURCE_BYTE
    )
  }
  compile(pattern: string, flags = ''): GuestRegex {
    const key = flags + '/' + pattern
    const hit = this.cache.get(key)
    if (hit) return hit
    const re = compileRegex(pattern, flags, (n) => {
      if ((this.used += n) > this.limit)
        throw new RegexError(
          `The regexes in this source are too large to compile (over ${
            this.limit
          } steps for its ${Math.round(
            this.limit / REGEX_COMPILE_WORK_PER_SOURCE_BYTE
          )} bytes)`
        )
    })
    this.cache.set(key, re)
    return re
  }
}

/**
 * Worst-case bytes a match's threads hold at once: two lists of at most one thread per
 * instruction, each with its slot array, plus the closure stack. The caller charges this once
 * per OPERATION (an allocation), before matching — not per call, since the lists are rebuilt.
 */
export function threadBytes(re: GuestRegex): number {
  const { prog, groups, regs, stateBase } = re[PROGRAM]
  return (
    (2 * prog.length + stateBase[prog.length]) *
      (((groups + 1) * 2 + regs) * 8 + 48) +
    stateBase[prog.length] * 4
  )
}

// ---------------------------------------------------------------- execute

export interface RegexMatch {
  index: number
  end: number
  /** captures[k] = [start, end] for group k (0 is the whole match), or undefined */
  captures: Array<[number, number] | undefined>
  names: Map<string, number>
}

const isWordAt = (input: string, i: number, wordChar: (c: number) => boolean) =>
  i >= 0 && i < input.length && wordChar(input.charCodeAt(i))

function assertOk(
  kind: string,
  input: string,
  pos: number,
  multiline: boolean,
  wordChar: (c: number) => boolean
): boolean {
  switch (kind) {
    case '^':
      return (
        pos === 0 || (multiline && isLineTerminator(input.charCodeAt(pos - 1)))
      )
    case '$':
      return (
        pos === input.length ||
        (multiline && isLineTerminator(input.charCodeAt(pos)))
      )
    case 'b':
      return (
        isWordAt(input, pos - 1, wordChar) !== isWordAt(input, pos, wordChar)
      )
    default:
      return (
        isWordAt(input, pos - 1, wordChar) === isWordAt(input, pos, wordChar)
      )
  }
}

/**
 * Find the leftmost match at or after `from` (exactly AT `from` when sticky). Every unit of work
 * — each instruction a thread visits, each capture copy (in proportion to its width), each class
 * probe — is passed to `charge` as it happens (batched per input position), and `charge` throws
 * to stop the engine.
 *
 * Threads and the closure stack are parallel arrays (a pc array and a slots array), allocated
 * once per call and per step rather than as an object per thread or a tuple per visit: the
 * engine is a per-character cost on every guest string operation, and its constant matters.
 */
export function execRegex(
  re: GuestRegex,
  input: string,
  from: number,
  charge: Charge,
  stickyOverride?: boolean,
  scratch?: RegexScratch
): RegexMatch | null {
  const compiled = re[PROGRAM]
  const { prog, regs, groups, names, flags, liveOf, stateBase } = compiled
  // without an operation's scratch, this call makes (and is charged for) its own
  const own = !scratch
  const table = scratch ?? regexScratch(re)
  const { mark } = table
  const sticky = stickyOverride ?? flags.sticky
  // a new attempt begins at each later position unless the match must start HERE
  const restart = !sticky && !compiled.anchored
  const capSlots = (groups + 1) * 2
  // captures, then the empty-check registers, in one per-thread array
  const nCaps = capSlots + regs
  // a copy of a thread's slots is work in proportion to its width (B1)
  const copyCost = 1 + (nCaps >> 3)
  const unicode = flags.unicode
  const multiline = flags.multiline
  const wordChar = flags.ignoreCase && unicode ? isWordCharIU : isWordChar
  let work = own ? 1 + (stateBase[prog.length] >> 3) : 0
  classWork = 0
  const flush = () => {
    work += classWork
    classWork = 0
    if (work) {
      const n = work
      work = 0
      charge(n)
    }
  }
  const nextGeneration = () => {
    if (++table.generation >= 0x7fffffff) {
      mark.fill(-1)
      table.generation = 1
    }
  }

  // the closure's stack, and the current and next thread lists, as parallel arrays
  const stackPc: number[] = []
  const stackCaps: number[][] = []
  let curPc: number[] = []
  let curCaps: number[][] = []
  let nextPc: number[]
  let nextCaps: number[][]
  let matched: number[] | null = null

  // Follow the zero-width instructions from `pc`, adding threads in priority order.
  const add = (
    listPc: number[],
    listCaps: number[][],
    pc: number,
    caps: number[],
    pos: number
  ) => {
    stackPc[0] = pc
    stackCaps[0] = caps
    let sp = 1
    while (sp > 0) {
      sp--
      const p = stackPc[sp]
      const c = stackCaps[sp]
      const ins = prog[p]
      // A thread's future depends on its pc AND on which enclosing optional iterations began at
      // THIS position (the empty check fails for exactly those). Deduplicating on the pc alone
      // let a path whose check would fail block a lower-priority path whose check would pass,
      // and the match came out different from JavaScript's (M1). After a character is consumed
      // every such bit is false again, so only the closure needs the wider key.
      const live = liveOf[p]
      let state = stateBase[p]
      for (let k = 0; k < live.length; k++)
        if (c[capSlots + live[k]] === pos) state += 1 << k
      work += 1 + live.length
      if (mark[state] === table.generation) continue
      mark[state] = table.generation
      switch (ins.op) {
        case 'jmp':
          stackPc[sp] = ins.x
          stackCaps[sp++] = c
          break
        case 'split':
          // y pushed first so x is explored first (it is preferred)
          stackPc[sp] = ins.y
          stackCaps[sp++] = c
          stackPc[sp] = ins.x
          stackCaps[sp++] = c
          break
        case 'save': {
          const n = c.slice()
          work += copyCost
          n[ins.n] = pos
          stackPc[sp] = p + 1
          stackCaps[sp++] = n
          break
        }
        case 'assert':
          if (assertOk(ins.kind, input, pos, multiline, wordChar)) {
            stackPc[sp] = p + 1
            stackCaps[sp++] = c
          }
          break
        case 'reset': {
          const n = c.slice()
          work += copyCost + ins.groups.length
          for (const g of ins.groups) n[g * 2] = n[g * 2 + 1] = -1
          stackPc[sp] = p + 1
          stackCaps[sp++] = n
          break
        }
        case 'mark': {
          const n = c.slice()
          work += copyCost
          n[capSlots + ins.r] = pos
          stackPc[sp] = p + 1
          stackCaps[sp++] = n
          break
        }
        case 'progress':
          if (c[capSlots + ins.r] !== pos) {
            stackPc[sp] = p + 1
            stackCaps[sp++] = c
          }
          break
        default:
          listPc.push(p)
          listCaps.push(c)
      }
    }
  }

  // With `u`, a start inside a surrogate pair backs up to the pair: a code point is matched whole
  if (
    unicode &&
    from > 0 &&
    from < input.length &&
    isTrailSurrogate(input.charCodeAt(from)) &&
    isLeadSurrogate(input.charCodeAt(from - 1))
  )
    from--
  let pos = from
  nextGeneration()
  work += copyCost
  add(curPc, curCaps, 0, new Array(nCaps).fill(-1), pos)
  while (true) {
    // Nothing alive: done if something matched (or no new attempt may begin); otherwise keep
    // walking — a new attempt starts at the next position even when every thread here died.
    if (curPc.length === 0 && (matched || !restart)) break
    work += curPc.length + 1
    flush()
    const cp =
      pos < input.length
        ? unicode
          ? input.codePointAt(pos)!
          : input.charCodeAt(pos)
        : -1
    const next = pos + (cp > 0xffff ? 2 : 1)
    nextGeneration()
    nextPc = []
    nextCaps = []
    for (let t = 0; t < curPc.length; t++) {
      const ins = prog[curPc[t]]
      if (ins.op === 'match') {
        matched = curCaps[t]
        break // every lower-priority thread is cut
      }
      if (ins.op === 'char' && cp !== -1 && classTest(ins.cls, cp))
        add(nextPc, nextCaps, curPc[t] + 1, curCaps[t], next)
    }
    flush()
    if (pos >= input.length) break
    // leftmost: a new attempt starts at the next position, lowest priority, until one matched
    if (!matched && restart) {
      work += copyCost
      add(nextPc, nextCaps, 0, new Array(nCaps).fill(-1), next)
    }
    curPc = nextPc
    curCaps = nextCaps
    pos = next
  }
  flush()
  if (!matched) return null
  const captures: Array<[number, number] | undefined> = []
  for (let g = 0; g <= groups; g++) {
    const s = matched[g * 2]
    const e = matched[g * 2 + 1]
    captures.push(s >= 0 && e >= 0 ? [s, e] : undefined)
  }
  return { index: captures[0]![0], end: captures[0]![1], captures, names }
}
