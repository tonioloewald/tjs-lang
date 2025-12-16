import {
  type Atom,
  type Capabilities,
  type RunResult,
  type RuntimeContext,
  coreAtoms,
} from './runtime'
import { TypedBuilder, type BaseNode, type BuilderType } from './builder'

export class AgentVM<M extends Record<string, Atom<any, any>>> {
  readonly atoms: typeof coreAtoms & M

  constructor(customAtoms: M = {} as M) {
    this.atoms = { ...coreAtoms, ...customAtoms }
  }

  get builder(): BuilderType<typeof coreAtoms & M> {
    return new TypedBuilder(this.atoms) as any
  }

  // Typed helper for builder
  get A99(): BuilderType<typeof coreAtoms & M> {
    return new TypedBuilder(this.atoms) as any
  }

  resolve(op: string) {
    return this.atoms[op]
  }

  getTools(filter: 'flow' | 'all' | string[] = 'all') {
    let targetAtoms = Object.values(this.atoms)

    if (Array.isArray(filter)) {
      targetAtoms = targetAtoms.filter((a) => filter.includes(a.op))
    } else if (filter === 'flow') {
      const flowOps = [
        'seq',
        'if',
        'while',
        'return',
        'try',
        'varSet',
        'varGet',
        'scope',
      ]
      targetAtoms = targetAtoms.filter((a) => flowOps.includes(a.op))
    }

    return targetAtoms.map((atom) => ({
      type: 'function',
      function: {
        name: atom.op,
        description: atom.docs,
        parameters: atom.inputSchema?.schema ?? {},
      },
    }))
  }

  async run(
    ast: BaseNode,
    args: Record<string, any> = {},
    options: { fuel?: number; capabilities?: Capabilities } = {}
  ): Promise<RunResult> {
    const startFuel = options.fuel ?? 1000

    // Default Capabilities
    const capabilities = options.capabilities ?? {}

    // Default In-Memory Store if none provided
    if (!capabilities.store) {
      const memoryStore = new Map<string, any>()
      capabilities.store = {
        get: async (key) => memoryStore.get(key),
        set: async (key, value) => {
          memoryStore.set(key, value)
        },
      }
    }

    const ctx: RuntimeContext = {
      fuel: { current: startFuel },
      args,
      state: {},
      capabilities,
      resolver: (op) => this.resolve(op),
      output: undefined,
    }

    if (ast.op !== 'seq') throw new Error("Root AST must be 'seq'")

    // Boot
    await this.resolve('seq')?.exec(ast, ctx)

    return {
      result: ctx.output,
      fuelUsed: startFuel - ctx.fuel.current,
    }
  }
}
