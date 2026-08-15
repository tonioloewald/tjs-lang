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

/**
 * State shared across cases so TypeScript can reuse its parsed libs.
 *
 * `lastProgram` is handed to `ts.createProgram` as `oldProgram` — TypeScript's own
 * incremental API, which decides for itself what is safe to reuse. Hand-rolling a
 * SourceFile cache instead is 10x faster and WRONG: a SourceFile carries per-Program state
 * (parent pointers, symbol links), and sharing one between Programs corrupts the checker —
 * measured, 7 of 10 tests failed.
 *
 * `caseCounter` gives every case a unique virtual filename. Sharing one path made
 * `oldProgram` reuse the PREVIOUS case's content, which failed the same 7 tests for a
 * different reason. Unique names leave only the libs eligible for reuse, which is exactly
 * what should be reused.
 *
 * Why bother: ~0.6s steady state and 1.55s cold, per case, for a test whose cost is
 * entirely setup — and anything taking a second without touching a network or a model is
 * worth doubting rather than budgeting for.
 */
let caseCounter = 0

/** Compile a `.d.ts` in isolation and return its diagnostics as readable strings. */
function diagnose(dts: string): string[] {
  // A UNIQUE name per case. `oldProgram` reuses any file the host reports as unchanged,
  // and every case previously shared one virtual path — so TypeScript reused the PREVIOUS
  // case's content and 7 of 10 tests checked the wrong source. Unique names leave only the
  // libs eligible for reuse, which is exactly what should be reused.
  // A `.ts` file containing `declare` statements, NOT a `.d.ts`.
  //
  // `skipLibCheck` skips type checking of every `.d.ts` — INCLUDING the one under test,
  // which is why it had to be `false` and why that mattered so much. But turning it off
  // also re-checks the whole standard library on every case: measured 628ms per program
  // against 136ms with it on, so ~490ms of each case was TypeScript checking `lib.es5`.
  //
  // Naming the virtual file `.ts` gets both. Our declarations are checked as ordinary
  // source (`declare` is valid in a `.ts`), the libs are trusted, and the errors this file
  // exists to catch are still caught — asserted by the apparatus test below, which is what
  // makes this safe rather than merely faster.
  const fileName = `/virtual/generated-${++caseCounter}.ts`
  const options: ts.CompilerOptions = {
    strict: true,
    // Safe here ONLY because the file under test is a `.ts` — see `fileName`.
    skipLibCheck: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es5.d.ts'],
  }
  const host = ts.createCompilerHost(options)
  const original = host.getSourceFile.bind(host)
  // Reuse the previous Program via TypeScript's OWN incremental API.
  //
  // Each case needs a full `ts.Program` with `skipLibCheck: false` — load-bearing, since
  // with it ON every error this file exists to catch is suppressed and the suite passes
  // vacuously. Re-parsing `lib.es2022.d.ts` per case cost ~0.6s steady state, 1.55s cold.
  //
  // Hand-rolling a SourceFile cache is 10x faster and WRONG: a SourceFile carries
  // per-Program state (parent pointers, symbol links), so sharing one between Programs
  // corrupts the checker — measured, 7 of 10 tests failed. `oldProgram` is the supported
  // way to say the same thing: TypeScript decides for itself which files it may reuse.
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
    // The three shapes this file was built to catch, asserted directly rather than
    // trusted to the config — TS2749 (value used as a type) and a plain assignment error
    // alongside the undeclared name above. Skipping lib checking must not skip OURS.
    expect(
      diagnose(
        'export declare const V: { x: number };\nexport declare function f(n: V): void;'
      )
    ).toEqual([expect.stringContaining('TS2749')])
    expect(
      diagnose('export declare const n: number;\nconst s: string = n;')
    ).toEqual([expect.stringContaining('TS2322')])
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

/**
 * An exported ARROW appears in the `.d.ts` with real parameter and return types.
 *
 * This is issue #4's behaviour, and it had no test — its only executable proof was
 * `.i4-check.ts`, a scratch probe committed at the repo root with absolute
 * `/Users/…` imports and no assertions. That file escaped CI (tsc skips dot-prefixed
 * paths) and the tarball (the `files` allowlist), so it harmed nobody — it just wasn't a
 * test, while being the only thing standing in for one.
 *
 * Before the fix an arrow got no `returns` metadata and its colon example became a JS
 * default, so the declaration was `id(x: any): any` at best. Promoted here with relative
 * imports and expectations, and the probe deleted.
 */
describe('exported arrows reach the .d.ts (issue #4)', () => {
  const SRC = `export const id = (x: 0) => x
export function idFn(x: 0) { return x }
export const mk = (tag: 'div', n: 0): '' => tag + n
`

  it('an arrow gets typed parameters, like the function form', () => {
    const dts = dtsFor(SRC)
    expect(dts).toContain('export declare function id(x: number)')
    // The control: the `function` spelling has always worked, so a change that broke
    // BOTH would still satisfy an assertion about arrows alone.
    expect(dts).toContain('export declare function idFn(x: number)')
  })

  it('an arrow return annotation reaches the declaration', () => {
    expect(dtsFor(SRC)).toContain(
      'export declare function mk(tag: string, n: number): string'
    )
  })

  it('and the whole file still compiles', () => {
    expect(diagnose(dtsFor(SRC))).toEqual([])
  })
})
