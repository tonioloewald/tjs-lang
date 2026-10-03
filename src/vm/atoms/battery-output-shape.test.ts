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

describe('a guest response-format schema is admitted (rc.2 thirteenth re-review)', () => {
  const format = (schema: any) => ({
    type: 'json_schema',
    json_schema: { name: 'r', strict: true, schema },
  })

  for (const op of ['llmPredictBattery', 'llmVision'] as const)
    it(`${op}: a pattern never reaches the model server`, async () => {
      const { calls, capabilities } = mockBattery()
      const step =
        op === 'llmPredictBattery'
          ? { op, system: 's', user: 'u' }
          : { op, system: 's', prompt: 'p', images: [] }
      const r = await runAtom(
        {
          ...step,
          responseFormat: format({ type: 'string', pattern: ['^(a+)+$'] }),
        },
        capabilities
      )
      expect(r.error?.message ?? 'admitted').toMatch(/not available in AsyncJS/)
      expect(calls.length).toBe(0)
    })

  it('an admitted schema still reaches the capability', async () => {
    const { calls, capabilities } = mockBattery()
    const r = await runAtom(
      {
        op: 'llmPredictBattery',
        system: 's',
        user: 'u',
        responseFormat: format({
          type: 'object',
          properties: { a: { type: 'string' } },
          required: ['a'],
          additionalProperties: false,
        }),
      },
      capabilities
    )
    expect(r.error).toBeUndefined()
    expect(calls[0].responseFormat.json_schema.schema.required).toEqual(['a'])
  })
})

describe('llmVision image URLs get the fetch rule (rc.2 cumulative review M2)', () => {
  // The BACKEND may fetch an http(s) image_url server-side, so an image URL is a request made on
  // the agent's behalf: inline data passes; http(s) only against the run's allowlist.
  const run = (images: string[], context?: Record<string, unknown>) => {
    const { capabilities, calls } = mockBattery()
    const vm = new AgentVM({ llmVision } as any)
    return vm
      .run(
        {
          op: 'seq',
          steps: [{ op: 'llmVision', prompt: 'p', images, result: 'out' }],
        } as any,
        {} as any,
        { fuel: 1e5, capabilities, context }
      )
      .then((r) => ({ r, calls }))
  }

  it('inline base64 image data passes with no allowlist', async () => {
    const { r, calls } = await run(['data:image/png;base64,iVBORw0KGgo='])
    expect(r.error).toBeUndefined()
    expect(calls.length).toBe(1)
  })

  for (const url of [
    'http://169.254.169.254/latest/meta-data/',
    'https://images.example.com/cat.png',
    'file:///etc/hosts',
    'data:text/html,<script>',
  ])
    it(`refused without an allowlist, before the backend is called: ${url}`, async () => {
      const { r, calls } = await run([url])
      expect(r.error).toBeDefined()
      expect(calls.length).toBe(0)
    })

  it('an http(s) image on the allowlist passes; one off it is refused', async () => {
    const ok = await run(['https://images.example.com/cat.png'], {
      allowedFetchDomains: ['images.example.com'],
    })
    expect(ok.r.error).toBeUndefined()
    const bad = await run(['https://169.254.169.254/x'], {
      allowedFetchDomains: ['images.example.com'],
    })
    expect(bad.r.error?.message ?? 'admitted').toMatch(/not in allowlist/)
    expect(bad.calls.length).toBe(0)
  })
})

