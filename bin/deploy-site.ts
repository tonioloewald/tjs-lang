#!/usr/bin/env bun
/**
 * Build the tosijs-ui doc site from a COMMIT and publish it to GitHub Pages (`gh-pages`),
 * served at https://tjs.tosijs.net.
 *
 *   bun run deploy:site            # builds HEAD
 *   bun run deploy:site <ref>      # builds <ref>
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
const ref = process.argv[2] ?? 'HEAD'
const sha = (await $`git rev-parse --short ${ref}`.cwd(repo).text()).trim()
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
