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

    // Copy static files (including TFS service worker — must not be bundled)
    await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg tjs-lang.svg demo/src/tfs-worker.js .demo/`
    await $`cp -r demo/static/texts .demo/`

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

    // TFS proxy — resolve npm packages from jsdelivr CDN
    // This is the server-side fallback when the service worker can't intercept
    // (e.g. blob iframes, first load before SW is active)
    if (pathname.startsWith('/tfs/')) {
      const tfsPath = pathname.slice(5)
      const CDN_BASE = 'https://cdn.jsdelivr.net/npm'

      // Parse package@version/subpath
      let name: string, version: string, subpath: string
      if (tfsPath.startsWith('@')) {
        const match = tfsPath.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/)
        if (match) {
          name = match[1]; version = match[2] || 'latest'; subpath = match[3] || ''
        } else {
          return new Response('invalid tfs path', { status: 400 })
        }
      } else {
        const match = tfsPath.match(/^([^/@]+)(?:@([^/]+))?(\/.*)?$/)
        if (match) {
          name = match[1]; version = match[2] || 'latest'; subpath = match[3] || ''
        } else {
          return new Response('invalid tfs path', { status: 400 })
        }
      }

      try {
        // If no subpath, resolve ESM entry point from package.json
        if (!subpath) {
          const pkgRes = await fetch(`${CDN_BASE}/${name}@${version}/package.json`)
          if (pkgRes.ok) {
            const pkg = await pkgRes.json()
            const exp = pkg.exports
            let entryPath: string | null = null

            if (exp) {
              // exports can be { ".": { import: "..." } } or { import: "..." }
              const dot = exp['.'] ?? exp
              if (typeof dot === 'string') entryPath = dot
              else if (dot?.import) entryPath = typeof dot.import === 'string' ? dot.import : dot.import?.default
              else if (dot?.default) entryPath = dot.default
            }
            if (!entryPath) entryPath = pkg.module || pkg.main || '/index.js'
            subpath = entryPath.startsWith('/') ? entryPath
              : entryPath.startsWith('./') ? entryPath.slice(1)
              : `/${entryPath}`
          }
        }

        const cdnUrl = `${CDN_BASE}/${name}@${version}${subpath}`
        const cdnRes = await fetch(cdnUrl)
        if (!cdnRes.ok) {
          // Try +esm fallback
          const esmRes = await fetch(`${CDN_BASE}/${name}@${version}${subpath || ''}/+esm`)
          if (esmRes.ok) {
            return new Response(await esmRes.text(), {
              headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' },
            })
          }
          return new Response(`package not found: ${name}@${version}`, { status: 404 })
        }
        return new Response(await cdnRes.text(), {
          headers: { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' },
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
