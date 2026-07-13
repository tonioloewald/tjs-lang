/**
 * VM instruments on the flight recorder (#17).
 *
 * The AJS half of the platform had an entirely separate error flow: AgentErrors
 * are returned, not thrown, and never reached __tjs.errors(). A page running
 * agents could exhaust fuel, time out an atom, or be denied a capability, and
 * the black box would show nothing.
 *
 * Every VM failure is constructed through `new AgentError(...)`, so recording
 * at that one choke point means the recorder cannot miss one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { AgentVM } from './vm'
import { createRuntime } from '../lang/runtime'

const g = globalThis as any

/** Burns fuel: a chain of varSets. */
const busywork = (steps: number) =>
  ({
    op: 'seq',
    steps: Array.from({ length: steps }, (_, i) => ({
      op: 'varSet',
      key: `v${i}`,
      value: { $expr: 'literal', value: i },
    })),
  } as any)

/** Needs the `llm` capability, which is not injected. */
const needsLlm = {
  op: 'seq',
  steps: [{ op: 'llmPredict', prompt: 'hello' }],
} as any

describe('flight recorder: vm', () => {
  let saved: any
  let rt: ReturnType<typeof createRuntime>

  beforeEach(() => {
    saved = g.__tjs
    rt = createRuntime()
    g.__tjs = { record: rt.record, records: rt.records }
  })
  afterEach(() => {
    g.__tjs = saved
  })

  it('records fuel exhaustion', async () => {
    const vm = new AgentVM()
    await vm.run(busywork(200), {}, { fuel: 3 })

    const vmRecords = rt.records({ source: 'vm' })
    expect(vmRecords.length).toBeGreaterThan(0)
    expect(vmRecords.some((r) => /fuel/i.test(r.message))).toBe(true)
    expect(vmRecords[0].severity).toBe('error')
  })

  it('records a missing capability (the VM has zero IO by default)', async () => {
    const vm = new AgentVM()
    await vm.run(needsLlm, {}, { fuel: 1000 })

    const vmRecords = rt.records({ source: 'vm' })
    expect(vmRecords.length).toBeGreaterThan(0)
    // The op that failed is on the record, so the black box says WHERE.
    expect((vmRecords[0].data as any).op).toBeTruthy()
  })

  it('does not inflate getErrorCount() — a VM error is not a type error', async () => {
    const vm = new AgentVM()
    await vm.run(needsLlm, {}, { fuel: 1000 })

    // Visible in the black box...
    expect(rt.records({ source: 'vm' }).length).toBeGreaterThan(0)
    // ...but errors()/getErrorCount() stay the TYPE-error API, so the documented
    // `clearErrors() → run → errors().length === 0` idiom still means what it did.
    expect(rt.errors()).toHaveLength(0)
    expect(rt.getErrorCount()).toBe(0)
  })

  it('runs fine with no runtime installed', async () => {
    delete g.__tjs
    const vm = new AgentVM()
    // The VM ships as its own bundle and must not depend on the language
    // runtime: no recorder, no crash.
    const result = await vm.run(needsLlm, {}, { fuel: 1000 })
    expect(result).toBeDefined()
  })
})
