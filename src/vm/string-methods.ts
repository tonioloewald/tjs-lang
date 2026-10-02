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
  type GuestRegex,
  type RegexMatch,
} from './regex'

export interface Meters {
  alloc(bytes: number): void
  steps(n: number): void
}

/** A string pattern, or a regex. A STRING passed to match/search is compiled as a pattern, as
 * JavaScript does (`'a.c'.search('.')` is 0); to replace/replaceAll/split it is literal. */
type Pattern = string | GuestRegex

const toRegex = (p: Pattern): GuestRegex =>
  isGuestRegex(p) ? p : compileRegex(String(p), '')

/** AdvanceStringIndex: past an empty match by one code unit, or one code point with `u`. */
function advance(s: string, i: number, unicode: boolean): number {
  if (!unicode || i + 1 >= s.length) return i + 1
  const c = s.charCodeAt(i)
  const d = s.charCodeAt(i + 1)
  return c >= 0xd800 && c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff
    ? i + 2
    : i + 1
}

/** Every match of a regex from 0, as `matchAll`/global methods find them. */
function allMatches(re: GuestRegex, s: string, m: Meters): RegexMatch[] {
  const out: RegexMatch[] = []
  let from = 0
  while (from <= s.length) {
    const hit = execRegex(re, s, from, m.steps)
    if (!hit) break
    m.alloc(64) // the match record
    out.push(hit)
    // past an empty match by one character, so the scan always advances
    from = hit.end === hit.index ? advance(s, hit.end, re.unicode) : hit.end
  }
  return out
}

// ---------------------------------------------------------------- substitution

interface Substitution {
  matched: string
  position: number
  captures: Array<string | undefined>
  named: Map<string, string | undefined> | null
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
  hasNames: boolean
): Piece[] {
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

function pieceText(p: Piece, sub: Substitution, s: string): string {
  if ('lit' in p) return p.lit
  if ('ref' in p)
    return p.ref === 'match'
      ? sub.matched
      : p.ref === 'before'
      ? s.slice(0, sub.position)
      : s.slice(sub.position + sub.matched.length)
  if ('group' in p) return sub.captures[p.group - 1] ?? ''
  return sub.named?.get(p.name) ?? ''
}

/** The exact length of a piece, WITHOUT building it (so it is charged before it exists). */
function pieceLength(p: Piece, sub: Substitution, s: string): number {
  if ('ref' in p)
    return p.ref === 'match'
      ? sub.matched.length
      : p.ref === 'before'
      ? sub.position
      : s.length - sub.position - sub.matched.length
  return pieceText(p, sub, s).length // literals and captures already exist
}

function substitutionOf(hit: RegexMatch, s: string): Substitution {
  const text = (c: [number, number] | undefined) =>
    c ? s.slice(c[0], c[1]) : undefined
  let named: Map<string, string | undefined> | null = null
  if (hit.names.size) {
    named = new Map()
    for (const [name, g] of hit.names) named.set(name, text(hit.captures[g]))
  }
  return {
    matched: s.slice(hit.index, hit.end),
    position: hit.index,
    captures: hit.captures.slice(1).map(text),
    named,
  }
}

/** Build `s` with each substitution applied — the output's exact size charged first. */
function substitute(
  s: string,
  subs: Substitution[],
  repl: string,
  groupCount: number,
  hasNames: boolean,
  m: Meters
): string {
  if (!subs.length) return s
  const pieces = parseReplacement(repl, groupCount, hasNames)
  let length = s.length
  for (const sub of subs) {
    length -= sub.matched.length
    for (const p of pieces) length += pieceLength(p, sub, s)
  }
  m.alloc(length * 2 + 64)
  let out = ''
  let last = 0
  for (const sub of subs) {
    out += s.slice(last, sub.position)
    for (const p of pieces) out += pieceText(p, sub, s)
    last = sub.position + sub.matched.length
  }
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
    return substitute(
      s,
      [{ matched: pattern, position: at, captures: [], named: null }],
      repl,
      0,
      false,
      m
    )
  }
  const hits = pattern.global
    ? allMatches(pattern, s, m)
    : [execRegex(pattern, s, 0, m.steps)].filter((h): h is RegexMatch => !!h)
  const groups = hits[0] ? hits[0].captures.length - 1 : 0
  return substitute(
    s,
    hits.map((h) => substitutionOf(h, s)),
    repl,
    groups,
    !!hits[0]?.names.size,
    m
  )
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
    subs.push({ matched: pattern, position: at, captures: [], named: null })
    if (at >= s.length) break
  }
  return substitute(s, subs, repl, 0, false, m)
}

export function search(s: string, pattern: Pattern, m: Meters): number {
  const re = toRegex(pattern)
  const hit = execRegex(re, s, 0, m.steps)
  return hit ? hit.index : -1
}

/** JavaScript's match result: an array with `index`, `input` and `groups`, or every match. */
export function match(s: string, pattern: Pattern, m: Meters): unknown {
  const re = toRegex(pattern)
  if (!re.global) {
    const hit = execRegex(re, s, 0, m.steps)
    if (!hit) return null
    const sub = substitutionOf(hit, s)
    m.alloc(
      (sub.matched.length +
        sub.captures.reduce((n, c) => n + (c?.length ?? 0), 0)) *
        2 +
        128
    )
    const out: any = [sub.matched, ...sub.captures]
    out.index = hit.index
    out.input = s
    out.groups = sub.named
      ? Object.assign(Object.create(null), Object.fromEntries(sub.named))
      : undefined
    return out
  }
  const hits = allMatches(re, s, m)
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
  if (s.length === 0) {
    if (!execRegex(sep, s, 0, m.steps, true)) push(s)
    return out
  }
  let p = 0
  let q = 0
  while (q < s.length) {
    const hit = execRegex(sep, s, q, m.steps, true)
    if (!hit || hit.end === p) {
      q = advance(s, q, sep.unicode)
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
