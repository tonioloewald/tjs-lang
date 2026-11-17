/**
 * The fetch-policy docs list exactly what the code reads (0.14.0 final review M3).
 *
 * #3991 added `allowPrivateNetwork` (`fetchPolicy.privateNetwork`), and the two pages a host reads
 * first did not mention it: safe-eval.md still said an allowlisted `127.0.0.1` "is fetched". Both
 * sides are read from the source, so a key added to either the type or the runtime fails here
 * until the page names it.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** The keys of `interface FetchPolicy` in eval.ts. */
function fetchPolicyKeys(): string[] {
  const src = read('src/lang/eval.ts')
  const body = src.slice(src.indexOf('export interface FetchPolicy {'))
  const block = body.slice(0, body.indexOf('\n}'))
  return [...block.matchAll(/^\s+(\w+)\?:/gm)].map((m) => m[1]).sort()
}

/** Every `ctx.context?.X` the VM runtime reads. */
function contextKeysRead(): string[] {
  const src = read('src/vm/runtime.ts')
  return [
    ...new Set([...src.matchAll(/context\?\.(\w+)/g)].map((m) => m[1])),
  ].sort()
}

describe('fetch policy documentation', () => {
  it('reads real keys (apparatus)', () => {
    expect(fetchPolicyKeys()).toContain('domains')
    expect(contextKeysRead()).toContain('allowedFetchDomains')
  })
  it('safe-eval.md names every FetchPolicy key', () => {
    const doc = read('guides/safe-eval.md')
    const row =
      doc.split('\n').find((l) => l.startsWith('| `fetchPolicy`')) ?? ''
    expect(fetchPolicyKeys().filter((k) => !row.includes(k))).toEqual([])
  })
  it('ajs-host.md lists every context key the VM reads', () => {
    const doc = read('guides/ajs-host.md')
    expect(
      contextKeysRead().filter((k) => !doc.includes(`| \`${k}\``))
    ).toEqual([])
  })
  it('neither page says an allowlisted loopback address is fetched', () => {
    for (const p of ['guides/safe-eval.md', 'guides/ajs-host.md'])
      expect(read(p)).not.toMatch(/\(`127\.0\.0\.1`, say\) is fetched/)
  })
})
