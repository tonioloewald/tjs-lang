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
  membraneValue,
} from './runtime'
import { TypedBuilder, type BaseNode, type BuilderType } from '../builder'
import { validate } from 'tosijs-schema'
import { checkAstVersion } from './ast-version'

/**
 * The transpiler, INJECTED rather than imported.
 *
 * `run()` accepts AJS source as well as an AST, and resolving that string used to mean a
 * static `import { transpile } from '../lang/core'` — which put the entire transpiler, acorn
 * included, inside `tjs-lang/vm`. Two costs:
 *
 *   - **Size.** 221.5 KB against 56.3 KB for the same `AgentVM` without it (minified,
 *     `tosijs-schema` external). 75% of the VM bundle was a parser.
 *   - **Attack surface.** A sandbox that parses is a sandbox whose parser is reachable from
 *     untrusted input, upstream of fuel, timeouts, capabilities and the membrane — the exact
 *     position the `test`-block leak occupied (0.13.10,
 *     `eval-no-transpile-execution.test.ts`). That leak was closed; the shape that permitted
 *     it should not survive it.
 *
 * So the dependency is now supplied by the ENTRY POINT. `tjs-lang/vm` calls
 * `setTranspiler(transpile)` and behaves exactly as before; `tjs-lang/vm-ast` does not, and
 * is therefore a VM that cannot parse because it contains no parser.
 *
 * **What this guarantees, stated precisely:** *no parser is present in this bundle* — not
 * *this object refuses source even when a parser is loaded*. The binding is module-level, so
 * importing both entries into one bundle shares it. That is the guarantee worth having: a
 * consumer who imported `tjs-lang/vm` already has the parser, so a per-instance refusal would
 * protect nothing it does not already have. If a per-instance guard is ever wanted, a
 * constructor option is the shape — do not quietly reinterpret this one.
 */
let transpileImpl: ((source: string) => { ast: unknown }) | null = null

/**
 * Supply the AJS source → AST transpiler. Called by `tjs-lang/vm`'s entry point; deliberately
 * NOT called by the AST-only entry.
 */
