import {
  type Atom,
  type Capabilities,
  type RunResult,
  type RuntimeContext,
  type CostOverride,
  coreAtoms,
  AgentError,
} from './runtime'
import { TypedBuilder, type BaseNode, type BuilderType } from '../builder'

/** Default timeout multiplier: milliseconds per fuel unit */
const FUEL_TO_MS = 10 // 1000 fuel = 10 seconds

export class AgentVM<M extends Record<string, Atom<any, any>>> {
  readonly atoms: typeof coreAtoms & M

  constructor(customAtoms: M = {} as M) {
    this.atoms = { ...coreAtoms, ...customAtoms }
  }

  get builder(): BuilderType<typeof coreAtoms & M> {
    return new TypedBuilder(this.atoms) as any
  }

  // Typed helper for builder
  get Agent(): BuilderType<typeof coreAtoms & M> {
    return new TypedBuilder(this.atoms) as any
  }

  /** @deprecated Use `Agent` instead */
  get A99(): BuilderType<typeof coreAtoms & M> {
    return this.Agent
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
    options: {
      fuel?: number
      capabilities?: Capabilities
      trace?: boolean
      timeoutMs?: number // Override automatic timeout (fuel * FUEL_TO_MS)
      signal?: AbortSignal // External abort signal (e.g., from caller)
      costOverrides?: Record<string, CostOverride> // Per-atom fuel cost overrides
      context?: Record<string, any> // Request-scoped metadata (auth, permissions, etc.)
    } = {}
  ): Promise<RunResult> {
    const startFuel = options.fuel ?? 1000

    // Calculate timeout from fuel budget (generous: 10ms per fuel unit)
    // Can be overridden with explicit timeoutMs option
    const timeoutMs = options.timeoutMs ?? startFuel * FUEL_TO_MS

    // Default Capabilities
    const capabilities = options.capabilities ?? {}

    // Track warnings
    const warnings: string[] = []

    // Default In-Memory Store if none provided (with warning)
    if (!capabilities.store) {
      const memoryStore = new Map<string, any>()
      let warned = false
      capabilities.store = {
        get: async (key) => {
          if (!warned) {
            warned = true
            warnings.push(
              'Using default in-memory store (not suitable for production)'
            )
          }
          return memoryStore.get(key)
        },
        set: async (key, value) => {
          if (!warned) {
            warned = true
            warnings.push(
              'Using default in-memory store (not suitable for production)'
            )
          }
          memoryStore.set(key, value)
        },
      }
    }

    // Create abort controller for timeout enforcement
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    // Link external signal if provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort())
    }

    const ctx: RuntimeContext = {
      fuel: { current: startFuel },
      args,
      state: {},
      consts: new Set(),
      capabilities,
      resolver: (op) => this.resolve(op),
      output: undefined,
      signal: controller.signal,
      costOverrides: options.costOverrides,
      context: options.context,
      warnings, // Shared warnings array
    }

    if (options.trace) {
      ctx.trace = []
    }

    if (ast.op !== 'seq')
      throw new Error(
        "Root AST must be 'seq'. Ensure you're passing a transpiled agent (use ajs`...` or transpile())."
      )

    try {
      // Race execution against timeout
      await Promise.race([
        this.resolve('seq')?.exec(ast, ctx),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`
              )
            )
          })
          // If already aborted, reject immediately
          if (controller.signal.aborted) {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`
              )
            )
          }
        }),
      ])
    } catch (e: any) {
      // Convert timeout error to AgentError
      if (
        e.message?.includes('timeout') ||
        e.message?.includes('aborted') ||
        controller.signal.aborted
      ) {
        ctx.error = new AgentError(
          `Execution timeout after ${timeoutMs}ms (fuel: ${startFuel}). Consider increasing fuel or optimizing your agent.`,
          'vm.run'
        )
      } else {
        // Re-throw non-timeout errors
        throw e
      }
    } finally {
      clearTimeout(timeout)
    }

    // If there's an error but no output was set, set the error as output
    if (ctx.error && ctx.output === undefined) {
      ctx.output = ctx.error
    }

    // Merge any warnings added via console.warn
    const allWarnings = [...warnings, ...(ctx.warnings ?? [])]

    return {
      result: ctx.output,
      error: ctx.error,
      fuelUsed: startFuel - ctx.fuel.current,
      trace: ctx.trace,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    }
  }
}
