/**
 * `replace`, `replaceAll`, `match`, `search` and `split` — implemented by the VM over its own
 * regex engine (`regex.ts`), instead of handed to the host's.
 *
 * Two reasons. The host's versions run the host's backtracking engine (and compile a string
 * pattern into one), which no budget can interrupt. And their OUTPUT could only be bounded in
 * advance, from a model of what they would produce — the rc.2 reviews found that model wrong
 * three ways (one `$'` per match where there were fifty; O(n²) for `$1`; capture groups).
 * Here the output is computed by the VM, so it is charged EXACTLY: each method knows the length
 * of what it is about to build before it builds it. Semantics follow the specification
 * (GetSubstitution, AdvanceStringIndex, the RegExp split algorithm), and are held to the native
 * methods by `string-methods.test.ts`.
 *
 * The caller supplies the meters: `alloc(bytes)` before an allocation, `steps(n)` for regex work.
 * Both throw to refuse. This module imports nothing from the VM.
 */
import {
  compileRegex,
  execRegex,
  isGuestRegex,
  regexScratch,
  threadBytes,
  type GuestRegex,
  type RegexMatch,
} from './regex'

export interface Meters {
  alloc(bytes: number): void
  steps(n: number): void
}

/** A string pattern, or a regex. A STRING passed to match/search is compiled as a pattern, as
 * JavaScript does (`'a.c'.search('.')` is 0); to replace/replaceAll/split it is literal. */
export type Pattern = string | GuestRegex

/** A regex prepared for ONE operation: its compile work charged, its worst-case thread memory
 * (including the visited-state table) charged once, and one scratch table shared by every match
 * the operation runs — so a split that matches at each position does not rebuild it each time,
 * and nothing outlives the operation (rc.2 eighth re-review B1, ninth re-review B1). */
export interface Prepared {
  re: GuestRegex
  exec(s: string, from: number, sticky?: boolean): RegexMatch | null
}

export function prepare(p: Pattern, m: Meters): Prepared {
  // a string pattern is compiled here: its program charged as it is built, like a literal's
  const re = isGuestRegex(p) ? p : compileRegex(String(p), '', m.steps, m.alloc)
  m.alloc(threadBytes(re))
  const scratch = regexScratch(re)
  return {
    re,
    exec: (s, from, sticky) => execRegex(re, s, from, m.steps, sticky, scratch),
  }
}

/** AdvanceStringIndex: past an empty match by one code unit, or one code point with `u`. */
export function advance(s: string, i: number, unicode: boolean): number {
  if (!unicode || i + 1 >= s.length) return i + 1
  const c = s.charCodeAt(i)
  const d = s.charCodeAt(i + 1)
  return c >= 0xd800 && c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff
    ? i + 2
    : i + 1
}

/** Every match from 0, as `matchAll`/global methods find them; one match for a non-global regex.
 * The ONE copy of this loop: the predicate adapter reuses it (a second copy advanced one code
 * unit past an empty `u` match and looped — rc.2 ninth re-review M1). */
export function allMatches(
  p: Prepared,
  s: string,
  m: Meters,
  all = p.re.global,
  start = 0
): RegexMatch[] {
  const out: RegexMatch[] = []
  let from = start
  while (from <= s.length) {
    const hit = p.exec(s, from)
    if (!hit) break
    m.alloc(64 + hit.captures.length * 24) // the match record, a slot per group
    out.push(hit)
    if (!all) break
    // past an empty match by one character, so the scan always advances
    from = hit.end === hit.index ? advance(s, hit.end, p.re.unicode) : hit.end
  }
  return out
}

