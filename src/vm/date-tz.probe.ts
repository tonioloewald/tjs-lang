/**
 * Subprocess probe for `guest-values.test.ts`: runs one program and prints its result, a capability's
 * received input, and the guest's own JSON, so the test can compare runs under different `TZ`.
 */
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'

const got: unknown[] = []
const sink = defineAtom(
  'sink',
  s.object({ v: s.any }),
  s.any,
  async ({ v }) => {
    got.push(JSON.parse(JSON.stringify(v)))
    return null
  },
  { effects: 'io' }
)
const r = await new AgentVM({ sink } as any).run(
  transpile(`function f() {
    const d = Date('2020-01-01T00:00:00Z')
    sink({ v: d })
    // a day added across the US daylight-saving change (2020-03-08) is 24h in UTC, 23h in local time
    const dst = Date('2020-03-07T12:00:00Z').add({ days: 1 })
    return { d, j: JSON.stringify(d), n: d.add({ days: 1 }), dst, f: d.format('YYYY-MM-DD') }
  }`).ast,
  {},
  { fuel: 1000 }
)
console.log(JSON.stringify({ result: r.result, error: r.error?.message, got }))
