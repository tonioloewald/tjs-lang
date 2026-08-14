#!/usr/bin/env bun
/**
 * Build script for demo - injects version from package.json
 */
import { $ } from 'bun'
import pkg from '../package.json'

const version = pkg.version

console.log(`Building demo with version ${version}...`)

// Clean the output directory first.
//
// `Bun.build` writes content-hashed chunk names and never removes what it did not
// produce, so every build left its predecessors behind. Measured before this line:
// `.demo` held 389 files and **864MB**, 358 of them older than a week — all dead chunks
// no `index.html` referenced. `firebase deploy` uploads the directory, so the hosting
// site accumulated them too. A clean build is 30 files and 35MB.
await $`rm -rf .demo`

// Build docs first
await $`bun run docs`

// Build with version injected using programmatic API
const result = await Bun.build({
  entrypoints: ['./demo/src/index.ts'],
  outdir: './.demo',
  minify: true,
  sourcemap: 'external',
  splitting: true,
  target: 'browser',
  define: {
    __VERSION__: JSON.stringify(version),
  },
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Bundled ${result.outputs.length} files`)

// Build standalone TJS runtime for iframe injection
const runtimeResult = await Bun.build({
  entrypoints: ['./demo/src/tjs-runtime-iframe.ts'],
  outdir: './.demo',
  minify: true,
  target: 'browser',
  naming: 'tjs-runtime.js',
})
if (!runtimeResult.success) {
  console.error('Runtime build failed:', runtimeResult.logs)
  process.exit(1)
}

// Build the TFS service worker (demo/src/tfs-worker.ts composes the shared
// import-resolver core from src/import-resolver/ with the playground's
// /iframe/ protocol). esbuild IIFE, not Bun.build ESM — a classic worker
// (registered without {type:'module'}) rejects import/export.
const { buildSync } = await import('esbuild')
buildSync({
  entryPoints: ['./demo/src/tfs-worker.ts'],
  outfile: './.demo/tfs-worker.js',
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100', 'safari15'],
})

// Copy static files
await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg demo/static/tosi-platform.json tjs-lang.svg .demo/`
await $`cp -r demo/static/texts .demo/`
await $`mkdir -p .demo/docs && cp -r docs/diagrams .demo/docs/ 2>/dev/null || true`

console.log(`Demo built successfully (v${version})`)
