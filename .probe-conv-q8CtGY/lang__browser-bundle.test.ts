/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { buildSync } from 'esbuild'

import { DEFAULT_TYPESCRIPT_URL } from '/Users/tonioloewald/tjs-lang/src/lang/browser-from-ts'

const HERE = '/Users/tonioloewald/tjs-lang/src/lang'
export {}

/* line 18 */
function bundle(entry, alias) {
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
bundle.__tjs = {
  params: {
    entry: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    alias: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:18',
}

/* line 32 */
function bareImports(src) {
  const found = []
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
bareImports.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'string',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:32',
}

describe('browser bundles are self-contained (CDN drop-in)', () => {
  it('tjs-browser inlines all deps — no bare/node imports', () => {
    const out = bundle('browser.ts')

    expect(bareImports(out)).toEqual([])

    expect(out.length).toBeGreaterThan(100_000)
  })
  it('tjs-browser-from-ts: no bare imports, TS lazy (not inlined)', () => {
    const out = bundle('browser-from-ts.ts', {
      typescript: `${HERE}/ts-cdn-shim.ts`,
    })
    expect(bareImports(out)).toEqual([])

    expect(out.length).toBeLessThan(300_000)

    expect(out).toContain('esm.sh/typescript')
  })
  it('default TypeScript CDN is esm.sh (the only one that serves it reliably)', () => {
    expect(DEFAULT_TYPESCRIPT_URL).toBe('https://esm.sh/typescript@5')
  })
})
