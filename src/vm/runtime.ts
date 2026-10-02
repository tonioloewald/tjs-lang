/*{"parent": "ajs.md", "order": 9}*/
import {
  checkedCost,
  timerMs,
  sourceBytesOver,
  guestSourceCap,
  budgetOrFunction,
  quotaCount,
  checkedQuota,
} from './admission'
import { s, validate, isBuilder, filter as schemaFilter } from 'tosijs-schema'
import {
  compileRegex,
  isGuestRegex,
  RegexError,
  REGEX_FUEL_PER_STEP,
  regexBytes,
  type Charge,
  type GuestRegex,
} from './regex'
import * as stringMethods from './string-methods'
import {
  checkAstVersion,
  astVersionOf,
  AST_VERSION_LEGACY,
} from './ast-version'
import { FORBIDDEN_KEYS_SET } from '../forbidden-keys'

/**
 * AJS `==`/`!=` equality — **footgun-free `===`**, consistent with TJS `Eq`
 * (`src/lang/runtime.ts`). NOT structural: it unwraps boxed primitives, treats
 * `null`/`undefined` as equal and `NaN` as equal to itself, but does NOT coerce
 * across types, and distinct objects/arrays are distinct (`[1,2] != [1,2]`).
 *
 * (Originally the VM did deep structural comparison here — an early, unconsidered
 * divergence from TJS `==`. It was also a SECURITY hole: a single `==` node costs
 * a flat EXPR_FUEL_COST, but the structural walk charged nothing per element, so
 * `==` on an attacker-controlled large structure was an unbounded-work / fuel-
 * bypass DoS — exactly what AJS exists to prevent. `eqValue` is O(1).
 *
 * Structural equality is an explicit operation: in TJS it's the `Is`/`IsNot`
 * function; AJS can grow an `Is` atom if/when needed — but it MUST be fuel-metered
 * per element compared, or it reintroduces the same DoS.)
 */
/**
 * Fail-soft boxed-primitive unwrap — THE one, imported, not copied.
 *
 * This was a fourth hand-written copy, and the worst-placed of the four: `unwrap-boxed.ts`
 * was created THIS release as "ONE definition", the commit that deduped it deduped
 * `lang/runtime.ts` and `emitters/js.ts`, and the VM — the copy an attacker reaches first —
 * was left behind. It was byte-identical, so nothing looked wrong; it simply was not
 * connected to the module, nor to the differential corpus that keeps the others honest.
 *
 * There was no bundle reason for the copy: this file already imports the sibling leaves
 * `../forbidden-keys`.
 */
import { unwrapBoxed as unwrapBoxedVM } from '../unwrap-boxed'

function eqValue(a: unknown, b: unknown): boolean {
  // Slot reads, not `.valueOf()` — a boxed subclass must not get to run guest-supplied
  // code inside the VM's own equality, and a throwing one must not escape as a raw
  // exception. Same discipline as the TJS runtime's `Eq`/`toBool`; keeping the two in
  // step is the point, since the VM is the copy an attacker reaches first.
  a = unwrapBoxedVM(a)
  b = unwrapBoxedVM(b)
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
    return true
  }
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true
  }
  return false
}

// --- Monadic Error Type ---

/**
 * AgentError wraps errors as values for monadic error flow.
 * When an atom fails, it stores an AgentError instead of throwing.
 * Subsequent atoms check for errors and pass them through without executing.
 */
/**
 * Report to the TJS flight recorder, if one is installed.
 *
 * Deliberately reached through `globalThis` rather than imported: the VM ships
 * as its own bundle (`tjs-lang/vm`) and must not pull the language runtime in
 * behind it. No runtime installed → no-op. A throwing recorder is swallowed —
 * recording must never change the behavior of the program it records.
 */
export function recordVmEvent(entry: {
  source: string
  severity: string
  message: string
  data?: unknown
}): boolean {
  const g = globalThis as any
  if (!g.__tjs || typeof g.__tjs.record !== 'function') return false
  try {
    g.__tjs.record(entry)
    return true
  } catch {
    // The recorder is not allowed to take the VM down with it.
    return false
  }
}

export class AgentError {
  readonly $error = true as const
  readonly message: string
  readonly op: string
  readonly cause?: Error

  constructor(message: string, op: string, cause?: Error) {
    this.message = message
    this.op = op
    this.cause = cause

    // Every VM failure — fuel exhaustion, atom timeout, capability denial,
    // atom throw — is constructed here. Recording at the single choke point
    // means the black box cannot miss one, and costs nothing on the happy path
    // (an AgentError is already the slow path).
    recordVmEvent({
      source: 'vm',
      severity: 'error',
      message,
      data: { op, cause: cause?.message },
    })
  }

  toString(): string {
    return `AgentError[${this.op}]: ${this.message}`
  }

  toJSON(): { $error: true; message: string; op: string } {
    return { $error: true, message: this.message, op: this.op }
  }
}

/**
 * Check if a value is an AgentError
 */
export function isAgentError(value: any): value is AgentError {
  return value instanceof AgentError || (value && value.$error === true)
}

// --- Types ---

export type OpCode = string

export interface Capabilities {
  fetch?: (url: string, init?: any) => Promise<any>
  store?: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    query?: (query: any) => Promise<any[]>
    /**
     * Predicate pushdown: filter at the data instead of dragging rows to the code.
     *
     * Takes a **canonical verified predicate** (produced by `canonicalizePredicate`
     * from `tjs-lang/lang`) — pure, total, serializable, and carrying a stable
     * `key` the store can cache on. The VM never parses it; it is data in flight,
     * which is what keeps the acorn-dependent canonicalizer out of the lean
     * `tjs-lang/vm` bundle.
     *
     * **Optional by design.** A store that can't evaluate predicates simply doesn't
     * implement this, and the guest filters with the ordinary `filter` atom — the
     * same progressive-enhancement shape as `$predicate` in JSON Schema (structure
     * for naive consumers, computation for aware ones). Pushdown is an optimization
     * you opt into, never a correctness requirement.
     */
    queryPredicate?: (query: {
      collection?: string
      /** Canonical predicate: `{ key, canonical, ast, entry }`. */
      predicate: {
        key: string
        canonical: string
        ast: unknown
        entry: string
      }
      limit?: number
    }) => Promise<any[]>
    vectorSearch?: (
      collection: string,
      vector: number[],
      k?: number,
      filter?: any
    ) => Promise<any[]>
  }
  llm?: {
    predict: (prompt: string, options?: any) => Promise<string>
    embed?: (text: string) => Promise<number[]>
  }
  agent?: {
    run: (agentId: string, input: any) => Promise<any>
  }
  xml?: {
    parse: (xml: string) => Promise<any>
  }
  code?: {
    /** Transpile AsyncJS source to AST */
    transpile: (source: string) => { op: string; steps: any[] }
  }
  [key: string]: any
}

export interface TraceEvent {
  op: string
  input: any
  stateDiff: Record<string, any>
  result?: any
  error?: string
  fuelBefore: number
  fuelAfter: number
  /**
   * Epoch milliseconds. A number rather than an ISO string: traces get sorted and
   * subtracted far more often than they get read, and it matches `Timestamp`, which is
   * epoch-ms based. Render with `Timestamp.iso()` when a human needs to see it.
   */
  timestamp: number
}

/** Cost override: static number or dynamic function */
export type CostOverride =
  | number
  | ((input: any, ctx: RuntimeContext) => number)

/** Timeout override: static number (ms) or dynamic function. 0 disables. */
export type TimeoutOverride =
  | number
  | ((input: any, ctx: RuntimeContext) => number)

/**
 * One scope's accounting for one bound name.
 *
 * `size` is the bytes charged for it, `ref` the value it was measured from, and `witness`
 * a cheap change-detector (an array's length) that lets a rebind of an unchanged value skip
 * re-measuring. The shape was spelled out longhand in three places — the context type, the
 * `callLocal` seeding, and `reduce`'s accumulator carry — which is three chances for the
 * three to drift apart.
 */
export interface HeapEntry {
  size: number
  ref: unknown
  witness: number
}

export interface RuntimeContext {
  fuel: { current: number }
  args: Record<string, any>
  state: Record<string, any> // Current scope state
  consts: Set<string> // Variables declared with const (immutable)
  capabilities: Capabilities
  resolver: (op: string) => Atom<any, any> | undefined
  output?: any
  error?: AgentError // Monadic error - when set, subsequent atoms are skipped
  memo?: Map<string, any>
  trace?: TraceEvent[]
  warnings?: string[] // Non-fatal warnings (e.g., console.warn)
  signal?: AbortSignal // External abort signal for timeout enforcement
  costOverrides?: Record<string, CostOverride> // Per-atom cost overrides
  /**
   * Per-atom CALL QUOTAS — a hard cap on how many times an op may run.
   *
   * Fuel meters work done INSIDE the VM. It is blind to what an atom summons outside it:
   * an `llmPredict` costing 50 fuel might cost real money, and a `httpFetch` costing 10
   * might hammer someone else's service. A budget denominated in VM work cannot express
   * "at most 3 model calls", so this does.
   *
   * Absent or unset op ⇒ unlimited, so it is purely additive.
   *
   * **SCOPE — read this before treating a quota as a spend cap.** A quota counts calls
   * within ONE run. A capability that starts a *new* `vm.run` gets a fresh counter, so an
   * agent able to trigger re-entrancy can multiply its allowance. Inline sub-agents share
   * the parent's context and therefore its counter; a capability calling back into the VM
   * does not.
   *
   * To enforce a cap across nested runs, pass the SAME `quotaUsed` object to each — see
   * `quotaUsed` below. Across a process or network boundary no such enforcement is
   * possible: budget does not travel, only tokens and data do.
   */
  quotas?: Record<string, number>
  /**
   * Calls made per op, for `quotas`. Supplied by `vm.run`, but a host may pass its own
   * object to share one budget across nested runs — the only way to make a quota hold
   * through re-entrancy.
   */
  quotaUsed?: Record<string, number>
  /** This run's OWN call counts — a floor under the shared `quotaUsed`, which is a host
   * object and can under-report (a Proxy that always says 0). Shared by derived contexts. */
  quotaLocal?: Record<string, number>
  timeoutOverrides?: Record<string, TimeoutOverride> // Per-atom timeout overrides (ms, 0 disables)
  maxSourceBytes?: number // The run's `maxSourceBytes`. For guest-built source (runCode/transpileCode) it can only LOWER the 8KB cap — see `guestSourceCap`
  context?: Record<string, any> // Immutable request-scoped metadata (auth, permissions, etc.)
  membraneMaxBytes?: number // Cap on the estimated size of a capability return crossing into guest state (default MEMBRANE_MAX_BYTES)
  maxHeapBytes?: number // Ceiling on bytes held live in guest scope (default MAX_HEAP_BYTES). Fuel bounds work; this bounds peak memory.
  /**
   * Running estimate of live guest-state bytes, held in a SHARED OBJECT rather than as a
   * plain number.
   *
   * `createChildScope` spreads the context, which copies a number by value while sharing a
   * Map by reference — so the total and the per-key ledger drifted apart across scopes and
   * the running total could go negative, silently buying back budget.
   *
   * REQUIRED, and created with the run (`AgentVM.run`), never lazily. A lazily created
   * account belongs to whichever context object first wrote — and every derived context is a
   * spread, so one created on a derived context (an atom's `inputsResolvedContext`, a
   * sub-agent's) was invisible to the run, and those writes were simply not counted (rc.2
   * re-review M1). Required means the compiler finds every context built without one.
   */
  heapAccount: {
    bytes: number
    /** Bytes allocated by steps still executing (see `allocate`); released as each ends. */
    transient: number
  }
  /** The allocation frame of the innermost step executing on this context (see `allocate`). */
  allocFrame?: { bytes: number }
  /**
   * Per name, the reference it was last MEASURED at (and its array length), so re-binding an
   * unchanged value costs nothing and a grown array costs only its tail. A CACHE for the cost of
   * measuring, never a source of refunds: nothing is subtracted from the estimate when a name is
   * rebound or its scope ends (see `chargeHeap`). It used to be — per name, then per scope —
   * and each version freed bytes still live through another name, four review rounds running.
   *
   * Per SCOPE, so a child's `x` never reads as the parent's `x`.
   *
   * Required for the same reason as `heapAccount`.
   */
  heapPerKey: Map<string, HeapEntry>
  /**
   * Every LIVE object guest values hang off — scope states, memo caches, run arguments — for
   * the true-live-heap measurement `reconcileHeap` takes before failing a run. Shared by
   * reference across the run (spread). Scope states enter only through `newScopeState`;
   * `releaseScope` removes what a scope registered.
   */
  heapRoots: Set<object>
  /**
   * The format version of the AST this context runs (`$ajs`). v2 reads a bare string as a
   * LITERAL; v1 as a reference when a variable of that name is in scope. Absent means v1.
   */
  astVersion?: number
  /** Set on the context an atom runs under when the VM resolved its inputs (see
   * `inputsResolvedContext`): `resolveValue` is the identity there. */
  inputsResolved?: boolean
  runCodeDepth?: number // Track nested runCode calls to prevent infinite recursion
  localCall?: boolean // Inside a callLocal helper body — return may be a non-object scalar
  helpers?: Record<string, { steps: any[]; paramNames: string[] }> // Local helper bodies, called by name
  callDepth?: number // Helper call nesting depth — guards against host-stack overflow on deep recursion
}

export type AtomExec = (step: any, ctx: RuntimeContext) => Promise<void>

/**
 * Effect classification of an atom.
 * - `'pure'`: deterministic, no IO, no capability access, no observable side
 *   effects — safe inside a synchronous predicate (see the predicate verifier).
 * - `'io'`: touches `ctx.capabilities` (fetch/store/llm/agent/code), or is
 *   nondeterministic (random/uuid), or has side effects (console). Not allowed
 *   in a predicate. Its return crosses the structuredClone membrane.
 *
 * ## `defineAtom` defaults to `'io'` (BREAKING, shipped as a PATCH in 0.13.6)
 *
 * A breaking change in a patch is deliberate, not an oversight. Gating a security
 * correctness fix behind a version bump leaves every adopter on `^0.13.x` holding the hole
 * until they choose to move — and since the failure mode here is the *silent absence of
 * protection*, the one who never upgrades is the one who stays exposed. The one who does
 * gets, at worst, a loud error naming an atom that was handing live host references to
 * guest code. Only good surprises, so they should arrive automatically.
 *
 * It defaulted to `'pure'` through 0.13.5, and that one default was serving two
 * populations with opposite needs:
 *
 * - **Core atoms** (`len`, `jsonStringify`, `map`) operate on data already inside the VM.
 *   Membraning them would deep-clone values that never left. `'pure'` is right.
 * - **Atoms defined through the public `defineAtom`** exist to bring HOST data *in* —
 *   Firestore snapshots, Elasticsearch hits, SDK responses. That is precisely the data the
 *   membrane exists to sanitise, and precisely the shape that carries accessors. `'io'` is
 *   right.
 *
 * The default served the first and silently disabled the boundary for the second, whose
 * authors are outside our audit surface. And it failed *quietly*: nothing warned, nothing
 * broke, the atom worked and the hardening was absent. snowfox-app upgraded specifically
 * for the prototype-strip and later found all four of its custom atoms untagged — people
 * who read the release note and acted on it still did not get the protection, which is what
 * settles it: documentation was not a control here (#38).
 *
 * So the default now fails SAFE. Core atoms are restored to `'pure'` by an explicit sweep
 * beside `EFFECTFUL_CORE_OPS`, which keeps one audit surface rather than 31 declarations.
 *
 * The invariant "anything touching ctx.capabilities is tagged 'io'" is guarded by
 * `atom-effects-scan.test.ts`, which reads what atom BODIES do — not by the list, which can
 * only prove it agrees with itself (that is how `xmlParse` stayed mis-tagged for two
 * releases).
 */
export type AtomEffects = 'pure' | 'io'

export interface AtomDef {
  op: OpCode
  inputSchema: any
  outputSchema?: any
  exec: AtomExec
  docs?: string
  timeoutMs?: number
  cost?: number | ((input: any, ctx: RuntimeContext) => number)
  effects?: AtomEffects
  /** The VM resolves this atom's inputs before calling it (see {@link AtomOptions}). */
  resolveInputs?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Atom<I, O> extends AtomDef {
  create(input: I): I & { op: string }
}

export interface AtomOptions {
  docs?: string
  timeoutMs?: number
  cost?: number | ((input: any, ctx: RuntimeContext) => number)
  /**
   * Effect class — defaults to **`'io'`** (0.13.6; was `'pure'`). Set `'pure'` only for an
   * atom that touches no capability, is deterministic, and has no side effects; doing so
   * opts its return OUT of the structuredClone membrane and makes it callable from a
   * verified predicate. See {@link AtomEffects}.
   */
  effects?: AtomEffects
  /**
   * Resolve this atom's inputs before calling it — **default `true`**. A program's
   * `myAtom({ url: someVar })` hands the AST's VALUE for `url` — a reference — not the value
   * of `someVar`. The core and battery atoms each call `resolveValue` themselves; an atom
   * written like the documented example (`async ({ url }) => fetch(url)`) did not, and so
   * received the variable's NAME (`"someVar"`) silently in every release before 0.14.0.
   * The VM now resolves for it. Set `false` only if your atom calls `resolveValue` on its own
   * inputs — resolving twice can read a resolved string as a variable name (v1 ASTs) or a
   * resolved object shaped like `{ $expr }` as an expression.
   */
  resolveInputs?: boolean
}

export interface RunResult {
  result: any
  error?: AgentError
  fuelUsed: number
  trace?: TraceEvent[]
  warnings?: string[] // Non-fatal warnings emitted during execution
}

// --- Procedure Store ---

/**
 * Stored procedure entry with AST and expiry metadata
 */
export interface StoredProcedure {
  ast: any
  createdAt: number
  expiresAt: number
}

/**
 * Module-level procedure store. In production, replace with a proper cache.
 * Default TTL: 1 hour. Max AST size: 100KB.
 */
export const procedureStore = new Map<string, StoredProcedure>()

/** Default TTL for stored procedures: 1 hour */
export const DEFAULT_PROCEDURE_TTL = 60 * 60 * 1000

/** Default max AST size: 100KB */
export const DEFAULT_MAX_AST_SIZE = 100 * 1024

/** Token prefix for identifying procedure tokens */
export const PROCEDURE_TOKEN_PREFIX = 'proc_'

/**
 * Check if a string is a procedure token
 */
export function isProcedureToken(value: any): value is string {
  return typeof value === 'string' && value.startsWith(PROCEDURE_TOKEN_PREFIX)
}

/**
 * Resolve a procedure token to its AST.
 * Returns the AST or throws an error if expired/not found.
 */
export function resolveProcedureToken(token: string): any {
  const entry = procedureStore.get(token)
  if (!entry) {
    throw new Error(`Procedure not found: ${token}`)
  }
  if (Date.now() > entry.expiresAt) {
    procedureStore.delete(token) // Clean up expired entry
    throw new Error(`Procedure expired: ${token}`)
  }
  // BOUNDARY: a stored AST re-enters the system here, so the version gate applies. This is
  // how `agentRun` receives an AST — it resolves a token and hands the result to `seq`,
  // never passing through `AgentVM.run()`. See checkAstVersion in ./ast-version.
  checkAstVersion(entry.ast, 'resolveProcedureToken')
  return entry.ast
}

/**
 * Generate a unique procedure token
 */
function generateProcedureToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return PROCEDURE_TOKEN_PREFIX + crypto.randomUUID()
  }
  // Fallback
  return (
    PROCEDURE_TOKEN_PREFIX +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  )
}

// --- Security ---

/**
 * Properties that are forbidden to access for security reasons.
 * Accessing these could allow prototype pollution or sandbox escape.
 */
const FORBIDDEN_PROPERTIES = FORBIDDEN_KEYS_SET

/**
 * Own-property test for a GUEST-CONTROLLED key.
 *
 * Use this — never `key in obj` and never a bare truthiness check on `obj[key]` — anywhere a
 * name the guest chose indexes a host object. `in` walks the prototype chain, so on a plain
 * object literal it answers `true` for `constructor`, `toString`, `valueOf`,
 * `hasOwnProperty` and the rest of `Object.prototype`, and the subsequent read returns a real
 * host function. That is not a theoretical concern here: it made `builtins.constructor`
 * reachable and CALLABLE from guest code with guest arguments, past an allowlist that only
 * ever enumerated own keys.
 *
 * Called through `Object.prototype.hasOwnProperty` rather than `obj.hasOwnProperty(key)`,
 * because the object under test may legitimately be `Object.create(null)` (which has no such
 * method) or may have `hasOwnProperty` shadowed by data that crossed the membrane.
 */
const own = (obj: unknown, key: string): boolean =>
  obj != null && Object.prototype.hasOwnProperty.call(obj, key)

/**
 * Scope-chain lookup for a GUEST-CONTROLLED key: walks the prototype chain, but stops
 * BEFORE `Object.prototype`.
 *
 * Guest scopes are deliberately prototype-linked — `state: Object.create(ctx.state)`, so a
 * child write shadows rather than clobbers (see the comment on `acquireScope`). So plain
 * `own()` is WRONG here: it severs lexical scoping, and a helper reading an outer variable
 * stops finding it. That is not hypothetical either — replacing `in` with `own()` on
 * `ctx.state` broke three stored-procedure tests immediately, which is the only reason this
 * distinction got written down instead of shipped.
 *
 * But plain `in` is equally wrong, because the chain ENDS at `Object.prototype`, so the
 * guest reaches `constructor`, `toString` and friends. The scope chain is legitimate; the
 * one link past it is not. Walk it, and stop at the boundary.
 */
const scopeHas = (obj: unknown, key: string): boolean => {
  let o: any = obj
  while (o != null && o !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(o, key)) return true
    o = Object.getPrototypeOf(o)
  }
  return false
}

/**
 * Capability-boundary membrane.
 *
 * Every value a capability (`fetch`, `store`, `llm`, `agent`, `code`, …) hands
 * back is host-authored data crossing into guest state. Without a membrane the
 * guest receives the *live host reference*: it can then invoke methods on it
 * (see `methodCall`), read prototype chains, or mutate an object the host still
 * holds — a sandbox escape and a mutation-aliasing hazard. The value model
 * inside the VM is JSON-ish (plain objects/arrays/primitives + structured-clone
 * builtins), so the correct crossing is a deep copy of *pure data only*.
 *
 * `membraneValue` does two things at the single choke point where an io-atom's
 * return lands in guest state:
 *   1. A budgeted, cycle-safe pre-walk that rejects anything non-data (function,
 *      symbol, bigint) with a precise reason BEFORE allocating a copy, and caps
 *      the estimated serialized size so a hostile/broken capability can't OOM
 *      the VM by returning a giant payload. (`structuredClone` alone would
 *      allocate the whole copy first, then maybe reject — the pre-walk fails
 *      cheap and fails closed.)
 *   2. `structuredClone`, which produces a de-prototyped deep copy (throwing on
 *      anything the pre-walk missed — defense in depth) with fresh identity, so
 *      the guest can neither reach the host object nor mutate a shared one.
 *
 * Primitives carry no reference and need no copy — fast path, zero allocation.
 * Only `effects: 'io'` atoms are membraned (pure atoms operate on data already
 * inside the VM); the budget is `ctx.membraneMaxBytes ?? MEMBRANE_MAX_BYTES`.
 */
const MEMBRANE_MAX_BYTES = 4 * 1024 * 1024 // 4MB — generous for data, cheap to reject a runaway
const MEMBRANE_MAX_DEPTH = 10_000 // reject absurd nesting before it can stack-overflow the walk / clone

export type MembraneResult =
  | { ok: true; value: unknown; bytes?: number }
  | { ok: false; reason: string }

/**
 * The prototypes plain data may have. Anything else is a CLASS INSTANCE, and the copy keeps
 * only its own data properties: a getter on the prototype, or a `#private` field, silently
 * reads as `undefined` on the other side. A Firestore Timestamp's `seconds` is exactly that,
 * and a negated rule over it flipped deny to ALLOW (0.14.0 final re-review 2, M-2). Refused
 * loudly instead, as an own getter already is. (Arrays, Date, Map, Set and typed arrays have
 * their own branches.)
 */
const PLAIN_PROTOTYPES = new Set<unknown>([
  Object.prototype,
  null,
  RegExp.prototype,
  Error.prototype,
  TypeError.prototype,
  RangeError.prototype,
  SyntaxError.prototype,
  ReferenceError.prototype,
  EvalError.prototype,
  URIError.prototype,
])

/**
 * `membraneValue` with the refusal naming WHO handed the value over — the party to go and
 * fix. Every reason is phrased for a capability return, so run arguments said "capability
 * return contains …" and pointed the host at the wrong code. A wrapper rather than a
 * parameter threaded through the walk, so the walk stays one function the membrane
 * invariant test can read whole.
 */
export function membraneValueFrom(
  subject: string,
  value: unknown,
  maxBytes: number
): MembraneResult {
  const r = membraneValue(value, maxBytes)
  return r.ok
    ? r
    : { ok: false, reason: r.reason.replace(/capability return/g, subject) }
}

export function membraneValue(
  value: unknown,
  maxBytes: number
): MembraneResult {
  // Fast path: primitives are pure data with no reachable reference.
  if (value === null || value === undefined) return { ok: true, value }
  const t = typeof value
  if (t === 'boolean' || t === 'number') return { ok: true, value }
  if (t === 'string') {
    if ((value as string).length * 2 > maxBytes) {
      return {
        ok: false,
        reason: `string exceeds ${maxBytes}-byte membrane budget`,
      }
    }
    return { ok: true, value }
  }
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    return {
      ok: false,
      reason: `a ${t} cannot cross the capability boundary into guest state`,
    }
  }

  // Objects/arrays: iterative, cycle-safe pre-walk for kind + budget.
  let bytes = 0
  const seen = new WeakSet<object>()
  const stack: Array<{ v: any; depth: number }> = [{ v: value, depth: 0 }]
  while (stack.length) {
    const { v, depth } = stack.pop()!
    if (v === null || v === undefined) {
      bytes += 8
      if (bytes > maxBytes) return overBudget(maxBytes)
      continue
    }
    const vt = typeof v
    if (vt === 'function' || vt === 'symbol' || vt === 'bigint') {
      return {
        ok: false,
        reason: `capability return contains a ${vt}, which cannot cross into guest state`,
      }
    }
    if (vt === 'string') {
      bytes += (v as string).length * 2 + 8
      if (bytes > maxBytes) return overBudget(maxBytes)
      continue
    }
    if (vt !== 'object') {
      // number / boolean — a large array/Map/Set of primitives must still be
      // budgeted, so check here too (this branch used to `continue` unchecked).
      bytes += 8
      if (bytes > maxBytes) return overBudget(maxBytes)
      continue
    }
    if (depth > MEMBRANE_MAX_DEPTH) {
      return {
        ok: false,
        reason: 'the value exceeds the membrane depth limit',
      }
    }
    if (seen.has(v)) continue // cycle / shared ref — structuredClone preserves it; don't recount
    seen.add(v)
    bytes += 16
    if (bytes > maxBytes) return overBudget(maxBytes)
    if (Array.isArray(v)) {
      // `Object.keys` on an array yields its indices AND any non-index own enumerable
      // property. Both are needed: the index branch was hardened separately and the
      // non-index one was never visited at all, so `arr.meta = { get(){…} }` ran host
      // code, leaked its return into guest state, leaked a thrown host message into
      // `result.error`, and carried an unbudgeted 5MB string past a 4MB cap —
      // `structuredClone` serialises those properties even though the walk skipped them.
      //
      // Read INCREMENTALLY, with the running budget, so an oversized array is refused
      // without first being enumerated. `Object.keys` on a 2,000,000-element array costs
      // 371ms and 52MB by itself — so rejecting a payload that exceeds a 1,024-byte
      // budget by four orders of magnitude cost 549ms and 103MB, all of it spent to say
      // no. The module docstring promises rejection "BEFORE the clone allocates (the OOM
      // guard)", and it did avoid the clone while allocating the same order of memory
      // itself. See `membrane-budget.test.ts`.
      const own = readArrayData(v, bytes, maxBytes, stack, depth)
      if (!own.ok) return own
      bytes = own.bytes
    } else if (v instanceof Date) {
      bytes += 32 // fixed-size builtin
      if (bytes > maxBytes) return overBudget(maxBytes)
    } else if (ArrayBuffer.isView(v)) {
      // TypedArray / DataView — charge the REAL backing size, not a flat
      // estimate: a 500MB Uint8Array must not cross a small budget.
      bytes += (v as ArrayBufferView).byteLength
      if (bytes > maxBytes) return overBudget(maxBytes)
    } else if (v instanceof ArrayBuffer) {
      bytes += v.byteLength
      if (bytes > maxBytes) return overBudget(maxBytes)
    } else if (v instanceof Map || v instanceof Set) {
      // Walk entries so a large collection is both budgeted and kind-checked (a value
      // could itself be a function / host ref). structuredClone clones keys and values,
      // so both cross the boundary.
      //
      // Read through the INTRINSIC iterator, and refuse a subclass outright. `for (const
      // x of v)` dispatches to `Symbol.iterator`, which a guest-supplied object controls,
      // while `structuredClone` reads the internal slots — so the two disagreed, and a
      // `class extends Map` with a lying iterator presented itself as EMPTY to this walk
      // while 20,000 real entries crossed a 1024-byte `membraneMaxBytes` intact. Verified
      // in both JSC and V8. Three guarantees failed at once: the documented OOM guard
      // ("rejects oversized payloads BEFORE the clone allocates") was simply not enforced
      // for Map/Set, MEMBRANE_MAX_DEPTH was evadable by nesting, and host code ran during
      // the walk.
      const proto = Object.getPrototypeOf(v)
      const isMap = v instanceof Map
      if (proto !== (isMap ? Map.prototype : Set.prototype)) {
        return {
          ok: false,
          reason: `capability return contains a ${
            isMap ? 'Map' : 'Set'
          } subclass; the boundary takes plain data only, because a subclass can override how it is read`,
        }
      }
      bytes += 16
      if (bytes > maxBytes) return overBudget(maxBytes)
      // `.call` on the intrinsic method, driven by hand — never `for…of`, which would
      // consult the object's own `Symbol.iterator` again.
      const it = isMap
        ? Map.prototype.entries.call(v as Map<any, any>)
        : Set.prototype.values.call(v as Set<any>)
      const next = it.next.bind(it)
      for (let step = next(); !step.done; step = next()) {
        if (isMap) {
          const [mk, mv] = step.value as [any, any]
          stack.push({ v: mk, depth: depth + 1 })
          stack.push({ v: mv, depth: depth + 1 })
        } else {
          stack.push({ v: step.value, depth: depth + 1 })
        }
      }
    } else {
      // Read DESCRIPTORS, not values. `v[k]` invokes a getter — so the walk that
      // exists to keep host code out of guest state would itself run host code,
      // before structuredClone is even reached and regardless of the verdict. A
      // getter can throw, mutate, or stall, so that is a side-effect vector on the
      // boundary, not merely a data-leak one.
      //
      // Accessors are rejected rather than evaluated: there is no way to learn what
      // one returns without running it, and structuredClone would run it again
      // anyway. A capability must hand over plain data.
      const proto = Object.getPrototypeOf(v)
      if (!PLAIN_PROTOTYPES.has(proto)) {
        const name = proto?.constructor?.name || 'an unnamed class'
        return {
          ok: false,
          reason: `capability return contains an instance of ${name}; only plain data crosses, and a class instance's prototype getters and private fields would silently read as undefined — convert it to a plain object first`,
        }
      }
      const own = readOwnData(v)
      if (!own.ok) return own
      bytes += own.bytes
      if (bytes > maxBytes) return overBudget(maxBytes)
      for (const value of own.values) stack.push({ v: value, depth: depth + 1 })
    }
  }

  try {
    return { ok: true, value: structuredClone(value), bytes }
  } catch (e: any) {
    return {
      ok: false,
      reason: `capability return is not structured-cloneable: ${
        e?.message || e
      }`,
    }
  }
}

/**
 * An array's own data, read against the running budget and abandoned the moment it blows.
 *
 * Two scans, because the two failure modes want opposite strategies:
 *
 * 1. **By index, up to `v.length`.** A dense array is refused after roughly
 *    `remaining / 8` elements — nothing is materialised, so a 2,000,000-element payload
 *    against a small budget stops almost immediately instead of allocating 52MB of index
 *    strings to reach the same verdict.
 *
 * 2. **`Object.keys` for the rest**, reached only when the index scan finished inside the
 *    budget. That is the sparse case, and it is exactly where `Object.keys` is CHEAP —
 *    it enumerates own properties, not the length range, so a length-1e9 array holding
 *    three values yields three keys. Without the `PROBE_CAP` handoff, scanning such an
 *    array by index would be a billion iterations: the naive fix for the dense DoS is a
 *    new sparse one.
 *
 * `Object.keys` also finds NON-INDEX own properties (`arr.meta = …`), which
 * `structuredClone` serialises and which therefore must be walked and charged for their
 * names. Those are the second scan's real job; the sparse handoff comes along for free.
 */
/**
 * THE over-budget refusal.
 *
 * There were two, with an identical message — `overBudget` and `membraneOverBudget` — left
 * behind when the array walk split out of `readOwnData`. Two spellings of one sentence on
 * the highest-stakes file in the repo is review burden for nothing, and the kind of pair
 * that drifts the moment someone improves the wording of one.
 */
