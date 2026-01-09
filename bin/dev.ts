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
import { $ } from 'bun'

const PORT = 8699 // Homage to Agent-99
const DEMO_DIR = './demo'
const DOCS_DIR = './docs'
const SRC_DIR = './src'
const ROOT_DIR = '.'

// Build the demo
async function buildDemo() {
  console.log('Building demo...')

  // Generate docs.json
  await $`node bin/docs.js`

  // Build the demo app (bundle everything for browser)
  await Bun.build({
    entrypoints: ['./demo/src/index.ts'],
    outdir: './docs',
    minify: false,
    sourcemap: 'external',
    target: 'browser',
  })

  // Copy static files
  await $`cp demo/index.html demo/static/favicon.svg demo/static/photo-*.jpg tosijs-agent.svg docs/`
  await $`cp -r demo/static/texts docs/`

  console.log('Build complete!')
}

// Initial build
await buildDemo()

// Watch for changes
const watcher = watch(SRC_DIR, { recursive: true }, async (event, filename) => {
  console.log(`\nFile changed: ${filename}`)
  await buildDemo()
})

const demoWatcher = watch(
  `${DEMO_DIR}/src`,
  { recursive: true },
  async (event, filename) => {
    console.log(`\nDemo file changed: ${filename}`)
    await buildDemo()
  }
)

// Watch for markdown file changes in root
const mdWatcher = watch(
  ROOT_DIR,
  { recursive: false },
  async (event, filename) => {
    if (filename && filename.endsWith('.md')) {
      console.log(`\nMarkdown file changed: ${filename}`)
      await buildDemo()
    }
  }
)

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
        },
      })
    }

    // For SPA routing, serve index.html for unknown paths
    const indexFile = Bun.file(join(DOCS_DIR, 'index.html'))
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { 'Content-Type': 'text/html' },
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
  - *.md (root directory)
  
  Press Ctrl+C to stop
`)

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  watcher.close()
  demoWatcher.close()
  mdWatcher.close()
  server.stop()
  process.exit(0)
})
