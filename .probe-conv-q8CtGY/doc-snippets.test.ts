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

import { readFileSync } from 'node:fs'

import { resolve } from 'node:path'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang'

const REPO = resolve('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const DOCS = [
  'CLAUDE-TJS-SYNTAX.md',
  'DOCS-TJS.md',
  'DOCS-WASM.md',
  'TJS-FOR-TS.md',
  'TJS-FOR-JS.md',
  'README.md',
  'CONTEXT.md',
  'guides/footguns.md',
  'guides/patterns.md',
  'docs/dictionary-defaults.md',

  'guides/tjs.md',
  'guides/benchmarks.md',
]

const Snippet = Type('Snippet', undefined, {
  doc: '',
  line: 0.0,
  code: '',
  mode: null,
})
var __tjs_has_Snippet = true

/* line 81 */
function snippets(doc) {
  const text = readFileSync(resolve(REPO, doc), 'utf8')
  const out = []
  const re =
    /(?:<!--\s*tjs-doc:\s*(fragment|expect-error)\s*-->\s*\n)?```(typescript|tjs|js|javascript)\n([\s\S]*?)```/g
  for (const m of text.matchAll(re)) {
    out.push({
      doc,
      line: text.slice(0, m.index).split('\n').length,
      code: m[3],
      mode: m[1] ?? 'compile',
    })
  }
  return out
}
snippets.__tjs = {
  params: {
    doc: {
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
  source: 'input.ts:81',
}

const ALL = DOCS.flatMap(snippets)

describe('documentation snippets are real code', () => {
  it('found snippets to check', () => {
    expect(ALL.length).toBeGreaterThan(20)
    expect(ALL.some((s) => s.mode === 'compile')).toBe(true)
  })
  for (const s of ALL) {
    if (s.mode === 'fragment') continue
    it(`${s.doc}:${s.line} ${
      s.mode === 'expect-error' ? 'must NOT compile' : 'compiles'
    }`, () => {
      let error = null
      try {
        tjs(s.code, { filename: `${s.doc}:${s.line}`, runTests: false })
      } catch (e) {
        error = String(e.message).split('\n')[0]
      }
      if (s.mode === 'expect-error') {
        expect(
          error
            ? 'rejected'
            : `compiles, but is marked expect-error:\n${s.code
                .trim()
                .slice(0, 200)}`
        ).toBe('rejected')
      } else {
        expect(
          error
            ? `${error}\n--- snippet ---\n${s.code.trim().slice(0, 300)}`
            : 'ok'
        ).toBe('ok')
      }
    })
  }
  it('fragments are annotated, never silently skipped', () => {
    const fragments = ALL.filter((s) => s.mode === 'fragment')
    expect(fragments.length).toBeLessThan(ALL.length / 2)
  })
  it('no single document is mostly fragments', () => {
    const MIN_SNIPPETS = 8
    const MAX_RATIO = 0.4
    /**
     * Documents allowed to exceed it, with the reason and the measured value.
     *
     * RATIOS MAY ONLY GO DOWN — the promote-check below demands the number be lowered
     * when it improves, so a fixed snippet cannot leave slack a regression can occupy.
     *
     * A single blanket threshold is the wrong instrument twice over: too low and a
     * comparison guide is permanently red for doing its job, too high and a reference
     * silently goes half-unchecked. Both entries below are fragment-heavy by nature, and
     * saying so HERE is the point — an allowance nobody can see is the same failure the
     * surrounding test exists to prevent.
     */
    const ALLOWED = {
      'TJS-FOR-TS.md': {
        ratio: 0.56,
        why: 'a side-by-side migration guide: most snippets are a TS excerpt beside its TJS counterpart, neither of which is a whole program',
      },
      'guides/footguns.md': {
        ratio: 0.5,
        why: 'each entry contrasts a JS expression with its TJS result; the JS half is deliberately not TJS-compilable',
      },
    }
    const byDoc = new Map()
    for (const s of ALL) {
      const e = byDoc.get(s.doc) ?? { total: 0, frag: 0 }
      e.total++
      if (s.mode === 'fragment') e.frag++
      byDoc.set(s.doc, e)
    }
    const measured = [...byDoc.entries()]
      .filter(([, e]) => e.total >= MIN_SNIPPETS)
      .map(([doc, e]) => ({ doc, ratio: e.frag / e.total, ...e }))
    const offenders = measured
      .filter(({ doc, ratio }) => ratio > (ALLOWED[doc]?.ratio ?? MAX_RATIO))
      .map(
        ({ doc, frag, total, ratio }) =>
          `${doc}: ${frag}/${total} fragments (${(ratio * 100).toFixed(0)}%)` +
          (ALLOWED[doc]
            ? ` — over its allowance of ${(ALLOWED[doc].ratio * 100).toFixed(
                0
              )}%`
            : '')
      )
    expect(offenders).toEqual([])

    const improved = measured
      .filter(
        ({ doc, ratio }) => ALLOWED[doc] && ratio < ALLOWED[doc].ratio - 0.05
      )
      .map(
        ({ doc, ratio }) =>
          `${doc} improved to ${(ratio * 100).toFixed(
            0
          )}% — lower or remove its ALLOWED entry`
      )
    expect(improved).toEqual([])

    const stale = Object.keys(ALLOWED).filter(
      (d) => !measured.some((m) => m.doc === d)
    )
    expect(stale).toEqual([])
  })
})
