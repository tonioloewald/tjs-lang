import { describe, it, expect } from 'bun:test'
import { defineAtom } from '../runtime'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

describe('Use Case: Self-Documentation', () => {
  it('should generate OpenAI-compatible tool definitions from atoms', () => {
    const vm = new AgentVM()
    const tools = vm.getTools()

    // 1. Verify structure
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)

    const firstTool = tools[0]
    expect(firstTool).toHaveProperty('type', 'function')
    expect(firstTool.function).toHaveProperty('name')
    expect(firstTool.function).toHaveProperty('description')
    expect(firstTool.function).toHaveProperty('parameters')

    // 2. Verify specific atom (e.g. mathCalc)
    const calcTool = tools.find((t) => t.function.name === 'mathCalc')
    expect(calcTool).toBeDefined()
    expect(calcTool?.function.description).toBe('Math Calc')
    expect(calcTool?.function.parameters).toEqual({
      type: 'object',
      properties: {
        expr: { type: 'string' },
        vars: {
          type: ['object', 'null'],
          additionalProperties: {},
        },
      },
      required: ['expr'],
      additionalProperties: false,
    })

    // 3. Verify custom atom documentation

    const customAtom = defineAtom(
      'myCustomOp',
      s.object({ input: s.string }),
      s.any,
      async () => {
        // noop
      },
      { docs: 'My custom operation' }
    )

    const customVM = new AgentVM({ custom: customAtom })
    const customTools = customVM.getTools()
    const myTool = customTools.find((t) => t.function.name === 'myCustomOp')

    expect(myTool).toBeDefined()
    expect(myTool?.function.description).toBe('My custom operation')
    expect(myTool?.function.parameters).toEqual({
      type: 'object',
      properties: { input: { type: 'string' } },
      required: ['input'],
      additionalProperties: false,
    })
  })

  it('should filter tools based on input', () => {
    const vm = new AgentVM()

    // 1. Flow Filter
    const flowTools = vm.getTools('flow')
    const flowOps = flowTools.map((t) => t.function.name)
    expect(flowOps).toContain('seq')
    expect(flowOps).toContain('if')
    expect(flowOps).not.toContain('mathCalc')

    // 2. Explicit List Filter
    const specificTools = vm.getTools(['mathCalc', 'httpFetch'])
    const specificOps = specificTools.map((t) => t.function.name)
    expect(specificOps).toHaveLength(2)
    expect(specificOps).toContain('mathCalc')
    expect(specificOps).toContain('httpFetch')
    expect(specificOps).not.toContain('seq')
  })
})