function overBudget(maxBytes: number): { ok: false; reason: string } {
  return {
    ok: false,
    reason: `the value exceeds the ${maxBytes}-byte membrane budget`,
  }
}

function readArrayData(
  v: unknown[],
  startBytes: number,
  maxBytes: number,
  stack: Array<{ v: any; depth: number }>,
  depth: number
): { ok: true; bytes: number } | { ok: false; reason: string } {
  let bytes = startBytes
  /** Values queued for the walk. Each will cost at least 8 — the early-bail lower bound. */
  let pushed = 0
  /** Own index properties actually found; `len - this` is the number of HOLES. */
  let indexCount = 0
  const len = v.length
  // How far to scan by index before concluding the array is sparse enough that
  // `Object.keys` is the cheaper instrument. Generous, because the index scan is doing
  // real work up to this point and only holes are wasted.
  const probeCap = Math.max(1024, Math.floor((maxBytes - startBytes) / 8) * 4)
  const scanned = Math.min(len, probeCap)

  let i = 0
  for (; i < scanned; i++) {
    const d = Object.getOwnPropertyDescriptor(v, i)
    if (!d) continue // a hole: `structuredClone` preserves it and it carries nothing
    if (d.get || d.set) {
      return {
        ok: false,
        reason: `capability return has an accessor at index ${i}; the boundary takes plain data only, because reading an accessor would execute host code`,
      }
    }
    // An index is a SLOT, not a stored name — see readOwnData — so nothing is charged
    // here. The bail uses a LOWER BOUND on what is already queued instead: every pushed
    // value costs at least 8 when the walk pops it (8 for null/undefined and primitives,
    // 8+ for a string, 16 for an object). Charging 8 here as well would double-count and
    // halve every array's capacity — the same phantom this branch was just fixed for,
    // reintroduced in the name of bailing early.
    stack.push({ v: d.value, depth: depth + 1 })
    pushed++
    indexCount++
    if (bytes + pushed * 8 > maxBytes) return overBudget(maxBytes)
  }

  // Everything the index scan did not reach, plus every non-index own property. When the
  // index scan covered the whole array this is only the non-index ones.
  for (const k of Object.keys(v)) {
    const asIndex = isArrayIndex(k) ? Number(k) : -1
    if (asIndex >= 0 && asIndex < i) continue // already handled above
    const d = Object.getOwnPropertyDescriptor(v, k)
    if (d && (d.get || d.set)) {
      return {
        ok: false,
        reason: `capability return has an accessor ${
          asIndex >= 0 ? `at index ${k}` : `property '${k}'`
        }; the boundary takes plain data only, because reading an accessor would execute host code`,
      }
    }
    stack.push({ v: d ? d.value : undefined, depth: depth + 1 })
    pushed++
    // A non-index key really is stored by name and really is serialised, so its name is
    // charged. An index is a slot and is not.
    if (asIndex < 0) bytes += k.length * 2 + 8
    else indexCount++
    if (bytes + pushed * 8 > maxBytes) return overBudget(maxBytes)
  }

  // HOLES ARE NOT FREE, because `structuredClone` reproduces `length`.
  //
  // Charging purely by content let an array's LENGTH cross unbudgeted, and the guard
  // exists precisely to stop the clone allocating: a capability returning an array with
  // `length = 1e9` and two values passed this walk on ~40 bytes, and `structuredClone`
  // then spent **6.5 seconds** materialising a billion-slot array (measured under Bun/JSC,
  // which densifies rather than preserving a sparse representation). Six seconds of
  // synchronous host work that no fuel budget, no atom timeout and no `membraneMaxBytes`
  // could see.
  //
  // A hole is priced at the same 8 bytes as a slot holding a primitive, since that is what
  // the clone allocates for it. A DENSE array is unaffected — it has no holes — so this
  // adds nothing to the ordinary case and does not re-introduce the capacity halving that
  // billing indices by name once caused.
  const holes = len - indexCount
  if (holes > 0) {
    bytes += holes * 8
    if (bytes > maxBytes) return overBudget(maxBytes)
  }

  return { ok: true, bytes }
}

/**
 * Read an object's own enumerable data properties WITHOUT evaluating a single accessor.
 *
 * The one place the membrane is allowed to look at a host object's contents, so it is the
 * one place this rule has to hold — and it has now been got wrong three times, in three
 * branches, one at a time:
 *
 *   - the object branch read `v[k]` directly (fixed e803f4b)
 *   - the array branch read `v[i]` directly (fixed c7959f4, the same defect one morning
 *     later, in the twin nobody looked at)
 *   - the array branch never visited non-index own properties at all, which
 *     `structuredClone` serialises regardless
 *
 * Reading `v[k]` invokes a getter, so the walk that exists to keep host code OUT of guest
 * state would itself execute host code — before `structuredClone` is reached and whatever
 * the eventual verdict. A getter can throw (leaking host exception text into the guest's
 * error), mutate, or stall, so this is a side-effect vector on the boundary, not only a
 * data-leak one.
 *
 * Accessors are REJECTED rather than evaluated: there is no way to learn what one returns
 * without running it, and `structuredClone` would run it a second time anyway. A capability
 * hands over plain data or it hands over nothing.
 */
/**
 * A canonical array index — the exact spec definition, not "looks numeric".
 *
 * `'01'`, `'1.0'`, `' 1'` and `'4294967295'` are ordinary property names even on an array:
 * they occupy a real named slot that `structuredClone` serialises by name, so they must
 * keep their name charge. Only a key that round-trips through `ToUint32` is an element.
 */
function isArrayIndex(k: string): boolean {
  const n = Number(k)
  return Number.isInteger(n) && n >= 0 && n < 0xffffffff && String(n) === k
}

function readOwnData(
  v: object
):
  | { ok: true; values: unknown[]; bytes: number }
  | { ok: false; reason: string } {
  const values: unknown[] = []
  let bytes = 0
  for (const k of Object.keys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, k)
    // An array's key list is its INDICES plus any non-index own property, and only the
    // latter is a name that crosses. `structuredClone` copies an element as a slot; the
    // string `"199999"` is never materialised, so billing it is billing for a thing that
    // does not exist. It compounds with length — 500k floats are 3.81MB of data and were
    // charged 13.14MB — which cut effective array capacity ~3.4× under the documented 4MB
    // default and made an ordinary RAG return look like an attack. See
    // `membrane-budget.test.ts`.
    //
    // A slot costs NOTHING here, rather than a token 8: every value is charged when the
    // walk pops it, and the floor is already 8 (null/undefined, primitive) or 16 (object).
    // Adding a surcharge on top would be a flat 2× on numeric arrays — the same phantom
    // in smaller print. Map/Set entries are priced the same way, by value only. The OOM
    // guard is untouched: 1M floats are still 8MB and still refused.

    if (d && (d.get || d.set)) {
      return {
        ok: false,
        reason: `capability return has an accessor property '${k}'; the boundary takes plain data only, because reading an accessor would execute host code`,
      }
    }
    bytes += k.length * 2 + 8
    values.push(d ? d.value : undefined)
  }
  return { ok: true, values, bytes }
}

/**
 * Throws if the property name is forbidden for security reasons.
 */
function assertSafeProperty(prop: string): void {
  if (FORBIDDEN_PROPERTIES.has(prop)) {
    throw new Error(`Security Error: Access to '${prop}' is forbidden`)
  }
}

/**
 * SSRF Protection: Block requests to private/internal addresses.
 * Only applies to default fetch; custom capabilities handle their own validation.
 */
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
])

/**
 * True if a dotted-decimal IPv4 host is loopback, private, link-local, or
 * "this host" — the SSRF-sensitive ranges. WHATWG URL already normalizes IPv4
 * shorthand and decimal/hex forms (`127.1`, `2130706433` → `127.0.0.1`) before
 * we see the host, so matching the canonical dotted form is sufficient.
 */
function isBlockedIPv4(host: string): boolean {
  return (
    /^127\./.test(host) || // loopback 127.0.0.0/8 (incl. 127.0.0.2, not just .1)
    /^10\./.test(host) || // private 10.0.0.0/8
    /^192\.168\./.test(host) || // private 192.168.0.0/16
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || // private 172.16.0.0/12
    /^169\.254\./.test(host) || // link-local 169.254.0.0/16 (incl. cloud metadata)
    /^0\./.test(host) // "this host" 0.0.0.0/8
  )
}

/**
 * True if an IPv6 host (brackets already stripped, lowercased) is loopback,
 * unspecified, unique-local, link-local, or an embedded-IPv4 address (both the
 * IPv4-*mapped* `::ffff:` form and the deprecated IPv4-*compatible* `::` form)
 * that resolves to a blocked IPv4. Closes the SSRF bypass where `[fc00::1]`,
 * `[fe80::1]`, `[::ffff:7f00:1]`, and `[::7f00:1]` (all = 127.0.0.1) reached the
 * network.
 */
function isBlockedIPv6(host: string): boolean {
  if (host === '::1' || host === '::') return true // loopback / unspecified
  if (/^f[cd]/.test(host)) return true // unique-local fc00::/7 (fc00–fdff)
  if (/^fe[89ab]/.test(host)) return true // link-local fe80::/10
  // Embedded IPv4: mapped `::ffff:a.b.c.d` / `::ffff:7f00:1`, or the deprecated
  // IPv4-compatible `::a.b.c.d` / `::7f00:1` (both normalize to the hex form).
  const mapped = /^::(?:ffff:)?(.+)$/.exec(host)
  if (mapped) {
    const v4 = ipv4FromMappedTail(mapped[1])
    if (v4 && isBlockedIPv4(v4)) return true
  }
  return false
}

/** Decode the tail of an IPv4-mapped IPv6 address to dotted-decimal, or null. */
function ipv4FromMappedTail(tail: string): string | null {
  if (tail.includes('.')) return tail // already dotted (::ffff:127.0.0.1)
  const groups = tail.split(':')
  if (groups.length !== 2) return null
  const hi = parseInt(groups[0], 16)
  const lo = parseInt(groups[1], 16)
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

function isBlockedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)

    // Block non-http(s) protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return true
    }

    const host = url.hostname.toLowerCase()

    // Block known dangerous hosts
    if (BLOCKED_HOSTS.has(host)) return true

    // Block internal suffixes
    if (host.endsWith('.internal') || host.endsWith('.local')) return true

    // IPv6 literals arrive bracketed (e.g. "[fe80::1]"); strip for range checks.
    if (host.startsWith('[') && host.endsWith(']')) {
      return isBlockedIPv6(host.slice(1, -1))
    }

    // Block loopback / private / link-local IPv4 ranges
    return isBlockedIPv4(host)
  } catch {
    return true // Invalid URL = blocked
  }
}

// --- Helpers ---

/**
 * Creates a child scope for the context.
 * Uses prototype inheritance so reads fall through to parent, but writes stay local.
 */
/**
 * Each scope's STATE object → that scope's heap ledger. `varAssign` writes to the scope that
 * owns a binding, which may be an ancestor; the bytes must be charged to THAT scope's ledger,
 * or a child scope's `releaseScope` would free budget the ancestor still holds (or the
 * ancestor would hold bytes no ledger records). Weak, so a discarded scope costs nothing.
 */
const STATE_LEDGERS = new WeakMap<object, Map<string, HeapEntry>>()
function ledgerFor(
  state: object,
  ledger: Map<string, HeapEntry>
): Map<string, HeapEntry> {
  if (!STATE_LEDGERS.has(state)) STATE_LEDGERS.set(state, ledger)
  return STATE_LEDGERS.get(state)!
}

export function createChildScope(ctx: RuntimeContext): RuntimeContext {
  const child: RuntimeContext = {
    ...ctx,
    state: newScopeState(ctx, ctx.state),
    // A scope runs STEPS, and steps resolve their values. Inherited from an atom's
    // `inputsResolvedContext`, this made every nested expression come back unevaluated.
    inputsResolved: false,
    // Its own allocation frame, released with the scope: an expression evaluated DIRECTLY in
    // it (a `filter`/`find` condition, per item) is garbage when the scope ends — charged to
    // the enclosing step's frame, it accumulated over the whole loop.
    allocFrame: { bytes: 0 },
  }
  SCOPE_FRAMES.set(child, child.allocFrame!)
  // `heapBytes` is a NUMBER, so the spread copies it by value while `heapPerKey` (a Map)
  // is shared by reference. The two then drift: a child binding a key updates the shared
  // ledger but only its own copy of the total, and when the parent later rebinds that key
  // it subtracts a size it never added — driving the running total negative and silently
  // buying back budget. Sharing the accounting object keeps the two halves together.
  child.heapAccount = ctx.heapAccount

  // The ledger, by contrast, must NOT be shared: a scope accounts what it owns. See the
  // `heapPerKey` doc — sharing it made shadowing a name a way to free its budget.
  child.heapPerKey = new Map()
  ledgerFor(child.state, child.heapPerKey)

  // `error` is the one field that must be shared BY REFERENCE, and the spread made it a
  // detached slot on every child. Nothing copied it back, so an error raised inside ANY
  // child scope simply vanished and the run reported success: verified for the heap
  // ceiling, for `Unknown Atom`, and for the `__proto__` security guard, all of which
  // surface correctly at top level and were silently dropped inside `map`/`scope`.
  //
  // Fixed here rather than at the eight call sites on purpose. A per-site `if
  // (scopedCtx.error) ctx.error = scopedCtx.error` is the shape this codebase has already
  // been bitten by four times ("fixed in X, twin kept the bug" — the membrane, the vision
  // probe, `varsLet`, the literal scanners); the ninth scope-creating atom would be
  // written without it. An accessor cannot be forgotten. `tryCatch` deliberately clears
  // `ctx.error`, and runs in the SAME scope, so it is unaffected.
  Object.defineProperty(child, 'error', {
    get: () => ctx.error,
    set: (e: AgentError | undefined) => {
      ctx.error = e
    },
    enumerable: true,
    configurable: true,
  })
  return child
}

/**
 * Give back the heap budget a discarded scope was holding.
 *
 * The counterpart to the per-scope ledger, and load-bearing in the OPPOSITE direction: a
 * scope whose entries are never released leaks accounting, so a `map` over a few thousand
 * items would trip a ceiling it is nowhere near. That failure is fail-closed (a spurious
 * error, not a bypass), which is precisely why it needs a test rather than trust — a cap
 * that quietly enforces something nobody asked for is still a broken cap.
 *
 * Every `createChildScope` must be paired with this in a `finally`, which
 * `src/vm/state-writes.test.ts` mechanises rather than leaving to memory.
 */
export function releaseScope(child: RuntimeContext): void {
  // Nothing is refunded (see `chargeHeap`): the scope's values may still be reachable from
  // elsewhere, and a refund for bytes still live was a hole straight through the ceiling (rc.2
  // third re-review B1: ~40MB under 1MB). What a release does is stop the scope being a ROOT,
  // so the next true measurement no longer counts it.
  child.heapRoots.delete(child.state)
  for (const root of OWNED_ROOTS.get(child) ?? []) child.heapRoots.delete(root)
  // Its in-flight allocations are over (see `allocFrame` in createChildScope) — the frame it
  // OWNS only. A hand-built context (callLocal, agentRun) inherits its step's frame by spread,
  // and releasing THAT released a still-running step's in-flight bytes.
  const frame = SCOPE_FRAMES.get(child)
  if (frame) {
    child.heapAccount.transient -= frame.bytes
    frame.bytes = 0
  }
  child.heapPerKey.clear()
}

/** The allocation frame each `createChildScope` scope owns (released by `releaseScope`). */
const SCOPE_FRAMES = new WeakMap<RuntimeContext, { bytes: number }>()

/** Roots a hand-built context registered beyond its state (its memo cache, its args). */
const OWNED_ROOTS = new WeakMap<RuntimeContext, object[]>()

/**
 * A new scope state, registered as a heap root. THE way a scope state is made:
 * `heap-roots.test.ts` fails on a `state:` built any other way, because a root the true
 * measurement cannot see is memory the ceiling cannot see.
 */
export function newScopeState(
  ctx: { heapRoots: Set<object> },
  proto?: object
): Record<string, any> {
  const state = proto ? Object.create(proto) : {}
  ctx.heapRoots.add(state)
  return state
}

/**
 * Make a container an atom holds in a JS LOCAL — while guest steps run — a heap root for that
 * long; returns the release. The true measurement (`reconcileHeap`) sees only registered roots,
 * and resets the estimate to what it saw, so an unregistered holder is memory that measurement
 * forgets: `map`'s results array accumulated ~94–196MB under a 1MB cap, the estimate lowered past
 * it on every reconcile (rc.2 fourth re-review B1). Call it in a `try` whose `finally` releases.
 */
function holdRoot(ctx: RuntimeContext, ...holders: unknown[]): VoidFunction {
  const held = holders.filter(
    (h): h is object => h !== null && typeof h === 'object'
  )
  for (const h of held) ctx.heapRoots.add(h)
  return () => {
    for (const h of held) ctx.heapRoots.delete(h)
  }
}

/** A loop's results array grew by one slot: an insertion into a root (I2). */
function chargeResultSlot(ctx: RuntimeContext, op: string): void {
  if (!chargeHeap(ctx, SLOT_BYTES, op, [])) throw ctx.error ?? new Error(op)
}

/** Register further roots owned by `child` (released with it). */
function ownRoots(child: RuntimeContext, ...roots: unknown[]): void {
  const owned = OWNED_ROOTS.get(child) ?? []
  for (const r of roots)
    if (r && typeof r === 'object') {
      child.heapRoots.add(r)
      owned.push(r)
    }
  OWNED_ROOTS.set(child, owned)
}

/**
 * Computes a shallow diff between two objects, returning the changes.
 */
function diffObjects(
  before: Record<string, any>,
  after: Record<string, any>
): Record<string, any> {
  const diff: Record<string, any> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeVal = before[key]
    const afterVal = after[key]

    if (afterVal !== beforeVal) {
      // For simplicity in tracing, we'll just show the new value.
      // A more complex diff could show { before: ..., after: ... }.
      setGuestKey(diff, key, afterVal)
    }
  }
  return diff
}

/**
 * Set `key` on an object the VM is building from GUEST keys — refusing `__proto__`.
 *
 * `obj['__proto__'] = v` does not add a property: it replaces the object's prototype. The heap
 * walk counts own properties only, so whatever hung off that prototype was never charged —
 * ~15MB held under an 8MB `maxHeapBytes` — and the guest could still read it through the
 * prototype (rc.2 review B4). Every site that builds an object from guest-chosen keys goes
 * through here: object literals, resolved values, atom inputs, and the guest `Object.assign`.
 * (`constructor`/`prototype` as KEYS are ordinary own properties — counted, and readable only
 * through the member guards — so data that uses them, e.g. model JSON, still works.)
 */
export function setGuestKey(
  obj: Record<string, any>,
  key: string,
  value: unknown
): void {
  if (key === '__proto__')
    throw new Error(
      "Security Error: '__proto__' is not allowed as an object key (it would replace the object's prototype)"
    )
  obj[key] = value
}

/** `obj[key]` if it is an OWN property, else `undefined` — never an inherited host value. */
function ownValue(obj: any, key: string): unknown {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key)
    ? obj[key]
    : undefined
}

/**
 * A run argument, read as guest data: an OWN property (an argument object's inherited
 * `constructor`, `toString` or `__proto__` handed the host's `Object`, its methods, and
 * `Object.prototype` itself to guest state and to capabilities — rc.2 sixteenth re-review B1),
 * forbidden keys refused, and the value checked like every other guest value.
 */
function argValue(ctx: RuntimeContext, key: string): unknown {
  assertSafeProperty(key)
  return guestValue(ownValue(ctx.args, key))
}

/**
 * Read a binding BY NAME: `'x'`, `'obj.a.b'`, `'args.k'` — v1's rule for a bare string, and the
 * rule for any atom input that IS a name (`varGet`'s `key`, `varsExport`'s `keys`) in every AST
 * version. Under v2 `resolveValue` reads a bare string as a literal, so those atoms asked for
 * variable `x` and got the string `'x'` back (rc.2 review B1). A name is a name in both formats.
 */
export function resolveName(val: string, ctx: RuntimeContext): any {
  // Special case: args.foo looks up ctx.args['foo'] directly
  // BUT only if 'args' is not a state variable (which takes precedence)
  if (val.startsWith('args.') && !('args' in ctx.state)) {
    return argValue(ctx, val.replace('args.', ''))
  }
  // Dot notation support
  if (val.includes('.')) {
    const parts = val.split('.')
    // Security: check each property name for forbidden access
    for (const part of parts) {
      if (FORBIDDEN_PROPERTIES.has(part)) {
        throw new Error(`Security Error: Access to '${part}' is forbidden`)
      }
    }
    let current = ctx.state[parts[0]]
    // If root variable exists, try to traverse
    if (current !== undefined) {
      for (let i = 1; i < parts.length; i++) {
        current = current?.[parts[i]]
      }
      // a dot-path is a value read too: `'s.add'` on a Set wrapper is a host function
      return guestValue(current)
    }
  }
  // Simple state lookup (not an expression, just key)
  // Check if the key exists in state (even if value is undefined)
  //
  // `own`, not `in` — the THIRD site of the same defect, and the one that survived fixing
  // the other two. `ctx.state` is a plain object literal, so `'toString' in ctx.state` is
  // true and this handed the guest `Object.prototype.toString` itself. Verified after the
  // `evaluateExpr` fix: a bare `hasOwnProperty` / `valueOf` / `constructor` still came back
  // `typeof === 'function'`, because a bare identifier reaches state through HERE, not
  // through `evaluateExpr`'s `ident` case.
  //
  // Worth noting why the earlier fix looked complete: the exploitable shape
  // (`constructor('abc')`, a CALL) does route through `evaluateExpr`, so the dangerous
  // case went away and the merely-leaking case did not. Fixing what reproduces is not the
  // same as fixing the class.
  if (scopeHas(ctx.state, val)) {
    return ctx.state[val]
  }
  // Key doesn't exist in state — return the literal string.
  //
  // RECORDED, not changed. This fallback is what turned a failed lookup into data in #52:
  // the emitter handed `resolveValue` the string "data.a", the root was not in state (it
  // came from args), and the caller got back the source text they had written, silently.
  //
  // The emitter no longer produces dot-path strings, so compiled code cannot reach this.
  // But the behaviour itself cannot simply become an error, because the ambiguity is real
  // and load-bearing: a hand-built AST legitimately says `value: 'obj.prop'` (the builder
  // API, 35+ call sites), and a program just as legitimately says `value: 'not.a.path'`
  // meaning a string. Once both are `typeof val === 'string'` they are indistinguishable —
  // which is exactly why the emitter must never add to the pile.
  //
  // So: leave the semantics alone and make the near-miss VISIBLE. This is the flight
  // recorder's stated purpose — record liberally, never change behaviour — and a
  // dotted string whose root is absent from scope is the highest-value thing it can
  // report, because the alternative is a plausible wrong value nobody can trace.
  if (val.includes('.')) {
    recordVmEvent({
      source: 'vm',
      severity: 'warning',
      message:
        `'${val}' looks like a path but its root '${
          val.split('.')[0]
        }' is not in scope — ` +
        `returning it as a literal string. If you meant a value, this is silently wrong.`,
      data: { value: val, root: val.split('.')[0] },
    })
  }
  return val
}

export function resolveValue(val: any, ctx: RuntimeContext): any {
  // Inside an atom whose inputs the VM already resolved: everything is a value now.
  if (ctx.inputsResolved) return val
  if (val && typeof val === 'object' && val.$kind === 'arg') {
    return argValue(ctx, String(val.path))
  }
  // Expression nodes - evaluate directly
  if (val && typeof val === 'object' && val.$expr) {
    return evaluateExpr(val, ctx)
  }
  if (typeof val === 'string') {
    // v2: a bare string is ALWAYS a literal; references are explicit nodes (board #1860).
    // v1 (and the builder, which writes v1) guesses: a reference if a variable of that name
    // is in scope — `resolveName`.
    if ((ctx.astVersion ?? AST_VERSION_LEGACY) >= 2) return val
    return resolveName(val, ctx)
  }
  // Recursively resolve plain object values (but not arrays or special objects)
  if (
    val &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    val.constructor === Object
  ) {
    const result: Record<string, any> = {}
    for (const key of Object.keys(val)) {
      setGuestKey(result, key, resolveValue(val[key], ctx))
    }
    return result
  }
  // Recursively resolve array elements
  if (Array.isArray(val)) {
    return val.map((item) => resolveValue(item, ctx))
  }
  return val
}

// --- Expression Node Types ---

export type ExprNode =
  | { $expr: 'literal'; value: any }
  | { $expr: 'ident'; name: string }
  | {
      $expr: 'member'
      object: ExprNode
      // string for static `obj.foo` and literal-indexed `arr[0]`;
      // ExprNode for variable-indexed `arr[i]` (evaluated at runtime).
      property: string | ExprNode
      computed?: boolean
      optional?: boolean
    }
  | { $expr: 'binary'; op: string; left: ExprNode; right: ExprNode }
  | { $expr: 'unary'; op: string; argument: ExprNode }
  | {
      $expr: 'logical'
      op: '&&' | '||' | '??'
      left: ExprNode
      right: ExprNode
    }
  | {
      $expr: 'conditional'
      test: ExprNode
      consequent: ExprNode
      alternate: ExprNode
    }
  | { $expr: 'array'; elements: ExprNode[] }
  | { $expr: 'object'; properties: { key: string; value: ExprNode }[] }
  | { $expr: 'call'; callee: string; arguments: ExprNode[] }
  | {
      $expr: 'methodCall'
      object: ExprNode
      method: string
      arguments: ExprNode[]
      optional?: boolean
    }
  // a regex literal: the VM builds the RegExp, after its ReDoS screen
  | { $expr: 'regex'; pattern: string; flags: string }

// --- Built-in Objects (Proxy-based) ---

/**
 * Create a proxy that provides helpful error messages for unsupported methods
 */
function createBuiltinProxy(
  name: string,
  supported: Record<string, any>,
  alternatives?: Record<string, string>
): any {
  return new Proxy(supported, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop]
      }
      const alt = alternatives?.[prop]
      if (alt) {
        throw new Error(`${name}.${prop} is not available. ${alt}`)
      }
      throw new Error(
        `${name}.${prop} is not supported in AsyncJS. Check docs for available ${name} methods.`
      )
    },
  })
}

/**
 * Convert an example-value schema (AsyncJS style) to JSON Schema.
 * Examples:
 *   'string' or 'hello' -> { type: 'string' }
 *   0 or 42 -> { type: 'number' }
 *   true/false -> { type: 'boolean' }
 *   ['string'] -> { type: 'array', items: { type: 'string' } }
 *   { name: 'string', age: 0 } -> { type: 'object', properties: {...}, required: [...] }
 */
function convertExampleToSchema(example: any): any {
  if (example === null) {
    return { type: 'null' }
  }

  if (example === undefined) {
    return {}
  }

  // Already a JSON Schema object: its 'type' is a type name, or an array of them (a nullable
  // field, `['string', 'null']`, was read as an EXAMPLE with a field named `type`)
  if (
    typeof example === 'object' &&
    example !== null &&
    'type' in example &&
    (typeof example.type === 'string' ||
      (Array.isArray(example.type) &&
        example.type.length > 0 &&
        example.type.every((t: unknown) => SCHEMA_TYPES.has(t as string))))
  ) {
    return example
  }

  // A tosijs-schema BUILDER — branded, not duck-typed (tjs-lang#58). An AJS example that has
  // a field named `schema` is an example, and reading it as a builder made that field the type.
  if (isBuilder(example)) {
    return example.schema
  }

  const type = typeof example

  if (type === 'string') {
    return { type: 'string' }
  }

  if (type === 'number') {
    return Number.isInteger(example) ? { type: 'integer' } : { type: 'number' }
  }

  if (type === 'boolean') {
    return { type: 'boolean' }
  }

  if (Array.isArray(example)) {
    if (example.length === 0) {
      return { type: 'array' }
    }
    // Use first element as item schema
    return {
      type: 'array',
      items: convertExampleToSchema(example[0]),
    }
  }

  if (type === 'object') {
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(example)) {
      setGuestKey(properties, key, convertExampleToSchema(value))
      required.push(key)
    }

    return {
      type: 'object',
      properties,
      required,
    }
  }

  // Fallback - accept anything
  return {}
}

/**
 * Built-in objects available in expressions.
 * These are Proxy objects that provide JS-like APIs mapped to safe implementations.
 */
/**
 * Where a VM wrapper keeps state the heap walk cannot see. The guest `Set` holds its items in
 * a CLOSURE, so `estimateBytes` — which walks own keys — counted a Set of 20MB as a handful of
 * methods (rc.2 second re-review, sibling of B2). A wrapper with hidden state exposes it here,
 * non-enumerable and symbol-keyed, so it never surfaces to the guest or to JSON.
 */
const HEAP_CONTENTS = Symbol('tjs.heapContents')

/** Marks the guest Date wrapper, so method bounds can dispatch on it (see `kindOf`). */
const DATE_WRAPPER = Symbol('tjs.dateWrapper')
function tagDateWrapper<T extends object>(wrapper: T): T {
  Object.defineProperty(wrapper, DATE_WRAPPER, { value: true })
  return sealMethods(wrapper)
}

function withHeapContents<T extends object>(contents: unknown, wrapper: T): T {
  Object.defineProperty(wrapper, HEAP_CONTENTS, { value: contents })
  return sealMethods(wrapper)
}

/**
 * A VM wrapper's methods are callable, not values: non-enumerable (so `Object.values`, `assign`,
 * spread and `JSON.stringify` cannot harvest them), non-writable and non-configurable (so guest
 * code cannot replace one). Rc.2 fifteenth re-review B1: `Object.values(s)` handed out `s.add`.
 */
function sealMethods<T extends object>(wrapper: T): T {
  for (const [k, d] of Object.entries(
    Object.getOwnPropertyDescriptors(wrapper)
  ))
    if (typeof d.value === 'function')
      Object.defineProperty(wrapper, k, {
        value: d.value,
        enumerable: false,
        writable: false,
        configurable: false,
      })
  return wrapper
}

/**
 * The function a method call runs: the INTRINSIC for the receiver's kind, never a property the
 * guest owns. `{ hasOwnProperty: stolenAdd }.hasOwnProperty(x)` dispatched to the guest's
 * property under `hasOwnProperty`'s bound, and grew a Set past `maxHeapBytes` (rc.2 fifteenth
 * re-review B1). Namespaces and the VM's wrappers carry their own (VM-built, sealed) methods.
 */
function intrinsicMethod(obj: any, method: string): unknown {
  // `Date` is the one namespace that is itself a function (`Date.now()`)
  if (typeof obj === 'function')
    return obj === (builtins as any).Date ? obj[method] : undefined
  if (typeof obj === 'string') return (String.prototype as any)[method]
  if (typeof obj === 'number') return (Number.prototype as any)[method]
  if (typeof obj === 'boolean') return (Boolean.prototype as any)[method]
  if (Array.isArray(obj)) return (Array.prototype as any)[method]
  if (
    NAMESPACE_OBJECTS.has(obj) ||
    HEAP_CONTENTS in obj ||
    DATE_WRAPPER in obj ||
    isGuestRegex(obj)
  )
    return obj[method]
  if (obj instanceof Date) return (Date.prototype as any)[method]
  return (Object.prototype as any)[method]
}

/** Deep-freeze plain JSON (the guest Schema constants are shared by every run). */
function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) deepFreeze(x)
    Object.freeze(v)
  }
  return v
}

/**
 * The guest `Schema` namespace: frozen plain JSON schemas, copied out of tosijs-schema's
 * builders once, at load. Its methods are not here — they are VM-implemented (`vmSchemaMethod`),
 * so reading `Schema.object` as a value finds nothing to steal.
 */
export const GUEST_SCHEMA: Readonly<Record<string, unknown>> = deepFreeze(
  Object.assign(
    Object.create(null),
    Object.fromEntries(
      (
        [
          'string',
          'number',
          'integer',
          'boolean',
          'null',
          'any',
          'undefined',
          'email',
          'uuid',
          'ipv4',
          'url',
          'datetime',
          'date',
          'emoji',
        ] as const
      ).map((n) => [n, structuredClone((s as any)[n].schema)])
    )
  )
)

