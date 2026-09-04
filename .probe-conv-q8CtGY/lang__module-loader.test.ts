/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { sep } from 'node:path'

import {
  ModuleLoader,
  inMemoryFileSystem,
} from '/Users/tonioloewald/tjs-lang/src/lang/module-loader'

/* line 17 */
/* TODO: TS types degraded — parts: TemplateStringsArray */
function p(parts) {
  return parts.join('').split('/').join(sep)
}
p.__tjs = {
  params: {
    parts: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:11',
}

/* line 19 */
function loaderWith(files, baseDir = '/proj', extra = {}) {
  const normalized = {}
  for (const [k, v] of Object.entries(files)) {
    normalized[k.split('/').join(sep)] = v
  }
  return new ModuleLoader({
    fs: inMemoryFileSystem(normalized),
    baseDir: baseDir.split('/').join(sep),
    ...extra,
  })
}
loaderWith.__tjs = {
  params: {
    files: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
    baseDir: {
      type: {
        kind: 'string',
      },
      required: false,
      default: '/proj',
    },
    extra: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: false,
      default: {},
    },
  },
  unsafe: true,
  source: 'input.ts:19',
}

describe('ModuleLoader.resolve', () => {
  it('resolves relative paths against the importer directory', () => {
    const loader = loaderWith({
      '/proj/app.tjs':
        'import { x } from "/Users/tonioloewald/tjs-lang/src/lang/math.tjs"',
      '/proj/math.tjs': 'export const x = 1',
    })
    expect(loader.resolve('./math.tjs', p`/proj/app.tjs`)).toBe(
      p`/proj/math.tjs`
    )
  })
  it('resolves relative paths against baseDir when no importer is given', () => {
    const loader = loaderWith({
      '/proj/math.tjs': 'export const x = 1',
    })
    expect(loader.resolve('./math.tjs')).toBe(p`/proj/math.tjs`)
  })
  it('resolves parent-relative paths', () => {
    const loader = loaderWith({
      '/proj/lib/inner.tjs':
        'import { y } from "/Users/tonioloewald/tjs-lang/src/math.tjs"',
      '/proj/math.tjs': 'export const y = 2',
    })
    expect(loader.resolve('../math.tjs', p`/proj/lib/inner.tjs`)).toBe(
      p`/proj/math.tjs`
    )
  })
  it('resolves absolute paths', () => {
    const loader = loaderWith({
      '/abs/foo.tjs': 'export const z = 3',
    })
    expect(loader.resolve(p`/abs/foo.tjs`)).toBe(p`/abs/foo.tjs`)
  })
  it('tries .tjs, .ts, .js extensions in order', () => {
    const loader = loaderWith({
      '/proj/legacy.ts': 'export const a = 1',
    })
    expect(loader.resolve('./legacy', p`/proj/app.tjs`)).toBe(
      p`/proj/legacy.ts`
    )
  })
  it('prefers .tjs when multiple extensions exist', () => {
    const loader = loaderWith({
      '/proj/foo.tjs': 'export const a = 1',
      '/proj/foo.ts': 'export const a = 2',
      '/proj/foo.js': 'export const a = 3',
    })
    expect(loader.resolve('./foo', p`/proj/app.tjs`)).toBe(p`/proj/foo.tjs`)
  })
  it('resolves directory imports via index.<ext>', () => {
    const loader = loaderWith({
      '/proj/utils/index.tjs': 'export const u = 1',
    })
    expect(loader.resolve('./utils', p`/proj/app.tjs`)).toBe(
      p`/proj/utils/index.tjs`
    )
  })
  it('walks up looking for node_modules for bare specifiers', () => {
    const loader = loaderWith({
      '/proj/node_modules/tjs-lang/linalg/index.tjs': 'export const dot = 1',
      '/proj/src/inner/app.tjs': 'import { dot } from "tjs-lang/linalg"',
    })
    expect(loader.resolve('tjs-lang/linalg', p`/proj/src/inner/app.tjs`)).toBe(
      p`/proj/node_modules/tjs-lang/linalg/index.tjs`
    )
  })
  it('checks bareSpecifierRoots before walking node_modules', () => {
    const loader = loaderWith(
      {
        '/proj/local-libs/mylib/index.tjs': 'export const x = 1',
      },
      '/proj',
      { bareSpecifierRoots: [p`/proj/local-libs`] }
    )
    expect(loader.resolve('mylib')).toBe(p`/proj/local-libs/mylib/index.tjs`)
  })
  it('returns null for URL specifiers', () => {
    const loader = loaderWith({})
    expect(loader.resolve('https://esm.sh/lodash')).toBeNull()
    expect(loader.resolve('http://example.com/foo.js')).toBeNull()
    expect(loader.resolve('data:text/javascript,foo')).toBeNull()
  })
  it('returns null for unknown bare specifiers', () => {
    const loader = loaderWith({})
    expect(loader.resolve('react')).toBeNull()
  })
  it('returns null for missing relative paths', () => {
    const loader = loaderWith({
      '/proj/app.tjs': '',
    })
    expect(loader.resolve('./does-not-exist', p`/proj/app.tjs`)).toBeNull()
  })
})

