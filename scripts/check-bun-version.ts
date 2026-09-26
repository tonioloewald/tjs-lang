/**
 * Refuse to build with a Bun other than the one in `.bun-version`.
 *
 * This repo COMMITS build output (`editors/**`, which `editors-build.test.ts` holds
 * byte-identical to a fresh bundle), and the publish workflow requires a CI build to reproduce
 * every shipped tracked file exactly. Bun's bundler output differs between versions — 1.4.0
 * and 1.4.2 built different bytes from one lockfile in tosijs-ui — so a local build with a
 * different Bun would commit output CI cannot reproduce, and the publish would fail at the
 * last step. Failing here moves that to the desk (practices/publishing-via-oidc.md).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const want = readFileSync(
  join(import.meta.dir, '..', '.bun-version'),
  'utf8'
).trim()
if (Bun.version !== want) {
  console.error(
    `🛑 Bun ${Bun.version} is not the pinned ${want} (.bun-version). Build output is committed ` +
      `and must reproduce in CI byte for byte. Install it: bun upgrade --version ${want}` +
      ` (or change .bun-version deliberately, rebuild, and commit the result).`
  )
  process.exit(1)
}
