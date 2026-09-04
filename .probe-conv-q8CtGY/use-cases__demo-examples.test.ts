/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { transpile } from '/Users/tonioloewald/tjs-lang/src/transpiler'

import { AgentVM, coreAtoms } from '/Users/tonioloewald/tjs-lang/src/index'

import { batteryAtoms } from '/Users/tonioloewald/tjs-lang/src/atoms'

import { examples } from '/Users/tonioloewald/tjs-lang/demo/src/examples'

describe('Demo Examples - Transpilation', () => {
  const _vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })
  for (const example of examples) {
    it(`should transpile "${example.name}"`, () => {
      const result = transpile(example.code)

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

  const executableExamples = examples.filter(
    (ex) =>
      !ex.requiresApi &&
      !ex.name.includes('API') &&
      !ex.name.includes('Weather') &&
      !ex.name.includes('iTunes') &&
      !ex.name.includes('GitHub') &&
      !ex.name.includes('Fuel')
  )
  for (const example of executableExamples) {
    it(`should execute "${example.name}"`, async () => {
      const { ast } = transpile(example.code)

      const result = await vm.run(ast, {})

      expect(result.error).toBeUndefined()
      expect(result.result).toBeDefined()
    })
  }
})
