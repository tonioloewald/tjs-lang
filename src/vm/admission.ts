import type { Capabilities, CostOverride, TimeoutOverride } from './runtime'

/**
 * ADMISSION — the one place caller-sized input and caller-set budgets are checked, before any
 * work proportional to them is done.
 *
 * The 0.14.0 release cycle blocked five times on one class of defect: work proportional to
 * caller-controlled input, done before any budget could stop it. Eval's spliced context
 * keys; the name scan run before the size gate; the argument walk before fuel; a `NaN` fuel
 * that made the argument budget untrippable; `vm.run(source)` transpiling with no cap; and a
 * quadratic pass behind every cap. Each fix guarded one door. This module is the funnel the
 * doors share (docs/reviews/0.14.0-final-rereview-4.md, "the missing structural phase"):
 *
 * - {@link validateRunOptions}: every budget a run is computed from is a real number.
 * - {@link sourceBytesOver}: the length-first source measure every source entry uses.
 * - {@link timerMs}: the one reading of a timeout, so `NaN` never silently disables one.
 * - {@link budgetOption}: the one reading of any other budget option (predicate fuel, …).
 * - {@link guestSourceCap}: the cap on guest-built source, which a run option can only lower.
 *
 * Its consumers — `vm.run`, `Eval`, `SafeFunction`, `runCode`, `transpileCode`, and every
 * atom charge — are enumerated by `src/admission.test.ts`, which runs each hostile shape
 * through each entry and asserts the refusal is CHEAP. A new entry path belongs in that
 * table, or it is a door with no funnel.
 */

/** `setTimeout` clamps anything above this to 1ms: an `Infinity` timeout fired at once. */
export const MAX_TIMER_MS = 2 ** 31 - 1

/**
 * Default source cap for every entry that transpiles caller-supplied text: 8KB.
 *
 * This cap IS the bound on pre-budget parse work for untrusted AJS, and says so. Nine
 * release-review rounds (0.14.0 final re-reviews 1-9) each found another shape the
 * preprocessor or acorn handles super-linearly — nested destructuring (19s at 60KB), a
 * `function` head followed by whitespace (2.9s: regex backtracking), brace nesting in acorn,
 * uncharged regex scans. Patching them one at a time did not converge, and a work meter
 * cannot see regex-engine or acorn work. A quadratic cost shrinks with the SQUARE of the
 * cap: at 8KB the worst shape known is ~455ms, densely nested destructuring (at 64KB it was ~19s), and one nobody has found
 * yet shrinks the same way. The largest AJS example in this repo is ~1.1KB; stored agents and
 * RBAC rules are far smaller than 8KB. Raise it per call (`maxSourceBytes`) for trusted
 * source. The structural fix — a single-pass AJS parser whose complexity is provable, and
 * optionally a worker with a hard wall clock — is tracked in TODO.md. (Tonio, 2026-09-26.)
 */
export const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024

const isBudget = (v: unknown): v is number =>
  typeof v === 'number' && !Number.isNaN(v) && v >= 0

/** The options `vm.run` accepts. Declared here, beside {@link RUN_OPTION_KINDS}, so the two
 * cannot be edited apart. */
export interface RunOptions {
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
  argsMaxBytes?: number // Ceiling on the run ARGUMENTS crossing into guest state (default DEFAULT_ARGS_MAX_BYTES); the run's fuel bounds it too — see ARG_BYTES_PER_FUEL
  maxSourceBytes?: number // Ceiling on SOURCE passed as a string (default DEFAULT_MAX_SOURCE_BYTES; 0/Infinity disable — trusted source only). For guest-built source (runCode/transpileCode) it can only LOWER the cap — see guestSourceCap
  maxHeapBytes?: number // Ceiling on bytes held live in guest scope (default 64MB). Fuel bounds work; this bounds peak memory.
}

/**
 * How each run option is validated — EVERY option, not a list of the ones someone thought
 * were budgets.
 *
 * The 0.14.0 cycle blocked four re-reviews running on a budget that failed open because it
 * was not on a list: `Eval`'s cap, `transpile`'s cap, predicate fuel, then `quotaUsed` — a
 * counter compared against a quota, where `NaN >= 3` is false and `-100` granted a hundred
 * extra calls (re-review 13). A list of budget NAMES is closed; the set of options is not. So
 * this is keyed by `keyof RunOptions`: adding an option without saying what it is fails to
 * COMPILE, and the only way to leave one unvalidated is to write `'opaque'` next to it.
 *
 * - `budget`: a non-negative number (`Infinity` = no limit).
 * - `budgetTable`: an object of per-op budgets (a function value is checked where it is called).
 * - `counterTable`: an object of per-op COUNTS — finite, non-negative. A counter of Infinity
 *   is not "no limit", it is a corrupted count.
 * - `opaque`: not a number the run compares against anything (capabilities, a signal, …).
 */
