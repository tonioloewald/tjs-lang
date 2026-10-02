/**
 * The VM's own regular-expression engine: a Pike VM, linear in input × pattern.
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
 */

/** A program may not exceed this many instructions (`a{1000}{1000}` would be a million). */
export const MAX_REGEX_PROGRAM = 20_000
/** Fuel per thread-step (a thread at one input position). */
export const REGEX_FUEL_PER_STEP = 0.00002

export class RegexError extends Error {}

// ---------------------------------------------------------------- parse

type CharTest = (c: number) => boolean

type Node =
  | { t: 'char'; test: CharTest }
  | { t: 'seq'; items: Node[] }
  | { t: 'alt'; options: Node[] }
  | { t: 'group'; index: number | null; body: Node }
  | { t: 'rep'; body: Node; min: number; max: number; lazy: boolean }
  | { t: 'assert'; kind: '^' | '$' | 'b' | 'B' }

interface ParseState {
  src: string
  i: number
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

const isWordChar = (c: number) =>
  (c >= 48 && c <= 57) ||
  (c >= 65 && c <= 90) ||
  (c >= 97 && c <= 122) ||
  c === 95
const isDigit = (c: number) => c >= 48 && c <= 57
/** JavaScript's WhiteSpace and LineTerminator, which `\s` matches. */
const isSpace = (c: number) =>
  c === 9 ||
  c === 10 ||
  c === 11 ||
  c === 12 ||
  c === 13 ||
  c === 32 ||
  c === 0xa0 ||
  c === 0x1680 ||
  (c >= 0x2000 && c <= 0x200a) ||
  c === 0x2028 ||
  c === 0x2029 ||
  c === 0x202f ||
  c === 0x205f ||
  c === 0x3000 ||
  c === 0xfeff
const isLeadSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff
const isTrailSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff
const isLineTerminator = (c: number) =>
  c === 10 || c === 13 || c === 0x2028 || c === 0x2029

/** Simple case folding, as `i` without `u` does: compare both cases of a character. */
function caseVariants(c: number): number[] {
  const s = String.fromCodePoint(c)
  const lo = s.toLowerCase()
  const up = s.toUpperCase()
  const out = [c]
  for (const v of [lo, up])
    if (v.length === s.length) {
      const cp = v.codePointAt(0)!
      if (!out.includes(cp)) out.push(cp)
    }
  return out
}

function parse(
  src: string,
  flags: Flags
): { node: Node; groups: number; names: Map<string, number> } {
  const st: ParseState = { src, i: 0, groups: 0, names: new Map(), flags }
  const node = parseAlt(st)
  if (st.i < src.length)
    throw new RegexError(`Unexpected '${src[st.i]}' in /${src}/`)
  return { node, groups: st.groups, names: st.names }
}

function parseAlt(st: ParseState): Node {
  const options = [parseSeq(st)]
  while (st.src[st.i] === '|') {
    st.i++
    options.push(parseSeq(st))
  }
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
    const m = /^\{(\d+)(,(\d*))?\}/.exec(st.src.slice(st.i))
    if (!m) return atom // a literal '{', as JavaScript reads it without `u`
    min = Number(m[1])
    max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3])
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
    const dotAll = st.flags.dotAll
    return { t: 'char', test: (x) => dotAll || !isLineTerminator(x) }
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
    (c === '{' && /^\{\d+(,\d*)?\}/.test(st.src.slice(st.i)))
  )
    throw new RegexError(`Nothing to repeat in /${st.src}/`)
  if (c === ')' || (c === ']' && st.flags.unicode))
    throw new RegexError(`Unmatched '${c}' in /${st.src}/`)
  st.i++
  const cp = st.flags.unicode ? codePointAt(st, st.i - 1) : c.charCodeAt(0)
  return literal(cp, st.flags)
}

/** With `u`, a surrogate pair in the PATTERN is one character. */
function codePointAt(st: ParseState, at: number): number {
  const cp = st.src.codePointAt(at)!
  if (cp > 0xffff) st.i = at + 2
  return cp
}

