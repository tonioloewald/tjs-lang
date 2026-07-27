/**
 * Issue #23 — `configure()` after a converted module captured the runtime is a
 * silent no-op (the module snapshotted its config at import). We can't fix that
 * silently in a patch (making config a live global read would change the
 * intentional per-instance isolation), so it must at least WARN loudly.
 *
 * The distinguisher: the top-level install calls the bare module-level
 * `createRuntime()`; an emitted/converted module captures via the INSTANCE's
 * `globalThis.__tjs.createRuntime()`. Only the latter flags "modules captured",
 * so configuring before any module loads never warns.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createRuntime, configure, resetRuntime } from './runtime'

describe('late-configure guard (#23)', () => {
  let warnings: string[]
  let originalWarn: typeof console.warn
  let savedGlobal: any

  beforeEach(() => {
    savedGlobal = (globalThis as any).__tjs
    resetRuntime() // clears the sticky modulesCaptured / warnedLateConfigure flags
    warnings = []
    originalWarn = console.warn
    console.warn = (m?: any) => warnings.push(String(m))
  })
  afterEach(() => {
    console.warn = originalWarn
    ;(globalThis as any).__tjs = savedGlobal
    resetRuntime()
  })

  const lateWarnings = () => warnings.filter((w) => w.includes('issues/23'))

  it('does NOT warn when configuring before any module captures', () => {
    ;(globalThis as any).__tjs = createRuntime() // install (bare module-level createRuntime)
    configure({ throwTypeErrors: true })
    expect(lateWarnings().length).toBe(0)
  })

  it('warns loudly when configuring AFTER a converted module captured', () => {
    const g = createRuntime()
    ;(globalThis as any).__tjs = g
    g.createRuntime() // emitted module capture: globalThis.__tjs.createRuntime()
    configure({ logTypeErrors: true })
    expect(lateWarnings().length).toBe(1)
    expect(lateWarnings()[0]).toMatch(/configure\(\) was called after/)
  })

  it('warns only once, and instance .configure() is guarded too', () => {
    const g = createRuntime()
    ;(globalThis as any).__tjs = g
    g.createRuntime() // capture
    configure({ logTypeErrors: true }) // first late configure → warns
    g.configure({ debug: true }) // second → once-guarded, no repeat
    expect(lateWarnings().length).toBe(1)
  })

  it('an instance .configure() after capture also warns (not just module-level)', () => {
    const g = createRuntime()
    ;(globalThis as any).__tjs = g
    g.createRuntime() // capture
    g.configure({ throwTypeErrors: true }) // late instance configure
    expect(lateWarnings().length).toBe(1)
  })
})