export function setTranspiler(fn: (source: string) => { ast: unknown }): void {
  transpileImpl = fn
}

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
      /** Per-atom call quotas — caps work summoned OUTSIDE the VM, which fuel cannot see. */
      quotas?: Record<string, number>
      /**
       * Shared quota counters. Pass the same object to nested runs to make a quota hold
       * through re-entrancy — otherwise each run starts fresh and a capability that calls
       * back into the VM multiplies its allowance.
       */
      quotaUsed?: Record<string, number>
      timeoutOverrides?: Record<string, TimeoutOverride> // Per-atom timeout overrides (ms, 0 disables)
      context?: Record<string, any> // Request-scoped metadata (auth, permissions, etc.)
      membraneMaxBytes?: number // Cap on the estimated size of a capability return crossing into guest state (default 4MB)
      maxHeapBytes?: number // Ceiling on bytes held live in guest scope (default 64MB). Fuel bounds work; this bounds peak memory.
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
        if (!transpileImpl)
          throw new Error(
            `This VM accepts an AST, not source: no transpiler is wired in. ` +
              `That is the point of the 'tjs-lang/vm-ast' build — it contains no parser, so ` +
              `no parser defect is reachable through it. Transpile on the CALLER's side, ` +
              `where the source is your own, and send the AST:\n\n` +
              `    import { transpile } from 'tjs-lang/lang'\n` +
              `    const { ast } = transpile(source)\n` +
              `    await vm.run(ast, args)\n\n` +
              `If you want the VM to parse for you, import 'tjs-lang/vm' instead.`
          )
        try {
          ast = transpileImpl(astOrToken).ast as BaseNode
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

    // REJECT BEFORE ACQUIRING ANYTHING.
    //
    // Both of these used to sit after the timer and the caller's abort listener were
    // created but before the `try` — so neither exit cleared the timer nor aborted the
    // controller, while the comment below claimed the `finally` "guarantees on every exit
    // path". Measured: five input-validation failures left five live timers, five root-op
    // throws left five more, and five ordinary runs left none. A pending timer also keeps
    // the event loop alive, so a host that validates a batch of agents and exits does not,
    // for up to `timeoutMs` (default `fuel × 10ms`) after the last rejection.
    //
    // Moving them up is better than widening the `try`: an argument that never runs should
    // not allocate a timer and a listener only to release them. Nothing is held here yet,
    // so nothing can leak.
    // Refuse a format this build cannot read, BEFORE inspecting its shape.
    //
    // Checked first because a future AST may legitimately have a different root: judging it by
    // today's rules would report "must be 'seq'" for something that is simply newer. And a
    // version field nobody acts on is decoration — running an AST whose format we do not
    // understand means guessing at the meaning of untrusted code, which is the one thing a
    // sandbox must not do. See src/vm/ast-version.ts.
    checkAstVersion(ast, 'AgentVM.run')

    if (ast.op !== 'seq')
      throw new Error(
        "Root AST must be 'seq'. Ensure you're passing a transpiled agent (use ajs`...` or transpile())."
      )

    // ARGUMENTS cross the same membrane as capability returns: they are host values entering
    // guest state. Without it a class instance passed as an argument arrived LIVE, and the
    // `methodCall` allowlist filters method NAMES, not owners — so `svc.slice(0)` on a host
    // object whose class defines `slice` ran host code (reached through `Eval`'s context,
    // 0.14.0). The copy keeps the data and drops the prototype, so the methods stay behind;
    // an own function or getter is rejected. Checked before the schema, which should see
    // what the guest will see.
    //
    // No BYTE cap here: `membraneMaxBytes` guards against a hostile capability flooding the
    // guest, while arguments are the host's own choice (a hosted endpoint's are bounded by
    // its request size). The live-heap ceiling still bounds what the guest binds.
    const crossed = membraneValue(args, Infinity)
    if (!crossed.ok) {
      const error = new AgentError(
        `Capability boundary rejected the run arguments: ${crossed.reason}`,
        'vm.run'
      )
      return {
        result: error,
        error,
        fuelUsed: 0,
        trace: options.trace ? [] : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }
    args = crossed.value as Record<string, any>

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
        // No step ran, so the trace is empty rather than absent when tracing is on —
        // the same value `ctx.trace` carried at this point, which is now created below.
        trace: options.trace ? [] : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }

    // Create abort controller for timeout enforcement
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    // Link external signal if provided.
    //
    // `{ signal: controller.signal }` is the removal mechanism, not a second abort source:
    // it tells the caller's signal to drop this listener as soon as OUR controller aborts,
    // which the `finally` below now guarantees on every exit path. Without it the listener
    // accumulated on a long-lived caller signal for the life of the process — measured at
    // ~2.1KB per run, 41.6MB retained after 20,000 runs against one shared signal (vs
    // 1.59MB with no signal at all). A host that runs many short agents under one
    // cancellation scope is the normal case, not an exotic one.
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), {
        signal: controller.signal,
      })
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
      quotas: options.quotas,
      quotaUsed: options.quotaUsed ?? {},
      timeoutOverrides: options.timeoutOverrides,
      context: options.context,
      membraneMaxBytes: options.membraneMaxBytes,
      maxHeapBytes: options.maxHeapBytes,
      warnings, // Shared warnings array
      helpers: (ast as any).helpers, // Local helper bodies, called by name via callLocal
    }

    if (options.trace) {
      ctx.trace = []
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
      // The run is over — cancel anything it still has in flight.
      //
      // Previously only the TIMEOUT aborted, so a run ending any other way (fuel
      // exhaustion, an atom error, or plain success) cleared the timer and left outbound
      // requests alive with nothing left to cancel them. A time box you can only rely on
      // when it expires is not a time box.
      //
      // Signalling, not awaiting: we do not wait for capabilities to unwind. Waiting is
      // exactly how graceful shutdown becomes the vulnerability — a capability that never
      // settles would hold the run open, turning cancellation into a path that starts
      // unmetered work.
      controller.abort()
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
