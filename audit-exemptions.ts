/**
 * Time-gated security-audit exemptions.
 *
 * `src/dependency-audit.test.ts` fails the suite on any **high or critical** advisory
 * reported by `bun audit` that isn't listed here with a future `until` date. Each
 * exemption is a deliberate, dated decision — "no clean fix today, and here's why it's
 * acceptable" — NOT a permanent silence:
 *
 *  - On/after `until`, the exemption lapses and the advisory fails the gate again,
 *    forcing a re-review (fix it, or renew the exemption with fresh justification).
 *  - If an exempted advisory is no longer reported (upstream shipped a fix, or the dep
 *    was removed), the gate warns that the entry is now dead and should be deleted.
 *
 * Only exempt what genuinely has no clean path today. The published package's runtime
 * deps (`acorn`/`acorn-loose`/`acorn-walk`/`tosijs-schema`) carry no advisories, so
 * everything here is dev/deploy-only tooling that never reaches a consumer's install.
 */
export interface AuditExemption {
  /** The GHSA id (from the advisory url), e.g. 'GHSA-xxxx-xxxx-xxxx'. */
  ghsa: string
  /** The npm package the advisory is against (for readability). */
  package: string
  /** Why this is acceptable today, and what the fix path is. */
  reason: string
  /** ISO date (YYYY-MM-DD). The exemption lapses ON/AFTER this date. */
  until: string
}

/**
 * EMPTY as of 2026-09-12, and that is the interesting part.
 *
 * This list held seven entries, all dated `2026-10-27`, all justified as dev/deploy-only.
 * Every one of them turned out to be FIXABLE the day it was checked:
 *
 *   flatted    x2  a published 3.4.4 was already past both affected ranges
 *   form-data  x1  2.5.6 was a PATCH within the same 2.x line
 *   undici     x4  upstream had shipped; the advisories were simply gone
 *   (also cleared without ever needing an exemption: qs x2, uuid, protobufjs x2,
 *    esbuild — the last because `^0.28.0` already permitted the fixed 0.28.2 and
 *    only the lockfile was stale)
 *
 * So the standing lesson, which the brace-expansion note below already recorded once
 * and which repeated verbatim: **an exemption's `until` date is when we agreed to look
 * again, not when a fix becomes available.** Six of these seven could have been closed
 * months earlier by anyone running `npm view <pkg> version`. Nothing was watching,
 * because a dated exemption reads as "handled" — the gate stays green, and green is
 * indistinguishable from fixed.
 *
 * Prefer an `overrides` entry (both `package.json` files carry one now, with the GHSA
 * ids and reasoning inline). An override FIXES the advisory; an exemption only agrees
 * to ignore it. Reach for an exemption when there is genuinely no published fix.
 *
 * Prior art, preserved because it is the same story: the three brace-expansion
 * advisories (GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895) were
 * dated 2026-10-27 and resolved by an override months early — and they only surfaced
 * as removable because a FOURTH advisory appeared with no exemption and failed the
 * gate. Without that accident the gate would have stayed quietly green on a fixable
 * advisory until October. That is exactly what happened again here, and the trigger was
 * again external: Dependabot being switched on.
 */
export const AUDIT_EXEMPTIONS: AuditExemption[] = []
