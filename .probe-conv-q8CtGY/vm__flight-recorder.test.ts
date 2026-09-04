/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const g = globalThis

/* line 19 */
function busywork(steps) {
  return {
    op: 'seq',
    steps: Array.from({ length: steps }, (_, i) => ({
      op: 'varSet',
      key: `v${i}`,
      value: { $expr: 'literal', value: i },
    })),
  }
}
busywork.__tjs = {
  params: {
    steps: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:19',
}

const needsLlm = {
  op: 'seq',
  steps: [{ op: 'llmPredict', prompt: 'hello' }],
}

describe('flight recorder: vm', () => {
  let saved
  let rt
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

    expect(vmRecords[0].data.op).toBeTruthy()
  })
  it('does not inflate getErrorCount() — a VM error is not a type error', async () => {
    const vm = new AgentVM()
    await vm.run(needsLlm, {}, { fuel: 1000 })

    expect(rt.records({ source: 'vm' }).length).toBeGreaterThan(0)

    expect(rt.errors()).toHaveLength(0)
    expect(rt.getErrorCount()).toBe(0)
  })
  it('runs fine with no runtime installed', async () => {
    delete g.__tjs
    const vm = new AgentVM()

    const result = await vm.run(needsLlm, {}, { fuel: 1000 })
    expect(result).toBeDefined()
  })
})
