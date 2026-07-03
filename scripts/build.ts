#!/usr/bin/env bun
/**
 * Build script for TJS bundles
 *
 * Uses esbuild for correct ESM re-export handling.
 *
 * Produces separate bundles for different use cases:
 * - index.js          - Everything (VM + lang + fromTS)
 * - tjs-vm.js         - VM runtime only (AgentVM, atoms)
 * - tjs-batteries.js  - LLM, vector, store ops
 * - tjs-lang.js       - TJS/AJS transpiler (no TS compiler)
 * - tjs-eval.js       - Safe eval (VM + transpiler)
 * - tjs-from-ts.js    - TS→TJS converter (needs typescript)
 */

import { buildSync } from 'esbuild'
import { gzipSync } from 'zlib'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const distDir = join(import.meta.dir, '../dist')

// Ensure dist exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

interface BuildTarget {
  name: string
  entry: string
  external?: string[]
  /** Module specifier → replacement path (esbuild alias). */
  alias?: Record<string, string>
  description: string
}

const targets: BuildTarget[] = [
  {
    name: 'index',
    entry: './src/index.ts',
    external: [
      'acorn',
      'tosijs-schema',
      'typescript',
      'node:readline',
      // module-loader.ts uses these for transpile-time .tjs/.ts/.js resolution
      // (node-only); externalize so the neutral bundle resolves rather than fails.
      'node:fs',
      'node:path',
    ],
    description: 'Main entry (VM + lang + fromTS)',
  },
  {
    name: 'tjs-vm',
    entry: './src/vm/index.ts',
    external: ['tosijs-schema'],
    description: 'VM runtime only',
  },
  {
    name: 'tjs-batteries',
    entry: './src/batteries/index.ts',
    external: ['tosijs-schema', 'node:readline'],
    description: 'LLM, vector, store ops',
  },
  {
    name: 'tjs-lang',
    entry: './src/lang/transpiler.ts',
    external: ['acorn', 'tosijs-schema'],
    description: 'TJS/AJS transpiler (no TS)',
  },
  {
    name: 'tjs-eval',
    entry: './src/lang/eval.ts',
    external: ['acorn', 'tosijs-schema'],
    description: 'Safe eval (VM + transpiler)',
  },
  {
    name: 'tjs-from-ts',
    entry: './src/lang/emitters/from-ts.ts',
    external: ['acorn', 'tosijs-schema', 'typescript'],
    description: 'TS→TJS converter (needs typescript)',
  },
  {
    name: 'tjs-css',
    entry: './src/css/index.ts',
    // Pulls the predicate engine (verify/compile/suggest), which uses acorn.
    external: ['acorn', 'acorn-walk', 'tosijs-schema'],
    description: 'CSS validators (verified predicates)',
  },
  {
    name: 'tjs-schema',
    entry: './src/schema/index.ts',
    // tosijs-schema MUST be external: it holds the single global $predicate
    // evaluator, so a bundled duplicate would register on the wrong instance.
    external: ['acorn', 'acorn-walk', 'tosijs-schema'],
    description: 'tosijs-schema + predicate support (pre-wired)',
  },
  {
    // Self-contained browser bundle: acorn + tosijs-schema INLINED (no
    // externals), so a single `import('https://cdn/.../tjs-browser.js')` works
    // on any CDN with zero import-map/config. TJS+AJS transpiler; no TypeScript.
    name: 'tjs-browser',
    entry: './src/lang/browser.ts',
    external: [],
    description: 'Self-contained browser transpiler (TJS/AJS, no deps)',
  },
  {
    // Browser TS→TJS: acorn + tosijs-schema inlined; `typescript` is lazy-loaded
    // from a CDN at call time (configurable, default jsDelivr) so the bundle
    // stays small and only pays the ~MB TS cost when you actually transpile TS.
    name: 'tjs-browser-from-ts',
    entry: './src/lang/browser-from-ts.ts',
    external: [],
    // Swap the static `typescript` import for the lazy CDN Proxy shim so the
    // compiler isn't inlined (~MB) — it's fetched on demand at call time.
    alias: { typescript: './src/lang/ts-cdn-shim.ts' },
    description: 'Browser TS→TJS (lazy-loads typescript from CDN)',
  },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function buildTarget(target: BuildTarget): { raw: number; gzip: number } {
  const outfile = join(distDir, `${target.name}.js`)

  buildSync({
    entryPoints: [target.entry],
    outfile,
    bundle: true,
    minify: true,
    sourcemap: true,
    format: 'esm',
    platform: 'neutral',
    external: target.external,
    alias: target.alias,
  })

  const content = readFileSync(outfile)
  const gzipped = gzipSync(content)

  return { raw: content.length, gzip: gzipped.length }
}

function main() {
  console.log('Building TJS bundles...\n')
  console.log('─'.repeat(65))
  console.log(
    `${'Bundle'.padEnd(20)} ${'Raw'.padStart(12)} ${'Gzipped'.padStart(
      12
    )}   Description`
  )
  console.log('─'.repeat(65))

  let totalRaw = 0
  let totalGzip = 0
  const failures: string[] = []

  for (const target of targets) {
    try {
      const { raw, gzip } = buildTarget(target)
      totalRaw += raw
      totalGzip += gzip

      console.log(
        `${target.name.padEnd(20)} ${formatSize(raw).padStart(12)} ${formatSize(
          gzip
        ).padStart(12)}   ${target.description}`
      )
    } catch (e: any) {
      failures.push(target.name)
      console.log(
        `${target.name.padEnd(20)} ${'FAILED'.padStart(12)}   ${e.message}`
      )
    }
  }

  console.log('─'.repeat(65))
  console.log(
    `${'TOTAL'.padEnd(20)} ${formatSize(totalRaw).padStart(12)} ${formatSize(
      totalGzip
    ).padStart(12)}`
  )
  console.log('')

  // Show what each subpath provides
  console.log('tjs-lang           → Everything (needs typescript)')
  console.log('tjs-lang/vm        → VM only (AgentVM, atoms)')
  console.log('tjs-lang/lang      → TJS/AJS transpiler (no TS compiler)')
  console.log('tjs-lang/eval      → Safe eval (VM + transpiler)')
  console.log('tjs-lang/lang/from-ts → TS→TJS (needs typescript)')
  console.log('tjs-lang/batteries → LLM, vector, store ops')

  // Fail noisily: a failed bundle is a broken package entry point. Exiting
  // non-zero stops `bun run make`, CI, and release scripts so it can't ship
  // silently (as the index bundle did from v0.8.0 until v0.8.1).
  if (failures.length > 0) {
    console.error(
      `\n✖ Build failed: ${
        failures.length
      } bundle(s) did not build — ${failures.join(', ')}`
    )
    process.exit(1)
  }
}

main()
