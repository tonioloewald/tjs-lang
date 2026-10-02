/**
 * Probe for vm-budgets.test.ts "extra arguments to a helper are dropped (B3)", run in its OWN
 * process: it measures process-wide `heapUsed`, which other test files running in the same
 * process disturbed (it failed 3 times in 7 under `bun test src/vm` — fifteenth re-review).
 * Prints `{ error, held }` as JSON.
 */
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import { AST_VERSION_KEY } from './ast-version'

const lit = (value: unknown) => ({ $expr: 'literal', value })
const n = { $expr: 'ident', name: 'n' }
let held = -1
let reached = false
const baseline = () => {
  Bun.gc(true)
  return process.memoryUsage().heapUsed
}
const sample = defineAtom(
  'sample',
  undefined,
  undefined,
  async () => {
    reached = true
    held = baseline() - start
  },
  { effects: 'pure' }
)
const ast = {
  [AST_VERSION_KEY]: 2,
  op: 'seq',
  helpers: {
    h: {
      paramNames: ['n'],
      steps: [
        {
          op: 'if',
          condition: { $expr: 'binary', op: '>', left: n, right: lit(0) },
          then: [
            {
              op: 'callLocal',
              name: 'h',
              args: [
                { $expr: 'binary', op: '-', left: n, right: lit(1) },
                {
                  $expr: 'methodCall',
                  object: lit('p'),
                  method: 'repeat',
                  arguments: [lit(300_000)],
                },
              ],
            },
          ],
          else: [{ op: 'sample' }],
        },
        { op: 'return', value: lit(0) },
      ],
    },
  },
  steps: [
    { op: 'callLocal', name: 'h', args: [lit(40), lit('x')], result: 'r' },
    { op: 'return', value: { ok: lit(true) } },
  ],
}
const start = baseline()
const r = await new AgentVM({ sample }).run(
  ast as any,
  {},
  {
    fuel: 5_000_000,
    maxHeapBytes: 1_000_000,
  }
)

console.log(JSON.stringify({ error: r.error?.message ?? null, held, reached }))
