/**
 * The import resolver's source rewriting is literal-safe and complete, and its worker deletes
 * only its own old caches (#4122 and the 2026-11-14 docs review).
 *
 * `rewriteImports`/`extractImports` matched with a regex over raw source: import-looking text
 * in strings and comments was rewritten, a `$` in the import clause stopped the match, dynamic
 * `import('x')` and minified `from"x"` were missed, and `data:`/`node:` specifiers were prefixed
 * like package names. And the activating worker deleted EVERY cache on the origin that was not
 * its own current one, wiping a host site's Cache API data.
 */
import { describe, it, expect } from 'bun:test'
import { rewriteImports, extractImports, staleResolverCaches } from './resolve'

const P = '/lib/'

describe('rewriteImports', () => {
  const cases: [string, string, string][] = [
    [
      'a named import',
      `import { a } from 'pkg'`,
      `import { a } from '/lib/pkg'`,
    ],
    ['a $ name', `import $ from 'jquery'`, `import $ from '/lib/jquery'`],
    [
      'an aliased $ name',
      `import { a as $b } from 'x'`,
      `import { a as $b } from '/lib/x'`,
    ],
    ['minified', `import{a}from"pkg"`, `import{a}from"/lib/pkg"`],
    ['a side-effect import', `import 'polyfill'`, `import '/lib/polyfill'`],
    [
      'a dynamic import',
      `const m = await import('pkg')`,
      `const m = await import('/lib/pkg')`,
    ],
    ['a re-export', `export * from 'pkg'`, `export * from '/lib/pkg'`],
  ]
  for (const [what, src, want] of cases)
    it(what, () => expect(rewriteImports(src, P)).toBe(want))

  const untouched: [string, string][] = [
    ['inside a string', `const doc = "import a from 'b'"`],
    ['inside a line comment', `// import a from 'b'`],
    ['inside a block comment', `/* import a from 'b' */`],
    ['inside a template', 'const t = `import a from "b"`'],
    ['a relative path', `import a from './a.js'`],
    ['an absolute path', `import a from '/a.js'`],
    ['a full URL', `import a from 'https://esm.sh/a'`],
    ['a data: URL', `import a from 'data:text/javascript,export default 1'`],
    ['a node: specifier', `import fs from 'node:fs'`],
    ['Array.from with a string', `const xs = Array.from('abc')`],
  ]
  for (const [what, src] of untouched)
    it(`leaves ${what} alone`, () => expect(rewriteImports(src, P)).toBe(src))
})

it('extractImports agrees: bare package names only', () => {
  expect(
    extractImports(
      `import a from 'pkg'\nimport b from './b'\nconst s = "import c from 'c'"\nimport('dyn')\nimport fs from 'node:fs'`
    )
  ).toEqual(['pkg', 'dyn'])
})

describe('staleResolverCaches', () => {
  it("deletes only earlier versions of the resolver's own cache", () => {
    expect(
      staleResolverCaches(
        ['tfs-v3', 'tfs-v4', 'tfs-v2', 'app-shell', 'tfs-vX'],
        'tfs-v4'
      )
    ).toEqual(['tfs-v3', 'tfs-v2'])
  })
  it('a name without a version number has no earlier versions', () => {
    expect(staleResolverCaches(['mine', 'other'], 'mine')).toEqual([])
  })
})
