#!/usr/bin/env bun
/**
 * Build script for TJS bundles
 *
 * Produces separate bundles for different use cases:
 * - tjs-vm.js        - VM runtime only (universal endpoint)
 * - tjs-batteries.js - LLM, vector, store ops (optional runtime)
 * - tjs-transpiler.js - TJS/AJS transpiler (no TS compiler)
 * - tjs-full.js      - Everything including fromTS + TS compiler
 */

import { build } from 'bun'
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
  description: string
}

const targets: BuildTarget[] = [
  {
    name: 'tjs-vm',
    entry: './src/vm/index.ts',
    external: ['tosijs-schema'],
    description: 'VM runtime (universal endpoint)',
  },
  {
    name: 'tjs-batteries',
    entry: './src/batteries/index.ts',
    external: ['tosijs-schema'],
    description: 'LLM, vector, store ops',
  },
  {
    name: 'tjs-transpiler',
    entry: './src/lang/transpiler.ts',
    external: ['acorn', 'tosijs-schema'],
    description: 'TJS/AJS transpiler (no TS)',
  },
  {
    name: 'tjs-full',
    entry: './src/index.ts',
    external: ['acorn', 'tosijs-schema', 'typescript'],
    description: 'Full bundle with TS support',
  },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function buildTarget(
  target: BuildTarget
): Promise<{ raw: number; gzip: number }> {
  const outfile = join(distDir, `${target.name}.js`)

  await build({
    entrypoints: [target.entry],
    outdir: distDir,
    naming: `${target.name}.js`,
    minify: true,
    sourcemap: 'external',
    target: 'browser',
    external: target.external,
  })

  const content = readFileSync(outfile)
  const gzipped = gzipSync(content)

  return { raw: content.length, gzip: gzipped.length }
}

async function main() {
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

  for (const target of targets) {
    try {
      const { raw, gzip } = await buildTarget(target)
      totalRaw += raw
      totalGzip += gzip

      console.log(
        `${target.name.padEnd(20)} ${formatSize(raw).padStart(12)} ${formatSize(
          gzip
        ).padStart(12)}   ${target.description}`
      )
    } catch (e: any) {
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

  // Show what a minimal endpoint needs
  console.log('Minimal universal endpoint: tjs-vm.js')
  console.log('With LLM/vector support:    tjs-vm.js + tjs-batteries.js')
  console.log('Browser playground:         tjs-full.js (includes TS compiler)')
}

main().catch(console.error)
