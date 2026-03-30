#!/usr/bin/env bun
/**
 * Build script for demo - injects version from package.json
 */
import { $ } from 'bun'
import pkg from '../package.json'

const version = pkg.version

console.log(`Building demo with version ${version}...`)

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

// Copy static files (including TFS service worker — must not be bundled)
await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg tjs-lang.svg demo/src/tfs-worker.js .demo/`
await $`cp -r demo/static/texts .demo/`
await $`cp -r docs/diagrams .demo/ 2>/dev/null || true`

console.log(`Demo built successfully (v${version})`)