type OptionKind = 'budget' | 'budgetTable' | 'counterTable' | 'opaque'
export const RUN_OPTION_KINDS: {
  readonly [K in keyof Required<RunOptions>]: OptionKind
} = {
  fuel: 'budget',
  timeoutMs: 'budget',
  argsMaxBytes: 'budget',
  membraneMaxBytes: 'budget',
  maxHeapBytes: 'budget',
  maxSourceBytes: 'budget',
  costOverrides: 'budgetTable',
  timeoutOverrides: 'budgetTable',
  quotas: 'budgetTable',
  quotaUsed: 'counterTable',
  capabilities: 'opaque',
  trace: 'opaque',
  signal: 'opaque',
  context: 'opaque',
}

/**
 * The reason a run's options are unusable, or null.
 *
 * Refused rather than defaulted: a caller who passed nonsense did not ask for the default.
 * `fuel: null` is refused too — only an ABSENT option takes the default. `Infinity` stays
 * legal everywhere a budget is a ceiling.
 */
export function validateRunOptions(
  options: Record<string, any>
): string | null {
  for (const [name, kind] of Object.entries(RUN_OPTION_KINDS)) {
    if (kind === 'opaque') continue
    const v = options[name]
    if (v === undefined) continue
    if (kind === 'budget') {
      if (!isBudget(v))
        return `Invalid run option ${name}: ${describe(
          v
        )} — it must be a non-negative number`
      continue
    }
    const entries = tableEntries(v)
    if (typeof entries === 'string')
      return `Invalid run option ${name}: ${entries}`
    for (const [op, x] of entries) {
      // Cost and timeout overrides may be functions of the input; their RESULT is checked
      // where it is used (the atom charge, `timerMs`), since it only exists then.
      if (
        kind === 'budgetTable' &&
        typeof x === 'function' &&
        name !== 'quotas'
      )
        continue
      const ok =
        kind === 'counterTable'
          ? isBudget(x) && Number.isFinite(x)
          : isBudget(x)
      if (!ok)
        return `Invalid run option ${name}.${op}: ${describe(
          x
        )} — it must be a ${
          kind === 'counterTable' ? 'finite ' : ''
        }non-negative number`
    }
  }
  return null
}

/**
 * A table's entries — EXACTLY the set an `[op]` read of it can resolve — or why it has none.
 *
 * The check must walk the set the read resolves (re-review 14). `Object.entries` walks own
 * ENUMERABLE keys, while `table[op]` also reaches inherited keys, non-enumerable ones and
 * getters. So `quotas: new Map(...)`, `Object.create({ ping: NaN })`, a non-enumerable
 * `ping: NaN` and a getter all passed admission and switched the quota off. So: a PLAIN
 * object (prototype `Object.prototype` or `null`), every own key (`Reflect.ownKeys`), string
 * keys only, data properties only — an accessor is host code, refused as the membrane refuses
 * it. Anything the runtime then reads comes from {@link snapshotTable}, not from the caller's
 * object, so it cannot change after this check.
 */
function tableEntries(v: unknown): Array<[string, unknown]> | string {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    return `${describe(v)} — it must be an object of per-op values`
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null)
    return `it must be a plain object (a Map or class instance is read differently than it is checked)`
  const out: Array<[string, unknown]> = []
  for (const key of Reflect.ownKeys(v)) {
    if (typeof key === 'symbol') return `symbol keys are not per-op values`
    const d = Object.getOwnPropertyDescriptor(v, key)!
    if (!('value' in d))
      return `'${key}' is an accessor — per-op values must be data, not getters`
    out.push([key, d.value])
  }
  return out
}

/**
 * The table the runtime READS: a frozen, null-prototype copy of a validated one. Frozen so a
 * value cannot change after admission; null-prototype so `table.toString` is `undefined`
 * rather than a function a custom atom named `toString` would have been charged by.
 */
export function snapshotTable<T>(
  table: Record<string, T> | undefined
): Readonly<Record<string, T>> | undefined {
  if (table === undefined) return undefined
  const out: Record<string, T> = Object.create(null)
  for (const key of Reflect.ownKeys(table) as string[])
    out[key] = Object.getOwnPropertyDescriptor(table, key)!.value
  return Object.freeze(out)
}

/**
 * How many times `op` has run, read from the SHARED counter at the moment of use.
 *
 * `quotaUsed` cannot be snapshotted: it is shared across nested runs by design, so it is
 * written to during a run and may be written by a capability or a sibling run too. So every
 * read is checked here, against exactly what the read sees — an own data property, a finite
 * non-negative count — and anything else refuses the step (re-review 14).
 */
export function quotaCount(table: Record<string, number>, op: string): number {
  const d = Object.getOwnPropertyDescriptor(table, op)
  if (!d) return 0
  if (!('value' in d))
    throw new Error(
      `Invalid quotaUsed.${op}: an accessor — counts must be data`
    )
  const v = d.value
  if (!(isBudget(v) && Number.isFinite(v)))
    throw new Error(
      `Invalid quotaUsed.${op}: ${describe(
        v
      )} — it must be a finite non-negative number`
    )
  return v
}

