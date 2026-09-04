/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { join } from 'node:path'

import {
  defaultOutDir,
  isInstalled,
} from '/Users/tonioloewald/tjs-lang/src/cli/playground'

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
