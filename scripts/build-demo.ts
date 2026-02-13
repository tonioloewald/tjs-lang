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

// Copy static files
await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg tjs-lang.svg .demo/`
await $`cp -r demo/static/texts .demo/`

console.log(`Demo built successfully (v${version})`)
