/**
 * Tests for TJS documentation generation
 *
 * The docs system is dead simple: walk source in order, emit what you find.
 * Doc blocks are markdown. Function signatures are code. That's it.
 */

import { describe, it, expect } from 'bun:test'
import { generateDocs, generateDocsMarkdown } from './docs'

describe('generateDocs', () => {
  describe('basic output', () => {
    it('extracts function signatures in document order', () => {
      const source = `
function first(x: 5) -> 10 {
  return x * 2
}

function second(a: '', b: 0) -> '' {
  return a + b
}
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(2)
      expect(result.items[0].type).toBe('function')
      expect(result.items[0]).toHaveProperty('name', 'first')
      expect(result.items[1].type).toBe('function')
      expect(result.items[1]).toHaveProperty('name', 'second')
    })

    it('extracts doc blocks in document order', () => {
      const source = `
/*#
# Module Header

This is the intro.
*/

/*#
More docs here.
*/
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(2)
      expect(result.items[0].type).toBe('doc')
      expect(result.items[0]).toHaveProperty('content')
      expect((result.items[0] as any).content).toContain('Module Header')
      expect(result.items[1].type).toBe('doc')
      expect((result.items[1] as any).content).toContain('More docs here')
    })

    it('interleaves docs and functions in document order', () => {
      const source = `
/*#
# First Section
*/
function first(x: 0) -> 0 { return x }

/*#
# Second Section
*/
function second(x: 0) -> 0 { return x }
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(4)
      expect(result.items[0].type).toBe('doc')
      expect(result.items[1].type).toBe('function')
      expect(result.items[1]).toHaveProperty('name', 'first')
      expect(result.items[2].type).toBe('doc')
      expect(result.items[3].type).toBe('function')
      expect(result.items[3]).toHaveProperty('name', 'second')
    })
  })

  describe('function signatures', () => {
    it('captures full signature with params and return type', () => {
      const source = `function greet(name: 'World') -> '' { return name }`
      const result = generateDocs(source)

      const func = result.items[0] as any
      expect(func.type).toBe('function')
      expect(func.signature).toContain('greet')
      expect(func.signature).toContain("name: 'World'")
      expect(func.signature).toContain("-> ''")
    })

    it('captures optional params with defaults', () => {
      const source = `function greet(name = 'World') { return name }`
      const result = generateDocs(source)

      const func = result.items[0] as any
      expect(func.signature).toContain("name = 'World'")
    })

    it('handles functions without return type', () => {
      const source = `function doStuff(x: 0) { console.log(x) }`
      const result = generateDocs(source)

      const func = result.items[0] as any
      expect(func.signature).toBe('function doStuff(x: 0)')
    })
  })

  describe('doc block content', () => {
    it('preserves markdown formatting', () => {
      const source = `
/*#
# Heading

- List item 1
- List item 2

\`code example\`
*/
`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      expect(doc.content).toContain('# Heading')
      expect(doc.content).toContain('- List item 1')
      expect(doc.content).toContain('`code example`')
    })

    it('preserves markdown tables', () => {
      const source = `
/*#
## Parameter Syntax
| Syntax | Meaning |
|--------|---------|
| \`x: 0\` | Required number |
| \`x = 0\` | Optional, defaults to 0 |
*/
`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      expect(doc.content).toContain('| Syntax | Meaning |')
      expect(doc.content).toContain('|--------|---------|')
      expect(doc.content).toContain('| `x: 0` | Required number |')
    })

    it('dedents common leading whitespace', () => {
      const source = `
/*#
    Indented content.
    More indented.
*/
`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      // Should not start with lots of spaces
      expect(doc.content).toBe('Indented content.\nMore indented.')
    })
  })

  describe('markdown output', () => {
    it('renders doc blocks as plain markdown', () => {
      const source = `
/*#
# Hello World

This is documentation.
*/
`
      const result = generateDocs(source)

      expect(result.markdown).toContain('# Hello World')
      expect(result.markdown).toContain('This is documentation.')
    })

    it('renders function signatures as code blocks', () => {
      const source = `function double(x: 5) -> 10 { return x * 2 }`
      const result = generateDocs(source)

      expect(result.markdown).toContain('```tjs')
      expect(result.markdown).toContain('function double(x: 5) -> 10')
      expect(result.markdown).toContain('```')
    })

    it('outputs items separated by blank lines', () => {
      const source = `
/*#
Intro
*/
function first(x: 0) -> 0 { return x }
/*#
Middle
*/
function second(x: 0) -> 0 { return x }
`
      const result = generateDocs(source)

      // Should have blank lines between items
      expect(result.markdown.split('\n\n').length).toBeGreaterThan(1)
    })
  })

  describe('real-world example', () => {
    it('documents a module with header and functions', () => {
      const source = `
/*#
# Math Utilities

A collection of math functions.
*/

function double(x: 5) -> 10 {
  return x * 2
}

function triple(x: 3) -> 9 {
  return x * 3
}

/*#
## Notes

These functions are pure.
*/
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(4)

      // First: module header
      expect(result.items[0].type).toBe('doc')
      expect((result.items[0] as any).content).toContain('Math Utilities')

      // Second: double function
      expect(result.items[1].type).toBe('function')
      expect((result.items[1] as any).name).toBe('double')

      // Third: triple function
      expect(result.items[2].type).toBe('function')
      expect((result.items[2] as any).name).toBe('triple')

      // Fourth: notes section
      expect(result.items[3].type).toBe('doc')
      expect((result.items[3] as any).content).toContain('Notes')

      // Markdown should have it all
      expect(result.markdown).toContain('Math Utilities')
      expect(result.markdown).toContain('function double')
      expect(result.markdown).toContain('function triple')
      expect(result.markdown).toContain('Notes')
    })
  })

  describe('TypeScript function syntax', () => {
    it('parses TypeScript function with return type', () => {
      const source = `function greet(name: string): string { return name }`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].type).toBe('function')
      expect((result.items[0] as any).signature).toBe(
        'function greet(name: string): string'
      )
    })

    it('parses TypeScript function without return type', () => {
      const source = `function log(msg: string) { console.log(msg) }`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(1)
      expect((result.items[0] as any).signature).toBe(
        'function log(msg: string)'
      )
    })

    it('handles mixed TJS and TypeScript in same file', () => {
      const source = `
function tsFunc(x: number): number { return x }
function tjsFunc(x: 0) -> 0 { return x }
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(2)
      expect((result.items[0] as any).signature).toContain(': number')
      expect((result.items[1] as any).signature).toContain('-> 0')
    })
  })
})