function literal(cp: number, flags: Flags): Node {
  if (!flags.ignoreCase) return { t: 'char', test: (x) => x === cp }
  const vs = caseVariants(cp)
  return { t: 'char', test: (x) => vs.includes(x) }
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
      const m = /^\?<([A-Za-z_$][\w$]*)>/.exec(st.src.slice(st.i))
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

/** A class escape's predicate (`\d` …), or null if `c` is not one. */
function classEscape(c: string): CharTest | null {
  switch (c) {
    case 'd':
      return isDigit
    case 'D':
      return (x) => !isDigit(x)
    case 'w':
      return isWordChar
    case 'W':
      return (x) => !isWordChar(x)
    case 's':
      return isSpace
    case 'S':
      return (x) => !isSpace(x)
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
      const m = /^[0-9a-fA-F]{2}/.exec(st.src.slice(st.i))
      if (!m) return 'x'.charCodeAt(0)
      st.i += 2
      return parseInt(m[0], 16)
    }
    case 'u': {
      if (st.src[st.i] === '{' && st.flags.unicode) {
        const m = /^\{([0-9a-fA-F]{1,6})\}/.exec(st.src.slice(st.i))
        if (!m) throw new RegexError(`Invalid unicode escape in /${st.src}/`)
        st.i += m[0].length
        return parseInt(m[1], 16)
      }
      const m = /^[0-9a-fA-F]{4}/.exec(st.src.slice(st.i))
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
  const cls = classEscape(c)
  if (cls) {
    st.i++
    return { t: 'char', test: cls }
  }
  if (!inClass && (c === 'b' || c === 'B')) {
    st.i++
    return { t: 'assert', kind: c }
  }
  return literal(charEscape(st, inClass), st.flags)
}

function parseClass(st: ParseState): Node {
  st.i++ // [
  let negate = false
  if (st.src[st.i] === '^') {
    negate = true
    st.i++
  }
  const tests: CharTest[] = []
  const ranges: Array<[number, number]> = []
  const one = (): { cp: number } | { test: CharTest } => {
    if (st.src[st.i] === '\\') {
      st.i++
      const cls = classEscape(st.src[st.i])
      if (cls) {
        st.i++
        return { test: cls }
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
    if ('test' in a) {
      tests.push(a.test)
      continue
    }
    if (
      st.src[st.i] === '-' &&
      st.src[st.i + 1] !== ']' &&
      st.i + 1 < st.src.length
    ) {
      st.i++
      const b = one()
      if ('test' in b) {
        // `[\d-z]`: the '-' is literal
        ranges.push([a.cp, a.cp], [45, 45])
        tests.push(b.test)
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
  const ic = st.flags.ignoreCase
  const inRanges = (x: number) => ranges.some(([lo, hi]) => x >= lo && x <= hi)
  const member = (x: number) =>
    tests.some((t) => t(x)) ||
    inRanges(x) ||
    (ic && caseVariants(x).some((v) => v !== x && inRanges(v)))
  return { t: 'char', test: negate ? (x) => !member(x) : member }
}

// ---------------------------------------------------------------- compile

type Instr =
  | { op: 'char'; test: CharTest }
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

/** Registers for the empty-iteration check, allocated as the program is compiled. */
interface CompileState {
  regs: number
}

function compileNode(
  node: Node,
  prog: Instr[],
  cs: CompileState = { regs: 0 }
): void {
  if (prog.length > MAX_REGEX_PROGRAM)
    throw new RegexError(
      `Regex too large (over ${MAX_REGEX_PROGRAM} instructions)`
    )
  switch (node.t) {
    case 'char':
      prog.push({ op: 'char', test: node.test })
      return
    case 'assert':
      prog.push({ op: 'assert', kind: node.kind })
      return
    case 'seq':
      for (const n of node.items) compileNode(n, prog, cs)
      return
    case 'group':
      if (node.index !== null) prog.push({ op: 'save', n: node.index * 2 })
      compileNode(node.body, prog, cs)
      if (node.index !== null) prog.push({ op: 'save', n: node.index * 2 + 1 })
      return
    case 'alt': {
      const jumps: Array<{ op: 'jmp'; x: number }> = []
      for (let k = 0; k < node.options.length; k++) {
        if (k < node.options.length - 1) {
          const split = { op: 'split' as const, x: prog.length + 1, y: -1 }
          prog.push(split)
          compileNode(node.options[k], prog, cs)
          const j = { op: 'jmp' as const, x: -1 }
          prog.push(j)
          jumps.push(j)
          split.y = prog.length
        } else compileNode(node.options[k], prog, cs)
      }
      for (const j of jumps) j.x = prog.length
      return
    }
    case 'rep': {
      // JavaScript clears a group's captures at the start of each iteration of a quantifier
      const inner = groupsOf(node.body)
      // An OPTIONAL iteration (past the minimum) that consumes nothing fails, as JavaScript's
      // RepeatMatcher does — so `(a?)?` on "" leaves group 1 undefined, not "".
      const iteration = (optional: boolean) => {
        const r = optional ? cs.regs++ : -1
        if (optional) prog.push({ op: 'mark', r })
        if (inner.length) prog.push({ op: 'reset', groups: inner })
        compileNode(node.body, prog, cs)
        if (optional) prog.push({ op: 'progress', r })
      }
      for (let k = 0; k < node.min; k++) iteration(false)
      if (node.max === Infinity) {
        const loop = prog.length
        const split = { op: 'split' as const, x: -1, y: -1 }
        prog.push(split)
        iteration(true)
        prog.push({ op: 'jmp', x: loop })
        const exit = prog.length
        if (node.lazy) [split.x, split.y] = [exit, loop + 1]
        else [split.x, split.y] = [loop + 1, exit]
      } else {
        const splits: Array<{ op: 'split'; x: number; y: number }> = []
        for (let k = node.min; k < node.max; k++) {
          const split = { op: 'split' as const, x: -1, y: -1 }
          prog.push(split)
          splits.push(split)
          const body = prog.length
          iteration(true)
          ;(split as any).body = body
        }
        const exit = prog.length
        for (const sp of splits) {
          const body = (sp as any).body as number
          if (node.lazy) [sp.x, sp.y] = [exit, body]
          else [sp.x, sp.y] = [body, exit]
        }
      }
      return
    }
  }
}

// ---------------------------------------------------------------- the regex object

const PROGRAM = Symbol('tjs.regexProgram')

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
}

export function isGuestRegex(x: unknown): x is GuestRegex {
  return !!x && typeof x === 'object' && PROGRAM in x
}

/** Compile a pattern. Throws RegexError (a clear message) on anything unsupported. */
export function compileRegex(source: string, flagText = ''): GuestRegex {
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
  const { node, groups, names } = parse(source, flags)
  const prog: Instr[] = [{ op: 'save', n: 0 }]
  const cs: CompileState = { regs: 0 }
  compileNode(node, prog, cs)
  prog.push({ op: 'save', n: 1 }, { op: 'match' })
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
    value: { prog, regs: cs.regs, groups, names, flags },
  })
  // prints as JavaScript prints a RegExp
  Object.defineProperty(re, 'toString', {
    value: () => `/${source}/${re.flags}`,
  })
  return Object.freeze(re) as GuestRegex
}

// ---------------------------------------------------------------- execute

export interface RegexMatch {
  index: number
  end: number
  /** captures[k] = [start, end] for group k (0 is the whole match), or undefined */
  captures: Array<[number, number] | undefined>
  names: Map<string, number>
}

interface Thread {
  pc: number
  caps: number[]
}

/**
 * Find the leftmost match at or after `from` (exactly AT `from` when sticky). `charge(n)` is
 * called with the number of thread-steps taken, so the caller bills fuel as the work happens.
 */
export function execRegex(
  re: GuestRegex,
  input: string,
  from: number,
  charge: (steps: number) => void,
  stickyOverride?: boolean
): RegexMatch | null {
  const { prog, regs, groups, names, flags } = re[PROGRAM]
  const sticky = stickyOverride ?? flags.sticky
  const capSlots = (groups + 1) * 2
  // captures, then the empty-check registers, in one per-thread array
  const nCaps = capSlots + regs
  const unicode = flags.unicode
  let clist: Thread[] = []
  let nlist: Thread[]
  const mark = new Int32Array(prog.length).fill(-1)
  let generation = 0
  let matched: number[] | null = null

  const isWordAt = (i: number) =>
    i >= 0 && i < input.length && isWordChar(input.charCodeAt(i))
  const assertOk = (kind: string, pos: number): boolean => {
    switch (kind) {
      case '^':
        return (
          pos === 0 ||
          (flags.multiline && isLineTerminator(input.charCodeAt(pos - 1)))
        )
      case '$':
        return (
          pos === input.length ||
          (flags.multiline && isLineTerminator(input.charCodeAt(pos)))
        )
      case 'b':
        return isWordAt(pos - 1) !== isWordAt(pos)
      default:
        return isWordAt(pos - 1) === isWordAt(pos)
    }
  }

  // Follow the zero-width instructions from `pc`, adding threads in priority order.
  const add = (list: Thread[], pc: number, caps: number[], pos: number) => {
    const stack: Array<[number, number[]]> = [[pc, caps]]
    while (stack.length) {
      const [p, c] = stack.pop()!
      if (mark[p] === generation) continue
      mark[p] = generation
      const ins = prog[p]
      switch (ins.op) {
        case 'jmp':
          stack.push([ins.x, c])
          break
        case 'split':
          // y pushed first so x is explored first (it is preferred)
          stack.push([ins.y, c], [ins.x, c])
          break
        case 'save': {
          const n = c.slice()
          n[ins.n] = pos
          stack.push([p + 1, n])
          break
        }
        case 'assert':
          if (assertOk(ins.kind, pos)) stack.push([p + 1, c])
          break
        case 'reset': {
          const n = c.slice()
          for (const g of ins.groups) n[g * 2] = n[g * 2 + 1] = -1
          stack.push([p + 1, n])
          break
        }
        case 'mark': {
          const n = c.slice()
          n[capSlots + ins.r] = pos
          stack.push([p + 1, n])
          break
        }
        case 'progress':
          if (c[capSlots + ins.r] !== pos) stack.push([p + 1, c])
          break
        default:
          list.push({ pc: p, caps: c })
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
  generation++
  add(clist, 0, new Array(nCaps).fill(-1), pos)
  while (true) {
    // Nothing alive: done if something matched (or a sticky attempt failed); otherwise keep
    // walking — a new attempt starts at the next position even when every thread here died.
    if (clist.length === 0 && (matched || sticky)) break
    charge(clist.length + 1)
    const cp =
      pos < input.length
        ? unicode
          ? input.codePointAt(pos)!
          : input.charCodeAt(pos)
        : -1
    const next = pos + (cp > 0xffff ? 2 : 1)
    generation++
    nlist = []
    for (const th of clist) {
      const ins = prog[th.pc]
      if (ins.op === 'match') {
        matched = th.caps
        break // every lower-priority thread is cut
      }
      if (ins.op === 'char' && cp !== -1 && ins.test(cp))
        add(nlist, th.pc + 1, th.caps, next)
    }
    if (pos >= input.length) break
    // leftmost: a new attempt starts at the next position, lowest priority, until one matched
    if (!matched && !sticky) add(nlist, 0, new Array(nCaps).fill(-1), next)
    clist = nlist
    pos = next
  }
  if (!matched) return null
  const captures: Array<[number, number] | undefined> = []
  for (let g = 0; g <= groups; g++) {
    const s = matched[g * 2]
    const e = matched[g * 2 + 1]
    captures.push(s >= 0 && e >= 0 ? [s, e] : undefined)
  }
  return { index: captures[0]![0], end: captures[0]![1], captures, names }
}
