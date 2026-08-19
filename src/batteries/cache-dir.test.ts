/**
 * The model-audit cache never lands in the consumer's working directory.
 *
 * `tjs-lang/batteries` used to drop `.models.cache.json` into `process.cwd()` — whatever
 * repo you happened to run from, under a name their `.gitignore` does not cover. The fix
 * for that reintroduced it in a different hat: a `|| '.'` fallback that fires whenever
 * `HOME` is unset (scratch containers, some CI images, systemd units), writing
 * `./.cache/tjs-lang/…` instead.
 *
 * Three behaviours ship in this function — the `TJS_CACHE_DIR` override, the no-home
 * fallback, and the per-platform base — and none of them could be tested at all while they
 * were welded to `process.env` and `process.platform` inside an async function that also
 * did a dynamic import. That is the whole reason `resolveCacheDir` is a pure function
 * taking its environment: the property below is one line, and it was unassertable.
 *
 * THE PROPERTY: always an absolute path that belongs to us. Never relative, never cwd.
 */
import { describe, it, expect } from 'bun:test'
import { join, isAbsolute } from 'node:path'
import { resolveCacheDir } from './audit'

const CASES: Array<
  [string, Record<string, string | undefined>, string, string]
> = [
  [
    'TJS_CACHE_DIR wins over everything',
    { TJS_CACHE_DIR: '/opt/cache', HOME: '/Users/x', XDG_CACHE_HOME: '/xdg' },
    'darwin',
    '/opt/cache',
  ],
  [
    'darwin uses ~/Library/Caches',
    { HOME: '/Users/x' },
    'darwin',
    '/Users/x/Library/Caches/tjs-lang',
  ],
  [
    'linux uses ~/.cache',
    { HOME: '/home/x' },
    'linux',
    '/home/x/.cache/tjs-lang',
  ],
  [
    'XDG_CACHE_HOME overrides the platform default',
    { HOME: '/home/x', XDG_CACHE_HOME: '/xdg' },
    'linux',
    '/xdg/tjs-lang',
  ],
  [
    'win32 uses LOCALAPPDATA',
    { USERPROFILE: 'C:/Users/x', LOCALAPPDATA: 'C:/Users/x/AppData/Local' },
    'win32',
    'C:/Users/x/AppData/Local/tjs-lang',
  ],
  [
    'win32 without LOCALAPPDATA derives it from the profile',
    { USERPROFILE: 'C:/Users/x' },
    'win32',
    'C:/Users/x/AppData/Local/tjs-lang',
  ],
  [
    'no home falls back to TMPDIR',
    { TMPDIR: '/scratch' },
    'linux',
    '/scratch/tjs-lang',
  ],
  ['no home and no TMPDIR falls back to /tmp', {}, 'linux', '/tmp/tjs-lang'],
]

describe('resolveCacheDir', () => {
  for (const [label, env, platform, expected] of CASES) {
    it(label, () => {
      expect(resolveCacheDir(env, platform, join)).toBe(expected)
    })
  }

  it('NEVER returns a relative path, whatever the environment', () => {
    // The one that matters. Every combination of the variables that can be absent —
    // including all of them at once, which is the case that produced `.` twice.
    const KEYS = [
      'HOME',
      'USERPROFILE',
      'XDG_CACHE_HOME',
      'LOCALAPPDATA',
      'TMPDIR',
    ]
    const PLATFORMS = ['darwin', 'linux', 'win32', 'freebsd']
    for (let mask = 0; mask < 1 << KEYS.length; mask++) {
      const env: Record<string, string | undefined> = {}
      KEYS.forEach((k, i) => {
        if (mask & (1 << i)) env[k] = k === 'HOME' ? '/home/x' : `/set-${k}`
      })
      for (const platform of PLATFORMS) {
        const got = resolveCacheDir(env, platform, join)
        expect(
          isAbsolute(got) || /^[A-Za-z]:/.test(got),
          `relative cache path ${got} for platform=${platform} env=${JSON.stringify(
            env
          )}`
        ).toBe(true)
        expect(got.startsWith('.')).toBe(false)
      }
    }
  })
})
