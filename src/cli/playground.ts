#!/usr/bin/env bun
/**
 * tjs-playground - Serve the TJS playground locally
 *
 * Usage:
 *   tjs-playground [--port 8699]
 *   bunx tjs-playground
 */

import { resolveCacheDir } from '../batteries/audit'
import { watch } from 'fs'
import { join, resolve } from 'path'
import { $ } from 'bun'
import { reclaimPort, validPort } from './port'

const DEFAULT_PORT = 8699 // Homage to Agent-99

/**
 * Where the built playground goes.
 *
 * It used to go into `<rootDir>/.demo` unconditionally, and `rootDir` is
 * `import.meta.dir/../..` — which, for a published bin, is `node_modules/tjs-lang`. So
 * `tjs-playground` built INTO ITS OWN INSTALLED PACKAGE. Under pnpm (every platform) and
 * bun on Linux, files in `node_modules` are HARDLINKS into the machine-wide content store,
 * so writing through them reaches every other project on the machine sharing that version.
 * `bin/docs.js` was the worse half: run with the package as cwd it rewrote
 * `demo/docs.json` in place, and from a published tarball — which does not carry every
 * markdown source — it regenerated a DEGRADED file, 95 documents against the repo's 104.
 *
 * So: a repo checkout still builds into `.demo` (that is the expected, gitignored place),
 * and an installed copy builds into the OS cache, keyed by version so two installed
 * versions cannot collide. `--out-dir` overrides either.
 */
export function isInstalled(rootDir: string): boolean {
  // A path SEGMENT equal to `node_modules`, not a substring of one.
  //
  // `rootDir.includes('node_modules')` is true for a repo checked out at
  // `~/src/my-node_modules-experiments/tjs-lang`, which would then build into the OS cache
  // instead of `.demo` and quietly stop matching the docs. Segment equality is the actual
  // question — "am I installed inside a node_modules tree?" — and it answers correctly for
  // a plain install, a pnpm store path, and a scoped package alike.
  return rootDir.split(/[/\\]/).includes('node_modules')
}

export function defaultOutDir(rootDir: string, version: string): string {
  if (!isInstalled(rootDir)) return join(rootDir, '.demo')
  // `resolveCacheDir` — the SAME policy, not a second copy of it.
  //
  // This was an independent transcription of the OS-cache-path rules that
  // `resolveCacheDir` was extracted this release to own, and it was the copy that writes
  // tens of megabytes: it silently ignored `TJS_CACHE_DIR`, so a consumer who redirected
  // the cache still got a `playground-<version>/` under `$HOME`. It also had no fallback
  // for a missing home directory, which the shared one grew after that exact bug.
  return join(
    resolveCacheDir(process.env, process.platform, join),
    `playground-${version}`
  )
}

const HELP = `
tjs-playground - Serve the TJS playground locally

Usage:
  tjs-playground [options]

Options:
  -p, --port <port>   Port to serve on (default: ${DEFAULT_PORT})
  -h, --help          Show this help message
  --no-watch          Don't watch for file changes
  --out-dir <dir>     Where to build. Defaults to .demo/ in a repo checkout, and
                      an OS cache directory when tjs-lang is installed — a bin
                      must never build into its own package directory, which
                      under pnpm/bun is a hardlink into the shared store.
  --force             Stop an EARLIER PLAYGROUND still holding the port —
                      identified by its command line, not merely by being a JS
                      runtime. Without this, an occupied port is reported and
                      nothing is killed. A port held by anything that is not one
                      of our servers is never touched, with or without --force.
                      "Ours" means a process whose COMMAND LINE names
                      tjs-playground, or a generic entry point (bin/dev.ts) whose
                      argv also references this installation.

Examples:
  tjs-playground
  tjs-playground --port 3000
  tjs-playground --force
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
  if (!validPort(port)) {
    console.error(`Invalid --port value: ${args[portIdx + 1]}`)
    process.exit(1)
  }

  const noWatch = args.includes('--no-watch')

  // The package root, whether that is a repo checkout or `node_modules/tjs-lang`. (The
  // two branches this replaced tested `import.meta.path.includes('node_modules')` and then
  // computed the same value either way — the distinction that matters is not WHERE the
  // package is, it is where we are allowed to WRITE. See defaultOutDir.)
  const rootDir = join(import.meta.dir, '..', '..')
  // The TESTED predicate, not a second answer to the same question. This line was the
  // substring check that `isInstalled` exists to replace, sitting seventy lines below it
  // in the same file: a repo at `~/src/my-node_modules-experiments/tjs-lang` reads as
  // installed and silently skips the docs rebuild.
  const installed = isInstalled(rootDir)

  const pkgVersion =
    (
      (await Bun.file(join(rootDir, 'package.json'))
        .json()
        .catch(() => null)) as { version?: string } | null
    )?.version ?? 'dev'

  const outIdx = args.findIndex((a) => a === '--out-dir')
  const outOverride = outIdx !== -1 ? args[outIdx + 1] : undefined
  if (outIdx !== -1 && !outOverride) {
    console.error('--out-dir requires a directory')
    process.exit(1)
  }
  const docsDir = outOverride
    ? resolve(outOverride)
    : defaultOutDir(rootDir, pkgVersion)

  // A receipt, on stderr so it cannot corrupt anything piping stdout. A tool that writes
  // somewhere non-obvious has to say where.
  console.error(`  build output: ${docsDir}`)
  const srcDir = join(rootDir, 'src')
  const demoDir = join(rootDir, 'demo')
  const editorsDir = join(rootDir, 'editors')

  // Check if docs directory exists
  const docsExists = await Bun.file(join(docsDir, 'index.html')).exists()

  if (!docsExists) {
    console.log('Docs not built yet. Building...')
    await buildDocs(rootDir)
  }

  // Make the port available, or explain and stop. This used to `kill -9` whatever
  // `lsof -ti:PORT` returned — which includes CLIENTS, so a browser tab open on the
  // playground got its network process killed. See `reclaimPort`.
  const reclaimed = await reclaimPort(port, {
    force: args.includes('--force'),
    label: 'playground',
  })
  if (!reclaimed.free) {
    console.error(reclaimed.message)
    process.exit(1)
  }

  // Build function
  async function buildDocs(root: string) {
    console.log('Building playground...')
    try {
      // Regenerate docs.json ONLY from a repo checkout. `bin/docs.js` writes
      // `demo/docs.json` relative to its cwd, so running it against an installed package
      // rewrites a file inside `node_modules` — and from a published tarball, which does
      // not carry every markdown source, it regenerates a DEGRADED one (95 documents
      // against the repo's 104). The shipped `demo/docs.json` is already current; it is
      // read at build time by `demo/src/index.ts` and needs nothing done to it.
      if (!installed) {
        const docsScript = join(root, 'bin', 'docs.js')
        if (await Bun.file(docsScript).exists()) {
          await $`node ${docsScript}`.cwd(root)
        }
      }

      // Build the demo app
      const result = await Bun.build({
        entrypoints: [join(root, 'demo', 'src', 'index.ts')],
        outdir: docsDir,
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
      const targetDocs = docsDir

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
${
  !noWatch
    ? `
  Watching for changes...`
    : ''
}

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

// Only when run as a script. Importing this module must not start a build and a server —
// which is what made it structurally untestable, and is why the hardlink-corruption fix
// shipped with 0% coverage while its sibling in the same session got a 258-line test.
if (import.meta.main) main()
