/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

import { createHash } from 'node:crypto'

import { stripComments } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

const AUDIT = readFileSync(
  join('/Users/tonioloewald/tjs-lang/src/batteries', 'audit.ts'),
  'utf8'
)
export {}

const AUDIT_CODE = stripComments(AUDIT)

const PROBE_FUNCTIONS = [
  'looksLikeVisionModel',
  'checkLLM',
  'checkVision',
  'checkStructured',
  'checkStructuredLegacy',
  'checkEmbedding',
  'isEmbeddingModel',
]

/* line 49 */
function functionSource(name) {
  const re = new RegExp(
    `^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`,
    'm'
  )
  const m = AUDIT.match(re)
  if (!m || m.index === undefined) return ''
  const end = AUDIT.indexOf('\n}\n', m.index)
  return AUDIT.slice(m.index, end === -1 ? AUDIT.length : end + 3)
}
functionSource.__tjs = {
  params: {
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:49',
}

/* line 60 */
function probeHash() {
  const h = createHash('sha256')
  for (const name of PROBE_FUNCTIONS) {
    const src = functionSource(name)

    h.update(
      src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, ' ')
    )
  }
  return h.digest('hex').slice(0, 16)
}
probeHash.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:60',
}

const PROBE_HASH = '738894d8926ef53d'

describe('the probe version tracks the probe', () => {
  it('finds every probe function it claims to hash', () => {
    const missing = PROBE_FUNCTIONS.filter((n) => functionSource(n) === '')
    expect(missing).toEqual([])
  })
  it('claims every probe function that EXISTS', () => {
    const src = readFileSync(
      join('/Users/tonioloewald/tjs-lang/src/batteries', 'audit.ts'),
      'utf-8'
    )
    const declared = [
      ...src.matchAll(
        /^(?:async )?function (check[A-Z]\w*|looksLike\w+|isEmbedding\w*)\(/gm
      ),
    ].map((m) => m[1])
    const unclaimed = declared.filter((n) => !PROBE_FUNCTIONS.includes(n))
    expect(
      unclaimed,
      `These probe functions are not hashed, so changing one would not force a ` +
        `PROBE_VERSION bump and a stale cache would serve the old conclusions.`
    ).toEqual([])
  })
  it('the probe logic is unchanged, or PROBE_VERSION was bumped', () => {
    const actual = probeHash()
    expect(
      actual,
      `The model-probe logic changed. A cached audit from an older version would keep ` +
        `serving the OLD conclusions for up to 24h — which is how a consolidated ` +
        `looksLikeVisionModel left gemma-4 marked vision:false.\n\n` +
        `  1. bump PROBE_VERSION in src/batteries/audit.ts\n` +
        `  2. set PROBE_HASH in this file to: ${actual}\n`
    ).toBe(PROBE_HASH)
  })
  it('the cache carries the version, and rejects an entry without one', () => {
    expect(AUDIT).toContain('probeVersion: PROBE_VERSION')
    expect(AUDIT).toContain('data.probeVersion !== PROBE_VERSION')
  })
  it('does not write into the consumer working directory', () => {
    expect(AUDIT_CODE).not.toContain('process.cwd()')
  })
})
export {}
