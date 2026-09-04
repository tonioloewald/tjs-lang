/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import * as ts from 'typescript'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { generateDTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/dts'

let caseCounter = 0

/* line 50 */
function diagnose(dts) {
  const fileName = `/virtual/generated-${++caseCounter}.ts`
  const options = {
    strict: true,

    skipLibCheck: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es5.d.ts'],
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
diagnose.__tjs = {
  params: {
    dts: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'string',
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:50',
}

/* line 106 */
function dtsFor(src) {
  return generateDTS(tjs(src, { filename: 'd.tjs', runTests: false }), src)
}
dtsFor.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:106',
}

describe('generated declarations compile', () => {
  it('the harness reports real diagnostics — apparatus check', () => {
    expect(diagnose('export declare function f(n: Ghost): number;')).toEqual([
      expect.stringContaining('TS2304'),
    ])

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

describe('exported arrows reach the .d.ts (issue #4)', () => {
  const SRC = `export const id = (x: 0) => x
export function idFn(x: 0) { return x }
export const mk = (tag: 'div', n: 0): '' => tag + n
`
  it('an arrow gets typed parameters, like the function form', () => {
    const dts = dtsFor(SRC)
    expect(dts).toContain('export declare function id(x: number)')

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

describe('separators inside example values', () => {
  const SRC = `export class Splitter {
  constructor(sep: ',', pad: 0) { this.sep = sep; this.pad = pad }
  join(items: [''], sep: ',') { return items.join(sep) }
}
export function fmt(list: [''], sep: ', ', wrap: '()') { return list.join(sep) }
`
  it('a comma example does not split the parameter list', () => {
    const dts = dtsFor(SRC)
    expect(dts).toContain('constructor(sep: string, pad: number)')
    expect(dts).toContain('join(items: any[], sep: string)')

    expect(dts).toContain('fmt(list: string[], sep: string, wrap: string)')
  })
  it('and the whole file compiles', () => {
    expect(diagnose(dtsFor(SRC))).toEqual([])
  })
})

describe('braces inside method bodies', () => {
  const SRC = `export class Fmt {
  brace(s: '') { return s + '}' }
  regex(s: '') { return /[}]/.test(s) }
  after(n: 0) { return n }
}
`
  it('every member reaches the declaration', () => {
    const dts = dtsFor(SRC)
    expect(dts).toContain('brace(s: string)')
    expect(dts).toContain('regex(s: string)')
    expect(dts).toContain('after(n: number)')
  })
  it('and it compiles', () => {
    expect(diagnose(dtsFor(SRC))).toEqual([])
  })
  it('a class inside a template is not declared at all', () => {
    const src = `export const doc = \`\nexport class Ghost { m(n: 0) { return n } }\n\`\nexport function real(n: 0) { return n }\n`
    expect(dtsFor(src)).not.toContain('Ghost')
  })
})
