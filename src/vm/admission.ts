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
 * cap: at 8KB the worst shape known is ~250ms (at 64KB it was ~19s), and one nobody has found
 * yet shrinks the same way. The largest AJS example in this repo is ~1.1KB; stored agents and
 * RBAC rules are far smaller than 8KB. Raise it per call (`maxSourceBytes`) for trusted
 * source. The structural fix — a single-pass AJS parser whose complexity is provable, and
 * optionally a worker with a hard wall clock — is tracked in TODO.md. (Tonio, 2026-09-26.)
 */
export const DEFAULT_MAX_SOURCE_BYTES = 8 * 1024

const isBudget = (v: unknown): v is number =>
  typeof v === 'number' && !Number.isNaN(v) && v >= 0

/**
 * The reason a run's options are unusable, or null.
 *
 * Refused rather than defaulted: a caller who passed nonsense did not ask for the default.
 * `fuel: null` is refused too — only an ABSENT fuel takes the default. `Infinity` stays
 * legal everywhere a budget is a ceiling.
 */
export function validateRunOptions(
  options: Record<string, any>
): string | null {
  const scalars = [
    'fuel',
    'timeoutMs',
    'argsMaxBytes',
    'membraneMaxBytes',
    'maxHeapBytes',
    'maxSourceBytes',
  ]
  for (const name of scalars) {
    if (!(name in options) || options[name] === undefined) continue
    if (!isBudget(options[name]))
      return `Invalid run option ${name}: ${describe(
        options[name]
      )} — it must be a non-negative number`
  }
  // Per-op tables. A negative cost MINTED fuel (fuelUsed −398 at fuel 1), a NaN quota read
  // as unlimited (`used >= NaN` is never true), a NaN timeout override disabled the timeout.
  for (const table of ['costOverrides', 'timeoutOverrides', 'quotas']) {
    const t = options[table]
    if (t === undefined) continue
    if (!t || typeof t !== 'object')
      return `Invalid run option ${table}: ${describe(
        t
      )} — it must be an object of per-op values`
    for (const [op, v] of Object.entries(t)) {
      // Cost and timeout overrides may be functions of the input; their RESULT is checked
      // where it is used (the atom charge, `timerMs`), since it only exists then.
      if (typeof v === 'function' && table !== 'quotas') continue
      if (!isBudget(v))
        return `Invalid run option ${table}.${op}: ${describe(
          v
        )} — it must be a non-negative number`
    }
  }
  return null
}

/**
 * How many bytes `code` has, if that is over `max` — else null. Length FIRST: a string with
 * more UTF-16 units than `max` has at least that many UTF-8 bytes, so a huge one is refused
 * without being encoded (encoding it is itself work proportional to the caller's input).
 */
export function sourceBytesOver(code: string, max: number): number | null {
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

function describe(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}
