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

export const AUDIT_EXEMPTIONS: AuditExemption[] = [
  // --- eslint tooling chain (dev-only; not in any shipped bundle) --------------
  {
    ghsa: 'GHSA-3jxr-9vmj-r5cp',
    package: 'brace-expansion',
    reason:
      'DoS via {} expansion. Transitive under eslint/typescript-eslint → minimatch → brace-expansion. Dev lint tooling only, never bundled or shipped. Waiting on an eslint/minimatch release that pulls the patched brace-expansion.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-mh99-v99m-4gvg',
    package: 'brace-expansion',
    reason:
      'Second brace-expansion DoS advisory; same dev-only eslint chain as above.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-25h7-pfq9-p65f',
    package: 'flatted',
    reason:
      'Unbounded-recursion DoS in flatted parse(). Transitive under eslint → file-entry-cache → flat-cache → flatted (the lint result cache). Dev-only; input is our own cache file, not attacker-controlled.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-rf6f-7fwh-wjgh',
    package: 'flatted',
    reason:
      'Prototype-pollution in flatted parse(); same dev-only eslint-cache chain as above.',
    until: '2026-10-27',
  },

  // --- firebase deploy chain (dev/deploy-only; not in the npm package) ---------
  {
    ghsa: 'GHSA-hmw2-7cc7-3qxx',
    package: 'form-data',
    reason:
      'CRLF injection in form-data. Transitive under firebase-admin → @google-cloud/storage → retry-request → @types/request → form-data. Used only by `bun run deploy` tooling, not shipped. Waiting on a firebase-admin dependency bump.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-f269-vfmq-vjvj',
    package: 'undici',
    reason:
      'WebSocket 64-bit length overflow. Transitive under firebase → @firebase/storage → undici. Deploy-only; we do not open undici WebSockets. Waiting on a firebase dependency bump.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-vrm6-8vpv-qv8q',
    package: 'undici',
    reason:
      'undici permessage-deflate memory DoS; same deploy-only firebase chain as above.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-v9p9-hfj2-hcw8',
    package: 'undici',
    reason:
      'undici server_max_window_bits validation; same deploy-only firebase chain as above.',
    until: '2026-10-27',
  },
  {
    ghsa: 'GHSA-vxpw-j846-p89q',
    package: 'undici',
    reason:
      'undici WebSocket fragment-count DoS; same deploy-only firebase chain as above.',
    until: '2026-10-27',
  },
]
