/**
 * A package written in `.tjs` emits as a package a TypeScript consumer and plain Node can use.
 *
 * Found by tosijs-native, the first project written natively in `.tjs` (#3587, #3588, #3589,
 * and its findings 4 and 5). Each was a reason a `.tjs` package could not be published:
 *
 *   - a barrel `index.tjs` of `export { … } from './x.tjs'` emitted an EMPTY `index.d.ts`;
 *   - a Type imported from another file became `any` in the declaration;
 *   - a Type named inside another Type's example became `any[]`;
 *   - a `null` dictionary-default member (any value at runtime) was declared `null`;
 *   - emitted `.js` imported `./x.tjs`, so it loaded only where a `.tjs` loader was installed.
 *
 * So this does what the adopter does: emit a small multi-file package with the CLI, compile a
 * consumer against the `.d.ts` with TypeScript under `nodenext`, strict, skipLibCheck off,
 * and run the `.js` in a real `node`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ts from 'typescript'
import { rewriteTjsSpecifiers } from '../lang/emitted-specifiers'

const CLI = join(import.meta.dir, 'tjs.ts')
let root = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'emit-pkg-'))
  mkdirSync(join(root, 'src'))
  const write = (f: string, s: string) => writeFileSync(join(root, f), s)
  write(
    'src/config.tjs',
    `export Type Product { example: { name: '', price: 0.0 } }
export Type Config { example: { products: [Product], main: Product } }
`
  )
  write(
    'src/native.tjs',
    `import { Config, Product } from './config.tjs'
export function createNative(config: Config, first: Product):! '' { return 'ok' }
export function make(opts = { storage: null, size: 0 }):! 0 { return 1 }
`
  )
  write(
    'src/index.tjs',
    `export { createNative, make } from './native.tjs'
export * from './config.tjs'
`
  )
  write('package.json', JSON.stringify({ type: 'module' }))
  const p = Bun.spawnSync(['bun', CLI, 'emit', '--dts', 'src', '-o', 'dist'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (p.exitCode !== 0)
    throw new Error(`emit failed:\n${p.stdout}\n${p.stderr}`)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const read = (f: string) => readFileSync(join(root, 'dist', f), 'utf8')

/** Compile `consumer` against the emitted declarations; return the diagnostics. */
function compile(consumer: string): string[] {
  const file = join(root, `use-${Math.random().toString(36).slice(2)}.ts`)
  writeFileSync(file, consumer)
  const program = ts.createProgram([file], {
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    // Only the emitted package: ambient @types (Bun's, Node's) are not what is under test.
    types: [],
  })
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

describe('a .tjs package, emitted', () => {
  it('the barrel re-exports, naming the emitted files (#3587)', () => {
    const index = read('index.d.ts')
    expect(index).toContain("export { createNative, make } from './native.js';")
    expect(index).toContain("export * from './config.js';")
  })

  it('an imported Type is named and imported, not any (#3588)', () => {
    const native = read('native.d.ts')
    expect(native).toContain(
      "import type { Config, Product } from './config.js';"
    )
    expect(native).toContain('createNative(config: Config, first: Product)')
  })

  it('a Type inside another Type is named, not any[] (#3589)', () => {
    expect(read('config.d.ts')).toContain(
      'export type Config = { products: Product[]; main: Product };'
    )
  })

  it('a null dictionary-default member is any, as at runtime (finding 4)', () => {
    expect(read('native.d.ts')).toContain('storage?: any')
  })

  it('a TypeScript consumer compiles under nodenext, and a wrong call does not', () => {
    const ok =
      compile(`import { createNative, make, type Config } from './dist/index.js'
const c: Config = { products: [{ name: 'a', price: 1 }], main: { name: 'b', price: 2 } }
createNative(c, { name: 'x', price: 3 })
make({ storage: new Map() })
`)
    expect(ok).toEqual([])
    const bad = compile(`import { createNative } from './dist/index.js'
createNative({ products: [{ name: 1, price: 1 }], main: { name: 'b', price: 2 } }, { name: 'x', price: 3 })
`)
    expect(bad.length).toBeGreaterThan(0)
  })

  it('the emitted JS imports .js and runs in plain node (finding 5)', () => {
    expect(read('native.js')).toContain("from './config.js'")
    // No IMPORT names a .tjs file (source locations like 'native.tjs:2' are expected).
    expect(read('native.js')).not.toMatch(/from ['"]\.\.?\/[^'"]*\.tjs['"]/)
    const p = Bun.spawnSync(
      [
        'node',
        '-e',
        "import('./dist/index.js').then(m => console.log(m.createNative({ products: [], main: { name: 'a', price: 1 } }, { name: 'b', price: 2 })))",
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' }
    )
    expect(new TextDecoder().decode(p.stdout).trim()).toBe('ok')
  })
})

describe('rewriteTjsSpecifiers', () => {
  it('rewrites relative .tjs specifiers only, found by parsing', () => {
    const src = `import a from './a.tjs'
export { b } from "../b.tjs"
export * from './c.tjs'
const d = await import('./d.tjs')
import pkg from 'pkg.tjs'
const text = "import x from './x.tjs'" // a mention, not an import
// import y from './y.tjs'
`
    const out = rewriteTjsSpecifiers(src)
    expect(out).toContain("import a from './a.js'")
    expect(out).toContain('export { b } from "../b.js"')
    expect(out).toContain("export * from './c.js'")
    expect(out).toContain("import('./d.js')")
    expect(out).toContain("from 'pkg.tjs'") // a package name is not ours to rename
    expect(out).toContain(`"import x from './x.tjs'"`) // byte-identical
    expect(out).toContain("// import y from './y.tjs'")
  })
})
