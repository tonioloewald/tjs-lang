/**
 * Reproduction + guard for the "`import 'tjs-lang'` crashes without the TypeScript
 * compiler" bug (snowfox production feedback).
 *
 * The main entry (`src/index.ts`) does `export * from './lang'`, which reaches
 * `src/lang/index.ts`. If that statically re-exports `fromTS`, the whole
 * TypeScript compiler (~4-10MB) is dragged into the module graph. `typescript`
 * is only a devDependency (externalized in the build), so a Node consumer who
 * runs `import 'tjs-lang'` without it installed gets
 * `Cannot find package 'typescript' imported from dist/index.js` — and it also
 * pulls TS at import time, which breaks constrained runtimes (Cloud Run).
 *
 * The fix: the TS compiler must be reachable ONLY via the explicit
 * `tjs-lang/lang/from-ts` subpath, never through the main entry. This test
 * bundles the main entry with esbuild (same externals as `scripts/build.ts`'s
 * `index` target) and asserts `typescript` never appears as an import specifier.
 */
import { describe, it, expect } from 'bun:test'
import { buildSync } from 'esbuild'

const HERE = import.meta.dir

/** All static + dynamic import specifiers in a bundle (bare, relative, or URL). */
function importSpecifiers(src: string): string[] {
  const found: string[] = []
  for (const m of src.matchAll(
    /(?:^|[;\n}])import\s*(?:[^"';]*?from)?\s*["']([^"']+)["']/g
  ))
    found.push(m[1])
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g))
    found.push(m[1])
  return [...new Set(found)]
}

describe("import 'tjs-lang' must not pull in the TypeScript compiler", () => {
  it('main entry bundle has no static `typescript` import', () => {
    // Mirror scripts/build.ts's `index` target externals. `typescript` is
    // externalized there, so if the main entry reaches it, esbuild leaves a
    // bare `import "typescript"` in the output — which is exactly the crash.
    const out = buildSync({
      entryPoints: [`${HERE}/index.ts`],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
      external: [
        'acorn',
        'tosijs-schema',
        'typescript',
        'node:readline',
        'node:fs',
        'node:path',
      ],
    }).outputFiles[0].text

    expect(importSpecifiers(out)).not.toContain('typescript')
  })
})
