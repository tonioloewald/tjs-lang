/**
 * Tests for TJS documentation generation
 *
 * The docs system is dead simple: walk source in order, emit what you find.
 * Doc blocks are markdown. Function signatures are code. That's it.
 */

import { describe, it, expect } from 'bun:test'
import { generateDocs, generateDocsMarkdown, prettifyTestBody } from './docs'

describe('generateDocs', () => {
  describe('basic output', () => {
    it('extracts function signatures in document order', () => {
      const source = `
function first(x: 5): 10 {
  return x * 2
}

function second(a: '', b: 0): '' {
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
function first(x: 0): 0 { return x }

/*#
# Second Section
*/
function second(x: 0): 0 { return x }
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
      const source = `function greet(name: 'World'): '' { return name }`
      const result = generateDocs(source)

      const func = result.items[0] as any
      expect(func.type).toBe('function')
      expect(func.signature).toContain('greet')
      expect(func.signature).toContain("name: 'World'")
      expect(func.signature).toContain(": ''")
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

  describe('JSDoc-style doc blocks', () => {
    it('extracts /** */ blocks and strips leading asterisks', () => {
      const source = `
/**
 * # Title
 *
 * Body line 1
 * Body line 2
 */
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(1)
      const doc = result.items[0] as any
      expect(doc.type).toBe('doc')
      expect(doc.content).toBe('# Title\n\nBody line 1\nBody line 2')
    })

    it('handles single-line JSDoc', () => {
      const source = `/** A short note. */`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      expect(doc.type).toBe('doc')
      expect(doc.content).toBe('A short note.')
    })

    it('preserves markdown lists and tables', () => {
      const source = `
/**
 * ## Options
 *
 * | Flag | Meaning |
 * |------|---------|
 * | \`-v\` | verbose |
 *
 * - first
 * - second
 */
`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      expect(doc.content).toContain('## Options')
      expect(doc.content).toContain('| Flag | Meaning |')
      expect(doc.content).toContain('- first')
    })

    it('leaves @param / @returns as plain markdown', () => {
      const source = `
/**
 * Square the input.
 *
 * @param x - the input
 * @returns the squared value
 */
function square(x: 0): 0 { return x * x }
`
      const result = generateDocs(source)

      const doc = result.items[0] as any
      expect(doc.content).toContain('@param x - the input')
      expect(doc.content).toContain('@returns the squared value')
    })

    it('skips JSDoc inside function bodies', () => {
      const source = `
function outer() {
  /**
   * Should not be extracted — inside a body.
   */
  return 1
}
`
      const result = generateDocs(source)

      // Only the function itself, no doc item
      const docs = result.items.filter((i) => i.type === 'doc')
      expect(docs).toHaveLength(0)
    })

    it('skips empty JSDoc blocks', () => {
      const source = `
/**
 *
 */
function f() {}
`
      const result = generateDocs(source)

      const docs = result.items.filter((i) => i.type === 'doc')
      expect(docs).toHaveLength(0)
    })

    it('does not treat /* ... */ as a doc comment', () => {
      const source = `
/* just a regular block comment */
function f() {}
`
      const result = generateDocs(source)

      const docs = result.items.filter((i) => i.type === 'doc')
      expect(docs).toHaveLength(0)
    })

    it('interleaves JSDoc with functions in document order', () => {
      const source = `
/**
 * # First
 */
function first(x: 0): 0 { return x }

/**
 * # Second
 */
function second(x: 0): 0 { return x }
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(4)
      expect(result.items[0].type).toBe('doc')
      expect((result.items[0] as any).content).toContain('# First')
      expect(result.items[1].type).toBe('function')
      expect(result.items[2].type).toBe('doc')
      expect((result.items[2] as any).content).toContain('# Second')
      expect(result.items[3].type).toBe('function')
    })

    it('coexists with /*# blocks in the same file', () => {
      const source = `
/*#
## TJS-native
*/

/**
 * ## JSDoc-native
 */
function f(x: 0): 0 { return x }
`
      const result = generateDocs(source)

      const docs = result.items.filter((i) => i.type === 'doc') as any[]
      expect(docs).toHaveLength(2)
      expect(docs[0].content).toContain('TJS-native')
      expect(docs[1].content).toContain('JSDoc-native')
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
      const source = `function double(x: 5): 10 { return x * 2 }`
      const result = generateDocs(source)

      expect(result.markdown).toContain('```tjs')
      expect(result.markdown).toContain('function double(x: 5): 10')
      expect(result.markdown).toContain('```')
    })

    it('outputs items separated by blank lines', () => {
      const source = `
/*#
Intro
*/
function first(x: 0): 0 { return x }
/*#
Middle
*/
function second(x: 0): 0 { return x }
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

function double(x: 5): 10 {
  return x * 2
}

function triple(x: 3): 9 {
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
function tjsFunc(x: 0): 0 { return x }
`
      const result = generateDocs(source)

      expect(result.items).toHaveLength(2)
      expect((result.items[0] as any).signature).toContain(': number')
      expect((result.items[1] as any).signature).toContain(': 0')
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
    const source = `function greet(name: 'World'): '' { return name }`
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
    expect(result).toContain("function greet(name: 'World'): ''")
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
function foo(x: 0): 0 { return x }
`
    const result = generateDocsMarkdown(source, undefined)

    expect(result).toContain('Intro')
    expect(result).toContain('## foo')
    expect(result).toContain('function foo(x: 0): 0')
    // No params/returns since no type metadata
    expect(result).not.toContain('**Parameters:**')
  })

  it('preserves document order with interleaved docs and functions', () => {
    const source = `
/*# Section 1 */
function first(x: 0): 0 { return x }
/*# Section 2 */
function second(x: 0): 0 { return x }
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

  it('handles comments inside, around, and between functions', () => {
    const source = `
/*# Module header */

function first(x: 0): 0 {
  /*# Comment inside first - should be ignored */
  return x
}

/*# Between first and second */

function second(y: ''): '' {
  /*# Comment inside second - should be ignored */
  return y
}

/*# After all functions */
`
    const result = generateDocsMarkdown(source, undefined)

    // Top-level doc blocks should be in output
    expect(result).toContain('Module header')
    expect(result).toContain('Between first and second')
    expect(result).toContain('After all functions')

    // Functions should be documented
    expect(result).toContain('## first')
    expect(result).toContain('## second')

    // Comments inside functions should NOT appear in top-level docs
    // (they are inside function bodies, not module-level documentation)
    expect(result).not.toContain('Comment inside first')
    expect(result).not.toContain('Comment inside second')

    // Check document order
    const headerPos = result.indexOf('Module header')
    const firstPos = result.indexOf('## first')
    const betweenPos = result.indexOf('Between first and second')
    const secondPos = result.indexOf('## second')
    const afterPos = result.indexOf('After all functions')

    expect(headerPos).toBeLessThan(firstPos)
    expect(firstPos).toBeLessThan(betweenPos)
    expect(betweenPos).toBeLessThan(secondPos)
    expect(secondPos).toBeLessThan(afterPos)
  })
})

describe('prettifyTestBody', () => {
  it('translates toBe', () => {
    expect(prettifyTestBody('expect(x).toBe(y)')).toBe('x  // → y')
  })

  it('translates toEqual to ≡', () => {
    expect(prettifyTestBody('expect(a).toEqual(b)')).toBe('a  // ≡ b')
  })

  it('handles balanced parens in expression', () => {
    expect(
      prettifyTestBody('expect(Boolean(new Boolean(false))).toBe(false)')
    ).toBe('Boolean(new Boolean(false))  // → false')
  })

  it('handles balanced parens in expected value', () => {
    expect(prettifyTestBody('expect(x).toBe(f(1, 2))')).toBe('x  // → f(1, 2)')
  })

  it('handles toBeTruthy / toBeFalsy / toBeNull / toBeUndefined', () => {
    expect(prettifyTestBody('expect(x).toBeTruthy()')).toBe('x  // → truthy')
    expect(prettifyTestBody('expect(x).toBeFalsy()')).toBe('x  // → falsy')
    expect(prettifyTestBody('expect(x).toBeNull()')).toBe('x  // → null')
    expect(prettifyTestBody('expect(x).toBeUndefined()')).toBe(
      'x  // → undefined'
    )
  })

  it('translates toContain / toThrow / toBeNaN', () => {
    expect(prettifyTestBody('expect(arr).toContain(3)')).toBe(
      'arr  // → contains 3'
    )
    expect(prettifyTestBody('expect(fn).toThrow()')).toBe('fn  // → throws')
    expect(prettifyTestBody('expect(x).toBeNaN()')).toBe('x  // → NaN')
  })

  it('translates toBeGreaterThan / toBeLessThan', () => {
    expect(prettifyTestBody('expect(x).toBeGreaterThan(5)')).toBe('x  // → > 5')
    expect(prettifyTestBody('expect(y).toBeLessThan(10)')).toBe('y  // → < 10')
  })

  it('preserves non-expect lines', () => {
    expect(prettifyTestBody('console.log("hi")')).toBe('console.log("hi")')
    expect(prettifyTestBody('const x = 5')).toBe('const x = 5')
  })

  it('handles multiple expects on separate lines', () => {
    const input = '  expect(x).toBe(1)\n  expect(y).toBeTruthy()'
    const expected = '  x  // → 1\n  y  // → truthy'
    expect(prettifyTestBody(input)).toBe(expected)
  })

  it('does not touch parens inside string literals', () => {
    // The `expect(...)` inside the string literal should NOT be transformed
    expect(prettifyTestBody(`const s = "expect(fake).toBe(impossible)"`)).toBe(
      `const s = "expect(fake).toBe(impossible)"`
    )
  })

  it('falls back gracefully on unknown matchers', () => {
    expect(prettifyTestBody('expect(x).somethingWeird(y)')).toBe(
      'x  // .somethingWeird(y)'
    )
  })
})

describe('function extraction', () => {
  it('captures simple function signatures', () => {
    const md = generateDocsMarkdown(
      `function add(a: 0, b: 0): 0 { return a + b }`
    )
    expect(md).toContain('## add')
    expect(md).toContain('function add(a: 0, b: 0): 0')
  })

  it('handles arrow-function defaults (params with nested parens)', () => {
    // Regression: the old funcPattern used [^)]* and broke on `(x) => x`
    const source = `
function mapStrings(arr: [''], fn = (x) => x): [''] {
  return arr.map(fn)
}
function compose(f = (x) => x, g = (x) => x): 0 {
  return f(g(5))
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('## mapStrings')
    expect(md).toContain("function mapStrings(arr: [''], fn = (x) => x): ['']")
    expect(md).toContain('## compose')
    expect(md).toContain('function compose(f = (x) => x, g = (x) => x): 0')
  })

  it('handles object/array example values in params', () => {
    const md = generateDocsMarkdown(
      `function f(p: { a: 0, b: '' }, q: [0]): {} { return p }`
    )
    expect(md).toContain("function f(p: { a: 0, b: '' }, q: [0]): {}")
  })

  it('handles return-type annotation with quoted string', () => {
    const md = generateDocsMarkdown(
      `function greet(name: 'World'): 'Hello, World!' { return \`Hello, \${name}!\` }`
    )
    expect(md).toContain("function greet(name: 'World'): 'Hello, World!'")
  })

  it('does not extract nested function declarations', () => {
    const source = `
function outer() {
  function nested() { return 1 }
  return nested
}
`
    const result = generateDocs(source)
    const fns = result.items.filter((i) => i.type === 'function')
    expect(fns.length).toBe(1)
    expect(fns[0].name).toBe('outer')
  })

  describe('function param rendering in docs', () => {
    // We need transpiled type metadata for the param-table renderer.
    // Use the lang index's `tjs()` to get types.
    const { tjs } = require('./index')

    it('renders an arrow-default param as `(x: any) => any` (not `function`)', () => {
      const r = tjs(`function f(fn = (x) => x): 0 { return 0 }`)
      const md = generateDocsMarkdown(r.code, r.types)
      expect(md).toContain('`fn`: (x: any) => any')
    })

    it('infers return type from concise arrow body', () => {
      const r = tjs(`function f(make = () => 5): 0 { return 0 }`)
      const md = generateDocsMarkdown(r.code, r.types)
      expect(md).toContain('`make`: () => number')
    })

    it('infers param types from arrow defaults', () => {
      const r = tjs(
        `function f(reduce = (acc = 0, x = 0) => 0): 0 { return 0 }`
      )
      const md = generateDocsMarkdown(r.code, r.types)
      expect(md).toContain('`reduce`: (acc: number, x: number) => number')
    })

    it('does not show `e.g. undefined` for function example values', () => {
      const r = tjs(`function f(fn = (x) => x): 0 { return 0 }`)
      const md = generateDocsMarkdown(r.code, r.types)
      expect(md).not.toContain('undefined')
    })
  })
})

describe('class extraction', () => {
  it('extracts a class with constructor and methods', () => {
    const source = `
class Point {
  constructor(x: 0, y: 0) {
    this.x = x
    this.y = y
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  toString() {
    return \`(\${this.x}, \${this.y})\`
  }
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('## Point')
    expect(md).toContain('class Point {')
    expect(md).toContain('constructor(x: 0, y: 0)')
    expect(md).toContain('magnitude()')
    expect(md).toContain('toString()')
    // Method bodies should NOT appear
    expect(md).not.toContain('this.x = x')
    expect(md).not.toContain('Math.sqrt')
  })

  it('extracts multiple constructors', () => {
    const source = `
class Color {
  constructor(r: +0, g: +0, b: +0) { this.r = r; this.g = g; this.b = b }
  constructor(hex: '#000000') { /* parse */ }
  toString() { return 'rgb(...)' }
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('constructor(r: +0, g: +0, b: +0)')
    expect(md).toContain("constructor(hex: '#000000')")
    expect(md).toContain('toString()')
  })

  it('renders extends clause', () => {
    const source = `
class ColorWithAlpha extends Color {
  constructor(r: 0, g: 0, b: 0, a: 1.0) { super(r, g, b); this.a = a }
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('class ColorWithAlpha extends Color {')
  })

  it('handles static / async / get / set modifiers', () => {
    const source = `
class Thing {
  static load(path: '') { return path }
  async fetch() { return null }
  get name() { return 'x' }
  set name(v: '') { this._name = v }
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain("static load(path: '')")
    expect(md).toContain('async fetch()')
    expect(md).toContain('get name()')
    expect(md).toContain("set name(v: '')")
  })

  it('captures return type annotations', () => {
    const source = `
class Math2 {
  add(a: 0, b: 0): 0 { return a + b }
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('add(a: 0, b: 0): 0')
  })

  it('does NOT extract `class Foo` text inside /*# */ doc blocks', () => {
    // The doc-block prose is rendered as-is, but we should NOT emit a
    // "## FakeClass" heading from the prose's `class FakeClass` mention.
    const source = `
/*#
## Example
Don't write this:

    class FakeClass { constructor(x) {} }
*/

class RealClass {
  constructor() {}
}
`
    const result = generateDocs(source)
    const classItems = result.items.filter((i) => i.type === 'class')
    expect(classItems.length).toBe(1)
    expect(classItems[0].name).toBe('RealClass')
  })

  it('does NOT extract `function` text inside /*# */ doc blocks', () => {
    const source = `
/*#
Don't write this:

    function fakeFn() {}
*/

function realFn() { return 1 }
`
    const result = generateDocs(source)
    const fnItems = result.items.filter((i) => i.type === 'function')
    expect(fnItems.length).toBe(1)
    expect(fnItems[0].name).toBe('realFn')
  })

  it('handles a class with no members', () => {
    const md = generateDocsMarkdown('class Empty {}')
    expect(md).toContain('## Empty')
    expect(md).toContain('class Empty {')
    expect(md).toContain('}')
  })
})

describe('generateDocsMarkdown — test cases section', () => {
  it('renders each named test as a "### <name> (test cases)" heading with prettified body', () => {
    const source = `
test 'x is 5' {
  expect(x).toBe(5)
}
test 'y is truthy' {
  expect(y).toBeTruthy()
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('### x is 5 (test cases)')
    expect(md).toContain('x  // → 5')
    expect(md).toContain('### y is truthy (test cases)')
    expect(md).toContain('y  // → truthy')
  })

  it('skips anonymous tests (no description)', () => {
    const source = `
test {
  expect(x).toBe(5)
}
`
    const md = generateDocsMarkdown(source)
    expect(md).not.toContain('(test cases)')
  })

  it('integrates with doc blocks and functions', () => {
    const source = `
/*#
# Module
Some intro.
*/

function add(a: 0, b: 0): 0 {
  return a + b
}

test 'add(2, 3) is 5' {
  expect(add(2, 3)).toBe(5)
}
`
    const md = generateDocsMarkdown(source)
    expect(md).toContain('# Module')
    expect(md).toContain('## add')
    expect(md).toContain('### add(2, 3) is 5 (test cases)')
    expect(md).toContain('add(2, 3)  // → 5')
  })
})