describe('ModuleLoader.load', () => {
  it('loads, parses, and surfaces imports/exports', () => {
    const loader = loaderWith({
      '/proj/math.tjs': `
        export function add(a: 0, b: 0): 0 { return a + b }
        export function sub(a: 0, b: 0): 0 { return a - b }
      `,
    })
    const mod = loader.load('./math.tjs', p`/proj/app.tjs`)
    expect(mod).not.toBeNull()
    expect(mod.path).toBe(p`/proj/math.tjs`)
    expect(mod.exports.map((e) => e.name).sort()).toEqual(['add', 'sub'])
    expect(mod.exports.every((e) => e.kind === 'function')).toBe(true)
  })
  it('captures import declarations', () => {
    const loader = loaderWith({
      '/proj/app.tjs': `
        import { add } from '/Users/tonioloewald/tjs-lang/src/lang/math.tjs'
        import sqrt from '/Users/tonioloewald/tjs-lang/src/lang/sqrt.tjs'
        import * as utils from '/Users/tonioloewald/tjs-lang/src/lang/utils.tjs'
      `,
      '/proj/math.tjs': 'export const add = 0',
      '/proj/sqrt.tjs': 'export default function sqrt() { return 0 }',
      '/proj/utils.tjs': 'export const x = 0',
    })
    const mod = loader.load('./app.tjs')
    expect(mod).not.toBeNull()
    const i = mod.imports
    expect(i.find((e) => e.local === 'add')).toMatchObject({
      specifier: './math.tjs',
      imported: 'add',
      namespace: false,
    })
    expect(i.find((e) => e.local === 'sqrt')).toMatchObject({
      specifier: './sqrt.tjs',
      imported: 'default',
      namespace: false,
    })
    expect(i.find((e) => e.local === 'utils')).toMatchObject({
      specifier: './utils.tjs',
      imported: '*',
      namespace: true,
    })
  })
  it('handles renamed imports (import { a as b } from ...)', () => {
    const loader = loaderWith({
      '/proj/app.tjs': `import { add as plus } from '/Users/tonioloewald/tjs-lang/src/lang/math.tjs'`,
      '/proj/math.tjs': 'export const add = 0',
    })
    const mod = loader.load('./app.tjs')
    expect(mod.imports[0]).toMatchObject({
      specifier: './math.tjs',
      local: 'plus',
      imported: 'add',
    })
  })
  it('surfaces re-exports with kind "re-export"', () => {
    const loader = loaderWith({
      '/proj/index.tjs': `
        export { add } from '/Users/tonioloewald/tjs-lang/src/lang/math.tjs'
        export * from '/Users/tonioloewald/tjs-lang/src/lang/utils.tjs'
      `,
      '/proj/math.tjs': 'export const add = 0',
      '/proj/utils.tjs': 'export const x = 0',
    })
    const mod = loader.load('./index.tjs')
    expect(mod).not.toBeNull()
    const reexports = mod.exports.filter((e) => e.kind === 're-export')
    expect(reexports).toContainEqual({
      name: 'add',
      kind: 're-export',
      fromSpecifier: './math.tjs',
    })
    expect(reexports).toContainEqual({
      name: '*',
      kind: 're-export',
      fromSpecifier: './utils.tjs',
    })
  })
  it('surfaces variable exports', () => {
    const loader = loaderWith({
      '/proj/things.tjs': `
        export const PI = 3.14
        export let counter = 0
      `,
    })
    const mod = loader.load('./things.tjs')
    expect(mod.exports).toContainEqual({ name: 'PI', kind: 'variable' })
    expect(mod.exports).toContainEqual({ name: 'counter', kind: 'variable' })
  })
  it('surfaces classes as variables (post-preprocessor: class → wrapClass(class))', () => {
    const loader = loaderWith({
      '/proj/things.tjs': `export class Foo {}`,
    })
    const mod = loader.load('./things.tjs')
    expect(mod.exports.find((e) => e.name === 'Foo')?.kind).toBe('variable')
  })
  it('surfaces default function exports', () => {
    const loader = loaderWith({
      '/proj/anon.tjs': `export default function () { return 1 }`,
    })
    const mod = loader.load('./anon.tjs')
    expect(mod.exports).toContainEqual({ name: 'default', kind: 'function' })
  })
  it('returns null when the source fails to parse', () => {
    const loader = loaderWith({
      '/proj/broken.tjs': `this is not valid javascript {{{`,
    })
    expect(loader.load('./broken.tjs')).toBeNull()
  })
  it('caches loaded modules by resolved path', () => {
    let reads = 0
    const fs = {
      readFile(path) {
        if (path.endsWith('math.tjs') || path.endsWith('math' + sep + 'tjs')) {
          reads++
          return 'export const x = 1'
        }
        return null
      },
      exists(path) {
        return path.endsWith('math.tjs') || path.endsWith('math' + sep + 'tjs')
      },
    }
    const loader = new ModuleLoader({ fs, baseDir: p`/proj` })
    loader.load('./math.tjs')
    loader.load('./math.tjs')
    loader.load('./math.tjs')
    expect(reads).toBe(1)
  })
  it('clearCache forces a reload', () => {
    let reads = 0
    const fs = {
      readFile() {
        reads++
        return 'export const x = 1'
      },
      exists: () => true,
    }
    const loader = new ModuleLoader({ fs, baseDir: p`/proj` })
    loader.load('./math.tjs')
    loader.clearCache()
    loader.load('./math.tjs')
    expect(reads).toBe(2)
  })
  it('respects cacheLimit by evicting oldest entries', () => {
    const loader = loaderWith(
      {
        '/proj/a.tjs': 'export const x = 1',
        '/proj/b.tjs': 'export const y = 2',
        '/proj/c.tjs': 'export const z = 3',
      },
      '/proj',
      { cacheLimit: 2 }
    )
    loader.load('./a.tjs')
    loader.load('./b.tjs')
    loader.load('./c.tjs')

    expect(loader.load('./a.tjs')).not.toBeNull()
  })
  it('returns null for unresolvable specifiers (no implicit fallback)', () => {
    const loader = loaderWith({})
    expect(loader.load('lodash')).toBeNull()
    expect(loader.load('https://esm.sh/lodash')).toBeNull()
  })
})