export const builtins: Record<string, any> = Object.assign(
  Object.create(null),
  {
    // Math - most methods are safe pure functions
    Math: createBuiltinProxy('Math', {
      // Constants
      PI: Math.PI,
      E: Math.E,
      LN2: Math.LN2,
      LN10: Math.LN10,
      LOG2E: Math.LOG2E,
      LOG10E: Math.LOG10E,
      SQRT2: Math.SQRT2,
      SQRT1_2: Math.SQRT1_2,

      // Safe pure functions
      abs: Math.abs,
      ceil: Math.ceil,
      floor: Math.floor,
      round: Math.round,
      trunc: Math.trunc,
      sign: Math.sign,
      sqrt: Math.sqrt,
      cbrt: Math.cbrt,
      pow: Math.pow,
      exp: Math.exp,
      expm1: Math.expm1,
      log: Math.log,
      log2: Math.log2,
      log10: Math.log10,
      log1p: Math.log1p,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,
      atan2: Math.atan2,
      sinh: Math.sinh,
      cosh: Math.cosh,
      tanh: Math.tanh,
      asinh: Math.asinh,
      acosh: Math.acosh,
      atanh: Math.atanh,
      hypot: Math.hypot,
      min: Math.min,
      max: Math.max,
      clz32: Math.clz32,
      imul: Math.imul,
      fround: Math.fround,

      // Random - use crypto when available
      random: () => {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          const arr = new Uint32Array(1)
          crypto.getRandomValues(arr)
          return arr[0] / (0xffffffff + 1)
        }
        return Math.random()
      },
    }),

    // JSON - parse and stringify
    JSON: createBuiltinProxy('JSON', {
      parse: (text: string) => JSON.parse(text),
      stringify: (value: any, replacer?: any, space?: number) =>
        JSON.stringify(value, replacer, space),
    }),

    // console - maps to trace/logging
    console: createBuiltinProxy(
      'console',
      {
        log: (..._args: any[]) => {
          // In expression context, we can't access trace easily
          // This is a no-op in expressions, but works in atom context
          // The transpiler should lift console.log to a trace atom call
          return undefined
        },
        warn: (..._args: any[]) => undefined,
        error: (..._args: any[]) => undefined,
        info: (..._args: any[]) => undefined,
      },
      {
        table: 'Use console.log with JSON.stringify for structured data.',
        dir: 'Use console.log instead.',
        trace: 'Stack traces are not available in AsyncJS.',
      }
    ),

    // Array static methods
    Array: createBuiltinProxy(
      'Array',
      {
        isArray: (value: any) => Array.isArray(value),
        from: (iterable: any, mapFn?: any, thisArg?: any) =>
          Array.from(iterable, mapFn, thisArg),
        of: (...items: any[]) => Array.of(...items),
      },
      {
        prototype: 'Prototype access is not allowed.',
      }
    ),

    // Object static methods
    Object: createBuiltinProxy(
      'Object',
      {
        keys: (obj: any) => Object.keys(obj),
        values: (obj: any) => Object.values(obj),
        entries: (obj: any) => Object.entries(obj),
        fromEntries: (entries: any) => Object.fromEntries(entries),
        // Not the native `Object.assign`: it would invoke the `__proto__` SETTER for a source
        // that has an own `__proto__` key (e.g. from `JSON.parse`) — see `setGuestKey`.
        assign: (target: any, ...sources: any[]) => {
          const out: Record<string, any> = {}
          for (const src of [target, ...sources])
            if (src != null)
              for (const k of Object.keys(src)) setGuestKey(out, k, src[k])
          return out
        },
        hasOwn: (obj: any, prop: string) => Object.hasOwn(obj, prop),
      },
      {
        prototype: 'Prototype access is not allowed.',
        create: 'Use object literals instead.',
        defineProperty: 'Property descriptors are not supported.',
        getPrototypeOf: 'Prototype access is not allowed.',
        setPrototypeOf: 'Prototype modification is not allowed.',
      }
    ),

    // String static methods
    String: createBuiltinProxy('String', {
      fromCharCode: (...codes: number[]) => String.fromCharCode(...codes),
      fromCodePoint: (...codePoints: number[]) =>
        String.fromCodePoint(...codePoints),
    }),

    // Number static methods and constants
    Number: createBuiltinProxy('Number', {
      isNaN: Number.isNaN,
      isFinite: Number.isFinite,
      isInteger: Number.isInteger,
      isSafeInteger: Number.isSafeInteger,
      parseFloat: parseFloat,
      parseInt: parseInt,
      MAX_VALUE: Number.MAX_VALUE,
      MIN_VALUE: Number.MIN_VALUE,
      MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
      MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
      POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
      NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
      NaN: Number.NaN,
      EPSILON: Number.EPSILON,
    }),

    // Global functions
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    encodeURI: encodeURI,
    decodeURI: decodeURI,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,

    // Constants
    undefined: undefined,
    null: null,
    NaN: NaN,
    Infinity: Infinity,

    // Schema-based filtering - strips extra properties, validates structure
    // Returns filtered data or throws on validation failure
    filter: (data: any, schema: any): any => {
      // the ADMITTED copy of the schema (or example) — what was checked is what validates
      const jsonSchema = admittedSchema(schema, 'filter').schema
      const result = schemaFilter(data, jsonSchema)
      if (result instanceof Error) {
        throw result
      }
      return result
    },

    // Schema, as DATA (rc.2 fourteenth re-review, Tonio 2026-10-02): guest code never holds a
    // tosijs-schema builder, whose methods are host closures. These are frozen plain JSON
    // schemas; `Schema.object(…)`, `isValid(…)` and the rest are VM-implemented (`vmSchemaMethod`).
    Schema: GUEST_SCHEMA,

    // Set factory - creates a set-like object backed by an array
    Set: (items: any[] = []) => {
      // `data` keeps insertion order (what the guest sees); `index` makes membership O(1).
      // Membership was `data.includes` — so `intersection`/`diff` were O(n×m) for a charge
      // linear in their size: 2.6s for 523 fuel at 60k items (rc.2 sixth re-review M2).
      const index = new globalThis.Set(items)
      const data = [...index]
      return withHeapContents(data, {
        // Mutable operations
        add(item: any) {
          if (!index.has(item)) {
            index.add(item)
            data.push(item)
          }
          return this
        },
        remove(item: any) {
          // SameValueZero, as the index uses: `indexOf(NaN)` is -1, and `splice(-1, 1)` removed
          // the LAST element — `data` and `index` drifted apart and the heap walk, which sees
          // `data`, stopped seeing what `index` held (rc.2 seventh re-review B5)
          if (index.delete(item))
            data.splice(
              data.findIndex((x) => x === item || (x !== x && item !== item)),
              1
            )
          return this
        },
        clear() {
          index.clear()
          data.length = 0
          return this
        },
        // Query operations
        has(item: any) {
          return index.has(item)
        },
        get size() {
          return data.length
        },
        toArray() {
          return [...data]
        },
        // Set operations - return new sets
        union(other: any) {
          const otherItems = other?.toArray?.() ?? other ?? []
          return builtins.Set([...data, ...otherItems])
        },
        intersection(other: any) {
          const o = new globalThis.Set(other?.toArray?.() ?? other ?? [])
          return builtins.Set(data.filter((x: any) => o.has(x)))
        },
        diff(other: any) {
          const o = new globalThis.Set(other?.toArray?.() ?? other ?? [])
          return builtins.Set(data.filter((x: any) => !o.has(x)))
        },
        // Iteration
        forEach(fn: (item: any) => void) {
          data.forEach(fn)
        },
        map(fn: (item: any) => any) {
          return builtins.Set(data.map(fn))
        },
        filter(fn: (item: any) => boolean) {
          return builtins.Set(data.filter(fn))
        },
        // Serialization - Sets serialize to arrays
        toJSON() {
          return [...data]
        },
      })
    },

    // Date factory - creates a date-like object
    // Also supports Date.now() for compatibility
    Date: (() => {
      const createDate = (d: globalThis.Date): any =>
        tagDateWrapper({
          // Get the underlying value
          get value() {
            return d.toISOString()
          },
          get timestamp() {
            return d.getTime()
          },
          // Components
          get year() {
            return d.getFullYear()
          },
          get month() {
            return d.getMonth() + 1 // 1-indexed
          },
          get day() {
            return d.getDate()
          },
          get hours() {
            return d.getHours()
          },
          get minutes() {
            return d.getMinutes()
          },
          get seconds() {
            return d.getSeconds()
          },
          get dayOfWeek() {
            return d.getDay()
          },
          // Arithmetic - returns new Date
          add({
            years = 0,
            months = 0,
            days = 0,
            hours = 0,
            minutes = 0,
            seconds = 0,
            ms = 0,
          }: {
            years?: number
            months?: number
            days?: number
            hours?: number
            minutes?: number
            seconds?: number
            ms?: number
          } = {}) {
            const newDate = new globalThis.Date(d.getTime())
            if (years) newDate.setFullYear(newDate.getFullYear() + years)
            if (months) newDate.setMonth(newDate.getMonth() + months)
            if (days) newDate.setDate(newDate.getDate() + days)
            if (hours) newDate.setHours(newDate.getHours() + hours)
            if (minutes) newDate.setMinutes(newDate.getMinutes() + minutes)
            if (seconds) newDate.setSeconds(newDate.getSeconds() + seconds)
            if (ms) newDate.setMilliseconds(newDate.getMilliseconds() + ms)
            return createDate(newDate)
          },
          // Difference
          diff(
            other: any,
            unit: 'ms' | 'seconds' | 'minutes' | 'hours' | 'days' = 'ms'
          ) {
            const otherTime =
              typeof other === 'object' && other.timestamp
                ? other.timestamp
                : new globalThis.Date(other).getTime()
            const diffMs = d.getTime() - otherTime
            switch (unit) {
              case 'seconds':
                return diffMs / 1000
              case 'minutes':
                return diffMs / (1000 * 60)
              case 'hours':
                return diffMs / (1000 * 60 * 60)
              case 'days':
                return diffMs / (1000 * 60 * 60 * 24)
              default:
                return diffMs
            }
          },
          // Formatting
          format(fmt = 'ISO') {
            if (fmt === 'ISO') return d.toISOString()
            if (fmt === 'date') return d.toISOString().split('T')[0]
            if (fmt === 'time')
              return d.toISOString().split('T')[1].split('.')[0]
            // Simple format substitution
            return fmt
              .replace('YYYY', String(d.getFullYear()))
              .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
              .replace('DD', String(d.getDate()).padStart(2, '0'))
              .replace('HH', String(d.getHours()).padStart(2, '0'))
              .replace('mm', String(d.getMinutes()).padStart(2, '0'))
              .replace('ss', String(d.getSeconds()).padStart(2, '0'))
          },
          // Comparison
          isBefore(other: any) {
            const otherTime =
              typeof other === 'object' && other.timestamp
                ? other.timestamp
                : new globalThis.Date(other).getTime()
            return d.getTime() < otherTime
          },
          isAfter(other: any) {
            const otherTime =
              typeof other === 'object' && other.timestamp
                ? other.timestamp
                : new globalThis.Date(other).getTime()
            return d.getTime() > otherTime
          },
          // String representation
          toString() {
            return d.toISOString()
          },
          // Serialization - Dates serialize to ISO strings
          toJSON() {
            return d.toISOString()
          },
        })

      // The Date factory function
      const DateFactory = (init?: string | number) => {
        const date =
          init !== undefined ? new globalThis.Date(init) : new globalThis.Date()
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date: ${init}`)
        }
        return createDate(date)
      }

      // Static methods (for Date.now() compatibility)
      DateFactory.now = () => globalThis.Date.now()
      DateFactory.parse = (str: string) => createDate(new globalThis.Date(str))

      return DateFactory
    })(),
  }
)

/**
 * Allowlist of method names `methodCall` may invoke — defense in depth behind
 * the capability membrane. Two facts make this safe *and* non-breaking:
 *   - The membrane guarantees guest values are plain data (de-prototyped by
 *     structuredClone), so `obj[method]` can only ever resolve to a standard
 *     built-in prototype method — never a custom/host method.
 *   - Builtin objects (Math/JSON/Object/Array/…) are curated proxies that
 *     already reject unknown statics at their `get` trap.
 * So allowing exactly {standard prototype methods} ∪ {builtin statics} permits
 * everything a guest legitimately calls and nothing else. The teeth: `call`,
 * `apply`, and `bind` live only on `Function.prototype` — absent here — so even
 * if a function reference ever leaked past the membrane, `methodCall` could not
 * use it to re-enter arbitrary host code with a chosen `this`/args.
 */

/**
 * THE METHOD TABLE (docs/vm-budgets.md): every method guest code may call, BY RECEIVER KIND, with
 * the exact type of every argument position and an upper bound on what a call allocates.
 *
 * The bound is computed from the SAME operands the native method then reads — that is the whole
 * point of the types. The rc.2 reviews found bounds computed from a different view of the input
 * than the native used, seven ways: a count read by the bound as 0 and by the native as `'1e8'`;
 * a method exempt from argument checks while JavaScript coerced its SECOND argument; one `$'` per
 * match where the template had fifty (docs/reviews/0.14.0-rc.2-rereview-7.md). With exact types
 * there is no second view: a count is a number, so `'x'.repeat('1e8')` is refused, not modelled.
 *
 * - A method a kind does not list is not callable on that kind (`includes` on a number).
 * - Arguments past the signature are refused (a native may read a position the bound ignored).
 * - `bound: 'vm'` methods are implemented by the VM (`string-methods.ts`), which charges exactly
 *   what it builds, as it builds it.
 *
 * Bounds are checked against real results by `vm-budgets.test.ts`. In-place growth (`push`, a
 * Set's `add`) is not an allocation here — it is charged where it lands (`accountMutation`, I2).
 */
type AllocBound = (receiver: any, args: any[], ctx: RuntimeContext) => number

/** The type of an argument position. `?` makes it optional (undefined allowed). */
type ArgType =
  | 'any' // a value, used as a value (stored, compared by identity) — never converted
  | 'str'
  | 'num' // a number (NaN and ±Infinity included: natives read them without allocating)
  | 'prim' // a string, number, boolean or null
  | 'nullish' // null or undefined
  | 'pattern' // a string or a VM regex
  | 'objOrArr' // a plain object or an array
  | 'array'
  | 'setLike' // a guest Set or an array
  | 'setSource' // what Set(…) copies: an array, a string, or a guest Set
  | 'dateLike' // a guest Date, a number or a string
  | 'amounts' // a plain object whose own values are numbers (Date add)
  | 'entries' // an array of [string | number, value] pairs
  | 'arrayLike' // what Array.from reads: an array, a string, a guest Set, or { length: number }
  | 'schema' // a schema value; a guest-supplied `pattern` in it is refused

interface Sig {
  args: string[]
  rest?: ArgType
  bound: AllocBound | 'vm'
}

/** Bytes for a value's top level: a string's characters, a container's slots. */
function shallowBytes(x: unknown): number {
  if (typeof x === 'string') return x.length * 2
  if (x === null || typeof x !== 'object') return SLOT_BYTES
  if (Array.isArray(x)) return 16 + x.length * SLOT_BYTES
  if (HEAP_CONTENTS in x) return 16 + shallowBytes((x as any)[HEAP_CONTENTS])
  let n = 16
  for (const k of Object.keys(x)) n += k.length * 2 + SLOT_BYTES
  return n
}

const sumOf = (xs: any[], f: (x: any) => number) =>
  xs.reduce((n: number, x: any) => n + f(x), 0)

const NONE: AllocBound = () => 0
const CONST =
  (bytes: number): AllocBound =>
  () =>
    bytes
/** A printed or copied TREE of the arguments, `c` times over (see `treeBytes`). */

/** A guest Set/Date wrapper, or a Schema builder: a fresh object of a dozen or so members. */
const WRAPPER_BYTES = 4096

const strLen = (x: unknown) => (typeof x === 'string' ? x.length : 0)
/** ToIntegerOrInfinity of a number (the arguments are numbers — see the types). */
const toInt = (x: unknown, dflt: number): number => {
  if (x === undefined) return dflt
  const n = x as number
  return Number.isNaN(n)
    ? 0
    : n === Infinity || n === -Infinity
    ? n
    : Math.trunc(n)
}
const clampIndex = (i: number, len: number) =>
  i < 0 ? Math.max(0, len + i) : Math.min(i, len)
/** `slice(start, end)` — relative indices, as the specification defines them. */
const sliceRange = (len: number, a: unknown, b: unknown) =>
  Math.max(0, clampIndex(toInt(b, len), len) - clampIndex(toInt(a, 0), len))
/** `substring(start, end)` — clamped, and swapped if reversed. */
const substringRange = (len: number, a: unknown, b: unknown) => {
  const s = Math.min(Math.max(toInt(a, 0), 0), len)
  const e = Math.min(Math.max(toInt(b, len), 0), len)
  return Math.abs(e - s)
}
/** `substr(start, length)`. */
const substrRange = (len: number, a: unknown, b: unknown) =>
  Math.max(
    0,
    Math.min(Math.max(toInt(b, len), 0), len - clampIndex(toInt(a, 0), len))
  )
/** A count read as the native reads it: ToIntegerOrInfinity, so `Infinity` stays Infinity (and
 * is refused by the gate) and a negative count is the native's RangeError. */
const count = (x: unknown) => Math.max(0, toInt(x, 0))

/** A comparator-less sort compares STRING FORMS: elements must be primitives. */
function sortBound(r: unknown[]): number {
  for (const x of r) primitiveOperand(x, 'a sorted element', 'expr.sort')
  return r.length * SCALAR_STRING_BYTES
}

/** A string method's result is at most `c` × its receiver (case mapping can lengthen). */
const STRING = (c: number): Sig => ({
  args: [],
  bound: (r) => c * r.length * 2 + 64,
})
const CONST_SIG = (bytes: number, ...args: string[]): Sig => ({
  args,
  bound: CONST(bytes),
})
const NONE_SIG = (...args: string[]): Sig => ({ args, bound: NONE })
const NUMS: Sig = { args: [], rest: 'num', bound: NONE }

/** The array a printer/flatten counts, PER PATH, refusing once the walk passed the headroom. */
const TREE_PRINT: AllocBound = (r, _a, ctx) => treeBytes(ctx, r).bytes + 64

/**
 * Merge signature groups, refusing a name defined twice. An object spread silently lets the
 * later entry win — that is how Set's `union` bound became dead code under Schema's (rc.2 sixth
 * re-review M1) — so a duplicate stops the module from loading instead.
 */
function sigTable(...parts: Array<Record<string, Sig>>): Record<string, Sig> {
  const out: Record<string, Sig> = Object.create(null)
  for (const part of parts)
    for (const [name, sig] of Object.entries(part)) {
      if (Object.prototype.hasOwnProperty.call(out, name))
        throw new Error(`Method table: '${name}' is defined twice`)
      out[name] = sig
    }
  return out
}

const SIGS: Record<string, Record<string, Sig>> = {
  string: {
    at: CONST_SIG(64, 'num?'),
    charAt: CONST_SIG(64, 'num?'),
    charCodeAt: NONE_SIG('num?'),
    codePointAt: NONE_SIG('num?'),
    concat: {
      args: [],
      rest: 'prim',
      bound: (r, a, ctx) =>
        r.length * 2 + sumOf(a, (x) => stringFormBound(ctx, x)) + 64,
    },
    endsWith: NONE_SIG('str', 'num?'),
    startsWith: NONE_SIG('str', 'num?'),
    includes: NONE_SIG('str', 'num?'),
    indexOf: NONE_SIG('str', 'num?'),
    lastIndexOf: NONE_SIG('str', 'num?'),
    localeCompare: NONE_SIG('str'),
    // NFKD expands one code point to as many as 18 (U+FDFA)
    normalize: { args: ['str?'], bound: (r) => 18 * r.length * 2 + 64 },
    padStart: {
      args: ['num', 'str?'],
      bound: (r, a) => Math.max(r.length, count(a[0])) * 2 + 64,
    },
    padEnd: {
      args: ['num', 'str?'],
      bound: (r, a) => Math.max(r.length, count(a[0])) * 2 + 64,
    },
    repeat: { args: ['num'], bound: (r, a) => r.length * count(a[0]) * 2 + 64 },
    // the SELECTED range (charging the receiver refused `s.slice(0, 10)` of a long string)
    slice: {
      args: ['num?', 'num?'],
      bound: (r, a) => sliceRange(r.length, a[0], a[1]) * 2 + 64,
    },
    substring: {
      args: ['num?', 'num?'],
      bound: (r, a) => substringRange(r.length, a[0], a[1]) * 2 + 64,
    },
    substr: {
      args: ['num?', 'num?'],
      bound: (r, a) => substrRange(r.length, a[0], a[1]) * 2 + 64,
    },
    // the VM's own implementations, over its own regex engine, charged exactly
    split: { args: ['pattern?', 'num?'], bound: 'vm' },
    replace: { args: ['pattern', 'str'], bound: 'vm' },
    replaceAll: { args: ['pattern', 'str'], bound: 'vm' },
    match: { args: ['pattern'], bound: 'vm' },
    search: { args: ['pattern'], bound: 'vm' },
    // case mapping can lengthen a string (ß → SS, ΐ → three characters)
    toLowerCase: STRING(3),
    toUpperCase: STRING(3),
    toLocaleLowerCase: STRING(3),
    toLocaleUpperCase: STRING(3),
    trim: STRING(1),
    trimStart: STRING(1),
    trimEnd: STRING(1),
    trimLeft: STRING(1),
    trimRight: STRING(1),
    toWellFormed: STRING(1),
    isWellFormed: NONE_SIG(),
    toString: NONE_SIG(),
    valueOf: NONE_SIG(),
  },
  number: {
    // a number prints in at most ~1100 digits (base 2), ~400 characters grouped by locale
    toFixed: CONST_SIG(4096, 'num?'),
    toExponential: CONST_SIG(4096, 'num?'),
    toPrecision: CONST_SIG(4096, 'num?'),
    toString: CONST_SIG(4096, 'num?'),
    toLocaleString: CONST_SIG(4096),
    valueOf: NONE_SIG(),
  },
  boolean: { toString: CONST_SIG(64), valueOf: NONE_SIG() },
  array: {
    at: NONE_SIG('num?'),
    concat: {
      args: [],
      rest: 'any',
      bound: (r, a) =>
        16 +
        r.length * SLOT_BYTES +
        sumOf(a, (x) =>
          Array.isArray(x) ? x.length * SLOT_BYTES : SLOT_BYTES
        ) +
        64,
    },
    copyWithin: NONE_SIG('num', 'num?', 'num?'),
    fill: NONE_SIG('any', 'num?', 'num?'),
    includes: NONE_SIG('any', 'num?'),
    indexOf: NONE_SIG('any', 'num?'),
    lastIndexOf: NONE_SIG('any', 'num?'),
    // every element's string form, plus the separator between each pair
    join: {
      args: ['str?'],
      bound: (r, a, ctx) =>
        treeBytes(ctx, r).bytes +
        Math.max(0, r.length - 1) * (a[0] === undefined ? 2 : a[0].length * 2) +
        64,
    },
    pop: NONE_SIG(),
    shift: NONE_SIG(),
    reverse: NONE_SIG(),
    push: { args: [], rest: 'any', bound: NONE },
    unshift: { args: [], rest: 'any', bound: NONE },
    slice: {
      args: ['num?', 'num?'],
      bound: (r, a) => 16 + sliceRange(r.length, a[0], a[1]) * SLOT_BYTES + 64,
    },
    sort: { args: [], bound: (r: unknown[]) => sortBound(r) },
    toSorted: { args: [], bound: (r) => shallowBytes(r) + sortBound(r) },
    toReversed: { args: [], bound: (r) => shallowBytes(r) + 64 },
    splice: {
      args: ['num?', 'num?'],
      rest: 'any',
      bound: (r) => shallowBytes(r) + 64,
    },
    toSpliced: {
      args: ['num?', 'num?'],
      rest: 'any',
      bound: (r, a) => shallowBytes(r) + a.length * SLOT_BYTES + 64,
    },
    with: { args: ['num', 'any'], bound: (r) => shallowBytes(r) + 64 },
    // every element reachable within the depth becomes a slot, counted per PATH (treeBytes);
    // a walk stopped past the headroom refuses (a stopped walk's slot count is not a bound)
    flat: {
      args: ['num?'],
      bound: (r, _a, ctx) => {
        const t = treeBytes(ctx, r)
        return t.truncated ? Infinity : 16 + t.slots * SLOT_BYTES + 64
      },
    },
    toString: { args: [], bound: TREE_PRINT },
    toLocaleString: { args: [], bound: TREE_PRINT },
    valueOf: NONE_SIG(),
  },
  object: {
    hasOwnProperty: NONE_SIG('prim'),
    propertyIsEnumerable: NONE_SIG('prim'),
    toString: CONST_SIG(64),
    toLocaleString: CONST_SIG(64),
    valueOf: NONE_SIG(),
  },
  set: {
    add: NONE_SIG('any'),
    remove: NONE_SIG('any'),
    has: NONE_SIG('any'),
    clear: NONE_SIG(),
    toArray: { args: [], bound: (r) => shallowBytes(r) + 64 },
    toJSON: { args: [], bound: (r) => shallowBytes(r) + 64 },
    union: {
      args: ['setLike'],
      bound: (r, a) =>
        2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES,
    },
    intersection: {
      args: ['setLike'],
      bound: (r, a) =>
        2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES,
    },
    diff: {
      args: ['setLike'],
      bound: (r, a) =>
        2 * (shallowBytes(r) + shallowBytes(a[0])) + WRAPPER_BYTES,
    },
  },
  date: {
    add: CONST_SIG(WRAPPER_BYTES, 'amounts'),
    diff: NONE_SIG('dateLike', 'str?'),
    isBefore: NONE_SIG('dateLike'),
    isAfter: NONE_SIG('dateLike'),
    // six single `.replace`s over the format string: bounded by its length
    format: { args: ['str?'], bound: (_r, a) => strLen(a[0]) * 2 + 256 },
    toString: CONST_SIG(256),
    toJSON: CONST_SIG(256),
  },
  'native-date': sigTable(
    Object.fromEntries(
      [
        'getDate',
        'getDay',
        'getFullYear',
        'getHours',
        'getMilliseconds',
        'getMinutes',
        'getMonth',
        'getSeconds',
        'getTime',
        'getTimezoneOffset',
        'getUTCDate',
        'getUTCDay',
        'getUTCFullYear',
        'getUTCHours',
        'getUTCMilliseconds',
        'getUTCMinutes',
        'getUTCMonth',
        'getUTCSeconds',
        'getYear',
        'valueOf',
      ].map((n) => [n, NONE_SIG()])
    ),
    Object.fromEntries(
      [
        'setDate',
        'setFullYear',
        'setHours',
        'setMilliseconds',
        'setMinutes',
        'setMonth',
        'setSeconds',
        'setTime',
        'setUTCDate',
        'setUTCFullYear',
        'setUTCHours',
        'setUTCMilliseconds',
        'setUTCMinutes',
        'setUTCMonth',
        'setUTCSeconds',
        'setYear',
      ].map((n) => [n, NONE_SIG('num', 'num?', 'num?', 'num?')])
    ),
    Object.fromEntries(
      [
        'toISOString',
        'toDateString',
        'toUTCString',
        'toGMTString',
        'toTimeString',
        'toJSON',
        'toString',
        'toLocaleString',
        'toLocaleDateString',
        'toLocaleTimeString',
      ].map((n) => [n, CONST_SIG(256)])
    )
  ),
  regex: {
    toString: { args: [], bound: (r: GuestRegex) => r.source.length * 2 + 64 },
  },
  'ns:Math': Object.fromEntries(
    [
      'abs',
      'acos',
      'acosh',
      'asin',
      'asinh',
      'atan',
      'atan2',
      'atanh',
      'cbrt',
      'ceil',
      'clz32',
      'cos',
      'cosh',
      'exp',
      'expm1',
      'floor',
      'fround',
      'hypot',
      'imul',
      'log',
      'log10',
      'log1p',
      'log2',
      'max',
      'min',
      'pow',
      'random',
      'round',
      'sign',
      'sin',
      'sinh',
      'sqrt',
      'tan',
      'tanh',
      'trunc',
    ].map((n) => [n, NUMS])
  ),
  'ns:JSON': {
    // a parsed value is at most ~16 bytes per source character (`[0,0,…]`: a slot per 2 chars)
    parse: { args: ['str'], bound: (_r, a) => 16 * a[0].length + 64 },
    // no replacer: guest code holds no functions — enforced by the closed value domain
    // (`evaluateExpr`/`guestValue`), not assumed; an indent of a number or a string
    stringify: {
      args: ['any', 'nullish?', 'prim?'],
      bound: (_r, a, ctx) => stringifyBound(ctx, a[0], a[2]),
    },
  },
  'ns:Array': {
    from: { args: ['arrayLike'], bound: (_r, a) => arrayFromBound(a[0]) },
    of: {
      args: [],
      rest: 'any',
      bound: (_r, a) => 16 + a.length * SLOT_BYTES + 64,
    },
    isArray: NONE_SIG('any'),
  },
  'ns:Object': {
    // a string is not an object here (it would enumerate its characters)
    keys: { args: ['objOrArr'], bound: (_r, a) => 4 * shallowBytes(a[0]) + 64 },
    values: {
      args: ['objOrArr'],
      bound: (_r, a) => 2 * shallowBytes(a[0]) + 64,
    },
    entries: {
      args: ['objOrArr'],
      bound: (_r, a) => 8 * shallowBytes(a[0]) + 64,
    },
    assign: {
      args: ['objOrArr'],
      rest: 'objOrArr',
      bound: (_r, a) => 2 * sumOf(a, shallowBytes) + 64,
    },
    fromEntries: {
      args: ['entries'],
      bound: (_r, a) =>
        2 * sumOf(a[0], (e: any[]) => shallowBytes(e[0]) + SLOT_BYTES) + 64,
    },
    hasOwn: NONE_SIG('objOrArr', 'prim'),
  },
  'ns:String': {
    fromCharCode: {
      args: [],
      rest: 'num',
      bound: (_r, a) => a.length * 2 + 64,
    },
    fromCodePoint: {
      args: [],
      rest: 'num',
      bound: (_r, a) => a.length * 4 + 64,
    },
  },
  'ns:Number': {
    // Number.isNaN & co. do not convert their argument (the global isNaN does)
    isNaN: NONE_SIG('any'),
    isFinite: NONE_SIG('any'),
    isInteger: NONE_SIG('any'),
    isSafeInteger: NONE_SIG('any'),
    parseFloat: NONE_SIG('str'),
    parseInt: NONE_SIG('str', 'num?'),
  },
  // Schema, as data: every method is VM-implemented (`vmSchemaMethod`), which admits each
  // argument, charges what it builds and what validation visits, and returns plain JSON. There is
  // no `builder` kind: no builder object ever enters guest state.
  'ns:Schema': Object.fromEntries(
    [
      ['object', ['any']],
      ['array', ['any']],
      ['record', ['any']],
      ['union', ['array']],
      ['tuple', ['array']],
      ['enum', ['array']],
      ['const', ['prim']],
      ['fromExample', ['any']],
      ['infer', ['any']],
      ['response', ['str', 'any']],
      ['isValid', ['any', 'any']],
    ].map(([n, args]) => [n, { args, bound: 'vm' }])
  ),
  'ns:console': Object.fromEntries(
    ['log', 'info', 'warn', 'error'].map((n) => [
      n,
      { args: [], rest: 'any', bound: NONE },
    ])
  ),
  'ns:Date': {
    now: NONE_SIG(),
    parse: CONST_SIG(WRAPPER_BYTES, 'str'),
  },
}

/** The global functions (`parseInt(…)`, `Set(…)`, …), typed the same way. */
const GLOBAL_SIGS: Record<string, Sig> = {
  parseInt: NONE_SIG('str', 'num?'),
  parseFloat: NONE_SIG('str'),
  isNaN: NONE_SIG('num'),
  isFinite: NONE_SIG('num'),
  // a UTF-16 unit is up to 3 UTF-8 bytes, each written as `%XX`
  encodeURI: { args: ['str'], bound: (_r, a) => 9 * a[0].length * 2 + 64 },
  encodeURIComponent: {
    args: ['str'],
    bound: (_r, a) => 9 * a[0].length * 2 + 64,
  },
  decodeURI: { args: ['str'], bound: (_r, a) => a[0].length * 2 + 64 },
  decodeURIComponent: { args: ['str'], bound: (_r, a) => a[0].length * 2 + 64 },
  Set: {
    args: ['setSource?'],
    bound: (_r, a) =>
      (typeof a[0] === 'string'
        ? a[0].length * 64
        : 2 * (a[0] === undefined ? 0 : shallowBytes(a[0]))) + WRAPPER_BYTES,
  },
  Date: CONST_SIG(WRAPPER_BYTES, 'dateLike?'),
  // a filtered COPY of its data, as a tree
  filter: {
    args: ['any', 'any'],
    // admits the schema (after example conversion, what the library validates), charges the
    // validation (schema nodes × data nodes), and bounds the filtered copy (a tree)
    bound: (_r, a, ctx) => {
      const nodes = admitGuestSchema(convertExampleToSchema(a[1]), 'filter')
      chargeValidation(ctx, nodes, a[0], 'filter')
      return 2 * treeBytes(ctx, a[0]).bytes + 64
    },
  },
}

/** `Array.from(source)`: a slot per element — `{ length: n }` is n slots from two keys. */
function arrayFromBound(src: unknown): number {
  if (typeof src === 'string') return src.length * (SLOT_BYTES + 32) + 64
  if (Array.isArray(src)) return shallowBytes(src) + 64
  if (src && typeof src === 'object' && HEAP_CONTENTS in src)
    return 2 * shallowBytes(src)
  return 16 + count((src as any).length) * SLOT_BYTES + 64
}

/** JSON.stringify: the value's printed TREE — JSON-escaped, so a control character is six — plus
 * indentation, which repeats per LINE and so grows with nesting depth. */
function stringifyBound(
  ctx: RuntimeContext,
  x: unknown,
  indent: unknown
): number {
  const tree = treeBytes(ctx, x, true)
  if (tree.truncated) return Infinity
  const width =
    typeof indent === 'number'
      ? Math.min(10, count(indent))
      : typeof indent === 'string'
      ? Math.min(10, indent.length)
      : 0
  // every node on a line of its own, indented `width` per level
  return (
    tree.bytes + 64 + (width ? tree.nodes * (2 + width * tree.depth) * 2 : 0)
  )
}

/** What kind of value a method is called on — methods dispatch on it, and so must bounds. */
function kindOf(r: unknown): string {
  if (typeof r === 'string') return 'string'
  if (typeof r === 'number') return 'number'
  if (typeof r === 'boolean') return 'boolean'
  if (Array.isArray(r)) return 'array'
  if (typeof r === 'function')
    return r === (builtins as any).Date ? 'ns:Date' : 'function'
  if (r && typeof r === 'object') {
    // namespaces FIRST: they are proxies that throw on a property they lack, and the probes
    // below read properties (`isBuilder` reads a symbol)
    for (const ns of NAMESPACES)
      if (r === (builtins as any)[ns]) return 'ns:' + ns
    if (HEAP_CONTENTS in r) return 'set'
    if (DATE_WRAPPER in r) return 'date'
    if (isGuestRegex(r)) return 'regex'
    if (r instanceof Date) return 'native-date'
    return 'object'
  }
  return typeof r
}
/** The builtin namespace objects (proxies over host APIs): never guest values. Built lazily,
 * after `builtins` exists; a Set, because `evaluateExpr` asks on every object result. */
let namespaceSet: Set<unknown> | undefined
const NAMESPACE_OBJECTS: { has(v: object): boolean } = {
  has(v: object) {
    namespaceSet ??= new Set(NAMESPACES.map((ns) => (builtins as any)[ns]))
    return namespaceSet.has(v)
  },
}

/**
 * The value-domain rule alone (no charging), for a value about to be INSERTED into guest data in
 * place (`push`, `Object.assign`): the charge walk runs after the mutation, and a refusal there
 * would leave the value inside a structure a guest `catch` can still reach.
 */
function assertGuestData(values: unknown[]): void {
  const seen = new WeakSet<object>()
  const stack: unknown[] = [...values]
  while (stack.length) {
    const v = stack.pop()
    if (typeof v === 'function') throw notGuestData()
    if (!v || typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    if (NAMESPACE_OBJECTS.has(v)) throw notGuestData()
    if (HEAP_CONTENTS in v || DATE_WRAPPER in v || isGuestRegex(v)) continue // VM wrapper
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v)))
      if ('value' in d) stack.push(d.value)
  }
}

/**
 * A guest value as it LEAVES the VM (the run result): the VM's wrappers become the data their
 * `toJSON` already describes (a Set → its items, a Date → its JSON form, a regex → its source).
 * A wrapper's methods are sealed, so a structuredClone at a host's worker or process boundary
 * silently reduced a Set to `{ size }` (rc.2 sixteenth re-review M1). Copies only what changes.
 */
export function egressData(
  v: unknown,
  seen = new Map<object, unknown>()
): unknown {
  if (!v || typeof v !== 'object') return v
  if (seen.has(v)) return seen.get(v)
  if (isGuestRegex(v)) return String(v)
  if (HEAP_CONTENTS in v || DATE_WRAPPER in v) {
    const json =
      typeof (v as any).toJSON === 'function' ? (v as any).toJSON() : undefined
    return egressData(json, seen)
  }
  if (Array.isArray(v)) {
    const out: unknown[] = []
    seen.set(v, out)
    let changed = false
    for (const x of v) {
      const y = egressData(x, seen)
      if (y !== x) changed = true
      out.push(y)
    }
    if (!changed) seen.set(v, v)
    return changed ? out : v
  }
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) return v
  const out: Record<string, unknown> = Object.create(proto)
  seen.set(v, out)
  let changed = false
  for (const [k, x] of Object.entries(v)) {
    const y = egressData(x, seen)
    if (y !== x) changed = true
    setGuestKey(out, k, y)
  }
  if (!changed) seen.set(v, v)
  return changed ? out : v
}

function notGuestData(): AgentError {
  return new AgentError(
    'A function or builtin namespace is not a value in AsyncJS: call it (e.g. Math.max(a, b), s.trim())',
    'bind'
  )
}
const NAMESPACES = [
  'Math',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'Schema',
  'console',
]

/** A plain object or array that holds DATA: no accessors to run, no prototype of its own. */
const isPlainObject = (x: unknown): x is Record<string, unknown> =>
  !!x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype ||
    Object.getPrototypeOf(x) === null) &&
  !(HEAP_CONTENTS in x) &&
  !(DATE_WRAPPER in x) &&
  !isGuestRegex(x)

const isPrimitive = (x: unknown) =>
  x === null || (typeof x !== 'object' && typeof x !== 'function')

/** Does `v` have the type an argument position declares? */
function argOk(type: string, v: unknown): boolean {
  if (type.endsWith('?')) return v === undefined || argOk(type.slice(0, -1), v)
  switch (type) {
    case 'any':
      return true
    case 'str':
      return typeof v === 'string'
    case 'num':
      return typeof v === 'number'
    case 'prim':
      return isPrimitive(v) && v !== undefined
    case 'nullish':
      return v === null || v === undefined
    case 'pattern':
      return typeof v === 'string' || isGuestRegex(v)
    case 'objOrArr':
      return Array.isArray(v) || isPlainObject(v)
    case 'array':
      return Array.isArray(v)
    case 'setLike':
      return (
        Array.isArray(v) || (!!v && typeof v === 'object' && HEAP_CONTENTS in v)
      )
    case 'setSource':
      return typeof v === 'string' || argOk('setLike', v)
    case 'dateLike':
      return (
        typeof v === 'number' ||
        typeof v === 'string' ||
        (!!v && typeof v === 'object' && DATE_WRAPPER in v)
      )
    case 'amounts':
      return (
        isPlainObject(v) &&
        Object.values(Object.getOwnPropertyDescriptors(v)).every(
          (d) => typeof d.value === 'number'
        )
      )
    case 'entries':
      return (
        Array.isArray(v) &&
        v.every(
          (e) =>
            Array.isArray(e) &&
            (typeof e[0] === 'string' || typeof e[0] === 'number')
        )
      )
    case 'arrayLike':
      return (
        typeof v === 'string' ||
        argOk('setLike', v) ||
        (isPlainObject(v) &&
          typeof Object.getOwnPropertyDescriptor(v, 'length')?.value ===
            'number')
      )
    case 'schema':
      return true // checked separately, for patterns (see admitGuestSchema)
  }
  return false
}

const KIND_NAMES: Record<string, string> = {
  string: 'a string',
  number: 'a number',
  boolean: 'a boolean',
  array: 'an array',
  object: 'an object',
  set: 'a Set',
  date: 'a Date',
  'native-date': 'a Date',
  regex: 'a regex',
  function: 'a function',
}

/**
 * THE gate for a guest method call: the method exists for this kind of receiver, every argument
 * has its declared type, and the call's allocation — bounded from those same operands — is
 * returned for the caller to charge before it runs (I1), or `'vm'` for a VM-implemented method.
 */
function methodGate(
  receiver: unknown,
  method: string,
  args: unknown[],
  ctx: RuntimeContext
): number | 'vm' {
  const kind = kindOf(receiver)
  // OWN entries only: `SIGS.number.hasOwnProperty` is Object.prototype's function, not a Sig
  const table = Object.prototype.hasOwnProperty.call(SIGS, kind)
    ? SIGS[kind]
    : undefined
  const sig =
    table && Object.prototype.hasOwnProperty.call(table, method)
      ? table[method]
      : undefined
  if (!sig)
    throw new AgentError(
      `'${method}' is not available on ${
        KIND_NAMES[kind] ?? kind.replace('ns:', '')
      }`,
      `expr.${method}`
    )
  checkArgs(sig, args, `${method}()`, `expr.${method}`)
  return sig.bound === 'vm' ? 'vm' : sig.bound(receiver, args, ctx)
}

function checkArgs(sig: Sig, args: unknown[], what: string, op: string): void {
  if (args.length > sig.args.length && !sig.rest)
    throw new AgentError(
      `${what} takes at most ${sig.args.length} argument(s)`,
      op
    )
  args.forEach((v, i) => {
    const type = i < sig.args.length ? sig.args[i] : sig.rest!
    if (!argOk(type, v))
      throw new AgentError(
        `${what}'s argument ${i + 1} must be ${
          ARG_NAMES[type.replace('?', '')] ?? type
        }` +
          (isPrimitive(v)
            ? ''
            : " — convert it explicitly (e.g. arr.join(','), JSON.stringify(obj))"),
        op
      )
    // a 'schema' argument is a schema OR an example (filter, Schema.isValid convert it first):
    // admit what the library will actually validate against
    if (type.replace('?', '') === 'schema')
      admitGuestSchema(convertExampleToSchema(v))
  })
}

const ARG_NAMES: Record<string, string> = {
  str: 'a string',
  num: 'a number',
  prim: 'a string, number, boolean or null',
  nullish: 'null',
  pattern: 'a string or a regex',
  objOrArr: 'an object or an array',
  array: 'an array',
  setLike: 'a Set or an array',
  setSource: 'an array, a string or a Set',
  dateLike: 'a Date, a number or a string',
  amounts: 'an object of numbers',
  entries: 'an array of [key, value] pairs',
  arrayLike: 'an array, a string, a Set or { length: number }',
}

/**
 * A schema's `pattern` runs on the HOST's regex engine when it validates — so a guest-supplied
 * pattern is refused (use `regexMatch`, which runs on the VM's). The library's own patterns
 * (emoji) are linear and allowed. `Schema.isValid(s, Schema.pattern('^(a+)+$'))` ran 386ms past
 * a 50ms timeout (rc.2 seventh re-review B7).
 */
const LIBRARY_PATTERNS = new Set<string>(
  [(s as any).emoji?.schema?.pattern].filter((p) => typeof p === 'string')
)
/**
 * THE admission check for a schema that came from guest code or the guest AST: a CLOSED schema
 * dialect. tosijs-schema compiles a schema's `pattern` on the HOST's regex engine and coerces
 * whatever value it finds (`new RegExp(['^(a+)+$'])` compiles the string), runs `$predicate`
 * through whatever evaluator the host registered, and looks `format` up by name. A denylist of
 * value shapes in front of that failed (rc.2 thirteenth re-review B1: an ARRAY `pattern` passed
 * the string-only check), so this is an allowlist: a guest schema is a plain JSON tree whose
 * every keyword is in `GUEST_SCHEMA_KEYWORDS` with exactly its value type. Anything else is
 * refused, naming its path. The walk is capped because it can run before any fuel exists.
 * Every door through which a guest schema reaches validation calls this; the doors are listed
 * in `regex-doors.test.ts` and exercised in `regex-doors-behaviour.test.ts`.
 */
export function admitGuestSchema(schema: unknown, op = 'Schema'): number {
  const walk: SchemaWalk = { nodes: 0, trail: [], op }
  admitSchemaNode(walk, isBuilder(schema) ? (schema as any).schema : schema, 0)
  return walk.nodes
}

/** The JSON-Schema type names a guest schema may use. */
const SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])
/** A guest schema's walk runs before fuel exists (an AST's inputSchema), so it is capped. */
const GUEST_SCHEMA_MAX_NODES = 10_000
const GUEST_SCHEMA_MAX_DEPTH = 64

