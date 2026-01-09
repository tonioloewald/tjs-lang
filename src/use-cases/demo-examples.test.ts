/**
 * Tests that all demo playground examples transpile correctly.
 * This catches issues like the Schema.response builtin not being recognized.
 */

import { describe, it, expect } from 'bun:test'
import { transpile } from '../transpiler'
import { AgentVM, coreAtoms } from '../index'
import { batteryAtoms } from '../atoms'

// Import examples from demo
import { examples } from '../../demo/src/examples'

describe('Demo Examples - Transpilation', () => {
  const _vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })

  for (const example of examples) {
    it(`should transpile "${example.name}"`, () => {
      // This should not throw
      const result = transpile(example.code)

      // Basic sanity checks
      expect(result).toBeDefined()
      expect(result.ast).toBeDefined()
      expect(result.ast.op).toBe('seq')
      expect(result.signature).toBeDefined()
      expect(result.signature.name).toBeDefined()
    })
  }
})

describe('Demo Examples - Execution (non-API)', () => {
  const vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })

  // Examples that don't require API calls or external fetches
  const executableExamples = examples.filter(
    (ex) =>
      !ex.requiresApi &&
      !ex.name.includes('API') &&
      !ex.name.includes('Weather') &&
      !ex.name.includes('iTunes') &&
      !ex.name.includes('GitHub') &&
      !ex.name.includes('Fuel') // Skip fuel exhaustion test
  )

  for (const example of executableExamples) {
    it(`should execute "${example.name}"`, async () => {
      const { ast } = transpile(example.code)

      // Run with default args (from signature defaults)
      const result = await vm.run(ast, {})

      // Should complete without error
      expect(result.error).toBeUndefined()
      expect(result.result).toBeDefined()
    })
  }
})
