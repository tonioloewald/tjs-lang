import {
  type Atom,
  type Capabilities,
  type RunResult,
  type RuntimeContext,
  type CostOverride,
  type TimeoutOverride,
  coreAtoms,
  AgentError,
  isProcedureToken,
  resolveProcedureToken,
} from './runtime'
import { TypedBuilder, type BaseNode, type BuilderType } from '../builder'
import { validate } from 'tosijs-schema'
import { transpile } from '../lang/core'

/**
 * Floor for the run-level default timeout. The actual default is derived from
 * the registered atoms (slowest atom × 2 — see `defaultRunTimeout`), but never
 * drops below this for a VM whose atoms are all fast.
 */
const MIN_DEFAULT_RUN_TIMEOUT_MS = 60_000

export class AgentVM<M extends Record<string, Atom<any, any>>> {
  readonly atoms: typeof coreAtoms & M

  private _defaultRunTimeout?: number

  constructor(customAtoms: M = {} as M) {
    this.atoms = { ...coreAtoms, ...customAtoms }
  }

  /**
   * Default run-level wall-clock timeout when `run()` is given no explicit
   * `timeoutMs`. Derived as `max(per-atom timeoutMs) × 2` over the registered
   * atoms (with headroom for an agent that chains a couple of slow calls), so
   * the run-level backstop can never be shorter than the slowest single atom's
   * own budget — otherwise that per-atom budget would be dead config (e.g.
   * `llmVision`/`llmPredictBattery` are 120s; a fixed 60s run default would kill
   * them mid-call). Atoms with `timeoutMs: 0` (no timeout, e.g. `seq`) are
   * excluded; the result is floored at {@link MIN_DEFAULT_RUN_TIMEOUT_MS}.
   * Self-adjusting: registering a slower custom atom raises the default.
   */
  get defaultRunTimeout(): number {
    if (this._defaultRunTimeout === undefined) {
      let slowest = 0
      for (const atom of Object.values(this.atoms)) {
        // undefined timeoutMs means the per-atom default (1000ms); 0 means none.
        const t = (atom as any).timeoutMs ?? 1000
        if (t > 0 && t > slowest) slowest = t
      }
      this._defaultRunTimeout = Math.max(
        MIN_DEFAULT_RUN_TIMEOUT_MS,
        slowest * 2
      )
    }
    return this._defaultRunTimeout
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
    astOrToken: BaseNode | string,
    args: Record<string, any> = {},
    options: {
      fuel?: number
      capabilities?: Capabilities
      trace?: boolean
      timeoutMs?: number // Wall-clock cap on the whole run (default: slowest atom × 2, min 60s — see defaultRunTimeout)
      signal?: AbortSignal // External abort signal (e.g., from caller)
      costOverrides?: Record<string, CostOverride> // Per-atom fuel cost overrides
      timeoutOverrides?: Record<string, TimeoutOverride> // Per-atom timeout overrides (ms, 0 disables)
      context?: Record<string, any> // Request-scoped metadata (auth, permissions, etc.)
    } = {}
  ): Promise<RunResult> {
    // Resolve string input to AST
    let ast: BaseNode
    if (typeof astOrToken === 'string') {
      if (isProcedureToken(astOrToken)) {
        // Procedure token - lookup stored AST
        ast = resolveProcedureToken(astOrToken) as BaseNode
      } else {
        // AJS source code - transpile to AST
        try {
          ast = transpile(astOrToken).ast as BaseNode
        } catch (e: any) {
          throw new Error(`AJS transpilation failed: ${e.message}`, {
            cause: e,
          })
        }
      }
    } else {
      ast = astOrToken
    }

    const startFuel = options.fuel ?? 1000

    // Run-level wall-clock timeout. Agents are typically IO-bound; the default
    // is derived from the registered atoms (slowest × 2) so it always covers the
    // slowest atom's own budget. See `defaultRunTimeout`.
    const timeoutMs = options.timeoutMs ?? this.defaultRunTimeout

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
      timeoutOverrides: options.timeoutOverrides,
      context: options.context,
      warnings, // Shared warnings array
      helpers: (ast as any).helpers, // Local helper bodies, called by name via callLocal
    }

    if (options.trace) {
      ctx.trace = []
    }

    if (ast.op !== 'seq')
      throw new Error(
        "Root AST must be 'seq'. Ensure you're passing a transpiled agent (use ajs`...` or transpile())."
      )

    // Input validation: validate args against the agent's input schema
    const inputSchema = (ast as any).inputSchema
    if (inputSchema && !validate(args, inputSchema)) {
      const error = new AgentError(
        `Input validation failed: args do not match expected schema`,
        'vm.run'
      )
      return {
        result: error,
        error,
        fuelUsed: 0,
        trace: ctx.trace,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }

    try {
      // Race execution against timeout
      await Promise.race([
        this.resolve('seq')?.exec(ast, ctx),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`
              )
            )
          })
          // If already aborted, reject immediately
          if (controller.signal.aborted) {
            reject(
              new Error(
                `Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`
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
          `Execution timeout after ${timeoutMs}ms. Pass a higher \`timeoutMs\` to vm.run() or set per-atom \`timeoutOverrides\` for slow IO atoms.`,
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
