/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { join, isAbsolute } from 'node:path'

import { resolveCacheDir } from '/Users/tonioloewald/tjs-lang/src/batteries/audit'

const CASES = [
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
    const KEYS = [
      'HOME',
      'USERPROFILE',
      'XDG_CACHE_HOME',
      'LOCALAPPDATA',
      'TMPDIR',
    ]
    const PLATFORMS = ['darwin', 'linux', 'win32', 'freebsd']
    for (let mask = 0; mask < 1 << KEYS.length; mask++) {
      const env = {}
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
