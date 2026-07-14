/**
 * Packaging guardrails.
 *
 * A published bundle that imports a package we never declared resolves fine on
 * this machine (node_modules is flat and hoisted) and hard-fails in a consumer's
 * isolated install. That is invisible from inside the repo — which is exactly
 * how `editors/codemirror` shipped importing five @codemirror/* packages with no
 * `peerDependencies` block at all (GitHub #16), while the repo itself was
 * resolving six of them purely by hoisting luck.
 *
 * The only reliable check is the one a consumer would run: read what the shipped
 * files actually import, and demand it be declared.
 *
 * Sibling in spirit to src/docs-index.test.ts — turn a convention into a test.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'
import { parse } from 'acorn'

const ROOT = join(import.meta.dir, '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** '@scope/pkg/sub' and 'pkg/sub' both declare as their package root. */
const packageRoot = (spec: string) => {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const isBare = (spec: string) =>
  !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('node:')

/**
 * Bare specifiers imported by a *bundled JS* file — parsed, not grepped.
 * A regex finds the word `import` inside string literals too, and these bundles
 * embed plenty of code as strings.
 */
function bareImportsJS(file: string): string[] {
  const ast: any = parse(readFileSync(join(ROOT, file), 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
  const specs = ast.body
    .filter((n: any) =>
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
      ].includes(n.type)
    )
    .map((n: any) => n.source?.value)
    .filter((v: any): v is string => typeof v === 'string')

  return [...new Set(specs.filter(isBare).map(packageRoot))]
}

/**
 * Bare specifiers imported by a *TypeScript source* file. Acorn can't parse TS,
 * so this is anchored to line-start import/export statements — good enough to
 * catch an undeclared dependency, and a false positive would be obvious.
 */
function bareImportsTS(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const specs = [
    ...src.matchAll(/^\s*(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]/gm),
  ].map((m) => m[1])
  return [...new Set(specs.filter(isBare).map(packageRoot))]
}

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
])

describe('package.json exports', () => {
  const targets = Object.entries(pkg.exports as Record<string, any>).flatMap(
    ([subpath, value]) => {
      const files =
        typeof value === 'string'
          ? [value]
          : Object.entries(value)
              // 'bun' points at TypeScript source, not a published artifact
              .filter(([cond]) => cond !== 'bun' && cond !== 'types')
              .map(([, f]) => f as string)
      return files.map((file) => ({ subpath, file }))
    }
  )

  it('points every export at a file that exists', () => {
    // dist/ is a build artifact — only check it if the build has been run.
    const missing = targets
      .filter(({ file }) => !file.startsWith('./dist/'))
      .filter(({ file }) => !existsSync(join(ROOT, file)))
    expect(missing).toEqual([])
  })

  it('ships types for every editors subpath that has them, and they exist', () => {
    // #12: `./editors/codemirror` shipped with no `.d.ts` and no `types`
    // condition, so consumers re-declared AutocompleteConfig by hand. The
    // declarations are emitted by tsc and committed next to the .js.
    //
    // monaco/ace are knowingly untyped — typing them means installing
    // monaco-editor + ace-builds (~127MB) to check two thin adapters. When that
    // changes, add them here.
    const mustBeTyped = ['./editors', './editors/codemirror']

    for (const subpath of mustBeTyped) {
      const entry = (pkg.exports as any)[subpath]
      expect(typeof entry).toBe('object')
      expect(entry.types).toBeTruthy()
      expect(existsSync(join(ROOT, entry.types))).toBe(true)

      // `types` must precede `default`, or the resolver never sees it.
      const conditions = Object.keys(entry)
      expect(conditions.indexOf('types')).toBeLessThan(
        conditions.indexOf('default')
      )
    }
  })

  it('declares every bare import of every published editors bundle', () => {
    // The editors bundles are committed to the repo (not built into dist/), so
    // they are always checkable — and they are where this bug actually lives.
    const bundles = globSync('editors/**/*.js', { cwd: ROOT })
    expect(bundles.length).toBeGreaterThan(0)

    const undeclared: string[] = []
    for (const bundle of bundles) {
      for (const spec of bareImportsJS(bundle)) {
        if (!declared.has(spec)) undeclared.push(`${bundle} → ${spec}`)
      }
    }

    expect(undeclared).toEqual([])
  })
})

describe('devDependencies cover what the repo imports', () => {
  it('declares every @codemirror/* and @lezer/* package the editor sources import', () => {
    // These resolve today only because the `codemirror` meta-package hoists
    // them. A stricter installer (pnpm, npm --install-strategy=nested) would
    // fail. Same bug class as the shipped one, one directory over.
    const sources = globSync('editors/**/*.ts', { cwd: ROOT })
    const known = new Set([
      ...declared,
      ...Object.keys(pkg.devDependencies ?? {}),
    ])

    const undeclared = new Set<string>()
    for (const file of sources) {
      for (const spec of bareImportsTS(file)) {
        if (
          (spec.startsWith('@codemirror/') || spec.startsWith('@lezer/')) &&
          !known.has(spec)
        ) {
          undeclared.add(spec)
        }
      }
    }

    expect([...undeclared]).toEqual([])
  })
})