/** One admission walk: its node count, and the path to where it is (built into a string only
 * when something is refused — rc.2 fourteenth re-review M4). */
interface SchemaWalk {
  nodes: number
  trail: string[]
  op: string
}

function refuseSchema(w: SchemaWalk, why: string): never {
  throw new AgentError(
    `This schema is not available in AsyncJS (${
      w.trail.join('') || 'the schema'
    }: ${why}). Guest schemas may use only the validation keywords the VM admits; for a pattern, use regexMatch (it runs on the VM's regex engine).`,
    w.op
  )
}

function countSchemaNode(w: SchemaWalk, depth: number): void {
  if (++w.nodes > GUEST_SCHEMA_MAX_NODES)
    refuseSchema(w, `more than ${GUEST_SCHEMA_MAX_NODES} nodes`)
  if (depth > GUEST_SCHEMA_MAX_DEPTH)
    refuseSchema(w, `nested more than ${GUEST_SCHEMA_MAX_DEPTH} deep`)
}

/** The own data properties of a plain object; anything else is refused. */
function schemaEntries(w: SchemaWalk, v: unknown): Array<[string, unknown]> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    refuseSchema(w, 'not a schema object')
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null)
    refuseSchema(w, 'not a plain object')
  const out: Array<[string, unknown]> = []
  const descriptors = Object.getOwnPropertyDescriptors(v)
  for (const k of Object.keys(descriptors)) {
    const d = descriptors[k]
    if (!('value' in d)) {
      w.trail.push(`.${k}`)
      refuseSchema(w, 'an accessor')
    }
    out.push([k, d.value])
  }
  return out
}

function schemaArray(
  w: SchemaWalk,
  v: unknown,
  depth: number,
  each: (w: SchemaWalk, x: unknown, depth: number) => void
): void {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype)
    refuseSchema(w, 'not an array')
  for (let i = 0; i < v.length; i++) {
    countSchemaNode(w, depth)
    w.trail.push(`[${i}]`)
    each(w, v[i], depth)
    w.trail.pop()
  }
}

function admitPrimitive(w: SchemaWalk, x: unknown): void {
  if (
    !(
      x === null ||
      typeof x === 'string' ||
      typeof x === 'boolean' ||
      (typeof x === 'number' && Number.isFinite(x))
    )
  )
    refuseSchema(w, 'not a JSON primitive')
}

function admitJson(w: SchemaWalk, x: unknown, depth: number): void {
  countSchemaNode(w, depth)
  if (Array.isArray(x)) schemaArray(w, x, depth + 1, admitJson)
  else if (x && typeof x === 'object')
    for (const [k, y] of schemaEntries(w, x)) {
      w.trail.push(`.${k}`)
      admitJson(w, y, depth + 1)
      w.trail.pop()
    }
  else admitPrimitive(w, x)
}

function admitSchemaNode(w: SchemaWalk, v: unknown, depth: number): void {
  countSchemaNode(w, depth)
  if (typeof v === 'boolean') return // `true` / `false` schemas
  for (const [k, value] of schemaEntries(w, v)) {
    // an absent keyword (JSON drops it, and so does the validator)
    if (value === undefined) continue
    w.trail.push(`.${k}`)
    const check = GUEST_SCHEMA_KEYWORDS[k]
    if (!check) refuseSchema(w, `'${k}' is not an admitted keyword`)
    check(w, value, depth)
    w.trail.pop()
  }
}

const sub = (w: SchemaWalk, x: unknown, d: number) =>
  admitSchemaNode(w, x, d + 1)
const finiteNumber = (w: SchemaWalk, x: unknown) =>
  typeof x === 'number' && Number.isFinite(x)
    ? undefined
    : refuseSchema(w, 'not a finite number')
const aString = (w: SchemaWalk, x: unknown) =>
  typeof x === 'string' ? undefined : refuseSchema(w, 'not a string')

/**
 * The closed guest-schema dialect: every admitted keyword and exactly its value type. The
 * keywords are those tosijs-schema ENFORCES (`ENFORCED_KEYWORDS`; `guest-schema.test.ts` checks
 * this table is a subset of it), minus the ones that run host code (`$predicate`) or the host's
 * regex engine (`pattern`, except the library's own), plus annotations that do nothing.
 */
const GUEST_SCHEMA_KEYWORDS: Record<
  string,
  (w: SchemaWalk, v: unknown, depth: number) => void
> = Object.assign(Object.create(null), {
  type: (w: SchemaWalk, v: unknown, d: number) =>
    Array.isArray(v)
      ? schemaArray(w, v, d, (w2, x) =>
          SCHEMA_TYPES.has(x as string)
            ? undefined
            : refuseSchema(w2, 'not a type name')
        )
      : SCHEMA_TYPES.has(v as string) || refuseSchema(w, 'not a type name'),
  properties: (w: SchemaWalk, v: unknown, d: number) => {
    for (const [k, x] of schemaEntries(w, v)) {
      w.trail.push(`.${k}`)
      sub(w, x, d)
      w.trail.pop()
    }
  },
  items: (w: SchemaWalk, v: unknown, d: number) =>
    Array.isArray(v)
      ? schemaArray(w, v, d, (w2, x) => sub(w2, x, d))
      : sub(w, v, d),
  additionalProperties: sub,
  anyOf: (w: SchemaWalk, v: unknown, d: number) =>
    schemaArray(w, v, d, (w2, x) => sub(w2, x, d)),
  oneOf: (w: SchemaWalk, v: unknown, d: number) =>
    schemaArray(w, v, d, (w2, x) => sub(w2, x, d)),
  required: (w: SchemaWalk, v: unknown, d: number) =>
    schemaArray(w, v, d, aString),
  enum: (w: SchemaWalk, v: unknown, d: number) =>
    schemaArray(w, v, d, admitPrimitive),
  const: admitPrimitive,
  minimum: finiteNumber,
  maximum: finiteNumber,
  exclusiveMinimum: finiteNumber,
  exclusiveMaximum: finiteNumber,
  multipleOf: finiteNumber,
  minLength: finiteNumber,
  maxLength: finiteNumber,
  minItems: finiteNumber,
  maxItems: finiteNumber,
  minProperties: finiteNumber,
  maxProperties: finiteNumber,
  // only the formats this release reviewed: anchored fixed-width regexes, or `new URL`
  format: (w: SchemaWalk, v: unknown) =>
    typeof v === 'string' && GUEST_FORMATS.has(v)
      ? undefined
      : refuseSchema(w, 'not an admitted format'),
  // only the library's own patterns, by the identity of their text
  pattern: (w: SchemaWalk, v: unknown) =>
    typeof v === 'string' && LIBRARY_PATTERNS.has(v)
      ? undefined
      : refuseSchema(w, "a 'pattern' is compiled by the host's regex engine"),
  title: aString,
  description: aString,
  default: (w: SchemaWalk, v: unknown, d: number) => admitJson(w, v, d + 1),
  examples: (w: SchemaWalk, v: unknown, d: number) => admitJson(w, v, d + 1),
  'x-tjs-undefined': (w: SchemaWalk, v: unknown) =>
    typeof v === 'boolean' ? undefined : refuseSchema(w, 'not a boolean'),
})

/** The formats reviewed for 0.14.0 (all linear). Pinned, not read live from the library, so a
 * new upstream format is not admitted until someone has looked at it; `guest-schema.test.ts`
 * fails if one of these stops being enforced upstream. */
export const GUEST_FORMATS: ReadonlySet<string> = new Set([
  'email',
  'uuid',
  'uri',
  'ipv4',
  'date',
  'date-time',
  'emoji',
])

/** The admitted keywords, for the drift test. */
export const GUEST_SCHEMA_KEYWORD_NAMES: readonly string[] = Object.keys(
  GUEST_SCHEMA_KEYWORDS
)

/**
 * An atom input as a string: itself if it is one, else its JSON — charged, as a JSON-escaped
 * TREE, before it is built. `hash`, `storeProcedure` and the console atoms called
 * `JSON.stringify` on guest values first and charged after (or never): a shared-reference DAG
 * became ~500MB for a few fuel (rc.2 seventh re-review B4).
 */
function stringifyInput(ctx: RuntimeContext, v: unknown, op: string): string {
  return typeof v === 'string' ? v : jsonOf(ctx, v, op)
}

/** `JSON.stringify(v)`, charged before it is built. */
function jsonOf(ctx: RuntimeContext, v: unknown, op: string): string {
  allocate(ctx, stringifyBound(ctx, v, undefined), op)
  return JSON.stringify(v) ?? String(v)
}

/** The read-only view of the table for the behavioural probe (`vm-budgets.test.ts`). */
export const methodBudgets = {
  /** Every method name callable on SOME kind (what the transpiler routes to methodCall). */
  names: (): string[] => [
    ...new Set(Object.values(SIGS).flatMap((t) => Object.keys(t))),
  ],
  globals: (): string[] => Object.keys(GLOBAL_SIGS),
  kinds: (): string[] => Object.keys(SIGS),
  kindOf: (r: unknown) => kindOf(r),
  /** The gate itself: types, then the bound. Throws where the VM would refuse. */
  bound: (
    name: string,
    receiver: unknown,
    args: unknown[],
    ctx: RuntimeContext
  ) => methodGate(receiver, name, args, ctx),
  globalBound: (name: string, args: unknown[], ctx: RuntimeContext): number => {
    const sig = GLOBAL_SIGS[name]
    checkArgs(sig, args, `${name}()`, `expr.${name}`)
    return (sig.bound as AllocBound)(undefined, args, ctx)
  },
}

/**
 * Call a guest-callable method through the gate: the one way a data ATOM performs the operation
 * its method twin performs, so the two cannot drift (docs/vm-budgets.md).
 */
function guestCall(
  ctx: RuntimeContext,
  receiver: any,
  method: string,
  args: unknown[],
  op: string
): any {
  const bound = methodGate(receiver, method, args, ctx)
  if (bound === 'vm') return vmMethod(ctx, receiver, method, args)
  allocate(ctx, bound, op)
  const fn = intrinsicMethod(receiver, method)
  if (typeof fn !== 'function')
    throw new AgentError(`'${method}' is not a method of this value`, op)
  return fn.apply(receiver, args)
}

/**
 * A response format is a GUEST schema handed to a model server, whose grammar compiler (llama.cpp,
 * outlines) turns a `pattern` into an automaton outside every budget; a host may also validate the
 * reply against it. So its SHAPE is allowlisted — the forms the OpenAI-compatible APIs define — and
 * the schema it carries is admitted like any guest schema. Anything else is refused: a shape this
 * did not anticipate (`{ type: 'json_object', schema }`) passed through unadmitted (rc.2
 * fourteenth re-review M2). Every LLM door calls this, the core `llmPredict` included (M1).
 */
export function admitResponseFormat(format: any, op: string): any {
  if (format === undefined || format === null) return format
  const keys = format && typeof format === 'object' ? Object.keys(format) : []
  const refuse = (why: string): never => {
    throw new AgentError(
      `responseFormat is not available in AsyncJS: ${why}`,
      op
    )
  }
  if (format.type === 'text' || format.type === 'json_object') {
    if (keys.some((k) => k !== 'type'))
      refuse(`a '${format.type}' format takes no other keys`)
    return format
  }
  if (
    format.type !== 'json_schema' ||
    keys.some((k) => k !== 'type' && k !== 'json_schema')
  )
    refuse(
      "use { type: 'json_schema', json_schema: { name, schema } } (Schema.response builds it)"
    )
  const js = format.json_schema
  if (
    !js ||
    typeof js !== 'object' ||
    Object.keys(js).some(
      (k) => !['name', 'strict', 'description', 'schema'].includes(k)
    )
  )
    refuse('json_schema takes name, strict, description and schema')
  admitGuestSchema(js.schema, op)
  return format
}

/**
 * Tool definitions carry guest schemas too. The SHAPE is allowlisted —
 * `{ type: 'function', function: { name, description?, parameters?, strict? } }` — and the
 * parameters schema admitted; any other spelling (`input_schema`, a flattened tool) is refused,
 * since an unanticipated shape is exactly what passed unexamined (fifteenth re-review M2).
 */
export function admitTools(tools: any, op: string): any {
  if (tools === undefined || tools === null) return tools
  const refuse = (why: string): never => {
    throw new AgentError(`tools are not available in AsyncJS: ${why}`, op)
  }
  if (!Array.isArray(tools)) refuse('tools must be an array')
  for (const t of tools) {
    if (
      !t ||
      typeof t !== 'object' ||
      t.type !== 'function' ||
      Object.keys(t).some((k) => k !== 'type' && k !== 'function')
    )
      refuse(
        "each tool is { type: 'function', function: { name, parameters } }"
      )
    const fn = t.function
    if (
      !fn ||
      typeof fn !== 'object' ||
      typeof fn.name !== 'string' ||
      Object.keys(fn).some(
        (k) => !['name', 'description', 'parameters', 'strict'].includes(k)
      )
    )
      refuse('a tool function takes name, description, parameters and strict')
    if (fn.parameters !== undefined) admitGuestSchema(fn.parameters, op)
  }
  return tools
}

/** The options `llmPredict` passes to a model: an allowlist, so no other key (`response_format`,
 * `functions`) carries an unadmitted schema to the provider (fifteenth re-review M2). */
const LLM_OPTION_KEYS = new Set([
  'model',
  'temperature',
  'maxTokens',
  'max_tokens',
  'topP',
  'top_p',
  'stop',
  'seed',
  'responseFormat',
  'tools',
])

/** A VM-implemented method: the string methods over the VM's regex engine, or Schema's. */
function vmMethod(
  ctx: RuntimeContext,
  receiver: any,
  method: string,
  args: any[]
): unknown {
  return receiver === GUEST_SCHEMA
    ? vmSchemaMethod(ctx, method, args)
    : vmStringMethod(ctx, receiver, method, args)
}

/** Fuel per schema-node × data-node step of validation (a step is a keyword check). */
/** Calibrated against the VM's own rate: at 0.00005 validation bought ~38× more host time per
 * fuel than a loop (rc.2 fifteenth re-review), and it is one synchronous, uninterruptible call. */
export const VALIDATION_FUEL_PER_STEP = 0.002

/**
 * Charge a validation BEFORE it runs: its work is (schema nodes) × (data nodes), not their sum —
 * an `anyOf` of 3,300 branches against a 97×97 array ran 630ms for 63 fuel when charged as a
 * sum (rc.2 fourteenth re-review M3). The data's own walk is metered by `treeBytes`.
 */
function chargeValidation(
  ctx: RuntimeContext,
  schemaNodes: number,
  data: unknown,
  op: string
): void {
  if (!ctx.fuel) return
  const dataNodes = Math.max(1, treeBytes(ctx, data).nodes)
  if (
    (ctx.fuel.current -= schemaNodes * dataNodes * VALIDATION_FUEL_PER_STEP) <=
    0
  )
    throw new AgentError('Out of Fuel', op)
}

/** A schema or example, as an ADMITTED plain-JSON copy: what guest code may hold and validate
 * against. The copy is made only after admission proved the tree plain data. */
function admittedSchema(
  x: unknown,
  op: string
): { schema: any; nodes: number } {
  const converted = convertExampleToSchema(x)
  const nodes = admitGuestSchema(converted, op)
  return { schema: structuredClone(converted), nodes }
}

/** The guest Schema namespace's methods: arguments admitted, results plain JSON built only from
 * admitted parts, output bounded before it is built, validation charged before it runs. */
function vmSchemaMethod(
  ctx: RuntimeContext,
  method: string,
  args: any[]
): unknown {
  const op = `Schema.${method}`
  // Per method (fourteenth/fifteenth re-review M1): a constructor's result mirrors its
  // arguments' tree (a copy, plus the wrapping keywords); `isValid` allocates only the admitted
  // copy of its SCHEMA — charging 32× its data refused ordinary 2MB payloads.
  allocate(
    ctx,
    method === 'isValid'
      ? 2 * treeBytes(ctx, args[1]).bytes + 512
      : 4 * treeBytes(ctx, args).bytes + 512,
    op
  )
  const each = (list: unknown[]) =>
    list.map((x) => admittedSchema(x, op).schema)
  const primitives = (list: unknown[]) => {
    for (const v of list)
      if (
        !(
          v === null ||
          typeof v === 'string' ||
          typeof v === 'boolean' ||
          (typeof v === 'number' && Number.isFinite(v))
        )
      )
        throw new AgentError(`${op} takes JSON primitives`, op)
    return list
  }
  switch (method) {
    case 'object': {
      const props = args[0]
      if (!props || typeof props !== 'object' || Array.isArray(props))
        throw new AgentError(`${op} takes an object of schemas`, op)
      const properties: Record<string, unknown> = Object.create(null)
      const required: string[] = []
      for (const [k, d] of Object.entries(
        Object.getOwnPropertyDescriptors(props)
      )) {
        if (!('value' in d))
          throw new AgentError(`${op}: '${k}' is an accessor`, op)
        assertSafeProperty(k)
        const schema = admittedSchema(d.value, op).schema
        setGuestKey(properties, k, schema)
        const type = schema?.type
        if (!(Array.isArray(type) && type.includes('null'))) required.push(k)
      }
      return {
        type: 'object',
        properties: { ...properties },
        required,
        additionalProperties: false,
      }
    }
    case 'array':
      return { type: 'array', items: admittedSchema(args[0], op).schema }
    case 'record':
      return {
        type: 'object',
        additionalProperties: admittedSchema(args[0], op).schema,
      }
    case 'union':
      return { anyOf: each(args[0]) }
    case 'tuple':
      return {
        type: 'array',
        items: each(args[0]),
        minItems: args[0].length,
        maxItems: args[0].length,
      }
    case 'enum': {
      const values = primitives(args[0])
      const type = values.every((v) => typeof v === 'string')
        ? 'string'
        : values.every((v) => typeof v === 'number')
        ? 'number'
        : undefined
      return type ? { type, enum: [...values] } : { enum: [...values] }
    }
    case 'const':
      return { const: primitives([args[0]])[0] }
    case 'fromExample':
    case 'infer':
      return admittedSchema(args[0], op).schema
    case 'response':
      return {
        type: 'json_schema',
        json_schema: {
          name: args[0],
          strict: true,
          schema: admittedSchema(args[1], op).schema,
        },
      }
    case 'isValid': {
      const { schema, nodes } = admittedSchema(args[1], op)
      chargeValidation(ctx, nodes, args[0], op)
      return validate(args[0], schema)
    }
  }
  throw new AgentError(`'${method}' is not a Schema method`, op)
}

/** The regex engine's meter for this run: its work, as fuel, refused when the fuel runs out. */
function regexFuel(ctx: RuntimeContext, op: string): Charge {
  return (n: number) => {
    if (!ctx.fuel) return
    if ((ctx.fuel.current -= n * REGEX_FUEL_PER_STEP) <= 0)
      throw new AgentError('Out of Fuel', op)
  }
}

/** The VM-implemented string methods (`string-methods.ts`), metered against this run. */
function vmStringMethod(
  ctx: RuntimeContext,
  s: string,
  method: string,
  args: any[]
): unknown {
  const op = `expr.${method}`
  const meters = {
    alloc: (bytes: number) => allocate(ctx, bytes, op),
    steps: regexFuel(ctx, op),
  }
  try {
    switch (method) {
      case 'replace':
        return stringMethods.replace(s, args[0], args[1], meters)
      case 'replaceAll':
        return stringMethods.replaceAll(s, args[0], args[1], meters)
      case 'match':
        return stringMethods.match(s, args[0], meters)
      case 'search':
        return stringMethods.search(s, args[0], meters)
      case 'split':
        return stringMethods.split(s, args[0], args[1], meters)
    }
  } catch (e: any) {
    if (e instanceof RegexError || e instanceof TypeError)
      throw new AgentError(e.message, op)
    throw e
  }
  throw new AgentError(`'${method}' is not a VM string method`, op)
}

/** The method allowlist: every name callable on some kind. */
const SAFE_METHOD_NAMES: ReadonlySet<string> = new Set(methodBudgets.names())

// Built-ins that are NOT available with helpful messages
const unsupportedBuiltins: Record<string, string> = Object.assign(
  Object.create(null),
  {
    RegExp:
      'RegExp is not available. Use string methods or the regexMatch atom.',
    Promise: 'Promise is not needed. All operations are implicitly async.',
    Map: 'Map is not available. Use plain objects instead.',
    WeakSet: 'WeakSet is not available.',
    WeakMap: 'WeakMap is not available.',
    Symbol: 'Symbol is not available.',
    Proxy: 'Proxy is not available.',
    Reflect: 'Reflect is not available.',
    Function:
      'Function constructor is not available. Define functions normally.',
    eval: 'eval is not available. Code is compiled, not evaluated.',
    setTimeout: 'setTimeout is not available. Use the delay atom.',
    setInterval: 'setInterval is not available. Use while loops with delay.',
    fetch: 'fetch is not available. Use the httpFetch atom.',
    require: 'require is not available. Atoms must be registered with the VM.',
    import: 'import is not available. Atoms must be registered with the VM.',
    process:
      'process is not available. AsyncJS runs in a sandboxed environment.',
    window: 'window is not available. AsyncJS runs in a sandboxed environment.',
    document:
      'document is not available. AsyncJS runs in a sandboxed environment.',
    global: 'global is not available. AsyncJS runs in a sandboxed environment.',
    globalThis: 'globalThis is not available. Use builtins directly.',
  }
)

/** Fuel cost per expression node evaluation */
const EXPR_FUEL_COST = 0.01

/** Fuel cost per character for string operations (1 fuel per ~10KB) */
const STRING_FUEL_PER_CHAR = 0.0001
/**
 * Fuel per byte an operation allocates (`allocate`): a UTF-16 character is 2 bytes, so this is
 * `STRING_FUEL_PER_CHAR` per character, the rate concatenation has always paid.
 */
const FUEL_PER_ALLOCATED_BYTE = STRING_FUEL_PER_CHAR / 2

/** Fuel cost per element for array allocation operations */
const ARRAY_FUEL_PER_ELEMENT = 0.001