describe('llmPredictBattery cannot route images around the image rule (cumulative review 2 M1)', () => {
  const run = (user: unknown, context?: Record<string, unknown>) => {
    const { capabilities, calls } = mockBattery()
    const vm = new AgentVM({ llmPredictBattery } as any)
    return vm
      .run(
        {
          op: 'seq',
          steps: [
            {
              op: 'varSet',
              key: 'u',
              value: { $expr: 'literal', value: user },
            },
            { op: 'llmPredictBattery', user: 'u', result: 'out' },
          ],
        } as any,
        {} as any,
        { fuel: 1e5, capabilities, context }
      )
      .then((r) => ({ r, calls }))
  }

  it('a { text, images } user is refused (the vision form belongs to llmVision)', async () => {
    const { r, calls } = await run({
      text: 'hi',
      images: ['http://169.254.169.254/y'],
    })
    // refused at the outbound membrane (user is declared string | array) or by admitLlmUser
    expect(r.error?.message ?? 'admitted').toMatch(
      /user must be a string or a message array|does not have the shape the atom declares/
    )
    expect(calls.length).toBe(0)
  })

  it('an image_url part inside a message array gets the fetch rule', async () => {
    const msgs = (url: string) => [
      { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
    ]
    const bad = await run(msgs('http://169.254.169.254/y'))
    expect(bad.r.error).toBeDefined()
    expect(bad.calls.length).toBe(0)
    const ok = await run(msgs('data:image/png;base64,iVBORw0KGgo='))
    expect(ok.r.error).toBeUndefined()
    expect(ok.calls.length).toBe(1)
  })

  it('a plain string user is unchanged', async () => {
    const { r, calls } = await run('hello')
    expect(r.error).toBeUndefined()
    expect(calls.length).toBe(1)
  })
})

describe("llmVision accepts httpFetch's own dataUrl output", () => {
  for (const img of [
    'data:image/png; charset=binary;base64,iVBORw0KGgo=',
    'data:application/octet-stream;base64,iVBORw0KGgo=',
  ])
    it(`passes: ${img.slice(0, 40)}`, async () => {
      const { capabilities, calls } = mockBattery()
      const r = await new AgentVM({ llmVision } as any).run(
        {
          op: 'seq',
          steps: [{ op: 'llmVision', prompt: 'p', images: [img], result: 'o' }],
        } as any,
        {} as any,
        { fuel: 1e5, capabilities }
      )
      expect(r.error).toBeUndefined()
      expect(calls.length).toBe(1)
    })
})

describe('cumulative review 3: the backend receives what was ADMITTED, never the guest string', () => {
  const ctx = { allowedFetchDomains: ['a.test'] }
  it('llmVision forwards the normalised href', async () => {
    const { capabilities, calls } = mockBattery()
    const r = await new AgentVM({ llmVision } as any).run(
      {
        op: 'seq',
        steps: [
          {
            op: 'llmVision',
            prompt: 'p',
            images: ['HTTPS://A.TEST/x/../cat.png'],
            result: 'o',
          },
        ],
      } as any,
      {} as any,
      { fuel: 1e5, capabilities, context: ctx }
    )
    expect(r.error).toBeUndefined()
    expect(calls[0].user.images).toEqual(['https://a.test/cat.png'])
  })
  it('a backslash-userinfo URL never reaches the backend as written', async () => {
    const { capabilities, calls } = mockBattery()
    await new AgentVM({ llmVision } as any).run(
      {
        op: 'seq',
        steps: [
          {
            op: 'llmVision',
            prompt: 'p',
            images: ['http://a.test\\\\@169.254.169.254/latest'],
            result: 'o',
          },
        ],
      } as any,
      {} as any,
      { fuel: 1e5, capabilities, context: ctx }
    )
    for (const c of calls)
      for (const u of c.user.images) expect(new URL(u).href).toBe(u) // canonical form only
    expect(JSON.stringify(calls)).not.toContain('\\\\')
  })

  const runUser = (user: unknown) => {
    const { capabilities, calls } = mockBattery()
    return new AgentVM({ llmPredictBattery } as any)
      .run(
        {
          op: 'seq',
          steps: [
            {
              op: 'varSet',
              key: 'u',
              value: { $expr: 'literal', value: user },
            },
            { op: 'llmPredictBattery', user: 'u', result: 'out' },
          ],
        } as any,
        {} as any,
        { fuel: 1e5, capabilities, context: ctx }
      )
      .then((r) => ({ r, calls }))
  }
  it('llmPredictBattery forwards a REBUILT message array with admitted image hrefs', async () => {
    const { r, calls } = await runUser([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          {
            type: 'image_url',
            image_url: { url: 'HTTPS://A.TEST/a/../b.png' },
          },
        ],
      },
    ])
    expect(r.error).toBeUndefined()
    expect(calls[0].user).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image_url', image_url: { url: 'https://a.test/b.png' } },
        ],
      },
    ])
  })
  for (const part of [
    { type: 'video_url', video_url: { url: 'http://169.254.169.254/v' } },
    { type: 'audio_url', audio_url: { url: 'http://169.254.169.254/a' } },
    { type: 'input_audio', input_audio: { data: 'x', format: 'wav' } },
    { type: 'file', file: { file_id: 'x' } },
    { type: 'IMAGE_URL', image_url: { url: 'http://169.254.169.254/i' } },
    {
      type: 'image_url',
      image_url: { url: 'https://a.test/x.png' },
      video_url: 'http://169.254.169.254/',
    },
    { type: 'text', text: 'hi', image_url: 'http://169.254.169.254/' },
  ])
    it(`refused before the backend: ${JSON.stringify(part).slice(
      0,
      60
    )}`, async () => {
      const { r, calls } = await runUser([{ role: 'user', content: [part] }])
      expect(r.error).toBeDefined()
      expect(calls.length).toBe(0)
    })
  it('a message with an extra key is refused', async () => {
    const { r, calls } = await runUser([
      {
        role: 'user',
        content: 'hi',
        name: 'x',
        url: 'http://169.254.169.254/',
      },
    ])
    expect(r.error).toBeDefined()
    expect(calls.length).toBe(0)
  })
})

