import { describe, it, expect } from 'bun:test'

// buildIframeDoc reads location.origin (browser global) — stub it for headless.
;(globalThis as any).location ??= { origin: 'http://test' }

import { buildIframeDoc } from './playground-shared'

/**
 * Structural guard for the introspection sandbox document. The critical
 * invariant: user code must run at MODULE TOP LEVEL (not inside a try block) so
 * its top-level `const`/`let` are module-scoped and the bridge's direct `eval`
 * can see them. A regression here silently breaks `todoApp.` completion.
 */
describe('buildIframeDoc — introspection bridge document', () => {
  const doc = buildIframeDoc({
    cssContent: '',
    htmlContent: '',
    importMapScript: '',
    jsCode: 'const todoApp = { items: [] }',
    importStatements: ["import { tosi } from 'https://cdn/tosijs'"],
    introspectionBridge: true,
  })

  it('runs user code at module top level — NOT inside a try block', () => {
    expect(doc).toContain('const todoApp = { items: [] }')
    // The real invariant: after the bridge is installed, the user code runs with
    // no try-wrap between (a block would re-scope its declarations away from
    // eval). (The injected introspector has its own internal try/catch — that's
    // fine and lives before the ready post.)
    const readyIdx = doc.indexOf('tjs-bridge-ready')
    const codeIdx = doc.indexOf('const todoApp')
    expect(codeIdx).toBeGreaterThan(readyIdx)
    expect(doc.slice(readyIdx, codeIdx)).not.toContain('try {')
  })

  it('installs the message listener and the injected introspector', () => {
    expect(doc).toContain("d.type !== 'tjs-introspect'")
    expect(doc).toContain('eval(d.path)')
    expect(doc).toContain('function introspectValue') // injected source
  })

  it('posts bridge-ready and puts imports first', () => {
    expect(doc).toContain('tjs-bridge-ready')
    const importIdx = doc.indexOf('import { tosi }')
    const listenerIdx = doc.indexOf('tjs-introspect')
    const codeIdx = doc.indexOf('const todoApp')
    // imports → listener → user code
    expect(importIdx).toBeGreaterThan(-1)
    expect(importIdx).toBeLessThan(listenerIdx)
    expect(listenerIdx).toBeLessThan(codeIdx)
  })

  it('does not install the bridge for a normal preview doc', () => {
    const preview = buildIframeDoc({
      cssContent: '',
      htmlContent: '',
      importMapScript: '',
      jsCode: 'console.log(1)',
    })
    expect(preview).not.toContain('tjs-introspect')
    expect(preview).toContain('try {') // normal preview DOES wrap in try
  })
})
