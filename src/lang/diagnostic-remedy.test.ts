/**
 * Diagnostics for deliberately-absent constructs must SHOW the fix, not describe it.
 *
 * This is an empirical finding turned into an invariant. An A/B over diagnostic text
 * (`experiments/agent-legibility/error-message-ab.ts`, N=10/variant) measured the repair
 * rate a message actually produces:
 *
 *   worked example  80%
 *   prose remedy    50%
 *   bare message     0%   ← what we shipped
 *   nothing at all   0%
 *
 * Our messages were accurate and worth exactly nothing: `Unsupported statement type:
 * ForStatement` names the defect perfectly and repaired 0 of 10. On that case, prose
 * advice scored 0/5 while the same remedy shown as code scored 5/5.
 *
 * The test is deterministic on purpose — no model, no network, runs in the fast lane.
 * The finding needed a model; the *invariant* it produced does not, so it can be enforced
 * on every commit rather than on the rare occasions someone runs the LLM lanes.
 *
 * If you add a construct AJS rejects, add a remedy with real code. A message that only
 * names the problem is a regression, however true it is.
 */
import { describe, it, expect } from 'bun:test'
import { ajs } from '../index'
import { ajs } from '../transpiler/index'
import { CONSTRUCT_REMEDIES } from './emitters/ast'

/** Source that trips each unsupported construct. */
const TRIGGERS: Record<string, string> = {
  ForStatement: `function f(n: 0) {
    let t = 0
    for (let i = 0; i < n; i++) { t = t + i }
    return { t }
  }`,
  SwitchStatement: `function f(k: '') {
    switch (k) { case 'a': return { v: 1 } }
    return { v: 0 }
  }`,
  ForInStatement: `function f(o: {}) {
    let n = 0
    for (const k in o) { n = n + 1 }
    return { n }
  }`,
  DoWhileStatement: `function f(n: 0) {
    let i = 0
    do { i = i + 1 } while (i < n)
    return { i }
  }`,
}

describe('unsupported-construct diagnostics carry a worked remedy', () => {
  it('every declared remedy contains actual code, not just prose', () => {
    for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
      // "Shows code" ≈ contains a line that reads like a statement. Prose-only
      // remedies measured 50% vs 80% for worked examples, and 0/5 vs 5/5 on the
      // for-loop case specifically — so this is the property that carries the value.
      const hasCode = /\n\s{2,}\S/.test(remedy) && /[={(]/.test(remedy)
      expect(hasCode, `${construct} remedy must show code:\n${remedy}`).toBe(
        true
      )
    }
  })

  it('mentions what to use INSTEAD, not only what is missing', () => {
    for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
      expect(
        /while|if|map|filter|reduce|return|function|keys/.test(remedy),
        `${construct} remedy must name a supported alternative`
      ).toBe(true)
    }
  })

  it('every remedy names a construct the transpiler ACTUALLY rejects', () => {
    // The check that earned its keep: a first draft carried a remedy for `for...of`,
    // which AJS supports. A diagnostic for a restriction that does not exist is worse
    // than no diagnostic — it teaches a false limit and sends the reader to a workaround
    // they never needed. Every remedy must have a trigger proving the rejection is real.
    for (const construct of Object.keys(CONSTRUCT_REMEDIES)) {
      expect(
        TRIGGERS[construct],
        `${construct} has a remedy but no trigger proving AJS rejects it. ` +
          `Either add a trigger, or delete the remedy — it may document a limit that isn't real.`
      ).toBeDefined()
    }
  })

  for (const [construct, src] of Object.entries(TRIGGERS)) {
    it(`${construct}: the thrown error actually carries the remedy`, () => {
      // The remedy is worthless if it lives in a table nobody reads — it has to reach
      // the message the caller (or the model) actually sees.
      let message: string
      try {
        ajs(src)
        throw new Error(`expected ${construct} to be rejected`)
      } catch (e: any) {
        message = String(e.message)
      }
      expect(message).toContain(`Unsupported statement type: ${construct}`)
      const remedy = CONSTRUCT_REMEDIES[construct]
      // Compare on the first line: the transpiler may wrap/indent the rest.
      expect(message).toContain(remedy.split('\n')[0])
    })
  }
})

describe('remedies are spec, not strings', () => {
  // Once an error message teaches, it is load-bearing specification and deserves what
  // spec gets. The sharpest version of that: a remedy we hand a model must be code the
  // model can actually run. A remedy that does not compile is worse than none — it
  // spends the one repair attempt we get and teaches a wrong lesson with our authority.
  //
  // The snippets are fragments (AJS requires a function declaration), so they are
  // compiled inside a wrapper that supplies the identifiers they reference.
  const WRAPPER_PARAMS = `items: [], data: {}, kind: '', n: 0`

  for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
    it(`${construct}: the suggested repair actually compiles`, () => {
      const code = remedy.split('\n').slice(1).join('\n')
      const src = `function demo(${WRAPPER_PARAMS}) {\n${code}\n  return 0\n}`
      expect(
        () => ajs(src),
        `the remedy shown for ${construct} does not compile — we would be handing a ` +
          `model broken code with our authority behind it:\n${src}`
      ).not.toThrow()
    })
  }
})
