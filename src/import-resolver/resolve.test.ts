/**
 * Routing-core tests for tjs-lang/import-resolver (#20).
 *
 * This logic previously lived in THREE diverged, mostly-untested copies
 * (demo/src/imports.ts, demo/src/tfs-worker.js, bin/dev.ts) — the SW routing
 * (parseTfsPath/buildCdnUrl) had NO tests at all. The extractImports/
 * rewriteImports cases are migrated from demo/src/imports.test.ts; everything
 * else is new coverage of the now-canonical resolver.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseTfsPath,
  buildCdnUrl,
  extractImports,
  rewriteImports,
  rewriteEsmShBody,
  serializeConfig,
  parseConfig,
  DEFAULT_CONFIG,
  JSDELIVR,
  ESM_SH,
} from './resolve'

describe('parseTfsPath', () => {
  it('parses bare, versioned, and subpath specs', () => {
    expect(parseTfsPath('tosijs')).toEqual({
      name: 'tosijs',
      version: '',
      subpath: '',
    })
    expect(parseTfsPath('tosijs@1.3.11')).toEqual({
      name: 'tosijs',
      version: '1.3.11',
      subpath: '',
    })
    expect(parseTfsPath('tosijs@1.3.11/utils')).toEqual({
      name: 'tosijs',
      version: '1.3.11',
      subpath: '/utils',
    })
    expect(parseTfsPath('lodash-es/debounce')).toEqual({
      name: 'lodash-es',
      version: '',
      subpath: '/debounce',
    })
  })

  it('parses scoped packages', () => {
    expect(parseTfsPath('@scope/pkg')).toEqual({
      name: '@scope/pkg',
      version: '',
      subpath: '',
    })
    expect(parseTfsPath('@scope/pkg@1.0.0/sub')).toEqual({
      name: '@scope/pkg',
      version: '1.0.0',
      subpath: '/sub',
    })
  })

  it('rejects malformed scoped specs', () => {
    expect(parseTfsPath('@')).toBeNull()
    expect(parseTfsPath('@scope')).toBeNull()
  })
})

describe('buildCdnUrl', () => {
  it('defaults to JSDelivr /+esm with @latest', () => {
    expect(buildCdnUrl('tosijs', '', '')).toBe(`${JSDELIVR}/tosijs@latest/+esm`)
    expect(buildCdnUrl('tosijs', '1.6.1', '')).toBe(
      `${JSDELIVR}/tosijs@1.6.1/+esm`
    )
    expect(buildCdnUrl('lodash-es', '', '/get')).toBe(
      `${JSDELIVR}/lodash-es@latest/get/+esm`
    )
  })

  it('routes the esm.sh allowlist (peer-dep dedup) to esm.sh', () => {
    expect(buildCdnUrl('react', '', '')).toBe(`${ESM_SH}/react`)
    expect(buildCdnUrl('react', '18', '')).toBe(`${ESM_SH}/react@18`)
    expect(buildCdnUrl('react-dom', '', '/client')).toBe(
      `${ESM_SH}/react-dom/client`
    )
  })

  it('honors all four explicit CDN hints', () => {
    expect(buildCdnUrl('jsdelivr', '', '/tosijs@1.6')).toBe(
      `${JSDELIVR}/tosijs@1.6/+esm`
    )
    expect(buildCdnUrl('esmsh', '', '/react@18')).toBe(`${ESM_SH}/react@18`)
    expect(buildCdnUrl('unpkg', '', '/preact')).toBe(
      'https://unpkg.com/preact?module'
    )
    expect(buildCdnUrl('github', '', '/user/repo@v1/dist/index.js')).toBe(
      `${ESM_SH}/gh/user/repo@v1/dist/index.js`
    )
  })

  it('respects a custom config (allowlist + default CDN)', () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      esmShPackages: ['preact'],
      defaultCdn: 'esmsh',
    }
    expect(buildCdnUrl('preact', '', '', cfg)).toBe(`${ESM_SH}/preact`)
    // react is NOT in this config's allowlist; default routing (esmsh) applies
    expect(buildCdnUrl('react', '', '', cfg)).toBe(`${ESM_SH}/react`)
    expect(buildCdnUrl('tosijs', '1.0.0', '', cfg)).toBe(
      `${ESM_SH}/tosijs@1.0.0`
    )
  })
})

describe('extractImports (migrated from demo/src/imports.test.ts)', () => {
  it('extracts named and default imports', () => {
    expect(extractImports(`import { foo } from 'pkg'`)).toEqual(['pkg'])
    expect(extractImports(`import React from 'react'`)).toEqual(['react'])
  })

  it('ignores relative imports', () => {
    expect(
      extractImports(`import { a } from './local'\nimport { b } from 'pkg'`)
    ).toEqual(['pkg'])
  })

  it('handles versioned specifiers and deduplicates', () => {
    expect(extractImports(`import { x } from 'tosijs@1.3.11'`)).toEqual([
      'tosijs@1.3.11',
    ])
    expect(
      extractImports(`import { a } from 'pkg'\nimport { b } from 'pkg'`)
    ).toEqual(['pkg'])
  })
})

describe('rewriteImports (migrated + prefix-parametrized)', () => {
  it('rewrites bare specifiers to the default /tfs/ prefix', () => {
    expect(rewriteImports(`import { foo } from 'tosijs'`)).toBe(
      `import { foo } from '/tfs/tosijs'`
    )
    expect(rewriteImports(`import { x } from 'tosijs@1.3.11'`)).toBe(
      `import { x } from '/tfs/tosijs@1.3.11'`
    )
    expect(
      rewriteImports(`import { debounce } from 'lodash-es/debounce'`)
    ).toBe(`import { debounce } from '/tfs/lodash-es/debounce'`)
    expect(
      rewriteImports(`import { createRoot } from 'react-dom/client'`)
    ).toBe(`import { createRoot } from '/tfs/react-dom/client'`)
    expect(rewriteImports(`import { x } from '@scope/pkg@1.0.0/sub'`)).toBe(
      `import { x } from '/tfs/@scope/pkg@1.0.0/sub'`
    )
    expect(rewriteImports(`export { foo } from 'pkg'`)).toBe(
      `export { foo } from '/tfs/pkg'`
    )
  })

  it('supports a consumer-chosen prefix (tosijs-ui wants /lib/)', () => {
    expect(rewriteImports(`import { foo } from 'tosijs'`, '/lib/')).toBe(
      `import { foo } from '/lib/tosijs'`
    )
    expect(rewriteImports(`export { foo } from 'pkg'`, '/lib/')).toBe(
      `export { foo } from '/lib/pkg'`
    )
  })

  it('leaves relative, absolute, and http(s) imports alone', () => {
    for (const src of [
      `import { x } from './local'`,
      `import { x } from '/abs/path'`,
      `import { x } from 'https://cdn.example.com/pkg.js'`,
    ]) {
      expect(rewriteImports(src)).toBe(src)
    }
  })

  it('handles multiple imports in one source', () => {
    const source = `import { a } from 'pkg-a'\nimport { b } from 'pkg-b'`
    const result = rewriteImports(source)
    expect(result).toContain(`from '/tfs/pkg-a'`)
    expect(result).toContain(`from '/tfs/pkg-b'`)
  })
})

describe('rewriteEsmShBody', () => {
  it('absolutizes esm.sh root-relative import paths', () => {
    expect(rewriteEsmShBody(`import "/react@18.2.0/es2022/react.mjs";`)).toBe(
      `import "${ESM_SH}/react@18.2.0/es2022/react.mjs";`
    )
    expect(
      rewriteEsmShBody(`export { createRoot } from "/react-dom@18/client";`)
    ).toBe(`export { createRoot } from "${ESM_SH}/react-dom@18/client";`)
  })

  it('leaves non-root-relative specifiers alone', () => {
    const src = `import x from "./sibling.js"; import y from "https://esm.sh/z";`
    expect(rewriteEsmShBody(src)).toBe(src)
  })
})

describe('config codec (client ↔ worker agreement)', () => {
  it('round-trips a full config', () => {
    const cfg = {
      prefix: '/lib/',
      defaultCdn: 'esmsh',
      esmShPackages: ['react', 'react-dom', 'preact'],
      cacheName: 'docs-v1',
    }
    expect(parseConfig(new URLSearchParams(serializeConfig(cfg)))).toEqual(cfg)
  })

  it('round-trips the default config, and an EMPTY allowlist stays empty', () => {
    expect(parseConfig(new URLSearchParams(serializeConfig()))).toEqual(
      DEFAULT_CONFIG
    )
    const noAllowlist = parseConfig(
      new URLSearchParams(serializeConfig({ esmShPackages: [] }))
    )
    expect(noAllowlist.esmShPackages).toEqual([])
  })

  it('missing params fall back to defaults (bare worker URL, no query)', () => {
    expect(parseConfig(new URLSearchParams(''))).toEqual(DEFAULT_CONFIG)
  })

  it('AGREEMENT: what the client rewrites to is what the worker routes on', () => {
    // The drift guard: rewriteImports emits `<prefix><spec>` and the worker
    // slices `config.prefix` off intercepted paths — both derive from the
    // same ResolverConfig through the codec, for any prefix.
    for (const prefix of ['/tfs/', '/lib/', '/modules/']) {
      const roundTripped = parseConfig(
        new URLSearchParams(serializeConfig({ prefix }))
      )
      const rewritten = rewriteImports(
        `import { x } from 'tosijs'`,
        roundTripped.prefix
      )
      expect(rewritten).toBe(`import { x } from '${prefix}tosijs'`)
      // and the worker-side slice recovers the original spec
      const path = `${prefix}tosijs`
      expect(path.startsWith(roundTripped.prefix)).toBe(true)
      expect(path.slice(roundTripped.prefix.length)).toBe('tosijs')
    }
  })
})

describe('built worker (anti-drift smoke)', () => {
  const workerPath = join(
    import.meta.dir,
    '..',
    '..',
    'dist',
    'import-resolver-worker.js'
  )

  // dist/ is a build product (gitignored); only check when it exists, the
  // same gate package-exports.test.ts uses.
  it.skipIf(!existsSync(workerPath))(
    'is a valid CLASSIC script embedding the shared routing',
    async () => {
      const source = readFileSync(workerPath, 'utf8')

      // A classic worker rejects import/export — the IIFE bundle must have
      // none. Parse as a SCRIPT (not module): module-only syntax throws.
      const { parse } = await import('acorn')
      expect(() =>
        parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
      ).not.toThrow()

      // Routing markers prove resolve.ts was bundled in, not a stale fork.
      expect(source).toContain('cdn.jsdelivr.net')
      expect(source).toContain('+esm')
      expect(source).toContain('esm.sh')
    }
  )
})