/**
 * A budget that may instead be a FUNCTION of the call (an atom's `timeoutMs`): a function
 * passes through — its RESULT is checked where it is called, by `timerMs` — and anything
 * else goes through {@link budgetOption}.
 */
export function budgetOrFunction(
  name: string,
  value: unknown,
  fallback: number
): number | ((...args: any[]) => unknown) {
  return typeof value === 'function'
    ? (value as (...args: any[]) => unknown)
    : budgetOption(name, value, fallback)
}

/**
 * How many bytes `code` has, if that is over `max` — else null. Length FIRST: a string with
 * more UTF-16 units than `max` has at least that many UTF-8 bytes, so a huge one is refused
 * without being encoded (encoding it is itself work proportional to the caller's input).
 */
export function sourceBytesOver(code: string, max: number): number | null {
  // The cap is VALIDATED HERE, in the funnel, not at each caller. `x > NaN` is never true, so
  // a NaN cap admitted everything — fixed once in Eval's local check, then reintroduced by the
  // next caller written (`transpile`'s opt-in cap, re-review 11). A caller cannot skip a check
  // that lives in the only measure there is.
  if (!isBudget(max))
    throw new Error(
      `Invalid maxSourceBytes: ${describe(
        max
      )} — it must be a non-negative number (0 or Infinity disables the cap)`
    )
  // 0 disables, everywhere (Eval documented it; vm.run read 0 as "refuse all" — re-review 5).
  if (max === Infinity || max === 0) return null
  if (code.length > max) return code.length
  const bytes = new TextEncoder().encode(code).length
  return bytes > max ? bytes : null
}

/**
 * The delay to arm a timer with, or undefined for none. `0` disables (documented), and so
 * does `Infinity`; a finite value is clamped to what `setTimeout` can represent. Anything
 * that is not a non-negative number is refused — returning a number here would silently
 * disable the timeout (`NaN > 0` is false), which is the failure this exists to prevent.
 */
export function timerMs(ms: unknown): number | undefined {
  if (!isBudget(ms)) throw new Error(`Invalid timeout: ${describe(ms)}`)
  if (ms === 0 || ms === Infinity) return undefined
  return Math.min(ms, MAX_TIMER_MS)
}

/** A cost as charged: a non-negative number, or an error — never a mint. */
export function checkedCost(cost: unknown, op: string): number {
  if (!isBudget(cost))
    throw new Error(
      `Invalid fuel cost for '${op}': ${describe(
        cost
      )} — a cost must be a non-negative number`
    )
  return cost
}

/**
 * A budget option's value: the fallback when ABSENT, the value when it is a non-negative
 * number, and a thrown error otherwise. THE way to read a budget-shaped option outside a
 * run (a run reads its options through {@link validateRunOptions} first).
 *
 * Every budget is compared against a counter, and every comparison with `NaN` is false — so
 * a `NaN` budget is not a small or large budget, it is NO budget: `--fuel < 0` never trips,
 * `bytes > NaN` never refuses. The 0.14.0 cycle blocked on that shape three times running
 * (`Eval`'s cap, `transpile`'s cap, the predicate compiler's fuel), each time one directory
 * over from the last fix. `src/budget-funnel.test.ts` now PARSES the source and fails on any
 * budget-named option read that does not reach a funnel, so the next site is found by a test
 * rather than by a review.
 *
 * `null` is refused: only an absent option takes the default. `Infinity` is legal — a ceiling
 * of Infinity is an explicit "no limit", not an accident.
 */
export function budgetOption(
  name: string,
  value: unknown,
  fallback: number
): number {
  if (value === undefined) return fallback
  if (!isBudget(value))
    throw new Error(
      `Invalid ${name}: ${describe(value)} — it must be a non-negative number`
    )
  return value
}

/**
 * The cap on source a GUEST builds and hands to `runCode`/`transpileCode`.
 *
 * Two trust domains share one run option. `maxSourceBytes` exists so a host can run a large
 * agent it TRUSTS; text the guest assembles at run time can come from `llmPredict` output or
 * run arguments, which it does not. So the run's option may only LOWER the guest cap, never
 * raise or disable it: disabling it (re-review 11) or raising it to 64KB (re-review 12, ~19s
 * of pre-fuel parse on the worst known shape) would uncap exactly the input the cap exists
 * for. A host that genuinely wants guest-built source larger than 8KB should transpile it
 * outside the run and hand the VM an AST.
 */
export function guestSourceCap(runMax: number | undefined): number {
  const max = budgetOption('maxSourceBytes', runMax, DEFAULT_MAX_SOURCE_BYTES)
  return max > 0 && max < DEFAULT_MAX_SOURCE_BYTES
    ? max
    : DEFAULT_MAX_SOURCE_BYTES
}

function describe(v: unknown): string {
  // JSON renders NaN and ±Infinity as `null`, which named the wrong value in every refusal.
  if (typeof v === 'number') return String(v)
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}
