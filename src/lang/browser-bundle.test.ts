/**
 * Guards the browser bundles' defining property: they must be **self-contained**
 * (no bare/node imports) so a single `import('https://cdn/.../tjs-browser.js')`
 * works on any CDN with zero import-map/config. Builds in-test with esbuild, so
 * it doesn't depend on `dist/` existing.
 *
 * CDN reality (verified in a real headless browser, 2026-06): the self-contained
 * TJS/AJS bundle loads from ANY CDN; for the TypeScript path, the compiler is
 * lazy-loaded and **esm.sh is the only CDN that reliably serves `typescript`**
 * (jsDelivr `+esm` / esm.run time out on its ~10MB CJS; skypack is dead).
 */
import { describe, it, expect } from 'bun:test'
import { buildSync } from 'esbuild'
import { DEFAULT_TYPESCRIPT_URL } from './browser-from-ts'

const HERE = import.meta.dir

function bundle(entry: string, alias?: Record<string, string>): string {
  const r = buildSync({
    entryPoints: [`${HERE}/${entry}`],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    external: [],
    alias,
  })
  return r.outputFiles[0].text
}

/** Bare (non-relative, non-URL) static + dynamic import specifiers. */
function bareImports(src: string): string[] {
  const found: string[] = []
  for (const m of src.matchAll(
    /(?:^|[;\n}])import\s*(?:[^"';]*?from)?\s*["']([^"']+)["']/g
  ))
    found.push(m[1])
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g))
    found.push(m[1])
  return [...new Set(found)].filter(
    (s) => !s.startsWith('.') && !s.startsWith('http')
  )
}

describe('browser bundles are self-contained (CDN drop-in)', () => {
  it('tjs-browser inlines all deps — no bare/node imports', () => {
    const out = bundle('browser.ts')
    // bareImports([]) already implies no `node:` imports (they'd be bare too);
    // a raw `out.includes('node:')` would false-positive on `{node: ...}` props.
    expect(bareImports(out)).toEqual([])
    // sanity: acorn really got inlined (parser internals present)
    expect(out.length).toBeGreaterThan(100_000)
  })

  it('tjs-browser-from-ts: no bare imports, TS lazy (not inlined)', () => {
    const out = bundle('browser-from-ts.ts', {
      typescript: `${HERE}/ts-cdn-shim.ts`,
    })
    expect(bareImports(out)).toEqual([])
    // typescript must NOT be bundled in (it's ~10MB) — the shim swaps it out
    expect(out.length).toBeLessThan(300_000)
    // the only runtime dependency is the configurable compiler URL
    expect(out).toContain('esm.sh/typescript')
  })

  it('default TypeScript CDN is esm.sh (the only one that serves it reliably)', () => {
    expect(DEFAULT_TYPESCRIPT_URL).toBe('https://esm.sh/typescript@5')
  })
})