/**
 * O(1) size hint for a value — the operand "width" an atom's work scales with.
 *
 * Deliberately shallow: reading `.length` / `Object.keys().length` is cheap, and a
 * metering function whose own cost scales with the input is the bug it exists to
 * prevent. Deep structure is charged when the atom's *result* is measured
 * (`chargeForSize` below), so a deep operand still pays on the way out.
 */
function sizeHint(v: any): number {
  if (typeof v === 'string') return v.length
  if (Array.isArray(v)) return v.length
  if (v && typeof v === 'object') return Object.keys(v).length
  return 0
}

/**
 * Charge fuel proportional to the size of an atom's operand or result, and fail
 * closed when the budget is gone.
 *
 * **This is the `==` bug class generalized.** A flat `cost:` charges the same fuel
 * for one element as for two million, so any atom whose work scales with operand
 * SIZE is a fuel-bypass: measured before this existed, `jsonStringify` of a
 * 2,000,000-element array cost 1.2 fuel and completed under a 10-fuel budget.
 * Fuel that doesn't track work isn't a budget, it's decoration.
 *
 * Cost model: strings by character, arrays/objects by element/key — the same
 * constants `methodCall` already uses for allocating expression methods, so the
 * expression and atom paths meter identically (they diverged, which is how this
 * survived: `JSON.stringify` in an *expression* charged, the `jsonStringify`
 * *atom* did not).
 *
 * @returns false if fuel is exhausted (caller must stop; ctx.error is set).
 */
/**
 * Hard ceiling on the bytes a single run may hold live in guest scope.
 *
 * Fuel meters *cumulative* work, which bounds how much a program can allocate over
 * its lifetime but says nothing about how much it holds at once. Measured: string
 * doubling (`x = x + x`) charges correctly, yet at the ~10KB-per-fuel rate a
 * legitimate 100,000-fuel budget still buys roughly a gigabyte of live string. Fuel
 * is a *time* budget; this is the *space* budget, and you need both — a run that
 * exhausts host memory has taken the process down regardless of how honestly it paid
 * for the privilege.
 */
const MAX_HEAP_BYTES = 64 * 1024 * 1024 // 64MB

/**
 * Fuel charged per node visited while measuring a value's retained size.
 *
 * Matched to ARRAY_FUEL_PER_ELEMENT: walking a structure to measure it is the same order
 * of work as walking it to copy it, and the two must be priced alike or the cheaper one
 * becomes the bypass.
 */
const HEAP_WALK_FUEL_PER_NODE = 0.001

/**
 * Bounded, cycle-safe byte estimate for a guest value.
 *
 * Stops as soon as it exceeds `cap`: **the estimator must never become the cost it is
 * trying to measure** (the same discipline as `sizeHint`). That sentence was already
 * written here, and the code did not honour it — see `trackHeapWrite`, which called this
 * on every bind with `cap` set to the ABSOLUTE 64MB ceiling, so the early exit could only
 * fire for values that were about to abort the run anyway.
 *
 * Reports `nodes` as well as `bytes` so the caller can charge fuel for the walk. A
 * traversal that costs the guest nothing is a fuel bypass however carefully it is bounded
 * in space: it is synchronous, so neither the per-atom nor the run-level timeout can
 * preempt it.
 *
 * Shared references are counted once (`seen`), which is a deliberate UNDER-estimate of
 * retained bytes and an accurate estimate of walk cost. The previous comment claimed
 * overestimating shared refs was deliberate and fail-closed; the WeakSet directly
 * contradicted it, so the claim is now gone rather than merely wrong.
 */
/** A pointer: the cost of a slot in an array, Map, Set or object, whatever it holds. */
const SLOT_BYTES = 8

function estimateBytes(
  value: any,
  cap: number
): { bytes: number; nodes: number } {
  let bytes = 0
  let nodes = 0
  const seen = new WeakSet<object>()
  const stack = [value]
  while (stack.length && bytes <= cap) {
    const v = stack.pop()
    nodes++
    if (v === null || v === undefined) continue
    const t = typeof v
    if (t === 'string') {
      bytes += (v as string).length * 2
      continue
    }
    // The guest value domain, checked HERE — in the walk every bound value, every insertion and
    // every reconcile already makes to charge memory — so a value that would put a host function
    // or a builtin namespace into guest state is refused whatever produced it (an argument read,
    // an atom result such as `pick` of a wrapper; rc.2 sixteenth re-review B1, B2). One walk
    // charges and checks; there is no producer list to keep complete.
    if (t === 'function') throw notGuestData()
    if (t !== 'object') continue // its slot was charged by the container
    if (seen.has(v)) continue
    seen.add(v)
    if (NAMESPACE_OBJECTS.has(v)) throw notGuestData()
    bytes += 16
    // a VM wrapper's own methods are sealed parts of the wrapper, not values it holds
    const wrapper = HEAP_CONTENTS in v || DATE_WRAPPER in v || isGuestRegex(v)
    if (HEAP_CONTENTS in v) {
      const contents = (v as any)[HEAP_CONTENTS]
      stack.push(contents)
      // a Set wrapper's membership index: one more slot per item
      if (Array.isArray(contents)) bytes += contents.length * SLOT_BYTES
    }
    // a compiled regex retains its program behind a hidden symbol the key walk cannot see
    if (isGuestRegex(v)) bytes += regexBytes(v)
    if (ArrayBuffer.isView(v)) {
      bytes += (v as ArrayBufferView).byteLength
    } else if (v instanceof ArrayBuffer) {
      bytes += v.byteLength
    } else if (Array.isArray(v)) {
      // EVERY slot holds a pointer, whatever is in it. A `null`/`undefined` slot, or a second
      // reference to an already-counted object, used to cost nothing — so
      // `Array.from({ length: 4e6 })` held ~256MB under a 1MB cap (rc.2 fourth re-review B2).
      // The slot is charged here, by the container; the element adds only its own body.
      for (let i = 0; i < v.length && bytes <= cap; i++) {
        bytes += SLOT_BYTES
        stack.push(v[i])
      }
    } else if (v instanceof Map) {
      for (const [k, mv] of v) {
        bytes += 2 * SLOT_BYTES
        stack.push(k)
        stack.push(mv)
        if (bytes > cap) break
      }
    } else if (v instanceof Set) {
      for (const sv of v) {
        bytes += SLOT_BYTES
        stack.push(sv)
        if (bytes > cap) break
      }
    } else if (!(v instanceof Date)) {
      // Own DATA properties only — never `v[k]`, which runs a getter. A getter's result is not
      // stored memory, and running one is executing host code mid-measurement: the VM's own
      // wrappers have getters (a Set's `size`), and a tosijs-schema builder's `.optional` returns
      // a NEW builder on every read, so walking `Schema` by `v[k]` never terminated.
      const descriptors = Object.getOwnPropertyDescriptors(v)
      for (const k of Object.keys(descriptors)) {
        bytes += k.length * 2 + SLOT_BYTES
        const d = descriptors[k]
        if ('value' in d && !(wrapper && typeof d.value === 'function'))
          stack.push(d.value)
        if (bytes > cap) break
      }
    }
  }
  return { bytes, nodes }
}

/**
 * An O(1) stand-in for "have these contents changed?", used to qualify the identity fast
 * path in `trackHeapWrite`.
 *
 * Only arrays get a real witness. In-place mutation does NOT rely on it: every mutation
 * charges what it adds as it happens (`accountMutation`), and re-stamps the witness so a later
 * re-bind of the same reference is not charged twice. `-1` means "no witness available",
 * which is stable — a non-array that keeps its identity keeps its fast path.
 *
 * It must stay O(1). Anything that walks the value defeats the purpose of the fast path
 * and reintroduces the quadratic it was added to remove.
 */
function heapWitness(value: unknown): number {
  return Array.isArray(value) ? value.length : -1
}

/**
 * Charge for a heap walk and STOP if that charge exhausted the budget.
 *
 * This is the invariant `cost-invariant.test.ts` exists to protect — every evaluation step
 * charges fuel >= c*(work it performs). Measured before the charge existed at all: 500
 * rebinds of a 300k-element array burned 28.8 SECONDS of pegged CPU for 50.2 fuel, versus
 * 1ms for a benign program charged the identical 50.2.
 *
 * Shared because it was written once with the check and once without, in two branches of
 * the same function.
 */
function chargeHeapWalk(
  ctx: RuntimeContext,
  nodes: number,
  op: string
): boolean {
  if (!ctx.fuel) return true
  ctx.fuel.current -= nodes * HEAP_WALK_FUEL_PER_NODE
  if (ctx.fuel.current > 0) return true
  // Claim the failure only if OUR charge is what crossed zero. If the budget was already
  // gone when we got here, the op that spent it owns the diagnosis — stealing the
  // attribution would point the user at the innocent `varSet` after an expression burned
  // the whole budget one step earlier.
  if (!ctx.error) {
    // The canonical message, not a bespoke one. Fuel exhaustion is a single condition and
    // consumers match on it; a second wording for the same thing is a trap for anyone who
    // wrote `err.message === 'Out of Fuel'`. The op carries the detail.
    //
    // No `before > 0` guard. Attribution was the reason for it — don't blame this op if the
    // budget was already gone when we arrived — but it left a hole in the CONTRACT its
    // callers document: "returns false ⇒ caller stops, and `ctx.error` is set". Entering
    // with `fuel <= 0` and no error yet returned false with nothing set, so the caller
    // aborted silently and the run reported success. `!ctx.error` already preserves the
    // attribution in the case that motivated the guard (an earlier op's error is left
    // alone); the guard only added the failure mode.
    ctx.error = new AgentError('Out of Fuel', op)
  }
  return false
}

/**
 * The heap-ceiling failure, in ONE wording.
 *
 * Both exits from `trackHeapWrite` built this error independently, and the two texts had
 * already drifted apart in whitespace and line breaks — the exact duplication this release
 * spent several commits removing elsewhere. A consumer matching on the message would have
 * seen two different strings for one condition depending on which path tripped.
 */
/**
 * Methods that change their receiver IN PLACE — the Array mutators, and the guest Set's. The
 * list is checked against BEHAVIOUR, not maintained by hand: `heap-mutation.test.ts` calls
 * every method `methodCall` permits on every receiver kind and fails on any that mutates and
 * is missing here.
 */
const MUTATING_METHODS: ReadonlySet<string> = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
  // the guest Set (`builtins.Set`)
  'add',
  'remove',
  'clear',
])

/** May guest code call `method` at all? (For the behavioural guards.) */
export function isGuestCallableMethod(method: string): boolean {
  return SAFE_METHOD_NAMES.has(method)
}

/** Does `methodCall` treat `method` as mutating its receiver? (For the behavioural guard.) */
export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method)
}

/** The binding a receiver expression is reached through: `a` for `a`, `a.b[i]`, … */
function receiverRoot(node: any, ctx: RuntimeContext): string | undefined {
  for (let n = node; n && typeof n === 'object'; n = n.object) {
    if (n.$expr === 'ident') return n.name
    if (n.$expr !== 'member') return undefined
  }
  // v1: a bare string names a binding (`'list'`, `'obj.items'`)
  if (typeof node === 'string' && (ctx.astVersion ?? 1) < 2)
    return node.split('.')[0]
  return undefined
}

/**
 * Charge what an IN-PLACE mutation adds to the heap budget, where it happens.
 *
 * The heap ledger is kept at BIND time, and a mutation binds nothing: a transpiled
 * `arr.push(x)` statement (or `a.fill(s)`, `set.add(x)`, `a.splice(0, 0, …)`) grew a held
 * value with no write for `trackHeapWrite` to see — 20MB under a 1MB cap (rc.2 second
 * re-review B2). So the two doors that mutate in place, `methodCall` and the `push` atom, call
 * this with what they inserted, charged to the run's estimate (`chargeHeap`), which a true
 * measurement corrects before any run fails.
 */
function accountMutation(
  ctx: RuntimeContext,
  receiver: unknown,
  inserted: unknown[],
  op: string
): boolean {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  const { bytes, nodes } = estimateBytes(
    inserted,
    Math.max(0, cap - ctx.heapAccount.bytes)
  )
  if (!chargeHeapWalk(ctx, nodes, op)) return false
  // Re-stamp the receiver's binding so a later re-bind of the same reference is not charged
  // for the growth a second time.
  const name = receiverRoot(receiver, ctx)
  if (name !== undefined) {
    const owner = ownerOf(ctx, name)
    const ledger =
      owner === ctx.state ? ctx.heapPerKey : STATE_LEDGERS.get(owner)
    const entry = ledger?.get(name)
    if (entry && entry.ref === owner[name])
      entry.witness = heapWitness(entry.ref)
  }
  return chargeHeap(ctx, bytes, op, [])
}

/**
 * THE heap ceiling: charge `bytes` to the run, and fail only if the TRUE live heap is over.
 *
 * The estimate only grows — every bind and every in-place insertion adds to it, and nothing is
 * ever refunded — so it is never below what is actually live. Refunds were the defect: the
 * ledger accounted bytes per binding NAME, but memory belongs to VALUES, which are aliased,
 * mutated and outlive their names. Refunding a name's bytes when its scope ended freed memory
 * still reachable through another binding (~40MB under a 1MB cap); never refunding an alias's
 * growth rejected programs whose live heap was 4KB (rc.2 third re-review B1, M1). Four review
 * rounds of patching which name to charge were moving the error around, not removing it.
 *
 * When the estimate crosses the cap, `reconcileHeap` measures what is actually live and the
 * estimate becomes that. So: no escape (the estimate is an upper bound, and the run fails only
 * on a measurement), and no false rejection (it fails only when the measurement is over).
 *
 * `pending` are values about to become live that no root holds yet (the value being bound).
 */
function chargeHeap(
  ctx: RuntimeContext,
  bytes: number,
  op: string,
  pending: unknown[]
): boolean {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  const account = ctx.heapAccount
  account.bytes += bytes
  if (account.bytes + account.transient <= cap) return true
  const live = reconcileHeap(ctx, pending, op)
  if (live === undefined) return false // the measurement itself ran out of fuel
  account.bytes = live
  if (live + account.transient > cap) {
    ctx.error = heapLimitError(live + account.transient, cap, op)
    return false
  }
  return true
}

/** Equality never converts its operands in AJS (`==` is footgun-free `===`), so it may compare
 * objects: by identity. */
const EQUALITY_OPS = new Set(['==', '!=', '===', '!=='])

/**
 * Refuse an object/array where AJS needs a primitive. JavaScript would convert it with
 * ToPrimitive/ToString — for an array, its whole string form, recursively — which is an
 * allocation no budget sees. Refused rather than charged (Tonio, 2026-10-02): no agent program
 * means `arr < 5`, and an explicit conversion (`arr.join(',')`, `JSON.stringify(obj)`) says
 * what it costs.
 */
function primitiveOperand(x: unknown, what: string, op: string): void {
  if (x !== null && (typeof x === 'object' || typeof x === 'function'))
    throw new AgentError(
      `${what} needs a string, number, boolean or null, not ${
        Array.isArray(x)
          ? 'an array'
          : typeof x === 'function'
          ? 'a function'
          : 'an object'
      } — convert it explicitly (e.g. arr.join(','), JSON.stringify(obj))`,
      op
    )
}

/**
 * `a + b + c + …` as ONE n-ary sum: the operands left to right (as JavaScript evaluates them),
 * then a fold — numeric while both sides are, string from the first string on. The string part
 * is bounded once, from every remaining operand, before anything is built (I1).
 *
 * One charge, not one per `+`: a template literal is a left-nested chain, and charging each
 * partial result kept every prefix in flight, so `${big}a${1}b` was refused where `a${1}b${big}`
 * fitted (rc.2 sixth re-review M4). And once the result is charged, the operands' own in-flight
 * bytes are released: the result's bound already covers their content.
 */
function evaluateSum(node: any, ctx: RuntimeContext): unknown {
  const operands: any[] = []
  let n = node
  while (n && n.$expr === 'binary' && n.op === '+') {
    operands.unshift(n.right)
    n = n.left
  }
  operands.unshift(n)
  const frame = ctx.allocFrame
  const before = frame ? frame.bytes : 0
  const values = operands.map((o) => {
    const v = evaluateExpr(o, ctx)
    primitiveOperand(v, "'+'", 'expr.concat')
    return v
  })
  let acc: any = values[0]
  let i = 1
  while (
    i < values.length &&
    typeof acc !== 'string' &&
    typeof values[i] !== 'string'
  )
    acc = acc + values[i++]
  if (i < values.length || typeof acc === 'string') {
    let bound = stringFormBound(ctx, acc)
    for (let j = i; j < values.length; j++)
      bound += stringFormBound(ctx, values[j])
    allocate(ctx, bound, 'expr.concat')
    while (i < values.length) acc = acc + values[i++]
    // the operands are consumed into the result, whose bound covers them
    if (frame) {
      const operandBytes = Math.max(0, frame.bytes - bound - before)
      frame.bytes -= operandBytes
      ctx.heapAccount.transient -= operandBytes
    }
  }
  return acc
}

/**
 * An upper bound, in bytes, on `String(x)` — what concatenation or stringification allocates.
 * A string is its own length; a scalar's string form is short; an object's is bounded by its
 * deep size (an array's `toString` joins its elements, recursively), with headroom for numbers,
 * which print longer than the 8-byte slot they occupy. The walk is charged like any heap walk.
 */
function stringFormBound(ctx: RuntimeContext, x: unknown): number {
  if (typeof x === 'string') return x.length * 2
  if (x === null || typeof x !== 'object') return SCALAR_STRING_BYTES
  return treeBytes(ctx, x).bytes
}

/**
 * The size of a value as a TREE — every PATH to a node counted, as printing or flattening it
 * visits them — for the printers (`join`, `JSON.stringify`, `flat`, `toString`, Schema-from-
 * example). `estimateBytes` counts each object once, which is right for MEMORY but not for
 * output: an eight-level, ten-wide DAG of shared arrays is a few hundred bytes of memory and
 * 400M characters of `join` (rc.2 sixth re-review B1). A cycle is not followed (an ancestor set,
 * not a global one), and the walk stops once past the heap cap — anything larger is refused
 * anyway. Every visit is charged as a heap walk.
 */
function treeBytes(
  ctx: RuntimeContext,
  x: unknown,
  json = false
): {
  bytes: number
  slots: number
  nodes: number
  depth: number
  truncated: boolean
} {
  // Stop at the HEADROOM left, not the whole cap: past it the caller refuses anyway, and a walk
  // to the full cap was up to `maxHeapBytes` of synchronous host work before any fuel was
  // charged (rc.2 seventh re-review M2). Fuel is charged AS the walk goes, every 1024 nodes.
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  const account = ctx.heapAccount
  const limit = account
    ? Math.max(0, cap - account.bytes - account.transient)
    : cap
  let bytes = 0
  let slots = 0
  let nodes = 0
  let charged = 0
  let depth = 0
  const ancestors = new Set<object>()
  // entries: [value, isExit, depth]
  const stack: Array<[unknown, boolean, number]> = [[x, false, 1]]
  while (stack.length && bytes <= limit) {
    const [v, exit, d] = stack.pop()!
    if (exit) {
      ancestors.delete(v as object)
      continue
    }
    if (++nodes - charged >= 1024) {
      if (!chargeHeapWalk(ctx, nodes - charged, 'expr.measure'))
        throw new AgentError('Out of Fuel', 'expr.measure')
      charged = nodes
    }
    if (d > depth) depth = d
    if (typeof v === 'string') {
      // JSON escapes a control character, a quote, a backslash or a lone surrogate — up to six
      // characters for one (rc.2 seventh re-review M3)
      bytes += (json ? jsonLength(v) : v.length) * 2 + 4
      continue
    }
    if (v === null || typeof v !== 'object') {
      bytes += SCALAR_STRING_BYTES
      continue
    }
    if (ancestors.has(v)) continue // a cycle: printed as '' (join) or refused (JSON)
    ancestors.add(v)
    stack.push([v, true, d])
    bytes += 8
    const contents = HEAP_CONTENTS in v ? (v as any)[HEAP_CONTENTS] : v
    if (Array.isArray(contents)) {
      slots += contents.length
      for (let i = contents.length - 1; i >= 0; i--) {
        bytes += 2
        stack.push([contents[i], false, d + 1])
      }
    } else {
      const descriptors = Object.getOwnPropertyDescriptors(contents)
      for (const k of Object.keys(descriptors)) {
        bytes += (json ? jsonLength(k) : k.length) * 2 + 8
        slots++
        const desc = descriptors[k]
        if ('value' in desc) stack.push([desc.value, false, d + 1])
      }
    }
  }
  if (nodes > charged && !chargeHeapWalk(ctx, nodes - charged, 'expr.measure'))
    throw new AgentError('Out of Fuel', 'expr.measure')
  const truncated = bytes > limit
  // A stopped walk's counts are not bounds: report it as over the cap, and say it stopped.
  return { bytes: truncated ? cap + 1 : bytes, slots, nodes, depth, truncated }
}

/** A string's length once JSON-escaped. */
function jsonLength(s: string): number {
  let n = s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20) n += 5 // \u00XX (or \n, shorter)
    else if (c === 0x22 || c === 0x5c) n += 1
    else if (c >= 0xd800 && c <= 0xdfff) {
      const pair =
        c <= 0xdbff &&
        i + 1 < s.length &&
        s.charCodeAt(i + 1) >= 0xdc00 &&
        s.charCodeAt(i + 1) <= 0xdfff
      if (pair) i++
      else n += 5 // a lone surrogate: \uXXXX
    }
  }
  return n
}

/** The longest string form of a scalar (a double is at most ~24 characters), in bytes. */
const SCALAR_STRING_BYTES = 64

/**
 * THE gate in front of every allocation that depends on runtime data (docs/vm-budgets.md, I1).
 *
 * `bytes` is an upper bound on what the operation is about to allocate, computed from its INPUTS
 * — never measured from its output, because a budget checked after the allocation has already
 * lost: `'x'.repeat(5e8)` built 1GB and then charged fuel; `Array.from({ length: 3e8 })` charged
 * nothing (rc.2 fifth re-review B2). Charges fuel in proportion, then admits the bytes against
 * the heap ceiling as TRANSIENT — in-flight memory of the step now executing, which no root can
 * see and which is released when the step ends (`exec`). Throws on refusal; the step wrapper turns
 * that into the run's error, attributed to the step.
 */
export function allocate(ctx: RuntimeContext, bytes: number, op: string): void {
  if (!(bytes > 0)) return
  // Larger than the whole ceiling (or unbounded — a measuring walk that had to stop): refused as
  // what it is, before any fuel is charged. It reported 'Out of Fuel' with fuelUsed Infinity.
  const ceiling = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  if (bytes > ceiling) throw heapLimitError(bytes, ceiling, op)
  if (ctx.fuel) {
    ctx.fuel.current -= bytes * FUEL_PER_ALLOCATED_BYTE
    if (ctx.fuel.current <= 0) throw new AgentError('Out of Fuel', op)
  }
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  const account = ctx.heapAccount
  if (account.bytes + account.transient + bytes > cap) {
    const live = reconcileHeap(ctx, [], op)
    if (live === undefined) throw new AgentError('Out of Fuel', op)
    account.bytes = live
    if (live + account.transient + bytes > cap)
      throw heapLimitError(live + account.transient + bytes, cap, op)
  }
  account.transient += bytes
  if (ctx.allocFrame) ctx.allocFrame.bytes += bytes
}

/**
 * The true live heap: one walk, one shared `seen` set (so a value reachable twice counts
 * once), over every registered root plus `pending`. Charged as a heap walk — it is O(live),
 * and runs only when the estimate has crossed the cap; after it, the next one is at least
 * (cap − live) charged bytes away. A program that holds close to the cap and keeps
 * reallocating pays for repeated walks in fuel, and so fails by fuel rather than hanging.
 */
function reconcileHeap(
  ctx: RuntimeContext,
  pending: unknown[],
  op: string
): number | undefined {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  const { bytes, nodes } = estimateBytes([...ctx.heapRoots, ...pending], cap)
  if (!chargeHeapWalk(ctx, nodes, op)) return undefined
  return bytes
}

function heapLimitError(total: number, cap: number, op: string): AgentError {
  return new AgentError(
    `Heap limit exceeded: guest state holds ~${Math.round(
      total / 1048576
    )}MB, ` +
      `limit ${Math.round(
        cap / 1048576
      )}MB. Fuel bounds total work; this bounds peak ` +
      `memory. Raise it with the maxHeapBytes run option if the workload genuinely ` +
      `needs it.`,
    op
  )
}

/**
 * Account a value being bound into guest scope against the run's live-heap ceiling.
 *
 * Charges what the bind adds to the run's estimate (`chargeHeap`), never refunding the value
 * it replaces — see `chargeHeap` for why. The per-scope ledger survives only to make re-binds
 * CHEAP: it remembers which reference each name was last measured at, so re-binding an
 * unchanged value costs nothing and a grown array costs only its new tail.
 *
 * @returns false if the ceiling is exceeded (caller must stop; ctx.error is set).
 */
function trackHeapWrite(
  ctx: RuntimeContext,
  key: string,
  value: any,
  op: string,
  ownerLedger?: Map<string, HeapEntry>
): boolean {
  const cap = ctx.maxHeapBytes ?? MAX_HEAP_BYTES
  ledgerFor(ctx.state, ctx.heapPerKey)
  const ledger = ownerLedger ?? ctx.heapPerKey
  const prevEntry = ledger.get(key)
  const witness = heapWitness(value)

  // IDENTITY FAST PATH: the same reference, unchanged since it was measured, is already in
  // the estimate. (Without this, an accumulator loop re-walked an unchanged value on every
  // bind — quadratic on the most ordinary AJS program there is.) In-place growth re-stamps
  // the witness when it is charged (`accountMutation`), so it never hides here.
  if (
    prevEntry &&
    prevEntry.ref === value &&
    prevEntry.witness === witness &&
    typeof value === 'object'
  )
    return true

  // APPEND FAST PATH: the same array, longer — measure only the new tail, so accumulating
  // stays linear.
  const appended =
    prevEntry &&
    prevEntry.ref === value &&
    Array.isArray(value) &&
    witness > prevEntry.witness
  const headroom = Math.max(0, cap - ctx.heapAccount.bytes)
  const { bytes, nodes } = estimateBytes(
    appended ? value.slice(prevEntry!.witness) : value,
    headroom
  )
  // Charge for the walk: every evaluation step charges fuel >= c*(work it performs)
  // (`cost-invariant.test.ts`). Measured before this existed: 500 re-binds of a 300k-element
  // array burned 28.8 SECONDS of CPU for 50.2 fuel.
  if (!chargeHeapWalk(ctx, nodes, op)) return false
  ledger.set(key, {
    size: (appended ? prevEntry!.size : 0) + bytes,
    ref: value,
    witness,
  })
  return chargeHeap(ctx, bytes, op, []) // already written: the root holds it
}

/**
 * THE ONLY WAY to bind a name into guest scope.
 *
 * Two guards belong together and were applied separately, so each was present at some
 * sites and absent at others:
 *
 *   - `assertSafeProperty` — a guest variable named `__proto__`/`constructor` would
 *     otherwise mutate the scope object's prototype
 *   - `trackHeapWrite` — the live-heap ceiling (`maxHeapBytes`)
 *
 * `varSet`/`constSet` had both. `varsLet` and `varsImport` had only the first, so the heap
 * ceiling was bypassed COMPLETELY by the two atoms whose whole job is binding variables:
 * verified, the identical doubling program routed through `varsLet` held a 1GB string
 * under the 64MB default cap, and `varsImport` bound a 40MB argument under a 1KB cap. The
 * loop binds (`map`/`filter`/`reduce`/`forEach`) and the catch binding had neither.
 *
 * A ceiling with an unguarded door is not a ceiling, and the way this happened is
 * instructive: nobody decided `varsLet` should be exempt — the accounting was added to the
 * two atoms someone was looking at. `src/vm/state-writes.test.ts` now fails on any bare
 * `ctx.state[…] =` outside this function, so the next binding atom cannot be written
 * without it.
 *
 * ## `alias`
 *
 * Binds without heap accounting, for a value that is ALREADY retained by something else
 * and so adds no new live bytes. Exactly one caller qualifies: the loop variable of
 * `map`/`filter`/`find`/`reduce`, which is a reference INTO the array being iterated.
 *
 * Accounting it was wrong twice over. It double-counted — the array is already on the
 * ledger (or is a program literal, bounded by the program) and the item is part of it — and
 * because a fresh item cannot hit the identity fast path, every iteration ran a full
 * `estimateBytes` walk. That made loop cost SIZE-SENSITIVE, which `cost-invariant.test.ts`
 * explicitly promises it is not: measured against 0.13.0-beta.1, `filter` over 5000 records
 * went from 101.2 fuel flat to 116.2 shallow / 166.2 deep. Deployed agents with budgets
 * tuned on an earlier release start failing on unchanged code.
 *
 * `alias` is NOT a general escape hatch, and the accumulator of `reduce` is the case that
 * shows why: `acc` is rebuilt each iteration and can grow without bound, so it stays fully
 * accounted. The rule is "this value is already retained elsewhere", not "this binding is
 * in a loop".
 *
 * @returns false if a limit was hit (caller must stop; ctx.error is set).
 */
function setStateVar(
  ctx: RuntimeContext,
  key: string,
  value: unknown,
  op: string,
  opts?: { alias?: boolean; owner?: Record<string, any> }
): boolean {
  assertSafeProperty(key)
  // `owner`: the scope object that holds the binding (`varAssign`), charged to ITS ledger.
  const target = opts?.owner ?? ctx.state
  // THE const rule, at the one place every scope write passes: a write may not land on a
  // const binding of the scope it writes. One rule serves both kinds of write, because it asks
  // about the scope actually written — a declaration writes the current scope (so a block
  // `let x` may shadow an outer `const x`), an assignment writes the owner (so it may not
  // reassign one). Per-site checks drifted: three atoms walked to the nearest owner for a
  // write to the current scope and refused legal JavaScript, while `varsImport`, `varsLet` and
  // `catch` checked nothing (rc.2 second re-review B1).
  if (constAt(target, key))
    throw new Error(`Cannot reassign const variable '${key}'`)
  const ledger =
    target === ctx.state ? undefined : STATE_LEDGERS.get(target) ?? undefined
  if (target !== ctx.state && !ledger)
    throw new Error(
      `Internal: no heap ledger for the scope that owns '${key}' — refusing an unaccounted write`
    )
  // WRITE FIRST, then account: the value this bind replaces is no longer live, and a
  // measurement taken before the write counted both — so `s = s + 'a'` was rejected at half the
  // cap (rc.2 fourth re-review M1). A failed charge rolls the write back. (Since the allocation
  // gate, this is defence in depth: the gate already counts old + new when the new value is
  // BUILT, which is the true peak — so a mutation test cannot tell the two orders apart.)
  const had = Object.prototype.hasOwnProperty.call(target, key)
  const previous = target[key]
  target[key] = value
  // A bind ENDS the in-flight life of what this step allocated: the value is now held by a
  // scope (and charged below), and every other intermediate it was computed from is garbage.
  // Left in the frame until the step ended, the value counted twice — `let a = Array.from({
  // length: 1e5 })` was refused at half the cap. (Alias binds move nothing, so they keep it.)
  if (!opts?.alias && ctx.allocFrame && ctx.allocFrame.bytes) {
    ctx.heapAccount.transient -= ctx.allocFrame.bytes
    ctx.allocFrame.bytes = 0
  }
  const rollback = () => {
    if (had) target[key] = previous
    else delete target[key]
  }
  let charged: boolean
  try {
    charged =
      opts?.alias === true || trackHeapWrite(ctx, key, value, op, ledger)
  } catch (e) {
    // a REFUSED value (not guest data) must not stay bound: a guest `catch` could reach it
    rollback()
    throw e
  }
  if (!charged) {
    rollback()
    return false
  }
  return true
}

function chargeForSize(ctx: RuntimeContext, value: any, op: string): boolean {
  if (!ctx.fuel) return true
  const n = sizeHint(value)
  if (n > 0) {
    ctx.fuel.current -=
      typeof value === 'string'
        ? n * STRING_FUEL_PER_CHAR
        : n * ARRAY_FUEL_PER_ELEMENT
  }
  if (ctx.fuel.current <= 0) {
    ctx.error = new AgentError('Out of Fuel', op)
    return false
  }
  return true
}

/**
 * Evaluates an expression node against the runtime context.
 * This replaces JSEP for new code - expressions are already parsed by Acorn.
 * Each node evaluation consumes a small amount of fuel to prevent runaway expressions.
 */
/**
 * Evaluate an expression to a GUEST VALUE. The guest value domain is closed: data (JSON-like
 * values) and the VM's own wrappers (Set, Date, regex) — never a host function or a builtin
 * namespace. Enforced HERE, where every expression's value is produced, not at the read sites
 * where an instance was once observed: the `member` guard alone left idents (`parseInt`),
 * namespace copies (`Object.values(Math)`), `toJSON` and dot-paths open (rc.2 fifteenth
 * re-review B1). The only positions that may name a function or namespace are the ones that CALL
 * or READ FROM it — a method call's receiver and a member read's object — which use
 * `evaluateCallable` and check their own results.
 */
export function evaluateExpr(node: ExprNode, ctx: RuntimeContext): any {
  return guestValue(evaluateCallable(node, ctx))
}

