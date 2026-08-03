import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { commentRanges, maskLiterals } from '../strip-comments'
import { coreAtoms, type AtomDef } from './runtime'
import { batteryAtoms } from './atoms/index'

/** Effective tags, as the VM sees them at run time. */
const REGISTERED = { ...coreAtoms, ...batteryAtoms } as Record<string, AtomDef>

/**
 * The effects tag, checked against what each atom's body ACTUALLY DOES.
 *
 * `atom-effects.test.ts` iterates `EFFECTFUL_CORE_OPS` — the same constant that ASSIGNS
 * the tag — so it cannot fail on an omission. It is a tautology: it proves the list agrees
 * with itself, which was never in doubt. Meanwhile `xmlParse` called
 * `ctx.capabilities.xml.parse(...)` and was tagged `pure`, and every atom in
 * `atoms/browser.ts` touched a capability with no tag at all.
 *
 * That is not cosmetic. `effects: 'io'` is what routes a return through the
 * structuredClone capability membrane, so a mis-tagged atom hands the guest a LIVE HOST
 * OBJECT — a `DOMParser` result is a real `Document`, with a real prototype chain, and
 * `methodCall` is standing right there. It is also what the predicate verifier reads, so a
 * cluster calling a mis-tagged atom gets certified pure, cached, and compiled to native JS.
 *
 * So this test reads the SOURCE and asks the only question that matters: does this atom's
 * body do something effectful, and is it tagged for it? A new atom that touches a
 * capability is caught the moment it is written, whether or not anyone remembers a list.
 */

const ATOM_SOURCES = [
  'runtime.ts',
  ...readdirSync(join(import.meta.dir, 'atoms'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join('atoms', f)),
]

/** Markers that make an atom effectful. Extend when a new escape from purity appears. */
const EFFECT_MARKERS: Array<[label: string, re: RegExp]> = [
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

interface AtomSite {
  file: string
  op: string
  body: string
  effects: string | null
}

/**
 * Pair every `defineAtom('name', …)` with the text of its call.
 *
 * Extent found by paren-matching over a LITERAL-MASKED view, so a paren inside a string,
 * a regex or a doc comment does not end the call early — the defect class this release
 * spent its largest change eliminating, and the reason this file can be short.
 */
function collectAtoms(file: string): AtomSite[] {
  const source = readFileSync(join(import.meta.dir, file), 'utf-8')
  const masked = maskLiterals(source)
  const comments = commentRanges(source)
  const inComment = (at: number) => comments.some(([a, b]) => at >= a && at < b)

  const sites: AtomSite[] = []
  const re = /\bdefineAtom\s*\(\s*['"]([A-Za-z0-9_$]+)['"]/g
  let m: RegExpExecArray | null
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
    const op = m[1]!
    // Prefer the EFFECTIVE tag. Core IO atoms are tagged post-construction via
    // EFFECTFUL_CORE_OPS (and the batteries similarly), which is a legitimate pattern —
    // reading only the literal at the declaration site would report three dozen false
    // positives and train everyone to ignore this test. An atom that is never registered
    // falls back to its declaration site: unreachable today is not the same as safe, and
    // it becomes reachable the moment someone wires it up.
    const effects =
      REGISTERED[op]?.effects ??
      /effects:\s*['"](\w+)['"]/.exec(body)?.[1] ??
      null
    sites.push({ file, op, body, effects })
  }
  return sites
}

const ALL_SITES = ATOM_SOURCES.flatMap(collectAtoms)

/**
 * Atoms whose body matches a marker but which are genuinely pure.
 *
 * Every entry needs a REASON. An unexplained exemption is how the original list rotted:
 * it recorded a decision without recording why, so nobody could tell a deliberate
 * omission from a forgotten one.
 */
const EXEMPT: Record<string, string> = {
  // `crypto.subtle.digest` is a DETERMINISTIC transform, not a source of randomness:
  // SHA-256 of the same bytes is the same string, always, with no IO and no ambient state.
  // The marker matches on `crypto.` because `crypto.getRandomValues` is the thing worth
  // catching. A predicate is free to hash.
  hash: 'crypto.subtle.digest is a pure function of its input, not a randomness source',
}

describe('effects tags match what the atom body does', () => {
  it('finds the atoms at all (guards against a silently empty scan)', () => {
    // A regex that matched nothing would make every assertion below vacuously true — the
    // exact "green != ran" failure this suite exists to prevent elsewhere.
    expect(ALL_SITES.length).toBeGreaterThan(50)
    expect(ALL_SITES.map((s) => s.op)).toContain('httpFetch')
    expect(ALL_SITES.map((s) => s.op)).toContain('xmlParse')
  })

  it('every atom whose body is effectful is tagged io', () => {
    const untagged: string[] = []
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
