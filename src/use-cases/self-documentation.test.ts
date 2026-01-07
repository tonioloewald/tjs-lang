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

    // 2. Verify specific atom (e.g. template)
    const templateTool = tools.find((t) => t.function.name === 'template')
    expect(templateTool).toBeDefined()
    expect(templateTool?.function.description).toBe('String Template')
    expect(templateTool?.function.parameters).toEqual({
      type: 'object',
      properties: {
        tmpl: { type: 'string' },
        vars: {
          type: 'object',
          additionalProperties: {},
        },
      },
      required: ['tmpl', 'vars'],
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
    expect(flowOps).not.toContain('template')

    // 2. Explicit List Filter
    const specificTools = vm.getTools(['template', 'httpFetch'])
    const specificOps = specificTools.map((t) => t.function.name)
    expect(specificOps).toHaveLength(2)
    expect(specificOps).toContain('template')
    expect(specificOps).toContain('httpFetch')
    expect(specificOps).not.toContain('seq')
  })
})
