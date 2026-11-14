/**
 * Runtime configuration is live and layered, so load order does not decide whether
 * `configure()` reaches a module (#4118; this file used to pin #23's WARNING that it did not).
 *
 * Before: an emitted module snapshotted its config when it captured the runtime
 * (`globalThis.__tjs.createRuntime()`). So (a) `globalThis.__tjs = createRuntime();
 * __tjs.configure({ throwTypeErrors: true })` reached no module imported afterwards, and (b) a
 * module loaded BEFORE `installRuntime()` honoured a later `configure()` while one loaded after
 * ignored it. Now each instance reads its parent's config live, under its own overrides.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { tjs } from './index'
import {
  createRuntime,
  configure,
  installRuntime,
  resetRuntime,
} from './runtime'

const g = globalThis as any
const SRC = 'function f(x: 0) { return x }'
/** Load an emitted module; returns its `f`. */
const loadModule = () => new Function(tjs(SRC).code + '\nreturn f')()
const throws = (f: (x: any) => any) => {
  try {
    f('not a number')
    return false
  } catch {
    return true
  }
}

describe('configure() reaches every module, whatever the load order (#4118)', () => {
  let saved: any
  beforeEach(() => {
    saved = g.__tjs
    resetRuntime()
  })
  afterEach(() => {
    g.__tjs = saved
    resetRuntime()
  })

  it('(a) configuring an installed createRuntime() reaches modules loaded later', () => {
    g.__tjs = createRuntime()
    g.__tjs.configure({ throwTypeErrors: true })
    expect(throws(loadModule())).toBe(true)
  })

  it('(a) …and modules loaded earlier', () => {
    g.__tjs = createRuntime()
    const f = loadModule()
    expect(throws(f)).toBe(false)
    g.__tjs.configure({ throwTypeErrors: true })
    expect(throws(f)).toBe(true)
  })

  it('(b) a module loaded before and one loaded after installRuntime() agree', () => {
    delete g.__tjs
    const before = loadModule()
    installRuntime()
    const after = loadModule()
    configure({ throwTypeErrors: true })
    expect([throws(before), throws(after)]).toEqual([true, true])
  })

  it("an instance's own override stays its own (the other direction)", () => {
    g.__tjs = createRuntime()
    const child = g.__tjs.createRuntime()
    child.configure({ logTypeErrors: true })
    expect(g.__tjs.getConfig().logTypeErrors).toBeFalsy()
    // and an override wins over a later parent change
    child.configure({ throwTypeErrors: false })
    g.__tjs.configure({ throwTypeErrors: true })
    expect(child.getConfig().throwTypeErrors).toBe(false)
    expect(g.__tjs.createRuntime().getConfig().throwTypeErrors).toBe(true)
  })
})
