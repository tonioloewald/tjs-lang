/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  createRuntime,
  configure,
  resetRuntime,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

describe('late-configure guard (#23)', () => {
  let warnings
  let originalWarn
  let savedGlobal
  beforeEach(() => {
    savedGlobal = globalThis.__tjs
    resetRuntime()
    warnings = []
    originalWarn = console.warn
    console.warn = (m) => warnings.push(String(m))
  })
  afterEach(() => {
    console.warn = originalWarn
    globalThis.__tjs = savedGlobal
    resetRuntime()
  })
  const lateWarnings = () => warnings.filter((w) => w.includes('issues/23'))
  it('does NOT warn when configuring before any module captures', () => {
    globalThis.__tjs = createRuntime()
    configure({ throwTypeErrors: true })
    expect(lateWarnings().length).toBe(0)
  })
  it('warns loudly when configuring AFTER a converted module captured', () => {
    const g = createRuntime()
    globalThis.__tjs = g
    g.createRuntime()
    configure({ logTypeErrors: true })
    expect(lateWarnings().length).toBe(1)
    expect(lateWarnings()[0]).toMatch(/configure\(\) was called after/)
  })
  it('warns only once, and instance .configure() is guarded too', () => {
    const g = createRuntime()
    globalThis.__tjs = g
    g.createRuntime()
    configure({ logTypeErrors: true })
    g.configure({ debug: true })
    expect(lateWarnings().length).toBe(1)
  })
  it('an instance .configure() after capture also warns (not just module-level)', () => {
    const g = createRuntime()
    globalThis.__tjs = g
    g.createRuntime()
    g.configure({ throwTypeErrors: true })
    expect(lateWarnings().length).toBe(1)
  })
})
