#!/usr/bin/env bun
/**
 * Build the published `tjs-lang/editors/*` entry points from their TypeScript
 * sources.
 *
 * Why this exists: the `editors/{monaco,codemirror,ace}/*.js` files are the
 * artifacts npm consumers actually import (see the `./editors/*` subpaths in
 * package.json). They were hand-maintained and drifted months behind the real
 * `.ts` implementations (the playground bundles from source, so the drift was
 * invisible in-repo) — none of the scope-model / introspection / member-
 * completion work reached `tjs-lang/editors/codemirror` consumers. This script
 * bundles each entry so the published `.js` always tracks its `.ts`.
 *
 * Externalization contract: each bundle inlines only the internal editor logic
 * (`../ajs-syntax`, `../tjs-syntax`, `../scope-symbols`, …) and externalizes:
 *   - the framework it augments (@codemirror/*, @lezer/*, codemirror,
 *     monaco-editor, ace-builds) — consumers bring their own, and CodeMirror in
 *     particular MUST be a singleton (a bundled duplicate breaks it);
 *   - the acorn stack (acorn / acorn-loose / acorn-walk) — these are tjs-lang
 *     runtime `dependencies`, so a consumer who installed tjs-lang already has
 *     them; inlining would just bloat the artifact.
 *
 * Output is ESM (the package is `"type": "module"` and the export map is ESM),
 * unminified (readable, git-diffable — small once the frameworks/acorn are
 * external), written in place next to the `.ts` and committed.
 *
 * Wired into `bun run make` (and runnable standalone via `bun run build:editors`).
 */
import { buildSync } from 'esbuild'
import { readFileSync } from 'fs'
import { join } from 'path'
import { gzipSync } from 'zlib'

export const ROOT = join(import.meta.dir, '..')

export interface EditorTarget {
  name: string
  entry: string
  outfile: string
  external: string[]
  description: string
}

/**
 * Bundle one editor target. With `write: true` (default) it writes the `.js` in
 * place and returns its bytes; with `write: false` it returns the bytes without
 * touching disk (used by the anti-drift guard test to compare against the
 * committed file).
 */
export function bundleEditor(
  target: EditorTarget,
  { write = true }: { write?: boolean } = {}
): string {
  const outfile = join(ROOT, target.outfile)
  const result = buildSync({
    entryPoints: [join(ROOT, target.entry)],
    outfile,
    write,
    bundle: true,
    minify: false,
    sourcemap: false,
    format: 'esm',
    platform: 'neutral',
    external: target.external,
  })
  return write ? readFileSync(outfile, 'utf8') : result.outputFiles![0].text
}

export const editorTargets: EditorTarget[] = [
  {
    name: 'codemirror',
    entry: 'editors/codemirror/ajs-language.ts',
    outfile: 'editors/codemirror/ajs-language.js',
    // @codemirror/* + @lezer/* + codemirror: peer framework (singleton).
    // acorn stack: tjs-lang runtime deps, resolved at the consumer.
    external: [
      '@codemirror/*',
      '@lezer/*',
      'codemirror',
      'acorn',
      'acorn-loose',
      'acorn-walk',
    ],
    description: 'CodeMirror 6 language + TJS completion source',
  },
  {
    name: 'monaco',
    entry: 'editors/monaco/ajs-monarch.ts',
    outfile: 'editors/monaco/ajs-monarch.js',
    // monaco-editor is imported type-only; externalize defensively.
    external: ['monaco-editor'],
    description: 'Monaco Monarch grammar + language registration',
  },
  {
    name: 'ace',
    entry: 'editors/ace/ajs-mode.ts',
    outfile: 'editors/ace/ajs-mode.js',
    // ace-builds is imported type-only; the mode receives `ace` at runtime.
    external: ['ace-builds'],
    description: 'Ace highlight rules + mode registration',
  },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main() {
  console.log('Building tjs-lang/editors/* entry points...\n')
  console.log('─'.repeat(72))
  console.log(
    `${'Entry'.padEnd(12)} ${'Raw'.padStart(10)} ${'Gzipped'.padStart(
      10
    )}   Description`
  )
  console.log('─'.repeat(72))

  const failures: string[] = []

  for (const target of editorTargets) {
    try {
      const content = bundleEditor(target, { write: true })
      // Guard against a silently-empty/degenerate bundle.
      if (content.length < 500) {
        throw new Error(`suspiciously small output (${content.length} B)`)
      }
      const gzip = gzipSync(content).length
      console.log(
        `${target.name.padEnd(12)} ${formatSize(content.length).padStart(
          10
        )} ${formatSize(gzip).padStart(10)}   ${target.description}`
      )
    } catch (e: any) {
      failures.push(target.name)
      console.log(
        `${target.name.padEnd(12)} ${'FAILED'.padStart(10)}   ${e.message}`
      )
    }
  }

  console.log('─'.repeat(72))

  if (failures.length > 0) {
    console.error(
      `\n✗ ${failures.length} editor bundle(s) failed: ${failures.join(', ')}`
    )
    process.exit(1)
  }
  console.log('\n✓ All editor entry points built from source.')
}

// Run the build only when invoked directly (`bun scripts/build-editors.ts`),
// not when imported by the guard test.
if (import.meta.main) main()
