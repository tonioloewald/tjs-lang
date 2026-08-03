/**
 * Surfacing transpile warnings in the CLI.
 *
 * The release's flagship diagnostic — "this annotation degraded to `any`, here is how to
 * get the safety back" — was invisible in `tjs check`, the command CI and coding agents
 * actually run. `check` printed `✓ file` and `f(user: any) -> void` with no hint that a
 * type had been dropped, while `tjs run` on the identical file printed the full remedy.
 * `tjs emit` was silent too, and `tjs convert` only showed them behind `--verbose`.
 * `git log v0.12.0..HEAD -- src/cli/` was EMPTY: the CLI was never taught about warnings.
 *
 * That directly undercuts this release's own measured finding — that a shown remedy gets
 * repaired ~80% of the time while a bare diagnostic gets repaired 0% — because the remedy
 * was not being shown at the moment it matters.
 *
 * Warnings go to STDERR so `tjs emit file.tjs > out.js` still produces clean output.
 */

/** Print transpile warnings to stderr. Returns how many were printed. */
export function reportWarnings(
  file: string,
  warnings: string[] | undefined
): number {
  if (!warnings?.length) return 0
  for (const w of warnings) {
    // Multi-line remedies are already formatted; indent continuation lines so a
    // warning reads as one block rather than as several unrelated messages.
    const [first, ...rest] = w.split('\n')
    console.error(`⚠ ${file}: ${first}`)
    for (const line of rest) console.error(`  ${line}`)
  }
  return warnings.length
}

/**
 * Apply `--max-warnings N`: exit non-zero when the count exceeds the budget.
 *
 * Lets CI fail on degradation without making every warning fatal — the same shape as
 * eslint's flag, and the reason a project can adopt the checks incrementally.
 */
export function enforceMaxWarnings(
  count: number,
  max: number | undefined
): void {
  if (max === undefined || count <= max) return
  console.error(
    `\n✗ ${count} warning${
      count === 1 ? '' : 's'
    } exceeds --max-warnings ${max}`
  )
  process.exit(1)
}
