/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { validate } from 'tosijs-schema'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import {
  llmPredictBattery,
  llmVision,
} from '/Users/tonioloewald/tjs-lang/src/vm/atoms/batteries'

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
      expect(
        validate({ role: 'assistant', content: 'hi' }, atom.outputSchema)
      ).toBe(true)

      expect(validate('hi', atom.outputSchema)).toBe(false)
    })
  }
})

/* line 63 */
function mockBattery() {
  const calls = []
  return {
    calls,
    capabilities: {
      llmBattery: {
        predict: async (system, user, tools, responseFormat) => {
          calls.push({ system, user, tools, responseFormat })
          return FUTURE_MESSAGE
        },
      },
    },
  }
}
mockBattery.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:63',
}

/* line 83 */
async function runAtom(step, capabilities) {
  const vm = new AgentVM({ llmPredictBattery, llmVision })
  return vm.run(
    {
      op: 'seq',
      steps: [
        { ...step, result: 'out' },
        { op: 'return', value: { $expr: 'ident', name: 'out' } },
      ],
    },
    {},
    { fuel: 1e5, capabilities }
  )
}
runAtom.__tjs = {
  params: {
    step: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
    capabilities: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:83',
}

describe('llmPredictBattery', () => {
  it('returns a message carrying unknown fields rather than failing validation', async () => {
    const { capabilities } = mockBattery()
    const r = await runAtom(
      { op: 'llmPredictBattery', system: 'be brief', user: 'hello' },
      capabilities
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect(r.result.reasoning_content).toBe('the model thought about it first')
  })
  it('defaults the system prompt', async () => {
    const { capabilities, calls } = mockBattery()
    await runAtom({ op: 'llmPredictBattery', user: 'hello' }, capabilities)
    expect(calls[0].system).toBe('You are a helpful agent.')
    expect(calls[0].user).toBe('hello')
  })
})

describe('llmVision', () => {
  const IMG = 'data:image/png;base64,iVBORw0KGgo='
  it('returns a message carrying unknown fields', async () => {
    const { capabilities } = mockBattery()
    const r = await runAtom(
      { op: 'llmVision', prompt: 'what is this?', images: [IMG] },
      capabilities
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
    expect(r.result.reasoning_content).toBe('the model thought about it first')
  })
  it('packs prompt and images into the multimodal user shape', async () => {
    const { capabilities, calls } = mockBattery()
    await runAtom(
      { op: 'llmVision', prompt: 'what is this?', images: [IMG] },
      capabilities
    )
    expect(calls[0].system).toBe('You analyze images accurately and concisely.')
    expect(calls[0].user).toEqual({ text: 'what is this?', images: [IMG] })

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
    const r = await runAtom({ op: 'llmVision', prompt: 'x', images: [IMG] }, {})
    expect(r.error?.message ?? 'no error').toMatch(/llmBattery/)
  })
})