describe('generateDocsMarkdown', () => {
  it('returns placeholder for empty source', () => {
    const result = generateDocsMarkdown('', undefined)
    expect(result).toBe('*No documentation available*')
  })

  it('renders doc blocks as markdown', () => {
    const source = `/*# Hello World */`
    const result = generateDocsMarkdown(source, undefined)
    expect(result).toContain('Hello World')
  })

  it('renders function with type metadata', () => {
    const source = `function greet(name: 'World') -> '' { return name }`
    const types = {
      greet: {
        params: {
          name: { type: { kind: 'string' }, required: true, example: 'World' },
        },
        returns: { kind: 'string' },
      },
    }

    const result = generateDocsMarkdown(source, types)

    expect(result).toContain('## greet')
    expect(result).toContain('```tjs')
    expect(result).toContain("function greet(name: 'World') -> ''")
    expect(result).toContain('**Parameters:**')
    expect(result).toContain('`name`: string')
    expect(result).toContain('(e.g. `"World"`)')
    expect(result).toContain('**Returns:** string')
  })

  it('shows optional parameters', () => {
    const source = `function greet(name = 'World') { return name }`
    const types = {
      greet: {
        params: {
          name: {
            type: { kind: 'string' },
            required: false,
            example: 'World',
          },
        },
      },
    }

    const result = generateDocsMarkdown(source, types)
    expect(result).toContain('*(optional)*')
  })

  it('works without type metadata', () => {
    const source = `
/*# Intro */
function foo(x: 0) -> 0 { return x }
`
    const result = generateDocsMarkdown(source, undefined)

    expect(result).toContain('Intro')
    expect(result).toContain('## foo')
    expect(result).toContain('function foo(x: 0) -> 0')
    // No params/returns since no type metadata
    expect(result).not.toContain('**Parameters:**')
  })

  it('preserves document order with interleaved docs and functions', () => {
    const source = `
/*# Section 1 */
function first(x: 0) -> 0 { return x }
/*# Section 2 */
function second(x: 0) -> 0 { return x }
/*# Conclusion */
`
    const types = {
      first: { params: { x: { type: { kind: 'number' }, required: true } } },
      second: { params: { x: { type: { kind: 'number' }, required: true } } },
    }

    const result = generateDocsMarkdown(source, types)

    // Check order by finding positions
    const section1Pos = result.indexOf('Section 1')
    const firstPos = result.indexOf('## first')
    const section2Pos = result.indexOf('Section 2')
    const secondPos = result.indexOf('## second')
    const conclusionPos = result.indexOf('Conclusion')

    expect(section1Pos).toBeLessThan(firstPos)
    expect(firstPos).toBeLessThan(section2Pos)
    expect(section2Pos).toBeLessThan(secondPos)
    expect(secondPos).toBeLessThan(conclusionPos)
  })

  it('works with TypeScript source', () => {
    const source = `
/*# TypeScript Example */
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`
    const types = {
      greet: {
        params: {
          name: { type: { kind: 'string' }, required: true, example: '' },
        },
        returns: { kind: 'string' },
      },
    }

    const result = generateDocsMarkdown(source, types)

    expect(result).toContain('TypeScript Example')
    expect(result).toContain('## greet')
    expect(result).toContain('function greet(name: string): string')
    expect(result).toContain('**Parameters:**')
    expect(result).toContain('**Returns:** string')
  })
})