/** Refuse a host function or builtin namespace as a guest value. */
export function guestValue<T>(v: T): T {
  if (
    typeof v === 'function' ||
    (v && typeof v === 'object' && NAMESPACE_OBJECTS.has(v as any))
  )
    throw new AgentError(
      'A function or builtin namespace is not a value in AsyncJS: call it (e.g. Math.max(a, b), s.trim())',
      'expr'
    )
  return v
}

/** An expression in a position that may name a function or namespace (a call's receiver, a
 * member read's object). Everything else goes through `evaluateExpr`. */
function evaluateCallable(node: ExprNode, ctx: RuntimeContext): any {
  // Handle non-expression values (literals passed directly)
  if (node === null || node === undefined) {
    return node
  }
  if (typeof node !== 'object' || !('$expr' in node)) {
    // It's a literal value, not an expression node
    return node
  }

  // Consume fuel for each expression node evaluation
  if (ctx.fuel) {
    ctx.fuel.current -= EXPR_FUEL_COST
    if (ctx.fuel.current <= 0) {
      throw new Error('Out of Fuel')
    }
  }

  switch (node.$expr) {
    case 'literal':
      return node.value

    case 'ident': {
      // Look up in state first, then args, then builtins.
      //
      // `own`, never `in`: `in` walks the PROTOTYPE CHAIN, and the key is guest-controlled.
      // `ctx.state` and `ctx.args` are ordinary object literals, so a guest naming
      // `constructor`, `toString`, `valueOf`, `hasOwnProperty` and seven other inherited
      // members resolved to real host functions here — past the allowlist, which only ever
      // described `builtins`' OWN keys. Reproduced before the fix (fuel 400, no capabilities):
      //   `return { v: constructor('abc') }`  ->  {"v":"abc"}   (host Object, guest args)
      //   `return { v: toString() }`          ->  "[object Undefined]"
      // The maps are `Object.create(null)` now too, so this is belt and braces — but `state`
      // and `args` are built elsewhere and cannot be fixed at their declaration.
      if (scopeHas(ctx.state, node.name)) {
        return ctx.state[node.name]
      }
      if (scopeHas(ctx.args, node.name)) {
        return argValue(ctx, node.name)
      }
      // Check builtins (Math, JSON, Array, etc.)
      if (own(builtins, node.name)) {
        return builtins[node.name]
      }
      // Check for unsupported builtins and give helpful error
      if (own(unsupportedBuiltins, node.name)) {
        throw new Error(unsupportedBuiltins[node.name])
      }
      return undefined
    }

    case 'member': {
      // may be a namespace (`Math.PI`); the member's own result is checked by `evaluateExpr`
      const obj = evaluateCallable(node.object, ctx)

      // Short-circuit for optional chaining
      if (node.optional && (obj === null || obj === undefined)) {
        return undefined
      }

      // Property is either a static string or a computed expression node (e.g. arr[i])
      const prop =
        typeof node.property === 'object' && node.property !== null
          ? evaluateExpr(node.property, ctx)
          : node.property
      // A key is a string or a number. An object key was converted with ToString — an array's
      // full string form, built for free (rc.2 sixth re-review B2).
      primitiveOperand(prop, 'a computed key', 'expr.member')
      assertSafeProperty(String(prop))

      const value = obj?.[prop]
      // A member read never hands guest code a host FUNCTION: a method is something to call, not
      // a value to hold. Held, it could be called on another receiver or spliced onto a harmless
      // object — a stolen builder `validate` ran a smuggled pattern on the host's regex engine
      // (rc.2 fourteenth re-review B1), and `'a'.toUpperCase` was the same hole, carded earlier.
      if (typeof value === 'function')
        throw new AgentError(
          `'${String(
            prop
          )}' is a method: call it — a method is not a value in AsyncJS`,
          'expr.member'
        )
      return value
    }

    case 'binary': {
      if (node.op === '+') return evaluateSum(node, ctx)
      const left = evaluateExpr(node.left, ctx)
      const right = evaluateExpr(node.right, ctx)
      // Operators take primitives (Tonio, 2026-10-02: "refuse it"). JavaScript converts an
      // object operand with ToPrimitive — an array becomes its full string form — so `arr < 5`
      // or `arr * 2` built that string for free; and nothing in agent code means it.
      if (!EQUALITY_OPS.has(node.op)) {
        primitiveOperand(left, `'${node.op}'`, 'expr.binary')
        primitiveOperand(right, `'${node.op}'`, 'expr.binary')
      }

      switch (node.op) {
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
        case '%':
          return left % right
        case '**':
          return left ** right
        case '>':
          return left > right
        case '<':
          return left < right
        case '>=':
          return left >= right
        case '<=':
          return left <= right
        case '==':
          return eqValue(left, right)
        case '!=':
          return !eqValue(left, right)
        case '===':
          return left === right
        case '!==':
          return left !== right
        default:
          throw new Error(`Unknown binary operator: ${node.op}`)
      }
    }

    case 'unary': {
      const arg = evaluateExpr(node.argument, ctx)
      if (node.op === '-' || node.op === '+')
        primitiveOperand(arg, `unary '${node.op}'`, 'expr.unary')
      switch (node.op) {
        case '!':
          return !arg
        case '-':
          return -arg
        case '+':
          return +arg
        case 'typeof':
          return typeof arg
        default:
          throw new Error(`Unknown unary operator: ${node.op}`)
      }
    }

    case 'logical': {
      // Short-circuit evaluation
      const left = evaluateExpr(node.left, ctx)
      if (node.op === '&&') {
        return left ? evaluateExpr(node.right, ctx) : left
      } else if (node.op === '??') {
        // Nullish coalescing: only use right if left is null/undefined
        return left ?? evaluateExpr(node.right, ctx)
      } else {
        // || operator
        return left ? left : evaluateExpr(node.right, ctx)
      }
    }

    case 'regex': {
      // A regex literal: compiled by the VM's OWN engine (regex.ts), from data — the host's
      // backtracking engine never sees a guest pattern
      if (typeof node.pattern !== 'string' || typeof node.flags !== 'string')
        throw new Error('A regex node needs a string pattern and flags')
      let re: GuestRegex
      try {
        // A compiled regex HOLDS its program for as long as it lives: each piece is charged as
        // it is built (I1; rc.2 tenth re-review), and the heap walk counts the whole program
        // (`regexBytes`) wherever the regex is held (ninth re-review B1).
        re = compileRegex(
          node.pattern,
          node.flags,
          regexFuel(ctx, 'expr.regex'),
          (bytes) => allocate(ctx, bytes, 'expr.regex')
        )
      } catch (e: any) {
        if (e instanceof AgentError) throw e
        throw new AgentError(e.message, 'expr.regex')
      }
      return re
    }

    case 'conditional': {
      const test = evaluateExpr(node.test, ctx)
      return test
        ? evaluateExpr(node.consequent, ctx)
        : evaluateExpr(node.alternate, ctx)
    }

    case 'array':
      return node.elements.map((el) => evaluateExpr(el, ctx))

    case 'object': {
      const result: Record<string, any> = {}
      for (const prop of node.properties) {
        setGuestKey(result, prop.key, evaluateExpr(prop.value, ctx))
      }
      return result
    }

    case 'call': {
      // Special case: Error() triggers monadic error flow
      if (node.callee === 'Error') {
        const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
        const message = typeof args[0] === 'string' ? args[0] : 'Error'
        ctx.error = new AgentError(message, 'Error')
        return undefined // Error triggered, subsequent operations will be skipped
      }

      // Check if this is a builtin global function (parseInt, parseFloat, etc.)
      // Own-property only — see the `ident` case above. This is the site where the leak
      // was actually exploitable: an inherited value that happened to be callable got
      // INVOKED with guest arguments.
      if (own(builtins, node.callee)) {
        const fn = builtins[node.callee]
        if (typeof fn === 'function') {
          const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
          const sig = Object.prototype.hasOwnProperty.call(
            GLOBAL_SIGS,
            node.callee
          )
            ? GLOBAL_SIGS[node.callee]
            : undefined
          if (!sig)
            throw new Error(`${node.callee}() is not available in AsyncJS`)
          // typed like methods: every argument the type the native reads (see methodGate)
          checkArgs(sig, args, `${node.callee}()`, `expr.${node.callee}`)
          allocate(
            ctx,
            (sig.bound as AllocBound)(undefined, args, ctx),
            `expr.${node.callee}`
          ) // I1
          return fn(...args)
        }
      }
      // For atom calls within expressions
      const atom = ctx.resolver(node.callee)
      if (!atom) {
        // Check unsupported builtins
        if (own(unsupportedBuiltins, node.callee)) {
          throw new Error(unsupportedBuiltins[node.callee])
        }
        throw new Error(`Unknown function: ${node.callee}`)
      }
      // This is synchronous evaluation - atom calls need special handling
      // For now, throw - atom calls should be lifted to statements
      throw new Error(
        `Atom calls in expressions not yet supported: ${node.callee}`
      )
    }

    case 'methodCall': {
      // Method call on an object (e.g., Math.floor(x), arr.length, str.toUpperCase())
      // — the receiver may be a namespace; the call's RESULT is checked by `evaluateExpr`
      const obj = evaluateCallable(node.object, ctx)

      // Short-circuit for optional chaining
      if (node.optional && (obj === null || obj === undefined)) {
        return undefined
      }

      const method = node.method
      assertSafeProperty(method)

      // Defense in depth: only standard built-in methods may be invoked. See
      // SAFE_METHOD_NAMES — this rejects call/apply/bind and any non-standard
      // method, so a leaked host reference can't be used to re-enter host code.
      if (!SAFE_METHOD_NAMES.has(method)) {
        throw new Error(
          `Security Error: method '${method}' is not callable in AsyncJS`
        )
      }

      if (obj === null || obj === undefined) {
        throw new Error(`Cannot call method '${method}' on ${obj}`)
      }

      // a VM-implemented namespace (the data-only Schema) has no host functions to look up
      const fn = obj === GUEST_SCHEMA ? undefined : intrinsicMethod(obj, method)
      if (obj !== GUEST_SCHEMA && typeof fn !== 'function') {
        throw new Error(`'${method}' is not a function`)
      }

      const args = node.arguments.map((arg) => evaluateExpr(arg, ctx))
      // I1: bound what the call will allocate from its inputs, and charge it, BEFORE calling.
      // (It used to be charged from the RESULT — after `'x'.repeat(5e8)` had built 1GB.)
      const bound = methodGate(obj, method, args, ctx)
      if (bound === 'vm') return vmMethod(ctx, obj, method, args)
      if (typeof fn !== 'function')
        throw new Error(`'${method}' is not a function`)
      allocate(ctx, bound, `expr.${method}`)
      if (
        (MUTATING_METHODS.has(method) && typeof obj === 'object') ||
        (method === 'assign' && obj === (builtins as any).Object)
      )
        assertGuestData(args)
      const result = fn.apply(obj, args)
      if (
        MUTATING_METHODS.has(method) &&
        typeof obj === 'object' &&
        !accountMutation(ctx, node.object, args, `expr.${method}`)
      )
        return undefined
      // `Object.assign(target, …sources)` grows its TARGET in place: the same I2 charge as a
      // mutator, against the binding the target is reached through.
      if (
        method === 'assign' &&
        obj === (builtins as any).Object &&
        !accountMutation(ctx, node.arguments[0], args.slice(1), 'expr.assign')
      )
        return undefined
      return result
    }

    default:
      throw new Error(`Unknown expression type: ${(node as any).$expr}`)
  }
}

// --- Atom Factory ---

/** The input a user callback sees: the step minus the VM's own fields. */
function withoutControlKeys(step: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const key of Object.keys(step))
    if (!STEP_CONTROL_KEYS.has(key)) setGuestKey(out, key, step[key])
  return out
}

/**
 * The context an atom whose inputs the VM resolved runs under: the same run (state, fuel,
 * heap, capabilities — all shared by reference) marked `inputsResolved`, with `error` and
 * `output` forwarded to the real context so an atom that sets them still affects the run.
 */
function inputsResolvedContext(ctx: RuntimeContext): RuntimeContext {
  const derived: RuntimeContext = { ...ctx, inputsResolved: true }
  RESOLVED_ORIGIN.set(derived, ctx)
  for (const field of ['error', 'output'] as const)
    Object.defineProperty(derived, field, {
      get: () => (ctx as any)[field],
      set: (v: unknown) => {
        ;(ctx as any)[field] = v
      },
      enumerable: true,
      configurable: true,
    })
  return derived
}

/**
 * The context each `inputsResolvedContext` was derived from. A STEP is never executed under a
 * derived context: an atom that runs nested steps hands its context back to `exec`, which
 * swaps the original in — so nested steps resolve their values, write the run's real state
 * and accounting, and see the run's real `error` (rc.2 re-review M1). One place, at the one
 * door every step goes through, rather than a rule each control atom has to remember.
 */
const RESOLVED_ORIGIN = new WeakMap<RuntimeContext, RuntimeContext>()

/** Fields of a step that are the VM's, not the atom's input. */
const STEP_CONTROL_KEYS = new Set([
  'op',
  'result',
  'resultConst',
  'resultAssign',
])

/** A step with every INPUT field resolved to its value (control fields left as they are). */
function resolveAtomInputs(step: any, ctx: RuntimeContext): any {
  const out: Record<string, any> = {}
  for (const key of Object.keys(step)) {
    setGuestKey(
      out,
      key,
      STEP_CONTROL_KEYS.has(key) ? step[key] : resolveValue(step[key], ctx)
    )
  }
  return out
}

export function defineAtom<I extends Record<string, any>, O = any>(
  op: string,
  inputSchema: any, // s.Schema<I>
  outputSchema: any | undefined, // s.Schema<O>
  fn: (input: I, ctx: RuntimeContext) => Promise<O>,
  options: AtomOptions | string = {}
): Atom<I, O> {
  const {
    docs = '',
    timeoutMs = 1000,
    cost = 1,
    // Defaults to 'io' — see AtomEffects. An atom defined through this function is, by
    // overwhelming default, an embedder bringing HOST data in, which is exactly the data
    // the membrane exists to sanitise. Core atoms are swept back to 'pure' after
    // construction (PURE by absence from EFFECTFUL_CORE_OPS), because for them the
    // opposite is true.
    effects = 'io',
    resolveInputs = true,
  } = typeof options === 'string' ? { docs: options } : options
  // A static timeout is checked when the atom is DEFINED, so a bad one fails where it was
  // written instead of on its first call.
  // A function timeout is supported, as it is in `timeoutOverrides`; its result goes
  // through `timerMs` per call (re-review 14: 350a30d briefly refused it).
  const atomTimeout = budgetOrFunction(
    `timeoutMs of atom '${op}'`,
    timeoutMs,
    1000
  ) as number

  const exec: AtomExec = async (step: any, ctx: RuntimeContext) => {
    if (ctx.inputsResolved) {
      const origin = RESOLVED_ORIGIN.get(ctx)
      // A replaced `state` would be silently dropped by the swap below — the steps would write
      // the caller's scope instead of the one the atom built — so it is refused like a copy.
      if (!origin || origin.state !== ctx.state)
        throw new Error(
          `'${op}' was run on a copy of an atom's context. An atom that runs steps must hand ` +
            `them the context it received, or a scope from createChildScope(ctx) — or be ` +
            `defined with { resolveInputs: false }`
        )
      ctx = origin
    }
    const { op: _op, result: _res, ...inputData } = step
    // This step's allocation frame: what it allocates while it runs counts as transient until
    // it ends (`allocate`). Restored on the way out, so frames nest with the steps.
    const frame = { bytes: 0 }
    const outerFrame = ctx.allocFrame
    ctx.allocFrame = frame
    try {
      // Skip if already in error state (monadic flow)
      if (ctx.error) return

      // --- Tracing Start ---
      const stateBefore = ctx.trace ? { ...ctx.state } : null
      const fuelBefore = ctx.fuel.current
      let result: any
      let error: string | undefined

      try {
        // 2a. Quota — checked BEFORE fuel and before execution, so an exhausted quota
        // costs nothing and cannot have already made the call it was meant to prevent.
        // `ctx.quotas` is the ADMITTED table (frozen, null-prototype, built from the entries the
        // check saw), so `[op]` reads exactly what was validated — and is checked again here.
        const admittedQuota = ctx.quotas?.[op]
        if (admittedQuota !== undefined) {
          const quota = checkedQuota(admittedQuota, op)
          if (!ctx.quotaUsed) ctx.quotaUsed = {}
          // Checked at the READ: the counter is shared, so it can change after admission. And
          // never below what THIS run has counted itself: a host object can only raise the
          // count (to hold a quota across nested runs), never lower it.
          if (!ctx.quotaLocal) ctx.quotaLocal = Object.create(null)
          const local = ctx.quotaLocal!
          const used = Math.max(quotaCount(ctx.quotaUsed, op), local[op] ?? 0)
          if (used >= quota) {
            ctx.error = new AgentError(
              `Quota exceeded for '${op}': ${quota} call${
                quota === 1 ? '' : 's'
              } allowed`,
              op
            )
            return
          }
          local[op] = used + 1
          ctx.quotaUsed[op] = used + 1
        }

        // 1b. An aborted run takes no further steps. `vm.run` stops WAITING when its deadline
        // passes, but only loops checked the signal, so straight-line steps carried on
        // unobserved (0.14.0 final re-review 6). Checked at the one point every step passes.
        if (ctx.signal?.aborted) {
          ctx.error = new AgentError('Execution aborted', op)
          return
        }

        // 2. Deduct Fuel (check for cost overrides first)
        // Resolve ONCE, before anything reads the input: the cost and timeout functions and the
        // atom body all see the same values. (Cost functions saw raw AST nodes while the body saw
        // values, so `i => i.items.length` billed 1 for a 10-element array — rc.2 review.)
        const callInput = atom.resolveInputs
          ? resolveAtomInputs(step, ctx)
          : step
        // Built only when a cost or timeout FUNCTION asks for it — most atoms have neither.
        let fnInputMemo: any
        const fnInput = () =>
          (fnInputMemo ??= atom.resolveInputs
            ? withoutControlKeys(callInput)
            : inputData)
        const overrideCost = ctx.costOverrides?.[op]
        const baseCost = overrideCost !== undefined ? overrideCost : cost
        // Through `checkedCost`, at the one place every charge happens: a negative cost MINTED
        // fuel (a -400 override gave fuelUsed -398 at fuel 1), and a NaN one poisoned the
        // meter. Checked here because a function cost only exists at call time.
        const currentCost = checkedCost(
          typeof baseCost === 'function' ? baseCost(fnInput(), ctx) : baseCost,
          op
        )
        if ((ctx.fuel.current -= currentCost) <= 0) {
          ctx.error = new AgentError('Out of Fuel', op)
          return
        }

        // 3. Execution with Timeout (per-atom override > atom default)
        const overrideTimeout = ctx.timeoutOverrides?.[op]
        const baseTimeout =
          overrideTimeout !== undefined ? overrideTimeout : atomTimeout
        // `timerMs`: 0 and Infinity mean none, and a NaN (from a function override) is refused
        // rather than read as `NaN > 0` — false, which silently disabled the timeout.
        const armedTimeout = timerMs(
          typeof baseTimeout === 'function'
            ? baseTimeout(fnInput(), ctx)
            : baseTimeout
        )
        let timer: any
        // An atom whose inputs the VM resolved runs under a context that SAYS so, and
        // `resolveValue` is the identity under it. Otherwise an atom written the old way — calling
        // `resolveValue` on its own inputs — resolved a second time, and guest DATA shaped like
        // `{ $expr: 'ident', name: 'secret' }` (or, in a v1 AST, a string naming a variable) was
        // evaluated as code (rc.2 review B5). Harmless by construction, not by a CHANGELOG note.
        const atomCtx = atom.resolveInputs ? inputsResolvedContext(ctx) : ctx
        const execute = async () => fn(callInput as I, atomCtx)

        result =
          armedTimeout !== undefined
            ? await Promise.race([
                execute(),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error(`Atom '${op}' timed out`)),
                    armedTimeout
                  )
                }),
              ]).finally(() => clearTimeout(timer))
            : await execute()

        // 4. Result - always set if step.result is specified (even for undefined values)
        if (step.result) {
          assertSafeProperty(step.result) // an atom result bound to __proto__/constructor would corrupt the scope
          if (step.resultConst && own(ctx.state, step.result)) {
            throw new Error(
              `Cannot redeclare variable '${step.result}' as const`
            )
          }
          // Capability-boundary membrane: an io atom's return value is host data
          // crossing into guest state. Deep-copy pure data (rejecting functions /
          // oversized payloads) so the guest can neither reach a host reference
          // nor mutate a shared object. Pure atoms operate on data already inside
          // the VM and need no crossing. See membraneValue.
          // Read atom.effects (not the captured `effects` default): io tagging is
          // applied post-construction via EFFECTFUL_CORE_OPS, mutating atom.effects.
          if (atom.effects === 'io' && result !== undefined) {
            const crossed = membraneValue(
              result,
              ctx.membraneMaxBytes ?? MEMBRANE_MAX_BYTES
            )
            if (!crossed.ok) {
              ctx.error = new AgentError(
                `Capability boundary rejected the return of '${op}': ${crossed.reason}`,
                op
              )
              return
            }
            result = crossed.value
          }
          // Validate output against schema (skip for undefined results)
          if (
            result !== undefined &&
            outputSchema &&
            !validate(result, outputSchema)
          ) {
            ctx.error = new AgentError(
              `Output validation failed for '${op}'`,
              op
            )
            return
          }
          // Space budget: an atom result is the other way large values enter guest
          // scope (a capability return, a big parse). Fuel already charged for the
          // work; this bounds what the run HOLDS.
          //
          // `setStateVar` does the tracking (it calls `trackHeapWrite` for every non-alias
          // write), so the explicit call that used to sit on the line above was redundant.
          // Not a double CHARGE — per-key accounting replaces rather than accumulates, so
          // the byte total was identical, which is why nothing caught it — but it did pay
          // the heap-walk fuel twice for a primitive, where the identity fast path does not
          // apply. Removed rather than kept "for clarity": two calls that must agree is the
          // shape every divergence in this codebase started as.
          // `resultAssign`: the emitter's `x = atom(…)` — an ASSIGNMENT, so the result goes to
          // the scope that owns `x` (tjs-lang#59), charged to that scope's ledger.
          const owner = step.resultAssign
            ? ownerOf(ctx, step.result)
            : undefined
          if (
            !setStateVar(
              ctx,
              step.result,
              result,
              op,
              owner ? { owner } : undefined
            )
          )
            return
          // Mark as const if resultConst is set
          if (step.resultConst) markConst(ctx, step.result)
        }
      } catch (e: any) {
        error = e.message || String(e)
        // Convert exception to monadic error. An AgentError thrown from inside the step (the
        // allocation gate) already names the operation that failed — keep it.
        ctx.error = e instanceof AgentError ? e : new AgentError(error!, op, e)
      } finally {
        // --- Tracing End ---
        if (ctx.trace && stateBefore) {
          const stateDiff = diffObjects(stateBefore, ctx.state)
          ctx.trace.push({
            op,
            input: inputData,
            stateDiff,
            result,
            error,
            fuelBefore,
            fuelAfter: ctx.fuel.current,
            timestamp: Date.now(),
          })
        }
      }
    } finally {
      // The step is over: what it allocated is now either bound (charged to the estimate when
      // it was) or garbage, so its transient bytes are released.
      ctx.heapAccount.transient -= frame.bytes
      ctx.allocFrame = outerFrame
    }
  }

  const atom = {
    op,
    inputSchema,
    outputSchema,
    exec,
    docs,
    timeoutMs: atomTimeout,
    cost,
    effects,
    resolveInputs,
    create: (input: I) => ({ op, ...input }),
  }
  return atom
}

// --- Core Atoms ---

// 1. Flow (Low cost: 0.1)

/*#
## seq (Sequence)

The root atom for all agent programs. Executes steps in order.

- Stops on `return` (when `ctx.output` is set)
- Stops on error (monadic error flow)
- Cost: 0.1

```javascript
// AsyncJS compiles to seq at the top level
const x = 1
const y = 2
return { sum: x + y }
```
*/
export const seq = defineAtom(
  'seq',
  s.object({ steps: s.array(s.any) }),
  undefined,
  async ({ steps }, ctx) => {
    for (const step of steps) {
      if (ctx.output !== undefined) return // Return check
      if (ctx.error) return // Monadic error - skip remaining steps
      const atom = ctx.resolver(step.op)
      if (!atom) throw new Error(`Unknown Atom: ${step.op}`)
      await atom.exec(step, ctx)
    }
  },
  { docs: 'Sequence', timeoutMs: 0, cost: 0.1 }
)

/*#
## if (Conditional)

Conditional branching based on expression evaluation.

```javascript
if (count > 0) {
  console.log("Has items")
} else {
  console.log("Empty")
}
```
*/
/**
 * Run a `{ … }` block's steps. In a v2 AST a block is a SCOPE, as in JavaScript: its
 * declarations shadow and end with it, and a `return` inside it returns from the program.
 *
 * v2 gave only `while` bodies a scope, so `if`/`else` and `try`/`catch` blocks declared into
 * the ENCLOSING scope: sibling blocks each declaring `const t`, a block `let x` beside an
 * outer `const x`, and `catch (e)` beside an outer `const e` were all refused — legal
 * JavaScript rejected (rc.2 third re-review M2). A v1 AST keeps the unscoped block it was
 * written for (it assigns with `varSet`, which writes the current scope).
 *
 * `bind` declares names in the block's scope before its steps run (the catch parameter).
 */
async function runBlock(
  ctx: RuntimeContext,
  steps: any[],
  scoped = (ctx.astVersion ?? AST_VERSION_LEGACY) >= 2,
  bind?: Record<string, unknown>
): Promise<void> {
  if (!scoped) {
    for (const [k, v] of Object.entries(bind ?? {}))
      if (!setStateVar(ctx, k, v, 'catch')) return
    await seq.exec({ op: 'seq', steps } as any, ctx)
    return
  }
  const block = createChildScope(ctx)
  try {
    for (const [k, v] of Object.entries(bind ?? {}))
      if (!setStateVar(block, k, v, 'catch')) return
    await seq.exec({ op: 'seq', steps } as any, block)
    // `output` is a per-context slot (the spread copies it), so a `return` in the block is
    // carried out explicitly; `error` is forwarded by `createChildScope` itself.
    if (block.output !== undefined) ctx.output = block.output
  } finally {
    releaseScope(block)
  }
}

export const iff = defineAtom(
  'if',
  s.object({
    condition: s.any, // ExprNode
    then: s.array(s.any),
    else: s.array(s.any).optional,
  }),
  undefined,
  async (step, ctx) => {
    if (evaluateExpr(step.condition, ctx)) {
      await runBlock(ctx, step.then)
    } else if (step.else) {
      await runBlock(ctx, step.else)
    }
  },
  { docs: 'If/Else', timeoutMs: 0, cost: 0.1 }
)

/*#
## while (Loop)

Repeats body while condition is truthy. Consumes fuel each iteration.

```javascript
let i = 0
while (i < 10) {
  console.log(i)
  i = i + 1
}
```

**Note:** No `break`/`continue`. Use condition variables instead.
*/
export const whileLoop = defineAtom(
  'while',
  s.object({
    condition: s.any, // ExprNode
    body: s.array(s.any),
  }),
  undefined,
  async (step, ctx) => {
    // v2: each iteration's body is a BLOCK, with its own scope, as in JavaScript. v1 ran the
    // body in the enclosing scope, so a `const` declared in it was a redeclaration on the
    // second pass ("Cannot reassign const variable", board #2343). Safe in v2 only because
    // assignment is `varAssign`, which writes the owning scope; a v1 AST assigns with
    // `varSet`, so it keeps the unscoped body it was written for.
    const blockScoped = (ctx.astVersion ?? AST_VERSION_LEGACY) >= 2
    while (evaluateExpr(step.condition, ctx)) {
      // Check abort signal for clean cancellation
      if (ctx.signal?.aborted) throw new Error('Execution aborted')
      if ((ctx.fuel.current -= 0.1) <= 0) throw new Error('Out of Fuel')
      await runBlock(ctx, step.body, blockScoped)
      if (ctx.output !== undefined) return
      if (ctx.error) return // Propagate monadic errors out of the loop
    }
  },
  { docs: 'While Loop', timeoutMs: 0, cost: 0.1 }
)

/*#
## return

Ends execution and returns values from state. The schema defines which
state variables to include in the output.

```javascript
const result = compute()
return { result }  // Returns { result: <computed value> }
```
*/
export const ret = defineAtom(
  'return',
  undefined,
  s.any,
  async (step: any, ctx) => {
    // If in error state, propagate the error as the output
    if (ctx.error) {
      ctx.output = ctx.error
      return ctx.error
    }

    // New style: return has explicit value
    if ('value' in step) {
      const res = resolveValue(step.value, ctx)

      // Enforce object returns — agents must return objects for composability.
      // Helper bodies (callLocal) are exempt: they're internal calls and may
      // return scalars, arrays, etc. like ordinary functions.
      if (
        !ctx.localCall &&
        res !== undefined &&
        res !== null &&
        !isAgentError(res) &&
        (typeof res !== 'object' || Array.isArray(res))
      ) {
        const err = new AgentError(
          `Agent must return an object, got ${
            Array.isArray(res) ? 'array' : typeof res
          }`,
          'return'
        )
        ctx.error = err
        ctx.output = err
        return err
      }

      ctx.output = res
      return res
    }

    // Legacy style: extract from state based on schema keys
    let res: any = {}
    if (step.schema?.properties) {
      for (const key of Object.keys(step.schema.properties)) {
        // A BINDING's value, never an inherited one: `ctx.state['toString']` read
        // Object.prototype's method into the result.
        setGuestKey(res, key, ownValue(ownerOf(ctx, key), key))
      }

      // If schema has nested structure, filter to strip extra properties
      // This makes return types act as projections
      if (step.filter !== false) {
        const nodes = admitGuestSchema(step.schema, 'return')
        chargeValidation(ctx, nodes, res, 'return')
        const filterResult = schemaFilter(res, step.schema)
        if (!(filterResult instanceof Error)) {
          res = filterResult
        }
        // If filter fails, keep original result (validation already passed above)
      }
    }
    ctx.output = res
    return res
  },
  { docs: 'Return', cost: 0.1 }
)

/*#
## try/catch

Error handling with monadic error flow. When an error occurs, subsequent
steps are skipped until caught.

```javascript
try {
  const data = fetch(url)
  processData(data)
} catch (err) {
  console.warn("Failed: " + err)
  return { error: err }
}
```

The catch block receives:
- `err` (or custom name): error message
- `errorOp`: the atom that failed
*/
export const tryCatch = defineAtom(
  'try',
  s.object({
    try: s.array(s.any),
    catch: s.array(s.any).optional,
    catchParam: s.string.optional,
  }),
  undefined,
  async (step, ctx) => {
    // Execute try block
    await runBlock(ctx, step.try)

    // If an error occurred and we have a catch block, handle it
    if (ctx.error && step.catch) {
      // Store error message in state for catch block to access
      // Use the catch parameter name if provided, otherwise 'error'
      const paramName = step.catchParam || 'error'
      const bind = { [paramName]: ctx.error.message, errorOp: ctx.error.op }
      // Clear the error - catch block handles it
      ctx.error = undefined
      // Execute the catch block, its parameter (and `errorOp`) bound IN it: a v2 catch block
      // is a scope, so `catch (e)` shadows an outer `e` instead of overwriting it.
      await runBlock(ctx, step.catch, undefined, bind)
      // If catch block didn't set a new error, we're recovered
      // If it did, that error propagates
    }
  },
  { docs: 'Try/Catch', timeoutMs: 0, cost: 0.1 }
)

export const errorAtom = defineAtom(
  'Error',
  s.object({ args: s.array(s.any).optional }),
  undefined,
  async (step, ctx) => {
    const message = step.args?.[0] ?? 'Error'
    ctx.error = new AgentError(String(message), 'Error')
  },
  { docs: 'Trigger error flow', cost: 0.1 }
)

/**
 * `const` is a property of a BINDING, and a binding belongs to a SCOPE — so const-ness is
 * recorded per scope object, not as one set of names for the whole run. With one set, an
 * inner `{ const x = 5 }` made an unrelated OUTER `x` unassignable for the rest of the run.
 */
const CONST_BINDINGS = new WeakMap<object, Set<string>>()

function markConst(ctx: RuntimeContext, key: string): void {
  let set = CONST_BINDINGS.get(ctx.state)
  if (!set) CONST_BINDINGS.set(ctx.state, (set = new Set()))
  set.add(key)
  ctx.consts.add(key) // kept for readers of the context shape; never consulted for rules
}

/** Is `key` a `const` binding OF `owner` — the scope object that holds it? */
function constAt(owner: Record<string, any>, key: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(owner, key) &&
    (CONST_BINDINGS.get(owner)?.has(key) ?? false)
  )
}

/**
 * An EXPRESSION STATEMENT: evaluate for its effects, bind nothing. `arr.push(x);` compiled to
 * `varSet _ <expr>`, which clobbered a guest's own `_` — and with `const _` in scope, refused a
 * legal program ("Cannot reassign const variable '_'") — and kept the last statement's result
 * alive as live heap.
 */
export const evaluate = defineAtom(
  'evaluate',
  s.object({ value: s.any }),
  undefined,
  async ({ value }, ctx) => {
    resolveValue(value, ctx)
  },
  {
    docs: 'Evaluate an expression for its effects (an expression statement)',
    cost: 0.1,
  }
)

