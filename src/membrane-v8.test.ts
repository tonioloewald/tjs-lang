/**
 * Membrane copies stay in V8's FAST mode (cumulative review 17, M2).
 *
 * Round 41 built object copies with a null prototype and switched it at the end; V8 leaves such
 * objects in dictionary mode, so every host that read an egress input, a copied argument or a
 * returned result paid for slow property access (measured 1.6–12×). Bun runs JavaScriptCore, so
 * only a real `node` subprocess against the BUILT bundle can see it.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const BUNDLE = join(ROOT, 'dist', 'tjs-vm-ast.js')
const hasNode = Bun.spawnSync(['node', '--version']).exitCode === 0

const probe = (body: string) => {
  const r = Bun.spawnSync([
    'node',
    '--allow-natives-syntax',
    '--input-type=module',
    '-e',
    `const m = await import(${JSON.stringify(BUNDLE)}); ${body}`,
  ])
  return (r.stdout.toString() + r.stderr.toString()).trim()
}

describe('membrane copies are fast-mode objects in V8', () => {
  if (process.env.CI)
    it('the bundle and node exist in CI', () => {
      expect(existsSync(BUNDLE)).toBe(true)
      expect(hasNode).toBe(true)
    })
  if (!existsSync(BUNDLE) || !hasNode) return

  it('the apparatus sees dictionary mode when it exists', () => {
    expect(
      probe(
        `const o = { a: 1, b: 2 }; delete o.a; console.log(%HasFastProperties(o))`
      )
    ).toBe('false')
  })

  it('object and array copies, nested, are fast', () => {
    expect(
      probe(`
        const r = m.membraneValue({ a: 1, b: { c: 2 }, list: [1, 2, { d: 3 }] }, 1e6)
        console.log([
          %HasFastProperties(r.value),
          %HasFastProperties(r.value.b),
          %HasFastProperties(r.value.list),
          %HasFastProperties(r.value.list[2]),
        ].join(','))
      `)
    ).toBe('true,true,true,true')
  })
})
