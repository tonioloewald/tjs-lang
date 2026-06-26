/**
 * Drives the REAL completion source the playground uses (tjsCompletionSource),
 * headlessly — its APIs (matchBefore / state.doc / pos / explicit) are DOM-free.
 *
 * Regression for the bug where the regex extractor missed destructuring, so the
 * tosijs todo example (everything bound via destructuring) suggested nothing.
 */
import { describe, it, expect } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { tjsCompletionSource } from './ajs-language'
import type { AutocompleteConfig } from './ajs-language'

const TODO = `import { elements, tosi } from 'tosijs'
const { todoApp } = tosi({ todoApp: { items: [], newItem: '' } })
const { h1, ul, template, li, label, input, button } = elements
`

async function optionsFor(
  source: string,
  pos: number = source.length,
  config: AutocompleteConfig = {}
) {
  const state = EditorState.create({ doc: source })
  const ctx = new CompletionContext(state, pos, /* explicit */ true)
  const result = await tjsCompletionSource(config)(ctx)
  return result?.options ?? []
}
const labelsFor = async (...args: Parameters<typeof optionsFor>) =>
  (await optionsFor(...args)).map((o) => o.label)

describe('tjsCompletionSource — scope-aware locals (live provider)', () => {
  it('suggests destructured bindings from the real todo example', async () => {
    const labels = await labelsFor(TODO)
    expect(labels).toContain('todoApp')
    expect(labels).toContain('h1')
    expect(labels).toContain('button')
    expect(labels).toContain('elements')
  })

  it('completes `tod` to todoApp', async () => {
    expect(await labelsFor(TODO + 'tod')).toContain('todoApp')
  })

  it('annotates a destructured binding with its source (∈ elements)', async () => {
    const opts = await optionsFor(TODO)
    expect(opts.find((o) => o.label === 'h1')?.detail).toBe('∈ elements')
  })
})

describe('tjsCompletionSource — member completion via live bindings (1b-i)', () => {
  // Stand in for the user's executed scope, live (resolved imports path).
  const liveBindings = {
    todoApp: { items: ['bathe the cat'], newItem: '', addItem() {} },
  }
  const member = (tail: string) =>
    labelsFor(`const x = 1\n${tail}`, undefined, {
      getLiveBindings: () => liveBindings,
    })

  it('todoApp. → its real properties (items, newItem, addItem)', async () => {
    const labels = await member('todoApp.')
    expect(labels).toContain('items')
    expect(labels).toContain('newItem')
    expect(labels).toContain('addItem')
  })

  it('todoApp.items. → array methods (push, map) — nested path resolves', async () => {
    const labels = await member('todoApp.items.')
    expect(labels).toContain('push')
    expect(labels).toContain('map')
  })

  it('unknown path resolves to nothing (no crash)', async () => {
    expect(await member('todoApp.nope.')).toEqual([])
  })
})

describe('tjsCompletionSource — member completion via the bridge (1b-ii)', () => {
  // The introspection bridge: async, returns the REAL runtime members for a path
  // the sync bindings don't know about (the user's own executed scope).
  const getMembers = async (path: string) => {
    if (path === 'todoApp')
      return [
        { label: 'items', type: 'property' as const, detail: 'object' },
        { label: 'addItem', type: 'method' as const, detail: '()' },
      ]
    if (path === 'todoApp.items')
      return [{ label: 'push', type: 'method' as const, detail: '(arg1)' }]
    return []
  }

  it('falls back to the bridge when sync bindings miss the path', async () => {
    const labels = await labelsFor('const x = 1\ntodoApp.', undefined, {
      getMembers,
    })
    expect(labels).toContain('items')
    expect(labels).toContain('addItem')
  })

  it('bridge resolves a nested path (todoApp.items.push)', async () => {
    const labels = await labelsFor('const x = 1\ntodoApp.items.', undefined, {
      getMembers,
    })
    expect(labels).toContain('push')
  })

  it('a method member becomes a callable completion', async () => {
    const opts = await optionsFor('const x = 1\ntodoApp.', undefined, {
      getMembers,
    })
    expect(opts.find((o) => o.label === 'addItem')?.type).toBe('method')
  })
})