// 2. State (Low cost: 0.1)
export const varSet = defineAtom(
  'varSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    assertSafeProperty(key) // a variable named __proto__/constructor would mutate the scope object's prototype
    const v = resolveValue(value, ctx)
    if (!setStateVar(ctx, key, v, 'varSet')) return undefined
  },
  { docs: 'Set Variable', cost: 0.1 }
)

/**
 * ASSIGNMENT (`x = v`, and every compound form, lowered to it): writes to the scope that OWNS
 * `x` — the nearest one that declared it — as JavaScript does. `varSet` is DECLARATION and
 * always writes the current scope; compiling both to `varSet` lost every assignment to an
 * outer variable made inside a `for…of` body (tjs-lang#59). An undeclared name is bound in
 * the current scope, which is what `varSet` did, so no program that worked stops working.
 */
/**
 * The scope object that owns `key` — the nearest that declared it — else the current one.
 * (`runCode` needs no boundary here: it runs in a fresh scope of its own, not a child of the
 * caller's, so the caller's bindings are not on this chain at all.)
 */
function ownerOf(ctx: RuntimeContext, key: string): Record<string, any> {
  for (
    let o: any = ctx.state;
    o != null && o !== Object.prototype;
    o = Object.getPrototypeOf(o)
  ) {
    if (Object.prototype.hasOwnProperty.call(o, key)) return o
  }
  return ctx.state
}

export const varAssign = defineAtom(
  'varAssign',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    assertSafeProperty(key)
    const owner = ownerOf(ctx, key) // the const check is setStateVar's, on this same owner
    const v = resolveValue(value, ctx)
    if (!setStateVar(ctx, key, v, 'varAssign', { owner })) return undefined
  },
  { docs: 'Assign Variable (writes the scope that owns it)', cost: 0.1 }
)

export const constSet = defineAtom(
  'constSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    assertSafeProperty(key)
    // Redeclaration is an error in the SAME scope only. `key in ctx.state` walked the scope
    // chain, so any OUTER binding — an imported argument included — made a block-level
    // `const` impossible: `Eval` code declaring `const total` failed whenever the caller
    // passed a `total` (0.14.0 final re-review, M-1). A block `const` shadows, as in JS.
    if (own(ctx.state, key)) {
      throw new Error(
        constAt(ctx.state, key)
          ? `Cannot reassign const variable '${key}'`
          : `Cannot redeclare variable '${key}' as const`
      )
    }
    const cv = resolveValue(value, ctx)
    if (!setStateVar(ctx, key, cv, 'constSet')) return undefined
    markConst(ctx, key)
  },
  { docs: 'Set Const Variable (immutable)', cost: 0.1 }
)

export const varGet = defineAtom(
  'varGet',
  s.object({ key: s.string }),
  s.any,
  async ({ key }, ctx) => {
    return resolveName(key, ctx)
  },
  { docs: 'Get Variable', cost: 0.1 }
)

export const varsImport = defineAtom(
  'varsImport',
  s.object({
    keys: s.union([s.array(s.string), s.record(s.string)]),
  }),
  undefined,
  async ({ keys }, ctx) => {
    if (Array.isArray(keys)) {
      for (const key of keys) {
        const v = resolveValue({ $kind: 'arg', path: key }, ctx)
        if (!setStateVar(ctx, key, v, 'varsImport')) return undefined
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        const v = resolveValue({ $kind: 'arg', path: path }, ctx)
        if (!setStateVar(ctx, alias, v, 'varsImport')) return undefined
      }
    }
  },
  {
    docs: 'Import variables from args into the current scope, with optional renaming.',
    cost: 0.2,
  }
)

export const varsLet = defineAtom(
  'varsLet',
  s.record(s.any),
  undefined,
  async (step, ctx) => {
    for (const key of Object.keys(step)) {
      if (key === 'op' || key === 'result') continue
      const v = resolveValue(step[key], ctx)
      if (!setStateVar(ctx, key, v, 'varsLet')) return undefined
    }
  },
  {
    docs: 'Initialize a set of variables in the current scope from the step object properties.',
    cost: 0.1,
  }
)

export const varsExport = defineAtom(
  'varsExport',
  s.object({
    keys: s.union([s.array(s.string), s.record(s.string)]),
  }),
  s.record(s.any),
  async ({ keys }, ctx) => {
    const result: Record<string, any> = {}
    if (Array.isArray(keys)) {
      for (const key of keys) {
        setGuestKey(result, key, resolveName(key, ctx))
      }
    } else {
      for (const [alias, path] of Object.entries(keys)) {
        setGuestKey(result, alias, resolveName(String(path), ctx))
      }
    }
    return result
  },
  {
    docs: 'Export variables from the current scope, with optional renaming.',
    cost: 0.2,
  }
)

export const scope = defineAtom(
  'scope',
  s.object({ steps: s.array(s.any) }),
  undefined,
  async ({ steps }, ctx) => {
    const scopedCtx = createChildScope(ctx)
    try {
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      // Propagate output/return up
      if (scopedCtx.output !== undefined) ctx.output = scopedCtx.output
    } finally {
      releaseScope(scopedCtx)
    }
  },
  { docs: 'Create new scope', timeoutMs: 0, cost: 0.1 }
)

/**
 * Maximum helper-call nesting depth. Fuel + timeout bound the total *work* a
 * recursive helper can do, but deeply-nested `await seq.exec` would overflow
 * the host JS stack (an uncatchable RangeError) before fuel runs out. This cap
 * converts runaway recursion into a clean monadic error instead.
 */
export const MAX_CALL_DEPTH = 256

export const callLocal = defineAtom(
  'callLocal',
  s.object({
    name: s.string,
    args: s.array(s.any),
  }),
  undefined,
  async ({ name, args }, ctx) => {
    const helper = ctx.helpers?.[name as string]
    if (!helper) {
      ctx.error = new AgentError(`Unknown helper: ${name}`, 'callLocal')
      return ctx.error
    }

    const depth = (ctx.callDepth ?? 0) + 1
    if (depth > MAX_CALL_DEPTH) {
      ctx.error = new AgentError(
        `Maximum helper call depth (${MAX_CALL_DEPTH}) exceeded — likely infinite recursion in '${name}'`,
        'callLocal'
      )
      return ctx.error
    }

    // Resolve each argument expression in the caller's scope — all of them, in order, as
    // JavaScript evaluates them — then keep only those a parameter binds. An extra argument is
    // garbage in JavaScript; held here for the whole call it was unbound AND uncharged (binding
    // the first parameter ends the step's in-flight bytes), so a hand-built AST could hold
    // ~256 × maxHeapBytes across recursive calls (rc.2 sixth re-review B3).
    const resolvedArgs = (args as any[])
      .map((arg) => resolveValue(arg, ctx))
      .slice(0, helper.paramNames.length)

    // Isolated scope: helpers are top-level sibling functions, not nested
    // closures, so they see ONLY their params — never the caller's locals.
    // Capabilities/fuel/resolver/etc. are shared via the spread; state and
    // consts start fresh. localCall exempts the helper's `return` from the
    // agent object-return contract (helpers may return scalars/arrays like
    // ordinary functions). callDepth guards against host-stack overflow.
    const scopedCtx: RuntimeContext = {
      ...ctx,
      state: newScopeState(ctx),
      consts: new Set(),
      output: undefined,
      error: undefined,
      localCall: true,
      callDepth: depth,
      // A FRESH ledger, like `createChildScope`. The spread shared the caller's by
      // reference, so binding a parameter whose name matched a caller variable was
      // accounted as replacing it — the caller's value stayed live and its budget came
      // back. The guest names both sides (helper params and its own variables), so this
      // was a second, independent route to the same bypass and it is not reached by the
      // `createChildScope` fix: this atom builds its scope by hand.
      heapPerKey: new Map(),
      // `heapAccount` must stay SHARED (the spread already does this): a helper's live
      // bytes count against the same run-wide total.
    }
    try {
      for (let i = 0; i < helper.paramNames.length; i++) {
        // Seed the helper's ledger from the CALLER's entry when the argument is a value
        // the caller already accounts.
        //
        // Passing a name into a helper allocates nothing — it is the same object, already
        // counted — but the fresh ledger above meant every argument was re-walked in full
        // on every call. Measured with an unchanged 20,000-element argument over 400
        // calls: **4ms / 272 fuel on 0.12.0 → 41ms / 8,294 fuel here**, ~30× the fuel for
        // identical work. Fuel is the unit hosts size their budgets in, so a host that
        // tuned `fuel` against 0.12.0 exhausts it long before the work it used to afford.
        //
        // Matched by REFERENCE against the caller's entries, not by name: an argument that
        // is a freshly built value has no caller entry and is measured normally, which is
        // right — it really is new memory. Seeding only spares the re-walk: the bytes are
        // already in the run's estimate, which nothing refunds.
        const arg = resolvedArgs[i]
        if (arg && typeof arg === 'object' && ctx.heapPerKey) {
          for (const entry of ctx.heapPerKey.values()) {
            if (entry.ref !== arg) continue
            scopedCtx.heapPerKey.set(helper.paramNames[i], entry)
            break
          }
        }
        if (
          !setStateVar(
            scopedCtx,
            helper.paramNames[i],
            resolvedArgs[i],
            'callLocal'
          )
        )
          return undefined
      }

      await seq.exec({ op: 'seq', steps: helper.steps } as any, scopedCtx)

      // Propagate errors but NOT output — the helper's return becomes this
      // atom's result, captured into the caller's named result variable by
      // the standard exec wrapper. Unlike `scope`, it does not bubble up
      // to ctx.output (so a helper return doesn't exit the caller agent).
      //
      return scopedCtx.output
    } finally {
      // This scope deliberately starts with `error: undefined` and is NOT built by
      // `createChildScope`, so the error accessor does not apply — this propagation is the
      // real mechanism. It is in `finally` because EVERY exit must carry it: a parameter bind
      // over the heap cap returned early, skipping it, and the run carried on and reported
      // success with the result silently undefined (rc.2 fifth re-review M2).
      if (scopedCtx.error) ctx.error = scopedCtx.error
      releaseScope(scopedCtx)
    }
  },
  { docs: 'Invoke a local helper function by name', timeoutMs: 0, cost: 0.1 }
)

// 3. List (Cost 1)

/**
 * The scope a `map`/`reduce` CALLBACK body runs in. A callback is a function: its `return`
 * returns from the callback, and may return a scalar. It ran as a plain child scope, so a
 * block-bodied callback's `return` hit the AGENT's "must return an object" rule and failed
 * the run — `[1, 2].map(v => { return v * 3 })` — and a returned object was ignored because
 * only `state.result` was read (`[null, null]`). Only expression-bodied arrows worked.
 */
function callbackScope(
  ctx: RuntimeContext,
  opts: { loop?: boolean } = {}
): RuntimeContext {
  const child = createChildScope(ctx)
  // A LOOP body (for...of) is the enclosing code's own: plain child scope, agent rules.
  if (opts.loop) return child
  child.localCall = true
  child.output = undefined
  return child
}

/** What a callback produced: its `return`, else the `result` an expression body binds. */
function callbackResult(ctx: RuntimeContext): unknown {
  return ctx.output !== undefined ? ctx.output : ctx.state['result']
}

/*#
## for...of / map

Transforms each item in an array. The `result` variable in each iteration
becomes the new item value.

```javascript
const doubled = items.map(x => x * 2)

// Or with for...of:
const results = []
for (const item of items) {
  results.push(process(item))
}
```
*/
export const map = defineAtom(
  'map',
  s.object({
    items: s.array(s.any),
    as: s.string,
    steps: s.array(s.any),
    // A for...of BODY (set by the transpiler), not a callback: see below.
    loop: s.boolean.optional,
  }),
  s.array(s.any),
  async ({ items, as, steps, loop }, ctx) => {
    const results: unknown[] = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('map: items is not an array')
    // The SOURCE is held too: a callback can rebind the name it came from, leaving this loop as
    // its only holder — invisible to the measurement (rc.2 fifth re-review B1).
    const release = holdRoot(ctx, results, resolvedItems)
    try {
      for (const item of resolvedItems) {
        // Check abort signal for clean cancellation
        if (ctx.signal?.aborted) throw new Error('Execution aborted')
        // A LOOP body is the enclosing function's own code: its `return` is the agent's
        // return, under the agent's rules, and it ends the loop. A CALLBACK body is a function
        // of its own (see callbackScope). One op served both, and when callbacks gained
        // function semantics, a `return` inside for...of was silently swallowed.
        const scopedCtx = callbackScope(ctx, { loop })
        try {
          if (!setStateVar(scopedCtx, as, item, 'map', { alias: true }))
            return undefined
          await seq.exec({ op: 'seq', steps } as any, scopedCtx)
          if (loop) {
            if (scopedCtx.output !== undefined) {
              ctx.output = scopedCtx.output
              return results
            }
            continue
          }
          results.push(callbackResult(scopedCtx) ?? null)
          chargeResultSlot(ctx, 'map')
        } finally {
          releaseScope(scopedCtx)
        }
      }
    } finally {
      release()
    }
    return results
  },
  { docs: 'Map Array', timeoutMs: 0, cost: 1 }
)

/*#
## filter

Keeps items that match a condition.

```javascript
const adults = users.filter(u => u.age >= 18)
```
*/
export const filter = defineAtom(
  'filter',
  s.object({
    items: s.array(s.any),
    as: s.string,
    condition: s.any, // ExprNode that evaluates to boolean
  }),
  s.array(s.any),
  async ({ items, as, condition }, ctx) => {
    const results: unknown[] = []
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('filter: items is not an array')
    // The SOURCE is held too: a callback can rebind the name it came from, leaving this loop as
    // its only holder — invisible to the measurement (rc.2 fifth re-review B1).
    const release = holdRoot(ctx, results, resolvedItems)
    try {
      for (const item of resolvedItems) {
        // Check abort signal for clean cancellation
        if (ctx.signal?.aborted) throw new Error('Execution aborted')
        const scopedCtx = createChildScope(ctx)
        try {
          if (!setStateVar(scopedCtx, as, item, 'filter', { alias: true }))
            return undefined
          const passes = evaluateExpr(condition, scopedCtx)
          if (passes) {
            results.push(item)
            chargeResultSlot(ctx, 'filter')
          }
        } finally {
          releaseScope(scopedCtx)
        }
      }
    } finally {
      release()
    }
    return results
  },
  { docs: 'Filter Array', timeoutMs: 0, cost: 1 }
)

/*#
## reduce

Accumulates a single value from an array.

```javascript
const sum = numbers.reduce((acc, n) => acc + n, 0)
```
*/
export const reduce = defineAtom(
  'reduce',
  s.object({
    items: s.array(s.any),
    as: s.string,
    accumulator: s.string,
    initial: s.any,
    steps: s.array(s.any),
  }),
  s.any,
  async ({ items, as, accumulator, initial, steps }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    const resolvedInitial = resolveValue(initial, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('reduce: items is not an array')

    let acc = resolvedInitial
    /**
     * The accumulator's ledger entry, carried ACROSS iterations.
     *
     * Each iteration gets a fresh child scope with an empty `heapPerKey`, so writing the
     * accumulator into it found no prior entry and re-walked the whole thing — O(n) per
     * step, O(n²) over the loop, on the most ordinary agent shape there is. Measured fuel
     * over 1k→8k items: 1624 → 4248 → 12495 → 40989, ~3× per doubling.
     *
     * Seeding the child with last iteration's entry is O(1) and lets the identity/append
     * paths in `trackHeapWrite` do their job: an unchanged accumulator costs nothing, and
     * one that grew costs only its new tail. Only the re-walk is spared: the bytes are
     * already in the run's estimate, which nothing refunds.
     */
    let accEntry: HeapEntry | undefined
    // The accumulator lives in a JS local BETWEEN iterations: a root, through a box whose
    // content changes as the accumulator is rebuilt (see `holdRoot`).
    const held = { acc }
    const release = holdRoot(ctx, held, resolvedItems)
    try {
      for (const item of resolvedItems) {
        // Check abort signal for clean cancellation
        if (ctx.signal?.aborted) throw new Error('Execution aborted')
        const scopedCtx = callbackScope(ctx)
        try {
          // Only when it is the SAME object — a body that rebuilds the accumulator (`map`
          // style) gets a fresh measurement, which is correct: it is a different value.
          if (accEntry && accEntry.ref === acc && scopedCtx.heapPerKey) {
            scopedCtx.heapPerKey.set(accumulator, accEntry)
          }
          // The ITEM aliases the source array; the ACCUMULATOR does not — it can grow
          // without bound, so it stays fully accounted.
          if (!setStateVar(scopedCtx, as, item, 'reduce', { alias: true }))
            return undefined
          if (!setStateVar(scopedCtx, accumulator, acc, 'reduce'))
            return undefined
          await seq.exec({ op: 'seq', steps } as any, scopedCtx)
          acc = callbackResult(scopedCtx) ?? acc
          held.acc = acc
          accEntry = scopedCtx.heapPerKey?.get(accumulator)
        } finally {
          releaseScope(scopedCtx)
        }
      }
    } finally {
      release()
    }
    return acc
  },
  { docs: 'Reduce Array', timeoutMs: 0, cost: 1 }
)

/*#
## find

Returns first item matching condition, or null.

```javascript
const admin = users.find(u => u.role === "admin")
```
*/
export const find = defineAtom(
  'find',
  s.object({
    items: s.array(s.any),
    as: s.string,
    condition: s.any, // ExprNode that evaluates to boolean
  }),
  s.any,
  async ({ items, as, condition }, ctx) => {
    const resolvedItems = resolveValue(items, ctx)
    if (!Array.isArray(resolvedItems))
      throw new Error('find: items is not an array')
    const release = holdRoot(ctx, resolvedItems)
    try {
      for (const item of resolvedItems) {
        // Check abort signal for clean cancellation
        if (ctx.signal?.aborted) throw new Error('Execution aborted')
        const scopedCtx = createChildScope(ctx)
        try {
          if (!setStateVar(scopedCtx, as, item, 'find', { alias: true }))
            return undefined
          const matches = evaluateExpr(condition, scopedCtx)
          if (matches) {
            return item
          }
        } finally {
          releaseScope(scopedCtx)
        }
      }
    } finally {
      release()
    }
    return null
  },
  { docs: 'Find in Array', timeoutMs: 0, cost: 1 }
)

export const push = defineAtom(
  'push',
  s.object({ list: s.array(s.any), item: s.any }),
  s.array(s.any),
  async ({ list, item }, ctx) => {
    const resolvedList = resolveValue(list, ctx)
    const resolvedItem = resolveValue(item, ctx)
    if (Array.isArray(resolvedList)) {
      assertGuestData([resolvedItem])
      resolvedList.push(resolvedItem)
      if (!accountMutation(ctx, list, [resolvedItem], 'push')) return undefined
    }
    return resolvedList
  },
  { docs: 'Push to Array', cost: 1 }
)

export const len = defineAtom(
  'len',
  s.object({ list: s.any }),
  s.number,
  async ({ list }, ctx) => {
    const val = resolveValue(list, ctx)
    return Array.isArray(val) || typeof val === 'string' ? val.length : 0
  },
  { docs: 'Length', cost: 1 }
)

// 6. String (Cost 1)
export const split = defineAtom(
  'split',
  s.object({ str: s.string, sep: s.string }),
  s.array(s.string),
  async ({ str, sep }, ctx) => {
    // The method, through the method table's gate: one implementation of `split` (v1 ASTs keep
    // this op; v2 compiles `s.split(x)` to the same call).
    return guestCall(
      ctx,
      resolveValue(str, ctx),
      'split',
      [resolveValue(sep, ctx)],
      'split'
    )
  },
  { docs: 'Split String', cost: 1 }
)
export const join = defineAtom(
  'join',
  s.object({ list: s.array(s.string), sep: s.string }),
  s.string,
  async ({ list, sep }, ctx) => {
    return guestCall(
      ctx,
      resolveValue(list, ctx),
      'join',
      [resolveValue(sep, ctx)],
      'join'
    )
  },
  { docs: 'Join String', cost: 1 }
)
export const template = defineAtom(
  'template',
  s.object({ tmpl: s.string, vars: s.record(s.any) }),
  s.string,
  async ({ tmpl, vars }: { tmpl: string; vars: Record<string, any> }, ctx) => {
    const resolvedTmpl = resolveValue(tmpl, ctx)
    if (typeof resolvedTmpl !== 'string')
      throw new AgentError("template's tmpl must be a string", 'template')
    // Interpolation is an amplifier — a placeholder may repeat, and each copy of a huge value is
    // a new allocation — so the bound counts every OCCURRENCE, before the string is built (I1).
    // (v2 compiles template literals to `+`; this op is for v1 ASTs.)
    // Each placeholder's value is resolved once, from the template's OWN vars — `{{constructor}}`
    // read the inherited `Object` and printed its source.
    const values = new Map<string, unknown>()
    let bound = resolvedTmpl.length * 2 + 64
    for (const [, key] of resolvedTmpl.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!values.has(key))
        values.set(key, resolveValue(ownValue(vars, key), ctx) ?? '')
      bound += stringFormBound(ctx, values.get(key)) // every occurrence is a copy
    }
    allocate(ctx, bound, 'template')
    return resolvedTmpl.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) =>
      String(values.get(key) ?? '')
    )
  },
  { docs: 'String Template', cost: 1 }
)

export const regexMatch = defineAtom(
  'regexMatch',
  s.object({
    pattern: s.string,
    value: s.any,
  }),
  s.boolean,
  async ({ pattern, value }, ctx: RuntimeContext) => {
    // Resolved: a v2 program may pass the pattern in a variable, which arrived here as its
    // expression NODE — and `new RegExp` stringified that to '[object Object]'.
    const source = resolveValue(pattern, ctx)
    const resolvedValue = resolveValue(value, ctx)
    if (typeof source !== 'string' && !isGuestRegex(source))
      throw new AgentError(
        "regexMatch's pattern must be a string or a regex",
        'regexMatch'
      )
    primitiveOperand(resolvedValue, "regexMatch's value", 'regexMatch')
    // on the VM's own engine: linear in input × pattern, every step charged
    return vmStringMethod(ctx, String(resolvedValue), 'search', [source]) !== -1
  },
  {
    docs: 'Returns true if the value matches the regex pattern.',
    cost: 2,
  }
)

// 7. Object (Cost 1)
export const pick = defineAtom(
  'pick',
  s.object({ obj: s.record(s.any), keys: s.array(s.string) }),
  s.record(s.any),
  async ({ obj, keys }: { obj: Record<string, any>; keys: string[] }, ctx) => {
    const resolvedObj = resolveValue(obj, ctx)
    const resolvedKeys = resolveValue(keys, ctx)
    // `pick` builds one property per key: bounded by the KEY LIST, charged before (I1).
    allocate(ctx, 4 * shallowBytes(resolvedKeys) + 64, 'pick')
    const res: any = {}
    if (resolvedObj && Array.isArray(resolvedKeys)) {
      // OWN properties only: `pick(o, ['constructor'])` read the inherited `Object` function and
      // handed the guest a live host function.
      for (const k of resolvedKeys) {
        // enumerable own DATA only: a VM wrapper's sealed methods are not values to pick
        // (rc.2 sixteenth re-review B2; the bind check refuses them as well)
        const d = Object.getOwnPropertyDescriptor(resolvedObj ?? {}, k)
        if (d && d.enumerable && 'value' in d) setGuestKey(res, k, d.value)
      }
    }
    return res
  },
  { docs: 'Pick Keys', cost: 1 }
)

export const omit = defineAtom(
  'omit',
  s.object({ obj: s.record(s.any), keys: s.array(s.string) }),
  s.record(s.any),
  async ({ obj, keys }: { obj: Record<string, any>; keys: string[] }, ctx) => {
    const resolvedObj = resolveValue(obj, ctx)
    const resolvedKeys = new Set(resolveValue(keys, ctx))
    // Unlike `pick`, `omit` copies up to the WHOLE source object.
    allocate(ctx, 2 * shallowBytes(resolvedObj) + 64, 'omit')
    const res: any = {}
    if (resolvedObj) {
      Object.keys(resolvedObj).forEach((k) => {
        if (!resolvedKeys.has(k)) setGuestKey(res, k, resolvedObj[k])
      })
    }
    return res
  },
  { docs: 'Omit Keys', cost: 1 }
)

export const merge = defineAtom(
  'merge',
  s.object({ a: s.record(s.any), b: s.record(s.any) }),
  s.record(s.any),
  async ({ a, b }, ctx) => {
    const ra = resolveValue(a, ctx)
    const rb = resolveValue(b, ctx)
    // Both operands are copied, so both are charged. Measured flat-charged: 400 merges
    // over a 400k-key object completed in 17.7 SECONDS having spent 400.3 fuel.
    // typed as Object.assign's sources: a string would spread into one key per character
    for (const [x, n] of [
      [ra, 1],
      [rb, 2],
    ] as const)
      if (x !== undefined && x !== null && !argOk('objOrArr', x))
        throw new AgentError(
          `merge's operand ${n} must be an object or an array`,
          'merge'
        )
    allocate(
      ctx,
      2 * (shallowBytes(ra ?? {}) + shallowBytes(rb ?? {})) + 64,
      'merge'
    )
    return { ...ra, ...rb }
  },
  { docs: 'Merge Objects', cost: 1 }
)
export const keys = defineAtom(
  'keys',
  s.object({ obj: s.record(s.any) }),
  s.array(s.string),
  async ({ obj }, ctx) => {
    const input = resolveValue(obj, ctx) ?? {}
    // O(keys), not O(1) (flat-charged, `keys` cost 1.2 fuel for 100 keys AND for 100,000).
    return guestCall(ctx, builtins.Object, 'keys', [input], 'keys')
  },
  { docs: 'Object Keys', cost: 1 }
)

// 8. IO (Cost 5)

/*#
## fetch

HTTP requests. Requires `fetch` capability or uses global fetch with SSRF protection.

```javascript
const data = fetch("https://api.example.com/data")
const posted = fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: { name: "New Item" }
})
```

Response types: `"json"` (default for JSON content-type), `"text"`, `"dataUrl"` (for images)

Security:
- Requires `ctx.context.allowedFetchDomains` allowlist OR restricts to localhost
- Automatically adds `X-Agent-Depth` header to prevent recursive agent loops
- Custom fetch capability can override all restrictions
*/

/** Maximum agent request depth to prevent recursive loops */
const MAX_AGENT_DEPTH = 10

/** Header name for tracking agent request depth */
const AGENT_DEPTH_HEADER = 'X-Agent-Depth'

/**
 * The depth header for a DEFAULT-path fetch, or none. It exists to catch agents calling back
 * into agent endpoints over HTTP. In a BROWSER it is a non-simple header, so on a cross-origin
 * request it forces a CORS preflight, and any API that does not allow the header fails with
 * "Failed to fetch" — every such API, for no benefit, since a third-party API is not an agent
 * endpoint (found running the AJS weather example on tjs.tosijs.net). So in a browser it goes
 * only to the page's own origin; a server runtime, which has no CORS, sends it everywhere.
 * A custom `fetch` capability receives the depth either way and decides for itself.
 */
export function depthHeaderFor(
  url: string,
  depth: number,
  env: { server: boolean; origin: string | undefined } = fetchEnvironment()
): Record<string, string> {
  if (!env.server && env.origin) {
    // An OPAQUE origin ('null': a sandboxed iframe, a file: or data: page) is same-origin with
    // nothing, so every request is cross-origin and the header would force a preflight.
    if (env.origin === 'null') return {}
    try {
      if (new URL(url, env.origin).origin !== env.origin) return {}
    } catch {
      return {}
    }
  }
  return { [AGENT_DEPTH_HEADER]: String(depth) }
}

/**
 * Where this fetch runs. SERVER means a runtime whose fetch never enforces CORS (Node, Bun,
 * Deno) — decided by the runtime, not by whether a `location` exists: test runners, SSR and
 * DOM shims (happy-dom) define one, and reading it as "browser" dropped the header
 * server-side, silently weakening recursion protection.
 */
function fetchEnvironment(): { server: boolean; origin: string | undefined } {
  const g = globalThis as any
  const server = !!(g.process?.versions?.node || g.Bun || g.Deno)
  return { server, origin: g.location?.origin }
}

/**
 * Check if a URL's domain is in the allowlist.
 * Supports exact matches and wildcard subdomains (*.example.com)
 */