/** JavaScript's match array for one hit — `index`, `input` and `groups` — charged first. */
export function matchArray(hit: RegexMatch, s: string, m: Meters): any {
  m.alloc(
    hit.captures.reduce((n, c) => n + (c ? (c[1] - c[0]) * 2 : 0) + 16, 0) +
      hit.names.size * 48 +
      128
  )
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

// ---------------------------------------------------------------- substitution

/** A match, as RANGES of the input: nothing is sliced until it is charged and appended. */
interface Substitution {
  start: number
  end: number
  captures: Array<[number, number] | undefined>
  names: Map<string, number> | null
}

/** Parse a replacement template once into pieces: literal text, or a reference. */
type Piece =
  | { lit: string }
  | { ref: 'match' | 'before' | 'after' }
  | { group: number }
  | { name: string }

function parseReplacement(
  repl: string,
  groupCount: number,
  hasNames: boolean,
  m: Meters
): Piece[] {
  // linear in the template (a `$<` scans to its `>` once, then skips past it)
  m.steps(repl.length + 1)
  m.alloc(repl.length * 2 + 64)
  const pieces: Piece[] = []
  let lit = ''
  for (let i = 0; i < repl.length; i++) {
    const c = repl[i]
    if (c !== '$' || i + 1 >= repl.length) {
      lit += c
      continue
    }
    const n = repl[i + 1]
    const push = (p: Piece, skip: number) => {
      if (lit) pieces.push({ lit })
      lit = ''
      pieces.push(p)
      i += skip
    }
    if (n === '$') {
      lit += '$'
      i++
    } else if (n === '&') push({ ref: 'match' }, 1)
    else if (n === '`') push({ ref: 'before' }, 1)
    else if (n === "'") push({ ref: 'after' }, 1)
    else if (n >= '0' && n <= '9') {
      // two digits if that names a group, else one (GetSubstitution)
      const two = repl[i + 2]
      const nn = two >= '0' && two <= '9' ? Number(n + two) : -1
      if (nn >= 1 && nn <= groupCount) push({ group: nn }, 2)
      else if (Number(n) >= 1 && Number(n) <= groupCount)
        push({ group: Number(n) }, 1)
      else lit += '$'
    } else if (n === '<' && hasNames) {
      const close = repl.indexOf('>', i + 2)
      if (close === -1) lit += '$'
      else push({ name: repl.slice(i + 2, close) }, close - i)
    } else lit += '$'
  }
  if (lit) pieces.push({ lit })
  return pieces
}

/** The input range a piece copies, or its literal text. */
function pieceSource(
  p: Piece,
  sub: Substitution,
  s: string
): string | [number, number] | undefined {
  if ('lit' in p) return p.lit
  if ('ref' in p)
    return p.ref === 'match'
      ? [sub.start, sub.end]
      : p.ref === 'before'
      ? [0, sub.start]
      : [sub.end, s.length]
  if ('group' in p) return sub.captures[p.group]
  const g = sub.names?.get(p.name)
  return g === undefined ? undefined : sub.captures[g]
}

const substitutionOf = (hit: RegexMatch): Substitution => ({
  start: hit.index,
  end: hit.end,
  captures: hit.captures,
  names: hit.names.size ? hit.names : null,
})

/** A template's shape, summed once: its literal length and how often each reference occurs. */
interface TemplateShape {
  literal: number
  match: number
  before: number
  after: number
  groups: Map<number, number>
  names: Map<string, number>
}

function shapeOf(pieces: Piece[]): TemplateShape {
  const t: TemplateShape = {
    literal: 0,
    match: 0,
    before: 0,
    after: 0,
    groups: new Map(),
    names: new Map(),
  }
  for (const p of pieces)
    if ('lit' in p) t.literal += p.lit.length
    else if ('ref' in p) t[p.ref]++
    else if ('group' in p)
      t.groups.set(p.group, (t.groups.get(p.group) ?? 0) + 1)
    else t.names.set(p.name, (t.names.get(p.name) ?? 0) + 1)
  return t
}

const spanLength = (c: [number, number] | undefined) => (c ? c[1] - c[0] : 0)

/** The exact length one substitution produces, in O(distinct references), without building it. */
function substitutionLength(t: TemplateShape, sub: Substitution, n: number) {
  let length =
    t.literal +
    t.match * (sub.end - sub.start) +
    t.before * sub.start +
    t.after * (n - sub.end)
  for (const [g, k] of t.groups) length += k * spanLength(sub.captures[g])
  for (const [name, k] of t.names) {
    const g = sub.names?.get(name)
    if (g !== undefined) length += k * spanLength(sub.captures[g])
  }
  return length
}

/**
 * Build `s` with each substitution applied. Each substitution is charged BEFORE it is built (M4):
 * its exact output length, computed from the template's shape, and a step per template piece, so
 * neither a huge output nor a long template of empty references runs ahead of the budget.
 */
function substitute(
  s: string,
  subs: Substitution[],
  repl: string,
  groupCount: number,
  hasNames: boolean,
  m: Meters
): string {
  if (!subs.length) return s
  const pieces = parseReplacement(repl, groupCount, hasNames, m)
  const shape = shapeOf(pieces)
  m.steps(pieces.length)
  m.alloc(64)
  let out = ''
  let last = 0
  for (const sub of subs) {
    m.steps(pieces.length + 1)
    m.alloc((sub.start - last + substitutionLength(shape, sub, s.length)) * 2)
    out += s.slice(last, sub.start)
    for (const p of pieces) {
      const from = pieceSource(p, sub, s)
      if (from !== undefined)
        out += typeof from === 'string' ? from : s.slice(from[0], from[1])
    }
    last = sub.end
  }
  m.alloc((s.length - last) * 2)
  return out + s.slice(last)
}

// ---------------------------------------------------------------- the methods

export function replace(
  s: string,
  pattern: Pattern,
  repl: string,
  m: Meters
): string {
  if (!isGuestRegex(pattern)) {
    const at = s.indexOf(pattern)
    if (at === -1) return s
    const end = at + pattern.length
    return substitute(
      s,
      [{ start: at, end, captures: [[at, end]], names: null }],
      repl,
      0,
      false,
      m
    )
  }
  return replaceHits(s, allMatches(prepare(pattern, m), s, m), repl, m)
}

/** Apply a replacement to matches already found: a template (`$1`, `$<name>`, …) charged
 * before it is built, or a function called per match as JavaScript calls it, each piece
 * charged before it is appended. Shared with the predicate adapter. */
export function replaceHits(
  s: string,
  hits: RegexMatch[],
  repl: string | ((...args: any[]) => unknown),
  m: Meters
): string {
  if (typeof repl !== 'function') {
    const groups = hits[0] ? hits[0].captures.length - 1 : 0
    return substitute(
      s,
      hits.map(substitutionOf),
      repl,
      groups,
      !!hits[0]?.names.size,
      m
    )
  }
  let out = ''
  let last = 0
  for (const hit of hits) {
    const a = matchArray(hit, s, m)
    const args = [...a, hit.index, s]
    if (a.groups) args.push(a.groups)
    const piece = String(repl(...args))
    m.alloc((hit.index - last + piece.length) * 2)
    out += s.slice(last, hit.index) + piece
    last = hit.end
  }
  m.alloc((s.length - last) * 2)
  return out + s.slice(last)
}

export function replaceAll(
  s: string,
  pattern: Pattern,
  repl: string,
  m: Meters
): string {
  if (isGuestRegex(pattern)) {
    if (!pattern.global)
      throw new TypeError('replaceAll must be called with a global RegExp')
    return replace(s, pattern, repl, m)
  }
  const subs: Substitution[] = []
  const step = Math.max(1, pattern.length)
  for (
    let at = s.indexOf(pattern);
    at !== -1;
    at = s.indexOf(pattern, at + step)
  ) {
    m.alloc(64)
    const end = at + pattern.length
    subs.push({ start: at, end, captures: [[at, end]], names: null })
    if (at >= s.length) break
  }
  return substitute(s, subs, repl, 0, false, m)
}

export function search(s: string, pattern: Pattern, m: Meters): number {
  const hit = prepare(pattern, m).exec(s, 0)
  return hit ? hit.index : -1
}

/** JavaScript's match result: an array with `index`, `input` and `groups`, or every match. */
export function match(s: string, pattern: Pattern, m: Meters): unknown {
  const p = prepare(pattern, m)
  if (!p.re.global) {
    const hit = p.exec(s, 0)
    return hit ? matchArray(hit, s, m) : null
  }
  const hits = allMatches(p, s, m)
  if (!hits.length) return null
  m.alloc(hits.reduce((n, h) => n + (h.end - h.index) * 2 + 8, 0) + 64)
  return hits.map((h) => s.slice(h.index, h.end))
}

/** `split(separator, limit)` — a string separator literally, a regex by the specification's
 * algorithm (a match at each position, captures spliced in, empty matches not splitting at the
 * position they were found). Every piece is charged as it is made. */
export function split(
  s: string,
  sep: Pattern | undefined,
  limit: number | undefined,
  m: Meters
): string[] {
  const lim = limit === undefined ? 2 ** 32 - 1 : limit >>> 0
  const out: string[] = []
  const push = (piece: string | undefined) => {
    m.alloc((piece?.length ?? 0) * 2 + 32)
    out.push(piece as string)
  }
  if (lim === 0) return out
  if (sep === undefined) {
    push(s)
    return out
  }
  if (!isGuestRegex(sep)) {
    if (sep === '') {
      // by code UNIT, as JavaScript splits a string on ''
      for (let i = 0; i < s.length && out.length < lim; i++) push(s[i])
      return out
    }
    let p = 0
    for (
      let at = s.indexOf(sep);
      at !== -1 && out.length < lim;
      at = s.indexOf(sep, p)
    ) {
      push(s.slice(p, at))
      p = at + sep.length
    }
    if (out.length < lim) push(s.slice(p))
    return out
  }
  const sepRe = prepare(sep, m)
  if (s.length === 0) {
    if (!sepRe.exec(s, 0, true)) push(s)
    return out
  }
  let p = 0
  let q = 0
  while (q < s.length) {
    const hit = sepRe.exec(s, q, true)
    if (!hit || hit.end === p) {
      q = advance(s, q, sepRe.re.unicode)
      continue
    }
    push(s.slice(p, q))
    if (out.length === lim) return out
    p = hit.end
    for (let g = 1; g < hit.captures.length; g++) {
      const c = hit.captures[g]
      push(c ? s.slice(c[0], c[1]) : undefined)
      if (out.length === lim) return out
    }
    q = p
  }
  push(s.slice(p))
  return out
}
