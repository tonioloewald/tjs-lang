/**
 * Change what the model probe CONCLUDES, and the cached conclusions must be invalidated.
 *
 * The audit cache was keyed on `baseUrl` plus a 24-hour TTL. That asks "is this answer
 * recent?" and never "is this answer still computed the same way?" — and 0.13.0 changed
 * exactly the second thing: `looksLikeVisionModel` was consolidated after being wrong in
 * three separate copies, and the survivor knew `gemma-3` but not `gemma-4`.
 *
 * So an upgrader with a warm cache kept `vision: false` for a multimodal model for up to a
 * day. The symptom — vision quietly unavailable — points nowhere near a stale JSON file,
 * and "wait 24 hours" is not a debugging step anyone reaches for.
 *
 * `PROBE_VERSION` fixes that, and this file is what stops it becoming decoration. A comment
 * saying "bump this when the probe changes" is exactly the kind of instruction that is
 * followed until the one time it matters, so the probe functions are HASHED and the hash is
 * recorded here. Edit one without bumping the version and this fails, naming both.
 *
 * When it fails legitimately: bump `PROBE_VERSION` in `audit.ts`, then update `PROBE_HASH`
 * below to the value this test prints. Both, in that order — updating only the hash is the
 * same as not having the test.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { stripComments } from '../strip-comments'

const AUDIT = readFileSync(join(import.meta.dir, 'audit.ts'), 'utf8')
/** The same file with comments removed — see the cwd check for why that matters. */
const AUDIT_CODE = stripComments(AUDIT)

/**
 * The functions whose OUTPUT decides what lands in the cache.
 *
 * Not the whole file: reformatting a comment or renaming a local in an unrelated helper
 * should not demand a cache-invalidating version bump, or the bump stops meaning anything.
 */
const PROBE_FUNCTIONS = [
  'looksLikeVisionModel',
  'checkLLM',
  'checkVision',
  'checkStructured',
  'checkStructuredLegacy',
  'checkEmbedding',
  'isEmbeddingModel',
]

/** A function's source text, from its declaration to the closing brace at column 0. */
function functionSource(name: string): string {
  const re = new RegExp(
    `^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`,
    'm'
  )
  const m = AUDIT.match(re)
  if (!m || m.index === undefined) return ''
  const end = AUDIT.indexOf('\n}\n', m.index)
  return AUDIT.slice(m.index, end === -1 ? AUDIT.length : end + 3)
}

function probeHash(): string {
  const h = createHash('sha256')
  for (const name of PROBE_FUNCTIONS) {
    const src = functionSource(name)
    // Comments and whitespace do not change a conclusion; strip them so a doc edit is not
    // mistaken for a behaviour change. Crude on purpose — over-triggering costs one bump,
    // under-triggering costs a day of stale answers.
    h.update(
      src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, ' ')
    )
  }
  return h.digest('hex').slice(0, 16)
}

/** Recorded 2026-08-30 against PROBE_VERSION 3. */
const PROBE_HASH = '51abaaa32ec2eec6'

describe('the probe version tracks the probe', () => {
  it('finds every probe function it claims to hash', () => {
    // A typo'd name would silently hash the empty string, and the guard would then never
    // notice a change to the function it was named for.
    const missing = PROBE_FUNCTIONS.filter((n) => functionSource(n) === '')
    expect(missing).toEqual([])
  })

  it('claims every probe function that EXISTS', () => {
    // The converse, and the direction that was missing. The list above checked only the
    // names it already had, so `checkLLM` — which decides whether a model is an LLM at all —
    // was never hashed. Changing it did not trip this guard, and a 24h cache would have gone
    // on serving the old classification. Same asymmetry as the editor vocabulary: verifying
    // every claim is not the same as verifying there are no unclaimed things.
    const src = readFileSync(join(import.meta.dir, 'audit.ts'), 'utf-8')
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
    // Caches written before 0.13.0 have no `probeVersion`, so they must read as stale
    // rather than as "version undefined, close enough".
    expect(AUDIT).toContain('probeVersion: PROBE_VERSION')
    expect(AUDIT).toContain('data.probeVersion !== PROBE_VERSION')
  })

  it('does not write into the consumer working directory', () => {
    // It used to be a dotfile dropped into whatever repo happened to be the cwd, which
    // the consumer then has to gitignore.
    //
    // Checked against the COMMENT-STRIPPED source, because the first version of this
    // assertion read the whole file and matched the sentence in `audit.ts` explaining
    // that the cwd write had been removed. A literal-blind guard, in a codebase whose
    // dominant defect class is literal blindness, written while fixing it. The shared
    // scanner exists precisely so this is a one-word fix rather than a hand-rolled one.
    expect(AUDIT_CODE).not.toContain('process.cwd()')
  })
})
