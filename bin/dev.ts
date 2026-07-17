/*
 * dev.ts - Development server for agent-99 demo site
 *
 * Run with: bun run bin/dev.ts
 *
 * Features:
 * - Serves demo site on https://localhost:8080
 * - Watches for file changes and rebuilds
 * - Auto-regenerates docs.json when source files change
 */

import { watch } from 'fs'
import { join } from 'path'
import { $, spawn } from 'bun'
import pkg from '../package.json'
import {
  parseTfsPath,
  buildCdnUrl,
  rewriteEsmShBody,
  ESM_SH,
} from '../src/import-resolver/resolve'

const VERSION = pkg.version

const PORT = 8699 // Homage to Agent-99

// Kill any existing process on our port
async function killExistingServer() {
  try {
    const result = await $`lsof -ti:${PORT}`.quiet()
    const pids = result.text().trim().split('\n').filter(Boolean)
    for (const pid of pids) {
      console.log(`Killing existing process on port ${PORT} (PID: ${pid})`)
      await $`kill -9 ${pid}`.quiet()
    }
  } catch {
    // No process on port, that's fine
  }
}

await killExistingServer()
const DEMO_DIR = './demo'
const DOCS_DIR = './.demo'
const SRC_DIR = './src'
const EDITORS_DIR = './editors'
const GUIDES_DIR = './guides'
const ROOT_DIR = '.'

// Build the demo
async function buildDemo() {
  console.log('Building demo...')

  try {
    // Generate docs.json
    await $`node bin/docs.js`

    // Build the demo app (bundle everything for browser)
    const result = await Bun.build({
      entrypoints: ['./demo/src/index.ts'],
      outdir: './.demo',
      minify: false,
      sourcemap: 'external',
      target: 'browser',
      define: {
        __VERSION__: JSON.stringify(VERSION),
      },
    })

    if (!result.success) {
      console.error('Build failed:')
      for (const log of result.logs) {
        console.error(log)
      }
      return
    }

    // Build standalone TJS runtime for iframe injection
    await Bun.build({
      entrypoints: ['./demo/src/tjs-runtime-iframe.ts'],
      outdir: './.demo',
      minify: false,
      target: 'browser',
      naming: 'tjs-runtime.js',
    })

    // Build the TFS service worker (shared import-resolver core + /iframe/
    // protocol; see demo/src/tfs-worker.ts). esbuild IIFE — a classic worker
    // rejects import/export, so Bun.build's ESM output won't do.
    const { buildSync } = await import('esbuild')
    buildSync({
      entryPoints: ['./demo/src/tfs-worker.ts'],
      outfile: './.demo/tfs-worker.js',
      bundle: true,
      minify: false,
      format: 'iife',
      platform: 'browser',
      target: ['chrome100', 'firefox100', 'safari15'],
    })

    // Copy static files
    await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg demo/static/tosi-platform.json tjs-lang.svg .demo/`
    await $`cp -r demo/static/texts .demo/`
    await $`mkdir -p .demo/docs && cp -r docs/diagrams .demo/docs/ 2>/dev/null || true`

    console.log('Build complete!')
  } catch (error) {
    console.error(
      'Build error:',
      error instanceof Error ? error.message : error
    )
  }
}

// Initial build
await buildDemo()

// Debounce rebuilds to avoid multiple rapid rebuilds
let rebuildTimeout: ReturnType<typeof setTimeout> | null = null
let isBuilding = false

async function debouncedBuild(source: string) {
  if (rebuildTimeout) {
    clearTimeout(rebuildTimeout)
  }
  rebuildTimeout = setTimeout(async () => {
    if (isBuilding) {
      // Schedule another build after current one finishes
      debouncedBuild(source)
      return
    }
    isBuilding = true
    console.log(`\n${source}`)
    await buildDemo()
    isBuilding = false
  }, 100)
}

// Watch for changes
const watcher = watch(SRC_DIR, { recursive: true }, (event, filename) => {
  debouncedBuild(`File changed: ${filename}`)
})

const demoWatcher = watch(
  `${DEMO_DIR}/src`,
  { recursive: true },
  (event, filename) => {
    debouncedBuild(`Demo file changed: ${filename}`)
  }
)

// Watch for editor changes
const editorsWatcher = watch(
  EDITORS_DIR,
  { recursive: true },
  (event, filename) => {
    debouncedBuild(`Editor file changed: ${filename}`)
  }
)

// Watch for guide/example changes
const guidesWatcher = watch(
  GUIDES_DIR,
  { recursive: true },
  (event, filename) => {
    debouncedBuild(`Guide file changed: ${filename}`)
  }
)

// Watch for markdown file changes in root
const mdWatcher = watch(ROOT_DIR, { recursive: false }, (event, filename) => {
  if (filename && filename.endsWith('.md')) {
    debouncedBuild(`Markdown file changed: ${filename}`)
  }
})

// Serve the docs directory
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html'
    }

    // Try to serve from docs directory
    const filePath = join(DOCS_DIR, pathname)
    const file = Bun.file(filePath)

    if (await file.exists()) {
      // Set appropriate content type
      const ext = pathname.split('.').pop()
      const contentTypes: Record<string, string> = {
        html: 'text/html',
        js: 'application/javascript',
        css: 'text/css',
        json: 'application/json',
        svg: 'image/svg+xml',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        ico: 'image/x-icon',
        map: 'application/json',
      }

      return new Response(file, {
        headers: {
          'Content-Type': contentTypes[ext || 'html'] || 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // Server-side /tfs/ fallback — used when the service worker can't
    // intercept (blob iframes, first load before SW activation).
    //
    // #20: routing now comes from src/import-resolver/resolve.ts — the same
    // parseTfsPath/buildCdnUrl the service worker uses — so the fallback
    // resolves IDENTICALLY to the primary path (JSDelivr /+esm + esm.sh
    // allowlist + CDN hints). The previous handler here was a diverged
    // reimplementation (raw JSDelivr + its own package.json exports
    // resolution + hand-rolled import rewriting): a package could work
    // through the SW and break through the fallback, or vice versa.
    if (pathname.startsWith('/tfs/')) {
      const tfsPath = pathname.slice(5)
      const parsed = parseTfsPath(tfsPath)
      if (!parsed) {
        return new Response('invalid tfs path', { status: 400 })
      }
      const cdnUrl = buildCdnUrl(parsed.name, parsed.version, parsed.subpath)

      try {
        const cdnRes = await fetch(cdnUrl)
        if (!cdnRes.ok) {
          return new Response(`package not found: ${cdnUrl}`, { status: 404 })
        }

        let body = await cdnRes.text()
        if (cdnUrl.startsWith(ESM_SH)) {
          body = rewriteEsmShBody(body)
        }

        return new Response(body, {
          headers: {
            'Content-Type': 'application/javascript',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch (err: any) {
        return new Response(`tfs error: ${err.message}`, { status: 502 })
      }
    }

    // For SPA routing, serve index.html for unknown paths
    const indexFile = Bun.file(join(DOCS_DIR, 'index.html'))
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`
  Development server running at http://localhost:${PORT}

  Watching for changes in:
  - ${SRC_DIR}/
  - ${DEMO_DIR}/src/
  - ${EDITORS_DIR}/
  - ${GUIDES_DIR}/
  - *.md (root directory)

  Press Ctrl+C to stop
`)

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  watcher.close()
  demoWatcher.close()
  editorsWatcher.close()
  guidesWatcher.close()
  mdWatcher.close()
  server.stop()
  process.exit(0)
})
