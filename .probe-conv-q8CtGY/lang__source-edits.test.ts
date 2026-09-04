/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { applyEdits } from '/Users/tonioloewald/tjs-lang/src/lang/source-edits'

/* line 15 */
/* TODO: TS types degraded — return: SourceEdit */
function E(start, end, text) {
  return {
    start,
    end,
    text,
  }
}
E.__tjs = {
  params: {
    start: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
    end: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
    text: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:9',
}

describe('the boundary case', () => {
  it('an insertion at a replacement’s END lands AFTER it', () => {
    const src = 'return TERNARY'
    const out = applyEdits(src, [E(7, 14, 'REPLACED'), E(14, 14, ' }')])
    expect(out).toBe('return REPLACED }')
  })
  it('an insertion at a replacement’s START lands BEFORE it', () => {
    const src = 'return TERNARY'
    const out = applyEdits(src, [E(7, 14, 'REPLACED'), E(7, 7, '{ ')])
    expect(out).toBe('return { REPLACED')
  })
  it('the two are not confused with each other', () => {
    const src = 'return TERNARY'
    const out = applyEdits(src, [
      E(7, 7, '{ '),
      E(7, 14, 'REPLACED'),
      E(14, 14, ' }'),
    ])
    expect(out).toBe('return { REPLACED }')
  })
})

describe('the emitter’s existing idioms keep working', () => {
  it('delete a span and insert at its start means REPLACE', () => {
    const out = applyEdits('abcdef', [E(1, 4, ''), E(1, 1, 'XY')])
    expect(out).toBe('aXYef')
  })
  it('several insertions at one position keep their established order', () => {
    const out = applyEdits('ab', [E(1, 1, 'first'), E(1, 1, 'second')])
    expect(out).toBe('asecondfirstb')
  })
  it('a pure deletion removes exactly its span', () => {
    expect(applyEdits('abcdef', [E(2, 4, '')])).toBe('abef')
  })
  it('edits are independent of the order they were pushed', () => {
    const edits = [E(8, 9, 'Z'), E(0, 1, 'A'), E(4, 5, 'M')]
    expect(applyEdits('0123456789', [...edits])).toBe('A123M567Z9')
    expect(applyEdits('0123456789', [...edits].reverse())).toBe('A123M567Z9')
  })
  it('no edits changes nothing', () => {
    expect(applyEdits('unchanged', [])).toBe('unchanged')
  })
})

describe('conflicts fail loudly instead of emitting something', () => {
  it('an insertion strictly INSIDE a replaced span throws', () => {
    expect(() =>
      applyEdits('return TERNARY', [E(7, 14, 'REPLACED'), E(10, 10, 'X')])
    ).toThrow(/Overlapping source edits/)
  })
  it('two partially overlapping replacements throw', () => {
    expect(() => applyEdits('abcdefgh', [E(1, 5, 'X'), E(3, 7, 'Y')])).toThrow(
      /Overlapping source edits/
    )
  })
  it('the message says what to do about it', () => {
    expect(() => applyEdits('abcdefgh', [E(1, 5, 'X'), E(3, 7, 'Y')])).toThrow(
      /gap text/
    )
  })
  it('IDENTICAL duplicate edits are a no-op, not a conflict', () => {
    expect(applyEdits('abcdef', [E(1, 3, 'X'), E(1, 3, 'X')])).toBe('aXdef')
  })
  it('adjacent edits touching at an endpoint are NOT an overlap', () => {
    expect(applyEdits('abcdef', [E(1, 3, 'X'), E(3, 5, 'Y')])).toBe('aXYf')
  })
})
