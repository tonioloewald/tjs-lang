/**
 * `tjs-playground` never builds into its own installed package directory.
 *
 * The fix for that shipped with **no test at all**: the commit touched only
 * `playground.ts` and a review document, and "verified end to end" meant by hand. Its
 * sibling fix from the same session — `port.ts` — got 258 lines. The difference was not
 * diligence, it was reachability: this module exported nothing and called `main()` at
 * import, so importing it started a build and a `Bun.serve`. A module that cannot be
 * imported cannot be tested, and CLAUDE.md's "always create a reproduction test case
 * before fixing a bug" loses to that every time.
 *
 * So `main()` is now behind `import.meta.main` and the two decisions are exported. This
 * file tests the decisions, which is where the bug lived — under pnpm and bun-on-Linux the
 * package directory is a HARDLINK into the machine-wide store, so building into it
 * corrupts the copy every other project on the machine shares.
 *
 * It also covers a latent bug a test would have caught at the time: the check was
 * `rootDir.includes('node_modules')`, a SUBSTRING test.
 */
import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { defaultOutDir, isInstalled } from './playground'

describe('deciding whether we are installed', () => {
  it('recognises a plain node_modules install', () => {
    expect(isInstalled('/Users/x/app/node_modules/tjs-lang')).toBe(true)
  })

  it('recognises a pnpm store path', () => {
    expect(
      isInstalled(
        '/Users/x/app/node_modules/.pnpm/tjs-lang@0.13.0/node_modules/tjs-lang'
      )
    ).toBe(true)
  })

  it('a repo checkout is NOT an install', () => {
    expect(isInstalled('/Users/x/src/tjs-lang')).toBe(false)
  })

  it('a directory merely NAMED like node_modules is not one', () => {
    // The latent bug. `includes('node_modules')` is true here, so a developer whose
    // checkout sat under such a path would silently build into the OS cache instead of
    // `.demo` and stop matching every instruction in the docs.
    expect(isInstalled('/Users/x/my-node_modules-experiments/tjs-lang')).toBe(
      false
    )
    expect(isInstalled('/Users/x/node_modules_backup/tjs-lang')).toBe(false)
  })
})

describe('choosing the output directory', () => {
  it('a repo checkout builds into .demo', () => {
    expect(defaultOutDir('/Users/x/src/tjs-lang', '0.13.0')).toBe(
      join('/Users/x/src/tjs-lang', '.demo')
    )
  })

  it('an install NEVER builds inside the package', () => {
    // The whole point: under pnpm and bun-on-Linux that directory is a hardlink into the
    // machine-wide store, so writing there reaches every other project sharing the version.
    const root = '/Users/x/app/node_modules/tjs-lang'
    const out = defaultOutDir(root, '0.13.0')
    expect(out.startsWith(root)).toBe(false)
  })

  it('an install is keyed by version, so two cannot collide', () => {
    const root = '/Users/x/app/node_modules/tjs-lang'
    expect(defaultOutDir(root, '0.13.0')).not.toBe(
      defaultOutDir(root, '0.14.0')
    )
    expect(defaultOutDir(root, '0.13.0')).toContain('0.13.0')
  })

  it('honours XDG_CACHE_HOME', () => {
    const saved = process.env.XDG_CACHE_HOME
    process.env.XDG_CACHE_HOME = '/tmp/xdg-probe'
    try {
      expect(
        defaultOutDir('/Users/x/app/node_modules/tjs-lang', '0.13.0')
      ).toStartWith('/tmp/xdg-probe')
    } finally {
      if (saved === undefined) delete process.env.XDG_CACHE_HOME
      else process.env.XDG_CACHE_HOME = saved
    }
  })
})
