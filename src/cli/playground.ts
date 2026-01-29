#!/usr/bin/env bun
/**
 * tjs-playground - Serve the TJS playground locally
 *
 * Usage:
 *   tjs-playground [--port 8699]
 *   bunx tjs-playground
 */

import { watch } from 'fs'
import { join } from 'path'
import { $ } from 'bun'

const DEFAULT_PORT = 8699 // Homage to Agent-99

const HELP = `
tjs-playground - Serve the TJS playground locally

Usage:
  tjs-playground [options]

Options:
  -p, --port <port>   Port to serve on (default: ${DEFAULT_PORT})
  -h, --help          Show this help message
  --no-watch          Don't watch for file changes

Examples:
  tjs-playground
  tjs-playground --port 3000
`

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }

  // Parse port
  const portIdx = args.findIndex((a) => a === '-p' || a === '--port')
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT

  const noWatch = args.includes('--no-watch')

  // Find the package root (where docs/ lives)
  // When installed via npm, this will be in node_modules/tjs-lang
  // When running locally, it's the repo root
  let rootDir: string

  // Check if we're in node_modules
  const scriptPath = import.meta.path
  if (scriptPath.includes('node_modules')) {
    // Installed as a package - go up to find package root
    rootDir = join(import.meta.dir, '..', '..')
  } else {
    // Running from repo
    rootDir = join(import.meta.dir, '..', '..')
  }

  const docsDir = join(rootDir, 'docs')
  const srcDir = join(rootDir, 'src')
  const demoDir = join(rootDir, 'demo')
  const editorsDir = join(rootDir, 'editors')

  // Check if docs directory exists
  const docsExists = await Bun.file(join(docsDir, 'index.html')).exists()

  if (!docsExists) {
    console.log('Docs not built yet. Building...')
    await buildDocs(rootDir)
  }

  // Kill any existing process on our port
  try {
    const result = await $`lsof -ti:${port}`.quiet()
    const pids = result.text().trim().split('\n').filter(Boolean)
    for (const pid of pids) {
      console.log(`Killing existing process on port ${port} (PID: ${pid})`)
      await $`kill -9 ${pid}`.quiet()
    }
  } catch {
    // No process on port
  }

  // Build function
  async function buildDocs(root: string) {
    console.log('Building playground...')
    try {
      // Generate docs.json
      const docsScript = join(root, 'bin', 'docs.js')
      if (await Bun.file(docsScript).exists()) {
        await $`node ${docsScript}`.cwd(root)
      }

      // Build the demo app
      const result = await Bun.build({
        entrypoints: [join(root, 'demo', 'src', 'index.ts')],
        outdir: join(root, 'docs'),
        minify: false,
        sourcemap: 'external',
        target: 'browser',
      })

      if (!result.success) {
        console.error('Build failed:')
        for (const log of result.logs) {
          console.error(log)
        }
        return false
      }

      // Copy static files
      const demoStatic = join(root, 'demo', 'static')
      const demoIndex = join(root, 'demo', 'index.html')
      const logoSvg = join(root, 'tjs-lang.svg')
      const targetDocs = join(root, 'docs')

      await $`cp ${demoIndex} ${logoSvg} ${targetDocs}/`.quiet()
      await $`cp ${join(demoStatic, 'favicon.svg')} ${targetDocs}/`.quiet()
      await $`cp ${join(demoStatic, 'photo-*.jpg')} ${targetDocs}/`.quiet()
      await $`cp -r ${join(demoStatic, 'texts')} ${targetDocs}/`.quiet()

      console.log('Build complete!')
      return true
    } catch (error) {
      console.error(
        'Build error:',
        error instanceof Error ? error.message : error
      )
      return false
    }
  }

  // Debounced rebuild
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null
  let isBuilding = false

  async function debouncedBuild(source: string) {
    if (rebuildTimeout) clearTimeout(rebuildTimeout)
    rebuildTimeout = setTimeout(async () => {
      if (isBuilding) {
        debouncedBuild(source)
        return
      }
      isBuilding = true
      console.log(`\n${source}`)
      await buildDocs(rootDir)
      isBuilding = false
    }, 100)
  }

  // Watch for changes if not disabled
  const watchers: ReturnType<typeof watch>[] = []

  if (!noWatch) {
    try {
      watchers.push(
        watch(srcDir, { recursive: true }, (event, filename) => {
          debouncedBuild(`File changed: ${filename}`)
        })
      )
      watchers.push(
        watch(join(demoDir, 'src'), { recursive: true }, (event, filename) => {
          debouncedBuild(`Demo file changed: ${filename}`)
        })
      )
      watchers.push(
        watch(editorsDir, { recursive: true }, (event, filename) => {
          debouncedBuild(`Editor file changed: ${filename}`)
        })
      )
    } catch {
      // Watching may fail if directories don't exist (installed package)
    }
  }

  // Serve the docs directory
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      let pathname = url.pathname

      if (pathname === '/') {
        pathname = '/index.html'
      }

      const filePath = join(docsDir, pathname)
      const file = Bun.file(filePath)

      if (await file.exists()) {
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

      // SPA fallback
      const indexFile = Bun.file(join(docsDir, 'index.html'))
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html' },
        })
      }

      return new Response('Not Found', { status: 404 })
    },
  })

  console.log(`
  TJS Playground running at http://localhost:${port}
${!noWatch ? `
  Watching for changes...` : ''}

  Press Ctrl+C to stop
`)

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    watchers.forEach((w) => w.close())
    server.stop()
    process.exit(0)
  })
}

main()
