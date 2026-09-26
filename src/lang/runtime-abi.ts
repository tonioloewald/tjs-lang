/**
 * The CONTRACT between emitted code and an installed `globalThis.__tjs` — not the release.
 * Emitted code uses a global runtime only when its `abi` is at least the one it was compiled
 * against, and falls back to its inline runtime otherwise. Bump it when a helper emitted code
 * calls changes meaning.
 *
 * 2 (0.14.0): `typeError(path, expected, value, reason, root)` propagates a MonadicError
 * `root` or `value`; the per-parameter "return any Error" pre-check was removed from emitted
 * code. A 0.13 runtime ignores `root`, so 0.14 code running under it replaced the caller's
 * error with a new "got object" one (0.14.0 final review, m-6).
 */
export const RUNTIME_ABI = 2
