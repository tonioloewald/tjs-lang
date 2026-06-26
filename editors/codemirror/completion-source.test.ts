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

const TODO = `import { elements, tosi } from 'tosijs'
const { todoApp } = tosi({ todoApp: { items: [], newItem: '' } })
const { h1, ul, template, li, label, input, button } = elements
`

function complete(source: string, pos: number = source.length) {
  const state = EditorState.create({ doc: source })
  const ctx = new CompletionContext(state, pos, /* explicit */ true)
  const result = tjsCompletionSource()(ctx)
  return (result?.options ?? []).map((o) => o.label)
}

describe('tjsCompletionSource — scope-aware locals (live provider)', () => {
  it('suggests destructured bindings from the real todo example', () => {
    const labels = complete(TODO)
    expect(labels).toContain('todoApp')
    expect(labels).toContain('h1')
    expect(labels).toContain('button')
    expect(labels).toContain('elements')
  })

  it('completes `tod` to todoApp', () => {
    const src = TODO + 'tod'
    const labels = complete(src)
    expect(labels).toContain('todoApp')
  })

  it('annotates a destructured binding with its source (∈ elements)', () => {
    const state = EditorState.create({ doc: TODO })
    const ctx = new CompletionContext(state, TODO.length, true)
    const opts = tjsCompletionSource()(ctx)?.options ?? []
    expect(opts.find((o) => o.label === 'h1')?.detail).toBe('∈ elements')
  })
})

describe('tjsCompletionSource — member completion via live bindings (1b)', () => {
  // Stand in for the introspection bridge: the user's executed scope, live.
  const liveBindings = {
    todoApp: {
      items: ['bathe the cat'],
      newItem: '',
      addItem() {},
    },
  }
  const source = (tail: string) => `const x = 1\n${tail}`
  const memberLabels = (tail: string) => {
    const src = source(tail)
    const state = EditorState.create({ doc: src })
    const ctx = new CompletionContext(state, src.length, true)
    const result = tjsCompletionSource({ getLiveBindings: () => liveBindings })(
      ctx
    )
    return (result?.options ?? []).map((o) => o.label)
  }

  it('todoApp. → its real properties (items, newItem, addItem)', () => {
    const labels = memberLabels('todoApp.')
    expect(labels).toContain('items')
    expect(labels).toContain('newItem')
    expect(labels).toContain('addItem')
  })

  it('todoApp.items. → array methods (push, map) — nested path resolves', () => {
    const labels = memberLabels('todoApp.items.')
    expect(labels).toContain('push')
    expect(labels).toContain('map')
  })

  it('unknown path resolves to nothing (no crash)', () => {
    expect(memberLabels('todoApp.nope.')).toEqual([])
  })
})
