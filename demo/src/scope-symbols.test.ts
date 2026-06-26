import { describe, it, expect } from 'bun:test'
import { collectScopeSymbols, type ScopeSymbol } from './scope-symbols'

// `|` marks the cursor; returns source without it + the offset.
function at(src: string): { source: string; position: number } {
  const position = src.indexOf('|')
  if (position === -1) return { source: src, position: src.length }
  return { source: src.slice(0, position) + src.slice(position + 1), position }
}

const names = (syms: ScopeSymbol[]) => syms.map((s) => s.name).sort()
const find = (syms: ScopeSymbol[], n: string) => syms.find((s) => s.name === n)

describe('collectScopeSymbols — destructuring-aware scope', () => {
  it('object destructuring from a call (the bug: `const { todoApp } = tosi(...)`)', () => {
    const { source } = at(`const { todoApp } = tosi({ items: [] })`)
    const syms = collectScopeSymbols(source)
    expect(names(syms)).toContain('todoApp')
    expect(find(syms, 'todoApp')?.origin?.via).toBe('destructure')
    expect(find(syms, 'todoApp')?.origin?.expr).toBe('tosi({ items: [] })')
  })

  it('multiple names destructured from an identifier carry member + source', () => {
    const { source } = at(`const { h1, ul, button } = elements`)
    const syms = collectScopeSymbols(source)
    expect(names(syms)).toEqual(['button', 'h1', 'ul'])
    // origin is the introspection hook: `elements.h1`
    expect(find(syms, 'h1')?.origin?.expr).toBe('elements')
    expect(find(syms, 'h1')?.origin?.member).toBe('h1')
  })

  it('array destructuring, holes skipped', () => {
    const { source } = at(`const [first, , third] = items`)
    expect(names(collectScopeSymbols(source))).toEqual(['first', 'third'])
  })

  it('rename binds the new name, records the source key', () => {
    const { source } = at(`const { color: c } = theme`)
    const syms = collectScopeSymbols(source)
    expect(names(syms)).toEqual(['c'])
    expect(find(syms, 'c')?.origin?.member).toBe('color')
  })

  it('defaults and rest', () => {
    const a = collectScopeSymbols(at(`const { x = 1, ...rest } = o`).source)
    expect(names(a)).toEqual(['rest', 'x'])
    const b = collectScopeSymbols(at(`const [head, ...tail] = xs`).source)
    expect(names(b)).toEqual(['head', 'tail'])
  })

  it('imports (named, default, namespace, renamed)', () => {
    const { source } = at(
      `import def, { tosi, elements as els } from 'tosijs'\nimport * as ns from 'x'`
    )
    const syms = collectScopeSymbols(source)
    expect(names(syms)).toEqual(['def', 'els', 'ns', 'tosi'])
    expect(find(syms, 'tosi')?.origin?.module).toBe('tosijs')
    expect(find(syms, 'els')?.kind).toBe('import')
  })

  it('function name in scope; params only inside the body', () => {
    const inside = at(`function ship(to, qty) {\n  |\n}`)
    const syms = collectScopeSymbols(inside.source, inside.position)
    expect(names(syms)).toEqual(['qty', 'ship', 'to'])

    const outside = at(`function ship(to, qty) {}\n|`)
    const syms2 = collectScopeSymbols(outside.source, outside.position)
    expect(names(syms2)).toContain('ship')
    expect(names(syms2)).not.toContain('to')
  })

  it('destructured params too', () => {
    const inside = at(`function render({ title, items }) {\n  |\n}`)
    const syms = collectScopeSymbols(inside.source, inside.position)
    expect(names(syms)).toEqual(['items', 'render', 'title'])
  })

  it('position-scoped: declarations after the cursor are excluded', () => {
    const { source, position } = at(`const before = 1\n|\nconst after = 2`)
    const syms = collectScopeSymbols(source, position)
    expect(names(syms)).toContain('before')
    expect(names(syms)).not.toContain('after')
  })

  it('resilient to mid-edit / not-yet-valid source (acorn-loose)', () => {
    // trailing incomplete line shouldn't blank out the earlier bindings
    const { source, position } = at(`const { todoApp } = tosi({})\ntodoApp.i|`)
    const syms = collectScopeSymbols(source, position)
    expect(names(syms)).toContain('todoApp')
  })

  it('the real tosijs todo example surfaces every binding', () => {
    const src = `import { elements, tosi } from 'tosijs'
const { todoApp } = tosi({ todoApp: { items: [], newItem: '' } })
const { h1, ul, template, li, label, input, button } = elements
`
    const got = names(collectScopeSymbols(src))
    for (const n of [
      'elements',
      'tosi',
      'todoApp',
      'h1',
      'ul',
      'template',
      'li',
      'label',
      'input',
      'button',
    ]) {
      expect(got).toContain(n)
    }
  })
})
