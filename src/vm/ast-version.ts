/**
 * The AJS AST format version — one constant, and the rule for reading it.
 *
 * ## Why this exists before anything needs it
 *
 * An AST is a **persisted artifact**, not just an intermediate value. `procedureStore` maps
 * `proc_…` tokens to stored ASTs, and any consumer serialising an agent has them on disk or in
 * a database. Data written today is read by code written later, which is the property that
 * makes versioning worth doing at all.
 *
 * ## The deadline is the first FORMAT CHANGE, not the first stored AST
 *
 * An earlier version of this note claimed a retrofit "can only say absent means 1 — exactly
 * the ambiguity a version field exists to prevent". **That was wrong, and the correction is
 * worth keeping**, because it is the thing that decides when this becomes expensive.
 *
 * "Absent means 1" is a *total, unambiguous rule*. It maps every AST to exactly one version
 * and it is no worse than an explicit field. Adding the field late is fine — **provided the
 * format has not changed in the meantime.**
 *
 * The real hazard is narrow and specific: ship a v2 format *without* having introduced the
 * field, and ASTs written under v2 also lack it. Only then does absent become genuinely
 * ambiguous — v1 or v2, unknowable — and only then is it permanent.
 *
 * So the window is "before the format first changes", and this landed comfortably inside it.
 * The field is cheap insurance bought early rather than a catastrophe narrowly averted.
 *
 * ## What this does and does not achieve
 *
 * It does **not** eliminate unversioned ASTs: ones already persisted have no field and must
 * keep working, so {@link astVersionOf} treats absent as {@link AST_VERSION_LEGACY} — soundly,
 * per the rule above. What it achieves is that **the population of unversioned ASTs stops
 * growing**, and that every AST from here on can be *refused* by a future reader that does not
 * understand it. An unversioned AST can never be refused as too new, because absent means 1 —
 * which is correct, since it is old by construction.
 *
 * That "stops growing" claim is only as good as the weakest **producer**, and it is all-or-
 * nothing: one producer that omits the field and the population grows again. There are two —
 * the transpiler (`lang/emitters/ast.ts`) and the builder (`TypedBuilder.toJSON()`) — and the
 * 0.14.0 review found the second one unstamped. `ast-version-producers.test.ts` now scans for
 * a third. The producer side and the consumer side are the same invariant seen from opposite
 * ends: stamp on the way out ({@link AST_VERSION_KEY}), refuse on the way in
 * ({@link checkAstVersion}).
 *
 * ## The rule, and why rejection matters
 *
 * A version this build does not understand is **rejected, not executed**. That is the entire
 * point: a field nobody acts on is decoration. A future AST may use ops, or op semantics, this
 * interpreter does not have — running it anyway means guessing at the meaning of untrusted
 * code, which is the one thing a sandbox must never do.
 *
 * Forward compatibility is therefore explicit: bump {@link AST_VERSION} when the format
 * changes in a way an older reader would misinterpret, and older builds will refuse rather
 * than silently misread.
 *
 * Planned for the Rust → wasm VM (`docs/ajs-native-vm.md`, "Constraints on 1.0"), where a
 * second implementation reading the same ASTs makes the version load-bearing rather than
 * merely prudent.
 */

/** Current AJS AST format version, written into the root of every AST we emit. */
export const AST_VERSION = 1

/**
 * The version assumed for an AST with no `$ajs` field.
 *
 * Only ASTs emitted before versioning existed can be in this state. New ones always carry the
 * field, so this is a compatibility floor rather than a default.
 */
export const AST_VERSION_LEGACY = 1

/** The root field carrying the format version. */
export const AST_VERSION_KEY = '$ajs'

/** Read the format version of an AST root, treating an absent field as legacy. */
export function astVersionOf(ast: unknown): number {
  const raw = (ast as Record<string, unknown> | null | undefined)?.[
    AST_VERSION_KEY
  ]
  return typeof raw === 'number' ? raw : AST_VERSION_LEGACY
}

/**
 * Explain why an AST cannot be run by this build, or `null` if it can.
 *
 * Returns a message rather than throwing so callers choose their own failure mode — the VM
 * wraps it in an `AgentError`, a validator might collect it.
 */
export function astVersionProblem(ast: unknown): string | null {
  const version = astVersionOf(ast)
  if (version === AST_VERSION) return null
  if (version < AST_VERSION) return null // older formats stay readable
  return (
    `This AST declares format version ${version}, but this build of tjs-lang understands ` +
    `at most ${AST_VERSION}. Refusing to run it rather than guess at ops it may use that ` +
    `this interpreter does not implement. Upgrade tjs-lang, or re-transpile the source ` +
    `with this version.`
  )
}

/**
 * Accept an AST at a system boundary — the ONE place the version gate is applied.
 *
 * ## Why this exists rather than a check at each call site
 *
 * The 0.14.0 review found the gate consulted only in `AgentVM.run()`, while **two other paths
 * accept an AST from outside and never reach it**: `agentRun` resolves a procedure token and
 * hands the result straight to the `seq` atom, and `storeProcedure` takes `ast: s.any` and
 * persists it. The second is the worse one — it stores an AST that may not be runnable, so the
 * failure surfaces later, somewhere else, to someone who did not write it.
 *
 * A version gate behind one of three doors is not a gate. And the general defect is not "two
 * call sites were missed" — it is that **nothing made the set of doors enumerable**, so the
 * next door is missed too. `checkAstVersion` is that enumerable point: every boundary calls
 * it, and `ast-version-boundaries.test.ts` PARSES this package to assert no boundary skips it.
 *
 * Boundaries are where an AST **arrives from outside**, not where nodes are evaluated. Gating
 * per-node would charge the check on every step of every run to catch something that can only
 * be wrong once, at the edge.
 */
export function checkAstVersion(ast: unknown, where: string): void {
  const problem = astVersionProblem(ast)
  if (problem) throw new Error(`${where}: ${problem}`)
}
