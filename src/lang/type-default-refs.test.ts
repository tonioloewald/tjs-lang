/**
 * A Type's `.default` resolves the Types its example names (#4097).
 *
 * `Type Piece { example: { cells: [Cell] } }` had `Piece.default.cells[0]` holding the Cell
 * TYPE OBJECT, so `JSON.stringify(Piece.default)` printed it (or `null` under `tjs run`). A
 * reference now resolves to the referenced Type's default, read when asked for so a Type
 * declared later is found. A cycle is dropped from an array, omitted from an object and skipped
 * in a union. Run with no shared runtime and with one installed, since emitted code uses its
 * inline Type either way.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const SRC = `Type Cell { example: { row: 0, column: 0 } }
Type Piece { example: { cells: [Cell] } }
Type Node { example: { v: 0, kids: [Node], next: Node | null } }
Type A { example: { b: B | null } }
Type B { example: { a: A | null, n: 0 } }
Type Early { example: { late: Late } }
Type Late { example: { s: '' } }`

const load = (shared: boolean) => {
  const g = globalThis as any
  const saved = g.__tjs
  if (shared) g.__tjs = createRuntime()
  try {
    return new Function(tjs(SRC).code + '\nreturn { Piece, Node, A, Early }')()
  } finally {
    g.__tjs = saved
  }
}

for (const shared of [false, true])
  describe(`Type .default with references (${
    shared ? 'shared runtime' : 'inline'
  })`, () => {
    const T = load(shared)
    it('resolves a referenced Type to its default', () => {
      expect(T.Piece.default).toEqual({ cells: [{ row: 0, column: 0 }] })
      expect(JSON.parse(JSON.stringify(T.Piece)).default).toEqual({
        cells: [{ row: 0, column: 0 }],
      })
    })
    it('a self-reference is a cycle: dropped from an array, skipped in a union', () => {
      expect(T.Node.default).toEqual({ v: 0, kids: [], next: null })
    })
    it('mutual recursion terminates', () => {
      expect(T.A.default).toEqual({ b: { a: null, n: 0 } })
    })
    it('a Type declared later is found', () => {
      expect(T.Early.default).toEqual({ late: { s: '' } })
    })
    it('each read is a fresh value, so mutating one does not change the type', () => {
      const d = T.Piece.default
      d.cells.push({ row: 9, column: 9 })
      expect(T.Piece.default.cells).toHaveLength(1)
    })
  })
