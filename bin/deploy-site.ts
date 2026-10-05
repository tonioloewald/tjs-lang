#!/usr/bin/env bun
/**
 * Build the tosijs-ui doc site from a COMMIT and publish it to GitHub Pages (`gh-pages`),
 * served at https://tjs.tosijs.net.
 *
 *   bun run deploy:site            # builds HEAD
 *   bun run deploy:site <ref>      # builds <ref>
 *   bun run preview:site [ref]     # the SAME build, served on http://localhost:8790, not pushed
 *
 * `preview:site` is how to test the site locally: it builds exactly what `deploy:site` would
 * (a commit, in a worktree), so a check passed in the preview is a check on what ships. It needs
 * no remote and does not publish. tosijs-ui's `devServer` is not used for this because it builds
 * in THIS checkout, and `buildSite()` deletes `dist/` (reason 1 below).
 *
 * Built in a throwaway git worktree, never in this checkout, for two reasons:
 *
 * 1. `buildSite()` deletes `dist/` on every run, and this checkout's `dist/` is what the
 *    release attestation hashes and what `npm pack` ships. Running it here silently
 *    invalidates a release in progress.
 * 2. A worktree builds exactly what was committed, so the site names a commit, not whatever
 *    happened to be on disk.
 *
 * The old playground (`.demo/`, Firebase) is a separate deploy: `bun run deploy:hosting`.
 */
import { $ } from 'bun'
import { mkdtempSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const repo = (await $`git rev-parse --show-toplevel`.text()).trim()
const args = process.argv.slice(2)
const preview = args.includes('--preview')
const ref = args.find((a) => !a.startsWith('--')) ?? 'HEAD'
const PREVIEW_PORT = Number(process.env.SITE_PREVIEW_PORT ?? 8790)
const sha = (await $`git rev-parse --short ${ref}`.cwd(repo).text()).trim()

// A site that says "built from <sha>" must name a commit others can see. Refuse one that is
// not on any remote branch (unpushed, or a local experiment) rather than publish a receipt
// that points at nothing.
const onRemote = (
  await $`git branch -r --contains ${sha}`.cwd(repo).nothrow().text()
).trim()
if (!onRemote && !preview) {
  console.error(
    `✖ ${sha} is not on any remote branch — push it first, then deploy.`
  )
  process.exit(1)
}
// Clear worktrees left by an interrupted earlier run. `prune` only drops the records of
// worktrees whose directories are already gone, but it is repo-wide, so it says what it drops
// (`-v`) rather than doing it silently.
await $`git worktree prune -v`.cwd(repo)
const work = mkdtempSync(join(tmpdir(), 'tjs-site-'))
const tree = join(work, 'tree')

try {
  await $`git worktree add --detach ${tree} ${sha}`.cwd(repo).quiet()
  symlinkSync(join(repo, 'node_modules'), join(tree, 'node_modules'))
  await Bun.write(
    join(tree, '.build-site.ts'),
    `import { buildSite } from 'tosijs-ui/site'
import config from './tjs-site.config'
if (!(await buildSite(config))) process.exit(1)
`
  )
  console.log(`▶ building the site from ${sha}`)
  await $`bun .build-site.ts`.cwd(tree)

  const out = join(tree, '.site')
  if (preview) {
    // Copy out of the worktree (removed in `finally`) and serve until interrupted.
    const served = join(repo, '.site-preview')
    rmSync(served, { recursive: true, force: true })
    await $`cp -R ${out} ${served}`
    serveStatic(served, sha)
    await new Promise(() => {})
  }
  const remote = (await $`git remote get-url origin`.cwd(repo).text()).trim()
  await $`git init -q -b gh-pages`.cwd(out)
  await $`git add -A`.cwd(out)
  await $`git commit -qm ${`site: built from ${sha}`}`.cwd(out)
  console.log(`▶ publishing to gh-pages`)
  await $`git push -q -f ${remote} gh-pages`.cwd(out)
  console.log(
    `✅ published ${sha} → https://tjs.tosijs.net (GitHub Pages builds in ~1 minute)`
  )
} finally {
  await $`git worktree remove --force ${tree}`.cwd(repo).nothrow().quiet()
  rmSync(work, { recursive: true, force: true })
}

/** GitHub Pages' resolution: a path, else `<path>/index.html`, else `<path>.html`, else 404. */
function serveStatic(root: string, sha: string) {
  Bun.serve({
    port: PREVIEW_PORT,
    hostname: '127.0.0.1',
    async fetch(req: Request) {
      const path = decodeURIComponent(new URL(req.url).pathname)
      if (path.split('/').includes('..'))
        return new Response('bad path', { status: 400 })
      for (const candidate of [path, `${path}/index.html`, `${path}.html`]) {
        const file = Bun.file(join(root, candidate))
        if ((await file.exists()) && !candidate.endsWith('/'))
          return new Response(file, {
            headers: { 'Cache-Control': 'no-store' },
          })
      }
      const notFound = Bun.file(join(root, '404.html'))
      return (await notFound.exists())
        ? new Response(notFound, { status: 404 })
        : new Response('not found', { status: 404 })
    },
  })
  console.log(
    `✅ preview of ${sha} → http://localhost:${PREVIEW_PORT} (not published; Ctrl-C to stop)`
  )
}
