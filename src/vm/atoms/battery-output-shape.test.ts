/**
 * The LLM batteries accept a provider field we have never heard of.
 *
 * An OpenAI-compatible chat message is an OPEN shape belonging to someone else. Both
 * battery atoms declared it with `s.object({ role, content, tool_calls })`, which emits
 * `additionalProperties: false` — a closed set upstream never promised. It cost nothing
 * until tosijs-schema 1.5.0 started enforcing `additionalProperties` correctly; then
 * gemma-4's `reasoning_content` made **every** vision call fail output validation with
 * `AgentError: Output validation failed for 'llmVision'`, on no change of ours.
 *
 * `7593b1a` opened both schemas and touched no test. Grepping the whole suite for
 * `reasoning_content` returned nothing (a glob is not written out here: a doc comment that
 * quotes one terminates itself, which is how this file failed to parse on its first run).
 * `llmVision`'s body had **zero executed coverage** — the only tests
 * near it need a live vision model and self-skip without one, so re-closing the schema left
 * the suite green. That is the whole failure: the fix was correct and undefended, and the
 * next person to think "these fields should be pinned" gets no argument from CI.
 *
 * So this file is deliberately mock-only and deterministic. It runs in `test:fast`, with no
 * LM Studio, no model, and no network. Two levels, because they fail for different reasons:
 *
 *   - the SCHEMA cases fail the moment either output schema is re-closed, naming the field
 *   - the ATOM cases run both bodies end to end through the VM, which is also the only
 *     executed coverage `llmVision` has
 *
 * `reasoning_content` is joined by `refusal`, `annotations` and `audio` — all real fields
 * providers have added since. A runtime schema should reject what is WRONG, not what is
 * merely newer than we are.
 */
import { describe, it, expect } from 'bun:test'
import { validate } from 'tosijs-schema'
import { AgentVM } from '../vm'
import { llmPredictBattery, llmVision } from './batteries'

/** A response from a provider that is ahead of us. */
const FUTURE_MESSAGE = {
  role: 'assistant',
  content: 'a hedgehog, side-on',
  reasoning_content: 'the model thought about it first',
  refusal: null,
  annotations: [],
}

describe('the declared output schemas are open', () => {
  for (const atom of [llmPredictBattery, llmVision]) {
    it(`${atom.op} accepts unknown provider fields`, () => {
      expect(validate(FUTURE_MESSAGE, atom.outputSchema)).toBe(true)
    })

    it(`${atom.op} still accepts the ordinary shape`, () => {
      // The control: `s.any` everywhere would pass the case above and check nothing.
      expect(
        validate({ role: 'assistant', content: 'hi' }, atom.outputSchema)
      ).toBe(true)
      // A message is an object. A bare string is what a caller who skipped the
      // `{ role, content }` envelope would send, and it is genuinely wrong.
      expect(validate('hi', atom.outputSchema)).toBe(false)
    })
  }
})

/** Records what the atom handed the capability, so the call shape is checked too. */
function mockBattery() {
  const calls: any[] = []
  return {
    calls,
    capabilities: {
      llmBattery: {
        predict: async (
          system: string,
          user: any,
          tools?: any,
          responseFormat?: any
        ) => {
          calls.push({ system, user, tools, responseFormat })
          return FUTURE_MESSAGE
        },
      },
    } as any,
  }
}

async function runAtom(step: Record<string, unknown>, capabilities: any) {
  const vm = new AgentVM({ llmPredictBattery, llmVision } as any)
  return vm.run(
    {
      op: 'seq',
      steps: [
        { ...step, result: 'out' },
        { op: 'return', value: { $expr: 'ident', name: 'out' } },
      ],
    } as any,
    {} as any,
    { fuel: 1e5, capabilities }
  )
}

describe('llmPredictBattery', () => {
  it('returns a message carrying unknown fields rather than failing validation', async () => {
    const { capabilities } = mockBattery()
    const r = await runAtom(
      { op: 'llmPredictBattery', system: 'be brief', user: 'hello' },
      capabilities
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect((r.result as any).reasoning_content).toBe(
      'the model thought about it first'
    )
  })

  it('defaults the system prompt', async () => {
    const { capabilities, calls } = mockBattery()
    await runAtom({ op: 'llmPredictBattery', user: 'hello' }, capabilities)
    expect(calls[0].system).toBe('You are a helpful agent.')
    expect(calls[0].user).toBe('hello')
  })
})

describe('llmVision', () => {
  // This block is `llmVision`'s only executed coverage. Everything else that touches it
  // needs a loaded vision model and self-skips without one.
  const IMG = 'data:image/png;base64,iVBORw0KGgo='

  it('returns a message carrying unknown fields', async () => {
    const { capabilities } = mockBattery()
    const r = await runAtom(
      { op: 'llmVision', prompt: 'what is this?', images: [IMG] },
      capabilities
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect((r.result as any).reasoning_content).toBe(
      'the model thought about it first'
    )
  })

  it('packs prompt and images into the multimodal user shape', async () => {
    const { capabilities, calls } = mockBattery()
    await runAtom(
      { op: 'llmVision', prompt: 'what is this?', images: [IMG] },
      capabilities
    )
    expect(calls[0].system).toBe('You analyze images accurately and concisely.')
    expect(calls[0].user).toEqual({ text: 'what is this?', images: [IMG] })
    // Vision takes no tools — the third argument is fixed at `undefined`.
    expect(calls[0].tools).toBeUndefined()
  })

  it('honours an explicit system prompt', async () => {
    const { capabilities, calls } = mockBattery()
    await runAtom(
      {
        op: 'llmVision',
        system: 'you are a botanist',
        prompt: 'identify',
        images: [IMG],
      },
      capabilities
    )
    expect(calls[0].system).toBe('you are a botanist')
  })

  it('reports a missing capability as an error, not a throw', async () => {
    const r = await runAtom(
      { op: 'llmVision', prompt: 'x', images: [IMG] },
      {} as any
    )
    expect(r.error?.message ?? 'no error').toMatch(/llmBattery/)
  })
})
