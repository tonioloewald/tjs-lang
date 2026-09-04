function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  return t
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Type }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync, readdirSync } from 'fs'

import { join } from 'path'

import {
  commentRanges,
  maskLiterals,
} from '/Users/tonioloewald/tjs-lang/src/strip-comments'

import { coreAtoms } from '/Users/tonioloewald/tjs-lang/src/vm/runtime'

import { batteryAtoms } from '/Users/tonioloewald/tjs-lang/src/vm/atoms/index'

const REGISTERED = { ...coreAtoms, ...batteryAtoms }

const ATOM_SOURCES = [
  'runtime.ts',
  ...readdirSync(join('/Users/tonioloewald/tjs-lang/src/vm', 'atoms'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join('atoms', f)),
]
export {}

const EFFECT_MARKERS = [
  ['reads ctx.capabilities', /\bctx\.capabilities\b/],
  ['is nondeterministic (Math.random)', /\bMath\.random\s*\(/],
  ['is nondeterministic (crypto)', /\bcrypto\s*\./],
  [
    'is nondeterministic (Date.now / new Date)',
    /\bDate\.now\s*\(|\bnew Date\s*\(/,
  ],
  ['performs IO (fetch)', /(?<!\w)fetch\s*\(/],
  ['writes to the console', /\bconsole\.(log|warn|error|info|debug)\s*\(/],
]

const AtomSite = Type('AtomSite', undefined, {
  file: '',
  op: '',
  body: '',
  effects: '' | null,
})
var __tjs_has_AtomSite = true

/* line 65 */
function collectAtoms(file) {
  const source = readFileSync(
    join('/Users/tonioloewald/tjs-lang/src/vm', file),
    'utf-8'
  )
  const masked = maskLiterals(source)
  const comments = commentRanges(source)
  const inComment = (at) => comments.some(([a, b]) => at >= a && at < b)
  const sites = []
  const re = /\bdefineAtom\s*\(\s*['"]([A-Za-z0-9_$]+)['"]/g
  let m
  while ((m = re.exec(source)) !== null) {
    if (inComment(m.index)) continue
    const open = masked.indexOf('(', m.index)
    let depth = 0
    let end = open
    for (let i = open; i < masked.length; i++) {
      if (masked[i] === '(') depth++
      else if (masked[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = source.slice(m.index, end + 1)
    const op = m[1]

    const effects =
      REGISTERED[op]?.effects ??
      /effects:\s*['"](\w+)['"]/.exec(body)?.[1] ??
      null
    sites.push({ file, op, body, effects })
  }
  return sites
}
collectAtoms.__tjs = {
  params: {
    file: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'any',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:65',
}
export {}

const ALL_SITES = ATOM_SOURCES.flatMap(collectAtoms)

const EXEMPT = {
  hash: 'crypto.subtle.digest is a pure function of its input, not a randomness source',
}

describe('effects tags match what the atom body does', () => {
  it('finds the atoms at all (guards against a silently empty scan)', () => {
    expect(ALL_SITES.length).toBeGreaterThan(50)
    expect(ALL_SITES.map((s) => s.op)).toContain('httpFetch')
    expect(ALL_SITES.map((s) => s.op)).toContain('xmlParse')
  })
  it('every atom whose body is effectful is tagged io', () => {
    const untagged = []
    for (const site of ALL_SITES) {
      if (EXEMPT[site.op]) continue
      const hit = EFFECT_MARKERS.find(([, re]) => re.test(site.body))
      if (hit && site.effects !== 'io') {
        untagged.push(
          `${site.file}: ${site.op} ${hit[0]} but effects=${
            site.effects ?? '(unset, defaults to pure)'
          }`
        )
      }
    }
    expect(
      untagged,
      'a mis-tagged atom skips the capability membrane AND is certified pure by the ' +
        "predicate verifier — add effects: 'io', or add an EXEMPT entry with a reason"
    ).toEqual([])
  })
})
