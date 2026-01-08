/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect, test } from 'vitest'
import { Agent } from './builder'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'
import * as s from 'valibot'

// This file is for type inference testing.
// It should compile without errors if the types are correct.

test('Inference Checks', () => {
  // --- Agent.take ---
  const builder1 = Agent.take()

  // Should have core atoms
  const n1 = builder1.varSet({ key: 'x', value: 1 })
  const n2 = builder1.template({ tmpl: 'hello', vars: {} })
  const n3 = builder1.customOp({ input: 'test' })

  // --- Agent.custom ---
  const customAtom = defineAtom(
    'customOp',
    s.object({ input: s.string() }),
    s.string(),
    async (input) => input.input
  )
  const atoms = { customOp: customAtom }

  const builder2 = Agent.custom(atoms)

  // Should have custom atom
  const n4 = builder2.customOp({ input: 'test' })
  const n5 = builder2.customOp({ input: 1 })
  // Should NOT have core atoms
  const n6 = builder2.varSet({ key: 'x', value: 1 })

  // --- vm.Agent ---
  const vm = new AgentVM({ customOp: customAtom })
  const builder3 = vm.Agent

  // Should have core atoms
  const n7 = builder3.varSet({ key: 'x', value: 1 })
  // Should have custom atom
  const n8 = builder3.customOp({ input: 'test' })

  const n9 = builder3.template({ tmpl: 'hello', vars: {} })
  const n10 = builder3.customOp({ input: 1 })
  // @ts-expect-error unknown atom
  const n11 = builder3.unknownOp()

  expect(true).toBe(true)
})