function isDomainAllowed(urlString: string, allowedDomains: string[]): boolean {
  try {
    const url = new URL(urlString)
    const host = url.hostname.toLowerCase()

    for (const pattern of allowedDomains) {
      const p = pattern.toLowerCase()
      if (p.startsWith('*.')) {
        // Wildcard: *.example.com matches sub.example.com and example.com
        const suffix = p.slice(1) // .example.com
        if (host.endsWith(suffix) || host === p.slice(2)) {
          return true
        }
      } else if (host === p) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

export const fetch = defineAtom(
  'httpFetch',
  s.object({
    url: s.string,
    method: s.string.optional,
    headers: s.record(s.string).optional,
    body: s.any.optional,
    responseType: s.string.optional, // 'json' | 'text' | 'dataUrl'
  }),
  s.any,
  async (step, ctx) => {
    const url = resolveValue(step.url, ctx)
    const method = resolveValue(step.method, ctx)
    const headers = resolveValue(step.headers, ctx) || {}
    const body = resolveValue(step.body, ctx)
    const responseType = resolveValue(step.responseType, ctx)
    // Typed before anything parses them: `new URL(DAG)` built the DAG's string form for free
    // (rc.2 seventh re-review B4), and a header value is converted by the host's fetch.
    if (typeof url !== 'string')
      throw new Error("httpFetch's url must be a string")
    for (const [name, v] of [
      ['method', method],
      ['responseType', responseType],
    ] as const)
      if (v !== undefined && typeof v !== 'string')
        throw new Error(`httpFetch's ${name} must be a string`)
    if (
      !isPlainObject(headers) ||
      !Object.values(Object.getOwnPropertyDescriptors(headers)).every(
        (d) => typeof d.value === 'string'
      )
    )
      throw new Error("httpFetch's headers must be an object of strings")

    // Get current depth from context (set by receiving endpoint)
    const currentDepth: number = ctx.context?.requestDepth ?? 0

    // Check depth limit
    if (currentDepth >= MAX_AGENT_DEPTH) {
      throw new Error(
        `Agent request depth exceeded (max ${MAX_AGENT_DEPTH}). This prevents recursive agent loops.`
      )
    }

    if (ctx.capabilities.fetch) {
      // Custom fetch capability handles its own validation
      // Pass depth info so it can add the header
      return ctx.capabilities.fetch(url, {
        method,
        headers: {
          ...headers,
          [AGENT_DEPTH_HEADER]: String(currentDepth + 1),
        },
        body,
        signal: ctx.signal,
        responseType,
      })
    }

    // Check allowlist - if configured, it controls what's allowed
    const allowedDomains: string[] | undefined =
      ctx.context?.allowedFetchDomains
    if (allowedDomains) {
      // Allowlist mode: only allow domains in the list
      if (!isDomainAllowed(url, allowedDomains)) {
        throw new Error(
          `Fetch blocked: domain not in allowlist. Allowed: ${allowedDomains.join(
            ', '
          )}`
        )
      }
      // Domain is in allowlist - skip SSRF check (allowlist takes precedence)
    } else {
      // No allowlist configured - use SSRF protection + localhost-only
      if (isBlockedUrl(url)) {
        throw new Error(
          `Blocked URL: private/internal addresses not allowed in default fetch`
        )
      }

      // Additionally restrict to localhost when no allowlist
      try {
        const parsed = new URL(url)
        const host = parsed.hostname.toLowerCase()
        if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
          throw new Error(
            `Fetch blocked: no allowedFetchDomains configured. ` +
              `Set ctx.context.allowedFetchDomains or provide a custom fetch capability.`
          )
        }
      } catch (e: any) {
        if (e.message.includes('allowedFetchDomains')) throw e
        throw new Error(`Invalid URL: ${url}`, { cause: e })
      }
    }

    // Default: global fetch with abort signal and depth header
    if (typeof globalThis.fetch === 'function') {
      const res = await globalThis.fetch(url, {
        method,
        headers: {
          ...(headers as Record<string, string>),
          ...depthHeaderFor(url, currentDepth + 1),
        },
        body: body ? jsonOf(ctx, body, 'httpFetch') : undefined,
        signal: ctx.signal, // Pass abort signal for cancellation
      })

      // Handle dataUrl response type - converts binary to data URI
      if (responseType === 'dataUrl') {
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        const contentType =
          res.headers.get('content-type') || 'application/octet-stream'
        return `data:${contentType};base64,${base64}`
      }

      // Try to parse JSON if content-type says so, else text
      const contentType = res.headers.get('content-type')
      if (
        responseType === 'json' ||
        (contentType && contentType.includes('application/json'))
      ) {
        return res.json()
      }
      return res.text()
    }
    throw new Error("Capability 'fetch' missing and no global fetch available")
  },
  { docs: 'HTTP Fetch', timeoutMs: 30000, cost: 5 }
)

// 9. Store

/*#
## storeGet / storeSet

Persistent key-value storage. Requires `store` capability.

```javascript
// Save data
storeSet("user:123", { name: "Alice", prefs: {} })

// Retrieve later
const user = storeGet("user:123")
```

**Warning:** Default in-memory store is not suitable for production.
*/
export const storeGet = defineAtom(
  'storeGet',
  s.object({ key: s.string }),
  s.any,
  async ({ key }, ctx) => {
    const k = resolveValue(key, ctx)
    return ctx.capabilities.store?.get(k)
  },
  { docs: 'Store Get', cost: 5 }
)

export const storeSet = defineAtom(
  'storeSet',
  s.object({ key: s.string, value: s.any }),
  undefined,
  async ({ key, value }, ctx) => {
    const k = resolveValue(key, ctx)
    const v = resolveValue(value, ctx)
    return ctx.capabilities.store?.set(k, v)
  },
  { docs: 'Store Set', cost: 5 }
)

export const storeQuery = defineAtom(
  'storeQuery',
  s.object({ query: s.any }),
  s.array(s.any),
  async ({ query }, ctx) =>
    ctx.capabilities.store?.query?.(resolveValue(query, ctx)) ?? [],
  { docs: 'Store Query', cost: 5 }
)

/*#
## storeQueryWhere (predicate pushdown)

Send the *predicate* to the data instead of dragging rows to the code.

`predicate` is a **canonical verified predicate** — build it at author/transpile time
with `canonicalizePredicate()` from `tjs-lang/lang`, then pass the resulting object.
Because it is verified pure and canonical, it is safe to ship, cheap to compare, and
carries a stable `key` the store can cache on (two spellings of the same predicate hit
the same cache entry).

```javascript
// canonical form produced outside the VM; the VM forwards it as data
const rows = storeQueryWhere({ collection: 'users', predicate: adultPredicate })
```

Requires a store that implements `queryPredicate`. If it doesn't, this fails with a
message pointing at the ordinary `storeQuery` + `filter` path rather than silently
returning everything — a filter that silently doesn't filter is an authorization bug.
*/
export const storeQueryWhere = defineAtom(
  'storeQueryWhere',
  s.object({
    predicate: s.any,
    collection: s.string.optional,
    limit: s.number.optional,
  }),
  s.array(s.any),
  async ({ predicate, collection, limit }, ctx) => {
    const pred = resolveValue(predicate, ctx)
    if (
      !pred ||
      typeof pred !== 'object' ||
      typeof pred.canonical !== 'string'
    ) {
      throw new Error(
        'storeQueryWhere: `predicate` must be a canonical verified predicate ' +
          '({ key, canonical, ast, entry }) — build one with canonicalizePredicate() ' +
          'from tjs-lang/lang.'
      )
    }
    const store = ctx.capabilities.store
    if (!store?.queryPredicate) {
      // Fail loudly rather than degrading to an unfiltered read: callers use this to
      // narrow data, and silently returning everything would be a data-exposure bug.
      throw new Error(
        "Capability 'store.queryPredicate' missing — this store can't evaluate " +
          'predicates. Use storeQuery + filter, or provide queryPredicate.'
      )
    }
    return (
      (await store.queryPredicate({
        collection: resolveValue(collection, ctx),
        predicate: pred,
        limit: resolveValue(limit, ctx),
      })) ?? []
    )
  },
  { docs: 'Store Query (predicate pushdown)', cost: 5 }
)
export const vectorSearch = defineAtom(
  'storeVectorSearch',
  s.object({
    collection: s.string.optional,
    vector: s.array(s.number),
    k: s.number.optional,
  }),
  s.array(s.any),
  async ({ collection, vector, k }, ctx) =>
    ctx.capabilities.store?.vectorSearch?.(
      resolveValue(collection, ctx),
      resolveValue(vector, ctx),
      resolveValue(k, ctx)
    ) ?? [],
  {
    docs: 'Vector Search',
    cost: (input, ctx) => 5 + (resolveValue(input.k, ctx) ?? 5),
  }
)

// 10. LLM

/*#
## llmPredict

Call language model. Requires `llm` capability with `predict` method.

```javascript
const response = llmPredict("Summarize this: " + text)

// With options
const structured = llmPredict(prompt, {
  model: "gpt-4",
  temperature: 0.7,
  responseFormat: { type: "json_object" }
})
```
*/
export const llmPredict = defineAtom(
  'llmPredict',
  s.object({ prompt: s.string, options: s.any.optional }),
  s.string,
  async ({ prompt, options }, ctx) => {
    if (!ctx.capabilities.llm?.predict)
      throw new Error("Capability 'llm.predict' missing")
    const resolved = resolveValue(options, ctx)
    // the response format and any tool schemas are GUEST schemas handed to a model server
    if (resolved !== undefined && resolved !== null) {
      if (typeof resolved !== 'object' || Array.isArray(resolved))
        throw new AgentError(
          'llmPredict options must be an object',
          'llmPredict'
        )
      for (const k of Object.keys(resolved))
        if (!LLM_OPTION_KEYS.has(k))
          throw new AgentError(
            `llmPredict option '${k}' is not available in AsyncJS (allowed: ${[
              ...LLM_OPTION_KEYS,
            ].join(', ')})`,
            'llmPredict'
          )
      admitResponseFormat(resolved.responseFormat, 'llmPredict')
      admitTools(resolved.tools, 'llmPredict')
    }
    return ctx.capabilities.llm.predict(resolveValue(prompt, ctx), resolved)
  },
  { docs: 'LLM Predict', timeoutMs: 120000, cost: 100 }
)

export const agentRun = defineAtom(
  'agentRun',
  s.object({ agentId: s.any, input: s.any }), // agentId can be string token or AST object
  s.any,
  async ({ agentId, input }, ctx) => {
    const resolvedId = resolveValue(agentId, ctx)
    const rawInput = resolveValue(input, ctx)

    let resolvedInput = rawInput
    if (rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
      resolvedInput = {}
      for (const k of Object.keys(rawInput)) {
        setGuestKey(resolvedInput, k, resolveValue(rawInput[k], ctx))
      }
    }

    // Check if this is a procedure token
    if (isProcedureToken(resolvedId)) {
      // Resolve the token to AST and execute directly
      const ast = resolveProcedureToken(resolvedId)

      // Execute the AST using the seq atom (recursive execution)
      // Create a child context with the input as args
      const childCtx: RuntimeContext = {
        ...ctx,
        args: resolvedInput,
        state: newScopeState(ctx),
        consts: new Set(),
        // A sub-agent is a different program: its own memoize cache, or it could read — or
        // poison — the caller's entries by choosing the same key.
        memo: new Map(),
        output: undefined,
        error: undefined,
        // A sub-agent is an AGENT, under the agent's return rule — never a callback's
        // exemption inherited from the `map` it was started in.
        localCall: false,
        // Own ledger — the spread would share the caller's by reference, and a
        // sub-agent binding a name the caller also uses would free the caller's budget.
        heapPerKey: new Map(),
      }

      try {
        const seqAtom = ctx.resolver('seq')
        if (!seqAtom) throw new Error('seq atom not found')
        // Already gated inside resolveProcedureToken — repeated so the rule stays mechanical:
        // EVERY execution of a non-literal AST is immediately preceded by the gate on it.
        // `ast-version-boundaries.test.ts` checks exactly that, and cannot see through calls.
        checkAstVersion(ast, 'agentRun')
        childCtx.astVersion = astVersionOf(ast) ?? AST_VERSION_LEGACY
        // ITS helpers, not the caller's: the spread handed a sub-agent the caller's local
        // functions, so a call by name ran the caller's body, or missed its own.
        childCtx.helpers = (ast as any).helpers
        ownRoots(childCtx, childCtx.memo, childCtx.args)
        await seqAtom.exec(ast, childCtx)

        if (childCtx.error) {
          throw new Error(childCtx.error.message || 'Sub-agent failed')
        }

        return childCtx.output
      } finally {
        releaseScope(childCtx)
      }
    }

    // Check if resolvedId is an AST object (has 'op' property)
    if (resolvedId && typeof resolvedId === 'object' && 'op' in resolvedId) {
      // Execute the AST directly
      const childCtx: RuntimeContext = {
        ...ctx,
        args: resolvedInput,
        state: newScopeState(ctx),
        consts: new Set(),
        // A sub-agent is a different program: its own memoize cache, or it could read — or
        // poison — the caller's entries by choosing the same key.
        memo: new Map(),
        output: undefined,
        error: undefined,
        // A sub-agent is an AGENT, under the agent's return rule — never a callback's
        // exemption inherited from the `map` it was started in.
        localCall: false,
        // Own ledger — see the sibling branch above. Here the AST is guest-supplied, so
        // the guest picks the binding names outright.
        heapPerKey: new Map(),
      }

      try {
        const seqAtom = ctx.resolver('seq')
        if (!seqAtom) throw new Error('seq atom not found')
        // The INLINE route — guest-supplied, no capability required. The first fix for the
        // 0.14.0 review's M3 gated only the token route and missed this one, which was the
        // review's own repro (0.14.0 re-review, M-1).
        checkAstVersion(resolvedId, 'agentRun')
        childCtx.astVersion = astVersionOf(resolvedId) ?? AST_VERSION_LEGACY
        childCtx.helpers = (resolvedId as any).helpers // its own (see above)
        ownRoots(childCtx, childCtx.memo, childCtx.args)
        await seqAtom.exec(resolvedId, childCtx)

        if (childCtx.error) {
          throw new Error(childCtx.error.message || 'Sub-agent failed')
        }

        return childCtx.output
      } finally {
        releaseScope(childCtx)
      }
    }

    // Fall back to capability-based agent lookup
    if (!ctx.capabilities.agent?.run)
      throw new Error("Capability 'agent.run' missing")

    const result = await ctx.capabilities.agent.run(resolvedId, resolvedInput)

    // Check if this is a RunResult (has fuelUsed property) - unwrap it
    if (
      result &&
      typeof result === 'object' &&
      'fuelUsed' in result &&
      typeof result.fuelUsed === 'number'
    ) {
      // It's a RunResult - check for error and propagate
      if (result.error) {
        throw new Error(result.error.message || 'Sub-agent failed')
      }
      return result.result
    }

    return result
  },
  { docs: 'Run Sub-Agent (accepts procedure token, AST, or agent ID)', cost: 1 }
)

/**
 * ADMISSION for guest-built source, before the host's transpiler sees it.
 *
 * `runCode` and `transpileCode` passed any string straight to `code.transpile` at a flat cost
 * of 1. Transpilation is super-linear in source length and runs synchronously, so neither fuel
 * nor timeout bounded it: ~220KB took 1.2s charging 61 fuel, 500KB 6.6s (0.14.0 final
 * re-review 3, M-1) — the same class as `Eval`'s `maxSourceBytes`, reached from inside a run.
 * Refused over the cap BEFORE any work (a length check first: a string of more chars than
 * the cap has more bytes too, so a huge one is refused without being encoded), then charged
 * per character like any other operand. The cap is `guestSourceCap` (admission.ts).
 */

function admitSource(ctx: RuntimeContext, code: unknown, op: string): string {
  if (typeof code !== 'string') throw new Error(`${op}: code must be a string`)
  // The run's `maxSourceBytes` may LOWER this cap, never raise or disable it: one option, two
  // trust domains (re-reviews 10-12). The rule lives in the funnel — see `guestSourceCap`.
  const max = guestSourceCap(ctx.maxSourceBytes)
  if (sourceBytesOver(code, max) !== null)
    throw new Error(
      `${op}: source is over the ${max}-byte limit. Transpilation runs ` +
        `before fuel can stop it, so oversized source is refused rather than metered.`
    )
  if (!chargeForSize(ctx, code, op)) throw new Error('Out of Fuel')
  return code
}

/*#
## transpileCode (Code to AST)

Transpiles AsyncJS code to an AST without executing it.
Useful for generating agents to send to other services via fetch.

```javascript
// Generate an agent and send it to a worker
let code = llmPredict({ prompt: 'Write an AsyncJS data processor' })
let ast = transpileCode({ code })
let result = httpFetch({
  url: 'https://worker.example.com/run',
  method: 'POST',
  body: JSON.stringify({ ast, args: { data: myData } })
})
```

Security: Only available when the `code.transpile` capability is provided.
*/
export const transpileCode = defineAtom(
  'transpileCode',
  s.object({
    code: s.string,
  }),
  s.any,
  async ({ code }, ctx) => {
    if (!ctx.capabilities.code?.transpile) {
      throw new Error(
        "Capability 'code.transpile' missing. Enable code transpilation by providing the code capability."
      )
    }

    const resolvedCode = admitSource(
      ctx,
      resolveValue(code, ctx),
      'transpileCode'
    )

    try {
      return ctx.capabilities.code.transpile(resolvedCode)
    } catch (e: any) {
      throw new Error(`Code transpilation failed: ${e.message}`, { cause: e })
    }
  },
  { docs: 'Transpile AsyncJS code to AST', cost: 1 }
)

/*#
## runCode (Dynamic Code Execution)

Transpiles and executes AsyncJS code at runtime. The generated code is its
own program: it sees only the `args` it is given — not the caller's
variables or helpers — and shares the run's fuel, heap budget,
capabilities, and trace.

This enables agents to write and execute code to solve problems.

```javascript
// Agent writes code to solve a problem
let code = llmPredict({ prompt: 'Write AsyncJS to calculate fibonacci(10)' })
let result = runCode({ code, args: {} })
return { answer: result }
```

The code must be a valid AsyncJS function. The function's return value
becomes the result of runCode.

Security: Only available when the `code.transpile` capability is provided.
The transpiled code runs with the same permissions as the parent.
Recursion depth is limited to prevent stack overflow.
*/
/** Maximum nesting depth for runCode to prevent infinite recursion */
const MAX_RUNCODE_DEPTH = 10

export const runCode = defineAtom(
  'runCode',
  s.object({
    code: s.string,
    args: s.record(s.any).optional,
  }),
  s.any,
  async ({ code, args }, ctx) => {
    // Check recursion depth
    const currentDepth = ctx.runCodeDepth ?? 0
    if (currentDepth >= MAX_RUNCODE_DEPTH) {
      throw new Error(
        `runCode recursion limit exceeded (max ${MAX_RUNCODE_DEPTH}). ` +
          'This prevents infinite loops from dynamically generated code calling runCode.'
      )
    }

    if (!ctx.capabilities.code?.transpile) {
      throw new Error(
        "Capability 'code.transpile' missing. Enable dynamic code execution by providing the code capability."
      )
    }

    const resolvedCode = admitSource(ctx, resolveValue(code, ctx), 'runCode')
    const resolvedArgs = args ? resolveValue(args, ctx) : {}

    // Transpile the code to AST
    let ast: { op: string; steps: any[] }
    try {
      ast = ctx.capabilities.code.transpile(resolvedCode)
    } catch (e: any) {
      throw new Error(`Code transpilation failed: ${e.message}`, { cause: e })
    }

    // Version BEFORE shape, as in AgentVM.run: a newer format should report its version, not
    // "must be a seq node". And the host's transpiler may be a different tjs-lang than this
    // VM — producer/interpreter version skew is exactly what the field exists to refuse.
    checkAstVersion(ast, 'runCode')
    if (ast.op !== 'seq') {
      throw new Error('Transpiled code must be a seq node')
    }

    // The dynamic code is its OWN PROGRAM, like a sub-agent: a fresh scope that sees only the
    // `args` it is handed, not the caller's variables or helpers. It shares the run — fuel,
    // heap account, capabilities, trace, and `error` (via `createChildScope`).
    //
    // It used to run in a CHILD of the caller's scope. Assignment then reached the caller's
    // variables (rc.2 review B2), and once that was stopped at a scope boundary, in-place
    // mutation still did — `allowed.push(…)`, `config.fill(…)` on any caller array, by name,
    // with no `args` involved (rc.2 re-review M2). And its reads exposed every caller binding
    // — keys, tokens — to code a model wrote. A boundary drawn on writes leaves reads and
    // mutation open; a fresh scope has nothing on the other side to reach. What it is GIVEN
    // in `args` it holds by reference, as a function holds its arguments.
    const childCtx = createChildScope(ctx)
    ctx.heapRoots.delete(childCtx.state) // replaced below: its own scope, not a child's
    childCtx.state = newScopeState(ctx)
    childCtx.heapPerKey = new Map()
    ledgerFor(childCtx.state, childCtx.heapPerKey)
    childCtx.consts = new Set()
    childCtx.helpers = (ast as any).helpers
    childCtx.memo = new Map() // its own cache, like its own scope (see agentRun)
    // The guest-built code is its OWN document: read it in its own format.
    childCtx.astVersion = astVersionOf(ast) ?? AST_VERSION_LEGACY
    try {
      childCtx.args = resolvedArgs
      ownRoots(childCtx, childCtx.memo, childCtx.args)
      childCtx.output = undefined
      childCtx.localCall = false // dynamic code is an agent, whatever scope started it
      childCtx.runCodeDepth = currentDepth + 1 // Increment depth for nested calls

      // Execute the transpiled code in the child context
      await seq.exec(ast as any, childCtx)

      // Propagate any error from child to parent. Redundant since `createChildScope`
      // made `error` a shared accessor, and kept because it is also the early RETURN —
      // deleting it would change control flow, not just remove a duplicate assignment.
      if (childCtx.error) {
        ctx.error = childCtx.error
        return
      }

      // Return the output from the dynamic code
      return childCtx.output
    } finally {
      releaseScope(childCtx)
    }
  },
  { docs: 'Run dynamically generated AsyncJS code', cost: 1 }
)

// 11. Parsing (Cost 1)
export const jsonParse = defineAtom(
  'jsonParse',
  s.object({ str: s.string }),
  s.any,
  async ({ str }, ctx) => {
    return guestCall(
      ctx,
      builtins.JSON,
      'parse',
      [resolveValue(str, ctx)],
      'jsonParse'
    )
  },
  { docs: 'Parse JSON', cost: 1 }
)
export const jsonStringify = defineAtom(
  'jsonStringify',
  s.object({ value: s.any }),
  s.string,
  async ({ value }, ctx) => {
    return guestCall(
      ctx,
      builtins.JSON,
      'stringify',
      [resolveValue(value, ctx)],
      'jsonStringify'
    )
  },
  { docs: 'Stringify JSON', cost: 1 }
)
export const xmlParse = defineAtom(
  'xmlParse',
  s.object({ str: s.string }),
  s.any,
  async ({ str }, ctx) => {
    if (!ctx.capabilities.xml?.parse)
      throw new Error("Capability 'xml.parse' missing")
    return ctx.capabilities.xml.parse(resolveValue(str, ctx))
  },
  { docs: 'Parse XML', cost: 1 }
)

// 12. Optimization

/*#
## memoize

In-memory caching within a single execution. Same key returns cached result.

```javascript
// Expensive computation cached by key
const result = memoize("expensive-" + id, () => {
  return heavyComputation(data)
})
```
*/
export const memoize = defineAtom(
  'memoize',
  s.object({ key: s.string.optional, steps: s.array(s.any) }),
  s.any,
  async ({ key, steps }, ctx) => {
    // In-memory memoization scoped to VM run
    if (!ctx.memo) ctx.memo = new Map()

    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))

    // Check if result exists
    if (ctx.memo.has(k)) {
      return ctx.memo.get(k)
    }

    // A memoized body is a CALLBACK: its `return` is the value, and may be a scalar.
    const scopedCtx = callbackScope(ctx)
    let result: any
    try {
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      result = callbackResult(scopedCtx)
    } finally {
      releaseScope(scopedCtx)
    }

    // Store
    // A FAILED run must not be cached as a success.
    //
    // The body's error left `result` undefined, and the entry was written anyway — so the
    // retry read a hit and returned `undefined` with NO error, for the whole TTL. Fuel
    // exhaustion, atom timeout, capability denial and the heap-limit error were all
    // laundered into a clean success, and for `cache` that success is shared across
    // processes for 24h by default.
    //
    // `runCode` has had the right shape all along, a couple of hundred lines above: check
    // `ctx.error` before propagating a result. This is that check, in the two places that
    // PERSIST one.
    if (ctx.error) return undefined

    ctx.memo.set(k, result)
    // The cache is a heap ROOT, and a store is an insertion into it: a result held only here
    // — never bound to a name — was never charged, so the estimate never rose and the true
    // measurement never ran. Ten unbound ~200KB results sat under a 1MB cap.
    if (!accountMutation(ctx, undefined, [result], 'memoize')) return undefined
    return result
  },
  { docs: 'Memoize steps result in memory', cost: 1 }
)

/*#
## cache

Persistent caching across executions using store capability.

```javascript
// Cache API result for 1 hour (3600000 ms)
const weather = cache("weather-" + city, 3600000, () => {
  return fetch("https://api.weather.com/" + city)
})
```
*/
export const cache = defineAtom(
  'cache',
  s.object({
    key: s.string.optional,
    steps: s.array(s.any),
    ttlMs: s.number.optional,
  }),
  s.any,
  async ({ key, steps, ttlMs }, ctx) => {
    if (!ctx.capabilities.store)
      throw new Error("Capability 'store' missing for caching")

    const k =
      resolveValue(key, ctx) ??
      (await hash.exec({ value: steps, algorithm: 'SHA-256' }, ctx))

    // Check cache
    const cacheKey = `cache:${k}`
    const cached = await ctx.capabilities.store.get(cacheKey)

    if (cached) {
      // If object with timestamp?
      // For simple store, we might store { val, exp }
      // Let's assume we store { val, exp } if we manage TTL manually
      // or capabilities handle TTL?
      // Standard KV doesn't enforce TTL usually unless Redis.
      // We implement soft TTL logic wrapper here.
      if (typeof cached === 'object' && cached._exp) {
        if (Date.now() < cached._exp) return cached.val
        // Expired
      } else {
        // No expiry metadata, assume valid if exists (or legacy data)
        return cached
      }
    }

    // A cached body is a CALLBACK: its `return` is the value, and may be a scalar.
    const scopedCtx = callbackScope(ctx)
    let result: any
    try {
      await seq.exec({ op: 'seq', steps } as any, scopedCtx)
      result = callbackResult(scopedCtx)
    } finally {
      releaseScope(scopedCtx)
    }

    // A FAILED run must not be cached as a success.
    //
    // The body's error left `result` undefined, and the entry was written anyway — so the
    // retry read a hit and returned `undefined` with NO error, for the whole TTL. Fuel
    // exhaustion, atom timeout, capability denial and the heap-limit error were all
    // laundered into a clean success, and for `cache` that success is shared across
    // processes for 24h by default.
    //
    // `runCode` has had the right shape all along, a couple of hundred lines above: check
    // `ctx.error` before propagating a result. This is that check, in the two places that
    // PERSIST one.
    if (ctx.error) return undefined

    // Store with TTL
    const expiry = Date.now() + (ttlMs ?? 24 * 3600 * 1000)

    if ((ctx.fuel.current -= 5) <= 0) throw new Error('Out of Fuel')
    await ctx.capabilities.store.set(cacheKey, { val: result, _exp: expiry })

    return result
  },
  { docs: 'Cache steps result in store with TTL', cost: 5 }
)

// 13. Utils
export const random = defineAtom(
  'random',
  s.object({
    min: s.number.optional,
    max: s.number.optional,
    format: s.string.optional,
    length: s.number.optional,
  }),
  s.any,
  async ({ min, max, format, length }, ctx) => {
    const f = resolveValue(format, ctx) ?? 'float'
    const len = resolveValue(length, ctx) ?? 10
    const mn = resolveValue(min, ctx) ?? 0
    const mx = resolveValue(max, ctx) ?? 1

    if (f === 'base36') {
      const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
      let result = ''
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const values = new Uint8Array(len)
        crypto.getRandomValues(values)
        for (let i = 0; i < len; i++) {
          result += chars[values[i] % 36]
        }
      } else {
        for (let i = 0; i < len; i++) {
          result += chars.charAt(Math.floor(Math.random() * 36))
        }
      }
      return result
    }

    // Prefer cryptographically secure random when available
    let val: number
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1)
      crypto.getRandomValues(arr)
      val = arr[0] / (0xffffffff + 1)
    } else {
      val = Math.random()
    }

    const range = mx - mn
    const result = val * range + mn

    if (f === 'integer') {
      return Math.floor(result)
    }
    return result
  },
  { docs: 'Generate Random', cost: 1 }
)

export const uuid = defineAtom(
  'uuid',
  undefined,
  s.string,
  async () => {
    // Prefer crypto.randomUUID when available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    // Fallback using crypto.getRandomValues if available
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16)
      crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0')
      ).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16
      )}-${hex.slice(16, 20)}-${hex.slice(20)}`
    }
    // Last resort fallback (insecure, for legacy environments only)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  },
  { docs: 'Generate UUID', cost: 1 }
)

export const hash = defineAtom(
  'hash',
  s.object({
    value: s.any,
    algorithm: s.string.optional, // e.g., 'SHA-256'
  }),
  s.string,
  async ({ value, algorithm }, ctx) => {
    const str = stringifyInput(ctx, resolveValue(value, ctx), 'hash')
    // The digest reads every byte, so charge for it. Flat-charged, `hash` cost 1.2 fuel for
    // 1KB and for 1MB alike.
    if (!chargeForSize(ctx, str, 'hash')) return undefined
    const algo = resolveValue(algorithm, ctx) || 'SHA-256'

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(str)
      const hashBuffer = await crypto.subtle.digest(algo, data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }

    // Fallback for environments without crypto.subtle
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return String(hash)
  },
  { docs: 'Hash a value', cost: 1 }
)

// 14. Console (logging, warnings, errors)

/*#
## console.log / console.warn / console.error

Logging utilities that integrate with trace and error flow.

```javascript
console.log("Debug info: " + value)   // Adds to trace
console.warn("Potential issue")        // Adds to trace + warnings summary
console.error("Fatal: " + msg)         // Triggers monadic error flow
```

- `log`: trace only (no side effects)
- `warn`: trace + appears in `result.warnings`
- `error`: stops execution, sets `result.error`
*/
export const consoleLog = defineAtom(
  'consoleLog',
  s.object({ message: s.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    if (ctx.trace) {
      ctx.trace.push({
        op: 'console.log',
        input: { message: msg },
        stateDiff: {},
        result: msg,
        fuelBefore: ctx.fuel.current,
        fuelAfter: ctx.fuel.current,
        timestamp: Date.now(),
      })
    }
  },
  { docs: 'Log to trace', cost: 0.1 }
)

export const consoleWarn = defineAtom(
  'consoleWarn',
  s.object({ message: s.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    const msgStr = stringifyInput(ctx, msg, 'console')
    // Add to warnings summary
    if (!ctx.warnings) ctx.warnings = []
    ctx.warnings.push(msgStr)
    // Add to trace for context
    if (ctx.trace) {
      ctx.trace.push({
        op: 'console.warn',
        input: { message: msg },
        stateDiff: {},
        result: msg,
        fuelBefore: ctx.fuel.current,
        fuelAfter: ctx.fuel.current,
        timestamp: Date.now(),
      })
    }
  },
  { docs: 'Add warning', cost: 0.1 }
)

export const consoleError = defineAtom(
  'consoleError',
  s.object({ message: s.any }),
  undefined,
  async ({ message }, ctx) => {
    const msg = resolveValue(message, ctx)
    const msgStr = stringifyInput(ctx, msg, 'console')
    ctx.error = new AgentError(msgStr, 'console.error')
  },
  { docs: 'Emit error and stop', cost: 0.1 }
)

// --- Stored Procedures ---

export const storeProcedure = defineAtom(
  'storeProcedure',
  s.object({
    ast: s.any,
    ttl: s.number.optional,
    maxSize: s.number.optional,
  }),
  s.string,
  async ({ ast, ttl, maxSize }, ctx) => {
    const resolvedAst = resolveValue(ast, ctx)
    // BOUNDARY: an AST arrives from outside and is PERSISTED here. Gating at storage rather
    // than only at execution is the point — storing an AST this build cannot run defers the
    // failure to whoever resolves the token later, which is someone who did not write it and
    // has no context for the error. Fail at the door instead.
    checkAstVersion(resolvedAst, 'storeProcedure')
    const resolvedTtl = ttl ? resolveValue(ttl, ctx) : DEFAULT_PROCEDURE_TTL
    const resolvedMaxSize = maxSize
      ? resolveValue(maxSize, ctx)
      : DEFAULT_MAX_AST_SIZE

    // Validate AST has an op
    if (!resolvedAst || typeof resolvedAst !== 'object' || !resolvedAst.op) {
      throw new Error('Invalid AST: must be an object with an "op" property')
    }

    // Check size
    const astJson = stringifyInput(ctx, resolvedAst, 'storeProcedure')
    if (astJson.length > resolvedMaxSize) {
      throw new Error(
        `AST too large: ${astJson.length} bytes exceeds limit of ${resolvedMaxSize} bytes. ` +
          `Consider reducing AST size or using a shorter TTL.`
      )
    }

    // Generate token and store
    const token = generateProcedureToken()
    const now = Date.now()
    procedureStore.set(token, {
      ast: resolvedAst,
      createdAt: now,
      expiresAt: now + resolvedTtl,
    })

    return token
  },
  { docs: 'Store an AST and return a token for later execution', cost: 1 }
)

export const releaseProcedure = defineAtom(
  'releaseProcedure',
  s.object({ token: s.string }),
  s.boolean,
  async ({ token }, ctx) => {
    const resolvedToken = resolveValue(token, ctx)
    return procedureStore.delete(resolvedToken)
  },
  { docs: 'Release a stored procedure by token', cost: 0.1 }
)

export const clearExpiredProcedures = defineAtom(
  'clearExpiredProcedures',
  undefined,
  s.number,
  async () => {
    const now = Date.now()
    let cleared = 0
    for (const [token, entry] of procedureStore) {
      if (now > entry.expiresAt) {
        procedureStore.delete(token)
        cleared++
      }
    }
    return cleared
  },
  { docs: 'Clear all expired procedures and return count', cost: 0.5 }
)

// --- Exports ---

export const coreAtoms = {
  seq,
  evaluate,
  if: iff,
  while: whileLoop,
  return: ret,
  try: tryCatch,
  Error: errorAtom,
  varSet,
  varAssign,
  constSet,
  varGet,
  varsImport,
  varsLet,
  varsExport,
  scope,
  callLocal,
  map,
  filter,
  reduce,
  find,
  push,
  len,
  split,
  join,
  template,
  regexMatch,
  pick,
  omit,
  merge,
  keys,
  httpFetch: fetch,
  storeGet,
  storeSet,
  storeQuery,
  storeQueryWhere,
  storeVectorSearch: vectorSearch,
  llmPredict,
  agentRun,
  transpileCode,
  runCode,
  jsonParse,
  jsonStringify,
  xmlParse,
  memoize,
  cache,
  random,
  uuid,
  hash,
  consoleLog,
  consoleWarn,
  consoleError,
  storeProcedure,
  releaseProcedure,
  clearExpiredProcedures,
}

/**
 * Effectful core atoms — anything that touches `ctx.capabilities`
 * (fetch/store/llm/agent/code), is nondeterministic (random/uuid), or has
 * observable side effects (console). Tagged centrally so the list reads as one
 * audit surface; a test asserts every capability-touching atom is in here.
 * Everything else defaults to `effects: 'pure'`.
 */
export const EFFECTFUL_CORE_OPS = [
  'httpFetch',
  'storeGet',
  'storeSet',
  'storeQuery',
  'storeQueryWhere',
  'storeVectorSearch',
  'llmPredict',
  'agentRun',
  'transpileCode',
  'runCode',
  'random',
  'uuid',
  'consoleLog',
  'consoleWarn',
  'consoleError',
  'storeProcedure',
  'releaseProcedure',
  'clearExpiredProcedures',
  'cache',
  'memoize',
  // Calls `ctx.capabilities.xml.parse(...)` and was tagged PURE — for two releases. The
  // consequences are not cosmetic: an untagged return skips the structuredClone membrane,
  // so a `DOMParser` result reached guest state as a LIVE HOST `Document`, prototype chain
  // and all, with `methodCall` standing right there. The predicate verifier reads the same
  // tag, so any cluster calling it was certified pure and compiled to native JS.
  //
  // `atom-effects.test.ts` could not catch it: it iterates THIS LIST, the same constant
  // that assigns the tag, so it can only prove the list agrees with itself. See
  // `atom-effects-scan.test.ts`, which reads what the bodies actually do.
  'xmlParse',
] as const

/**
 * Core atoms are classified HERE, not by `defineAtom`'s default.
 *
 * Since 0.13.6 that default is `'io'`, because the public API's callers are embedders
 * bringing host data in (#38 — see `AtomEffects`). Core atoms are the opposite population:
 * they operate on data already inside the VM, so membraning them would deep-clone values
 * that never left. This sweep restores that, and keeps the audit surface a single list of
 * 21 rather than 31 scattered `effects: 'pure'` declarations.
 *
 * Both directions are set explicitly, so a core atom's class never depends on which default
 * happens to be in force — the thing that made the old arrangement fragile.
 */
const EFFECTFUL_SET: ReadonlySet<string> = new Set(EFFECTFUL_CORE_OPS)
for (const [op, atom] of Object.entries(coreAtoms as Record<string, AtomDef>)) {
  atom.effects = EFFECTFUL_SET.has(op) ? 'io' : 'pure'
  // Every core atom resolves its own inputs (control atoms must NOT have their `steps`
  // resolved), so the VM must not resolve them a second time.
  atom.resolveInputs = false
}
