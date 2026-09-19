/**
 * The AJS AST format version — one constant, and the rule for reading it.
 *
 * ## Why this exists before anything needs it
 *
 * An AST is a **persisted artifact**, not just an intermediate value. `procedureStore` maps
 * `proc_…` tokens to stored ASTs, and any consumer serialising an agent has them on disk or in
 * a database. So the format has the property that makes versioning urgent rather than tidy:
 * data written today is read by code written later.
 *
 * Adding the field costs a few lines now. It stops being cheap the moment ASTs are persisted
 * at scale, because a retrofit can only say "absent means 1" — which is exactly the ambiguity
 * a version field exists to prevent, and it is permanent.
 *
 * ## What this does and does not achieve
 *
 * It does **not** eliminate unversioned ASTs: ones already persisted have no field and must
 * keep working, so {@link astVersionOf} treats absent as {@link AST_VERSION_LEGACY}. What it
 * achieves is that **the population of unversioned ASTs stops growing.** It becomes a finite,
 * shrinking set with a known upper bound in time, rather than an unbounded one. That is the
 * whole win, and it is only available before the format is widely stored.
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
