/**
 * LM Studio LIVE smoke — the irreducible "our client still works against reality".
 *
 * Deliberately minimal. The capability layer's request/parse/error logic is now
 * covered deterministically and fast in llm-transport.test.ts (HTTP fixtures), so
 * this file keeps only what a real server can prove: that audit classifies a live
 * model list, and that predict/embed/structured-output actually round-trip against
 * LM Studio. It asserts SHAPE (a string, a vector, parseable JSON), never content —
 * content is the model's business, and AJS grokkability is measured separately in
 * ajs-grokkability.test.ts.
 *
 * Gated by SKIP_LLM_TESTS (so test:fast skips it) and run in the pre-tag gate. It
 * audits ONCE in beforeAll — the previous version re-audited in all five tests,
 * and the audit (which probes every loaded model with several HTTP calls) is the
 * expensive part. That single change is most of why this file went from ~28s to a
 * few seconds.
 */
import { describe, it, expect, beforeAll } from 'bun:test'
import { LocalModels } from './models'
import { getLLMCapability, type LLMCapability } from './llm'

describe.skipIf(process.env.SKIP_LLM_TESTS)('LM Studio live smoke', () => {
  let models: LocalModels
  let caps: LLMCapability

  beforeAll(async () => {
    models = new LocalModels()
    await models.audit()
    caps = getLLMCapability(models)
  }, 120_000)

  it('audit classifies a live model list (>=1 LLM, >=1 embedding)', () => {
    const all = models.getModels()
    expect(all.length).toBeGreaterThan(0)

    const llm = models.getLLM()
    expect(llm.type).toBe('LLM')

    const embedding = models.getEmbedding()
    expect(embedding.dimension).toBeGreaterThan(0)

    console.log(`Live LLM: ${llm.id} | embedding: ${embedding.id}`)
  })

  it('predict() round-trips to a real chat completion', async () => {
    const res = await caps.predict('You are terse.', 'the color of the sky is')
    expect(typeof res.content).toBe('string')
    expect(res.content.length).toBeGreaterThan(0)
  }, 60_000)

  it('embed() round-trips to a real embedding vector', async () => {
    const vec = await caps.embed('this is a test')
    expect(Array.isArray(vec)).toBe(true)
    expect(vec.length).toBeGreaterThan(100)
    expect(typeof vec[0]).toBe('number')
  }, 60_000)

  // No dedicated structured-output test on purpose: the audit step above already
  // exercises JSON-schema mode live against every model (audit.ts → checkStructured,
  // which POSTs a response_format request and JSON.parses the result), and the
  // fixture suite covers our side (that we select the structured model and forward
  // response_format). A separate live call here would only add a model swap.
})