describe('cumulative review 4: the outbound membrane (declared shape, deep copy)', () => {
  const videoParts = [
    { type: 'video_url', video_url: { url: 'http://169.254.169.254/v' } },
  ]
  const runStep = (atoms: any, step: any) => {
    const { capabilities, calls } = mockBattery()
    return new AgentVM(atoms)
      .run(
        {
          op: 'seq',
          steps: [
            {
              op: 'varSet',
              key: 'evil',
              value: { $expr: 'literal', value: videoParts },
            },
            step,
          ],
        } as any,
        {} as any,
        { fuel: 1e5, capabilities }
      )
      .then((r) => ({ r, calls }))
  }
  it('llmPredictBattery: a system that is not a string is refused before the backend', async () => {
    const { r, calls } = await runStep(
      { llmPredictBattery },
      { op: 'llmPredictBattery', system: 'evil', user: 'hi' }
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /does not have the shape the atom declares/
    )
    expect(calls.length).toBe(0)
  })
  it('llmVision: a prompt that is not a string is refused before the backend', async () => {
    const { r, calls } = await runStep(
      { llmVision },
      { op: 'llmVision', prompt: 'evil', images: [] }
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /does not have the shape the atom declares/
    )
    expect(calls.length).toBe(0)
  })
  it('a guest that catches a timeout cannot change what a slow host is about to send', async () => {
    let received: any
    const capabilities = {
      llmBattery: {
        predict: async (_s: string, _u: any, tools: any) => {
          await new Promise((r) => setTimeout(r, 120))
          received = JSON.parse(JSON.stringify(tools))
          return { content: 'ok' }
        },
      },
    }
    const tools = [{ type: 'function', function: { name: 'f' } }]
    await new AgentVM({ llmPredictBattery } as any).run(
      {
        op: 'seq',
        steps: [
          {
            op: 'varSet',
            key: 'tools',
            value: { $expr: 'literal', value: tools },
          },
          {
            op: 'try',
            try: [{ op: 'llmPredictBattery', user: 'hi', tools: 'tools' }],
            catch: [
              {
                op: 'push',
                list: 'tools',
                item: {
                  $expr: 'literal',
                  value: { type: 'function', function: { name: 'injected' } },
                },
              },
            ],
          },
        ],
      } as any,
      {} as any,
      { fuel: 1e5, capabilities, timeoutOverrides: { llmPredictBattery: 30 } }
    )
    await new Promise((r) => setTimeout(r, 200))
    // compared with a FRESH literal: the guest's push mutated the array the literal node holds,
    // and the host received the copy taken before it
    expect(received).toEqual([{ type: 'function', function: { name: 'f' } }])
    expect(tools.length).toBe(2) // apparatus: the guest really did mutate its own array
  })
})
