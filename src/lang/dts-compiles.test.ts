/**
 * The generated `.d.ts` is fed to the TypeScript compiler.
 *
 * A declaration file's ONLY job is to compile and describe. Nothing checked that it did:
 * every dts test asserted on the emitted STRING, so a `.d.ts` that TypeScript rejects
 * outright passed the suite. It shipped rejecting:
 *
 *   - **TS2749** — `'Even' refers to a value, but is being used as a type.` A declared Type
 *     was emitted as a `const` (the runtime guard) and then referenced in type position by
 *     every function that used it.
 *   - **TS2552** — `Cannot find name 'Odd'.` A NON-exported Type was skipped entirely,
 *     while exported signatures still named it.
 *
 * Before this release the same input produced `n: any` — lossy, but valid. A declaration
 * file that does not compile is worse than one that says `any`, because `any` degrades and
 * this fails.
 *
 * ## `skipLibCheck` must be false
 *
 * `skipLibCheck: true` is the common default and it suppresses errors in `.d.ts` files —
 * which is every error this file exists to catch. With it on, this test passes vacuously
 * against the broken emitter. That is asserted below rather than trusted.
 */
import { describe, it, expect } from 'bun:test'
import * as ts from 'typescript'
import { tjs } from './index'
import { generateDTS } from './emitters/dts'

/** Compile a `.d.ts` in isolation and return its diagnostics as readable strings. */
function diagnose(dts: string): string[] {
  const fileName = '/virtual/generated.d.ts'
  const options: ts.CompilerOptions = {
    strict: true,
    // The whole point — see the header.
    skipLibCheck: false,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts'],
  }
  const host = ts.createCompilerHost(options)
  const original = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === fileName
      ? ts.createSourceFile(name, dts, languageVersion, true, ts.ScriptKind.TS)
      : original(name, languageVersion, ...rest)
  host.fileExists = (name) => name === fileName || ts.sys.fileExists(name)
  host.readFile = (name) => (name === fileName ? dts : ts.sys.readFile(name))

  const program = ts.createProgram([fileName], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === fileName)
    .map(
      (d) =>
        `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
    )
}

const dtsFor = (src: string) =>
  generateDTS(tjs(src, { filename: 'd.tjs', runTests: false }) as any, src)

describe('generated declarations compile', () => {
  it('the harness reports real diagnostics — apparatus check', () => {
    // If the compiler were misconfigured, every assertion below would pass vacuously.
    expect(diagnose('export declare function f(n: Ghost): number;')).toEqual([
      expect.stringContaining('TS2304'),
    ])
    expect(diagnose('export declare function f(n: number): number;')).toEqual(
      []
    )
  })

  it('an exported declared Type is usable in type position', () => {
    // TS2749 — emitted as a value, used as a type.
    const dts = dtsFor(`
export Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
export function half(n: Even): 0 { return n / 2 }
`)
    expect(diagnose(dts)).toEqual([])
  })

  it('a NON-exported declared Type named by an exported signature resolves', () => {
    // TS2552 — skipped entirely, while `bump` still referenced it.
    const dts = dtsFor(`
Type Odd 'an odd number' {
  example: 1
  predicate(v) { return v % 2 === 1 }
}
export function bump(n: Odd): 0 { return n + 1 }
`)
    expect(diagnose(dts)).toEqual([])
  })

  it('an ordinary module compiles', () => {
    const dts = dtsFor(`
export function greet(name: 'World'): '' { return 'Hello, ' + name }
export function add(a: 0, b: 0): 0 { return a + b }
export function pick(items: [''], n = 0): '' { return items[n] }
`)
    expect(diagnose(dts)).toEqual([])
  })

  it('the `description:` field spelling of a Type also compiles', () => {
    // Three spellings reach `detectTypeDeclarations` by different paths; all three have
    // to produce a resolvable name.
    const dts = dtsFor(`
export Type Even {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
export function double(n: Even): 0 { return n * 2 }
`)
    expect(diagnose(dts)).toEqual([])
  })

  it('Enum and Union declarations compile', () => {
    const dts = dtsFor(`
export Enum Color 'a colour' {
  Red = 'red'
  Green = 'green'
}
export function paint(c: Color): '' { return c }
`)
    expect(diagnose(dts)).toEqual([])
  })
})

describe('the type alias carries the example, not the description', () => {
  it('a described block Type takes its example, not its description', () => {
    // Every block-form pattern in `detectTypeDeclarations` omitted the optional
    // DESCRIPTION, so the simple-form pattern captured `'an even number' {` as the
    // example and the alias came out `string` for a type whose example is `0`.
    const dts = dtsFor(`
export Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`)
    expect(dts).toContain('export type Even = number;')
    expect(dts).not.toContain('export type Even = string;')
  })
})
