const MonadicError =
  (globalThis.__tjs_MonadicError_1 ??= class MonadicError extends Error {
    constructor(m, p, e, a, c, r) {
      super(m)
      this.name = 'MonadicError'
      this.path = p
      this.expected = e
      this.actual = a
      this.callStack = c
      this.reason = r
    }
  })
function __arrKinds(v) {
  if (!v.length) return 'empty array'
  const k = [],
    n = Math.min(v.length, 64)
  for (let i = 0; i < n; i++) {
    const x = v[i],
      t = x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x
    if (!k.includes(t)) k.push(t)
    if (k.length === 4)
      return 'array of ' + k.join(' | ') + (i + 1 < v.length ? ' …' : '')
  }
  return 'array of ' + k.join(' | ') + (v.length > 64 ? ' …' : '')
}
function typeError(p, e, v, r) {
  const a = v === null ? 'null' : Array.isArray(v) ? __arrKinds(v) : typeof v
  const m = r
    ? 'Expected ' + e + " for '" + p + "': " + r
    : 'Expected ' + e + " for '" + p + "', got " + a
  const err = new MonadicError(m, p, e, a, undefined, r)
  const g = globalThis.__tjs
  const c = g?.getConfig?.()
  try {
    g?.record?.({
      source: 'type',
      severity: 'error',
      message: err.message,
      error: err,
    })
  } catch {}
  if (c?.logTypeErrors) console.error('[TJS TypeError] ' + err.message)
  if (c?.throwTypeErrors) throw err
  return err
}
function isMonadicError(v) {
  return v instanceof Error && v.name === 'MonadicError' && 'path' in v
}
function bang(o, p) {
  if (o === null || o === undefined)
    return typeError('bang.' + p, 'non-null', o)
  if (isMonadicError(o)) return o
  return o[p]
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  typeError,
  isMonadicError,
  bang,
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { generateDocs } from '/Users/tonioloewald/tjs-lang/src/lang/docs'

import { generateDTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/dts'

import { lint } from '/Users/tonioloewald/tjs-lang/src/lang/linter'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import {
  maskWasmBodies,
  unmaskWasmBodies,
  transformBangAccess,
} from '/Users/tonioloewald/tjs-lang/src/lang/parser-transforms'

import { preprocess } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

import { commentSafe } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { join, resolve } from 'node:path'

const HIDING_PLACES = [
  ['in a single-quoted string', (t) => `const hidden = '${t}'`],
  ['in a double-quoted string', (t) => `const hidden = "${t}"`],
  ['in a template literal', (t) => `const hidden = \`${t}\``],
  ['in a line comment', (t) => `// ${t}`],
  ['in a block comment', (t) => `/* ${t} */`],
]

describe('literal blindness — a trigger inside a literal is not structure', () => {
  describe('inline test blocks survive a comment marker in a literal', () => {
    const triggers = ['/*', '*/', '**/*.ts', '// not a comment']
    for (const trigger of triggers) {
      for (const [where, hide] of HIDING_PLACES) {
        if (where === 'in a block comment' && trigger.includes('*/')) continue
        it(`finds the test with ${JSON.stringify(trigger)} ${where}`, () => {
          const src = `${hide(trigger)}\nfunction f(x: 0) { return x }\n`
          const r = tjs(src)
          expect(r.testResults?.length ?? 0).toBe(1)
          expect(r.testResults?.[0]?.passed).toBe(true)
        })
      }
    }
  })
  describe('the == → Eq rewrite survives an escaped backslash', () => {
    const sources = [
      [
        'escaped backslash on the right',
        `function f(sep: '') { return sep == '\\\\' }`,
      ],
      [
        'escaped backslash on the left',
        `function f(sep: '') { return '\\\\' == sep }`,
      ],
      ['escaped quote', `function f(sep: '') { return sep == '\\'' }`],
      [
        'backslash in a return example',
        `function f(): '\\\\' { return '\\\\' }`,
      ],
      [
        'backslash as a param default',
        `function f(sep = '\\\\') { return sep }`,
      ],
    ]
    for (const [label, src] of sources) {
      it(label, () => {
        expect(() => tjs(src, { runTests: false })).not.toThrow()
      })
    }
  })
  describe('doc generation survives a regex literal', () => {
    const regexes = ['/}/', '/\\$\\{([^}]+)\\}/g', '/["\']/', '/\\/\\*/']
    for (const re of regexes) {
      it(`emits docs with ${re} above the doc block`, () => {
        const src = `const R = ${re}\n/*#\n## Title\nBody text.\n*/\nfunction f(x: 0) { return x }`
        const docs = generateDocs(src)
        expect(docs.items.length).toBeGreaterThan(0)
        expect(docs.markdown).toContain('## Title')
      })
    }
  })
  describe('a declaration shown inside a comment is not a declaration', () => {
    const shapes = [
      [
        'class in a doc comment',
        `/*#\n    class Point { constructor(x, y) { this.x = x } }\n*/\nfunction f(x: 0) { return x }`,
      ],
      [
        'extend in a doc comment',
        `/*#\n    extend Array { last() { return this[this.length - 1] } }\n*/\nfunction f(x: 0) { return x }`,
      ],
      [
        'class in a string',
        `const example = 'class Point { }'\nfunction f(x: 0) { return x }`,
      ],
    ]
    for (const [label, src] of shapes) {
      it(label, () => {
        expect(() => tjs(src, { runTests: false })).not.toThrow()
      })
    }
  })
  describe('function bodies are not truncated by a regex literal', () => {
    const bodies = [
      [
        'regex with a close brace',
        `function f(x: '') {\n  if (/^\\}/.test(x)) { return 1 }\n  return 2\n}\nfunction g(y: 0) { return y }`,
      ],
      [
        'regex with a lone quote',
        `function f(x: '') {\n  const q = /'/\n  return q.test(x)\n}\nfunction g(y: 0) { return y }`,
      ],
      [
        'regex with a comment marker',
        `function f(x: '') {\n  const q = /\\/\\*/\n  return q.test(x)\n}\nfunction g(y: 0) { return y }`,
      ],
    ]
    for (const [label, src] of bodies) {
      it(label, () => {
        const out = tjs(src, { runTests: false }).code

        expect(out).toContain('function f')
        expect(out).toContain('function g')
      })
    }
  })
  describe('a destructured parameter list splits on real commas only', () => {
    const cases = [
      [
        'comma in a string default',
        `function f({a = 'x,', b: 'y'}) { return a + b }`,

        `f({b: 'y'})`,
        'x,y',
      ],
      [
        'comma in a colon example',
        `function f({a: 'x,y', b: 2}) { return a + String(b) }`,
        `f({a: 'x,y', b: 2})`,
        'x,y2',
      ],
      [
        'comma in a template default',
        'function f({a = `p,q`, b: 1}) { return a + String(b) }',
        'f({b: 1})',
        'p,q1',
      ],
      [
        'comma in a regex default',
        `function f({a = /,/, b: 1}) { return a.test('x,y') }`,
        'f({b: 1})',
        true,
      ],
      [
        'brace in a string default',
        `function f({a = '{', b: 'y'}) { return a + b }`,
        `f({b: 'y'})`,
        '{y',
      ],
      [
        'comma in a comment',
        `function f({a = 1 /*, */, b: 'y'}) { return String(a) + b }`,
        `f({b: 'y'})`,
        '1y',
      ],
    ]
    for (const [label, src, call, expected] of cases) {
      it(label, () => {
        const out = tjs(src, { runTests: false }).code
        const value = new Function(`${out}\nreturn ${call}`)()
        expect(value).toEqual(expected)
      })
    }
    it('leaves a literal containing a comma byte-identical', () => {
      const out = tjs(`function f({a = 'x,', b: 'y'}) { return a + b }`, {
        runTests: false,
      }).code
      expect(out).toContain(`a = 'x,'`)
      expect(out).not.toContain(`a = 'x, '`)
    })
  })
  describe('wasm masking ignores a `wasm {` written in a literal', () => {
    it('does not treat a quoted `wasm {` as a block', () => {
      const src = `const open = 'wasm {'\nfunction g(a: 0, b: 0) { return a == b }\nconst close = '}'\n`
      const r = maskWasmBodies(src)
      expect(r.masks).toHaveLength(0)

      expect(unmaskWasmBodies(r.source, r.masks)).toBe(src)
    })
    it('still masks a real block, losslessly', () => {
      const src = `function f(x: 0): 0 {\n  wasm { i32.const 1\n    return }\n  return x\n}\n`
      const r = maskWasmBodies(src)
      expect(r.masks).toHaveLength(1)
      expect(unmaskWasmBodies(r.source, r.masks)).toBe(src)
    })
    it('the == rewrite still reaches code near a quoted `wasm {`', () => {
      const src = `const open = 'wasm {'\nfunction g(a: 0, b: 0) { return a == b }\nconst close = '}'\n`
      const out = tjs(src, { runTests: false }).code
      expect(out).toMatch(/Eq\(/)
      expect(out).not.toMatch(/return a == b/)
    })
  })
  describe('TS conversion: embedded tests and doc comments survive a regex', () => {
    it('does not DROP a real embedded test', () => {
      const src = `const q = /['"]/\n/**/\nexport function add(a: number, b: number) { return a + b }`
      expect(fromTS(src, { emitTJS: true }).code).toContain(`test 'adds'`)
    })
    it('does not PROMOTE a documentation example into a real test', () => {
      const src = `const q = /'/\n/**\n * Adds. Don't use for strings.\n * \n */\nexport function add(a: number, b: number) { return a + b }`
      const out = fromTS(src, { emitTJS: true }).code
      expect(out).not.toMatch(/^\s*test 'not a real test'/m)
    })
    it('keeps a doc comment after a brace-bearing regex', () => {
      const src = `const R = /\\$\\{([^}]+)\\}/g\n/*#\n## Heading\nDocs.\n*/\nexport function f(x: number) { return x }`
      expect(fromTS(src, { emitTJS: true }).code).toContain('## Heading')
    })
  })
  describe('the linter agrees with the compiler about `unsafe`', () => {
    it('does not flag a construct the compiler accepts', () => {
      const src = 'const d = unsafe new Date(0)\nconsole.log(d)'
      expect(() => tjs(src, { runTests: false })).not.toThrow()
      expect(lint(src).diagnostics.map((d) => d.rule)).not.toContain(
        'no-explicit-new'
      )
    })
    it('still flags an unguarded one', () => {
      const src = 'class Foo {}\nconst d = new Foo()\nconsole.log(d)'
      const diags = lint(src).diagnostics
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].message).toContain('a class is CALLED')
    })
  })
})

describe('ASI guard is literal-aware', () => {
  const t = (src) => tjs(src, { filename: 'asi.tjs', runTests: false })
  it('a `//` inside a template does not break a concatenation', () => {
    expect(() => t('const m = `a // b` +\n  `c`')).not.toThrow()
  })
  it('the shape that actually bit us — a multi-line message', () => {
    expect(() =>
      t(
        'const m = `x` +\n  `  predicate(x) { return 1 }   // function form\\n` +\n  `y`'
      )
    ).not.toThrow()
  })
  it('and the real ASI trap is still guarded', () => {
    expect(
      preprocess('const x = g\n(a)', { filename: 'a.tjs' }).source
    ).toContain(';(a)')
    expect(
      preprocess('const y = h\n`tpl`', { filename: 'a.tjs' }).source
    ).toContain(';`tpl`')
  })
})

describe('no shipped file strips comments with a raw regex', () => {
  const ROOT = resolve('/Users/tonioloewald/tjs-lang/src/lang', '..')
  /** Every shipped `.ts` under src/, excluding tests and the scanner that owns this. */
  const files = () => {
    const out = []
    ;(function walk(d) {
      for (const e of readdirSync(d)) {
        const p = join(d, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (
          p.endsWith('.ts') &&
          !p.endsWith('.test.ts') &&
          !p.endsWith('strip-comments.ts')
        ) {
          out.push(p)
        }
      }
    })(ROOT)
    return out
  }
  it('finds files to check', () => {
    expect(files().length).toBeGreaterThan(30)
  })
  it('has no unexplained raw comment-stripping regex', () => {
    const offenders = []
    for (const f of files()) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        const code = line.trim()
        if (code.startsWith('//') || code.startsWith('*')) return

        if (!/\.replace\(\s*\/\\\/\\\/[^)]*\)/.test(line)) return

        const context = lines.slice(Math.max(0, i - 10), i).join('\n')
        if (/NOT `maskLiterals`|literal-aware|missing primitive/.test(context))
          return
        offenders.push(`${f.replace(ROOT, 'src')}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
export {}

describe('a declaration inside a literal is data, not a declaration', () => {
  /** Each is valid TJS on its own — pinned by the control below. */
  const DECLARATIONS = [
    ['Type', 'Type Age { example: +0 }'],
    [
      'FunctionPredicate',
      "FunctionPredicate Cb { params: { x: 0 }, returns: '' }",
    ],
    ['Generic', 'Generic Box<T> { value: T }'],
    ['Union', "Union Status 'task status' { 'pending' | 'done' }"],
    ['Enum', "Enum Color 'a colour' { Red: 'red', Green: 'green' }"],
    ['const!', 'const! cfg = { a: 1 }'],
  ]
  /**
   * Escaping is real here, because every payload above contains quotes. A wrapper that
   * emitted `'…returns: '' }'` would be illegal JavaScript, and the resulting parse error
   * would look exactly like the bug — so the harness has to be correct for the test to
   * mean anything.
   */
  const WRAPPERS = [
    [
      'single-quoted',
      (t) => `const doc = '${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
    ],
    ['double-quoted', (t) => `const doc = ${JSON.stringify(t)}`],
    ['template', (t) => 'const doc = `' + t + '`'],
  ]
  for (const [kw, decl] of DECLARATIONS) {
    it(`${kw} still transforms when it is real (control)`, () => {
      // Without this, pointing every scanner at a view where nothing ever matches would
      // pass every case below.
      const out = tjs(decl, { filename: 'd.tjs', runTests: false }).code
      expect(out).not.toContain(decl)
    })
    for (const [where, wrap] of WRAPPERS) {
      it(`${kw} ${where} is left alone`, () => {
        const literal = wrap(decl)
        // The REAL declaration is present too. `transformConstBang` returns early when it
        // finds no genuine declaration, so a file containing only the literal never
        // reaches the rewrite and looks clean — the bug needs both to show itself.
        const src = `${decl}\n${literal}\nconsole.log(1)`
        const out = tjs(src, { filename: 'd.tjs', runTests: false }).code
        const line = out.split('\n').find((l) => l.includes('doc ='))
        expect(line?.trim() ?? '(the literal vanished)').toBe(literal)
      })
    }
  }
})

describe('the unsafe marker is a comment, not a string', () => {
  const MARKER = ['/*', ' unsafe ', '*/'].join('')
  const unsafeFlag = (src) =>
    /"unsafe": true/.test(tjs(src, { filename: 'u.tjs', runTests: false }).code)
  const HIDDEN = [
    ['single-quoted default', `function h(n: 0, s = '${MARKER}') { return n }`],
    ['double-quoted default', `function h(n: 0, s = "${MARKER}") { return n }`],
    ['template default', 'function h(n: 0, s = `' + MARKER + '`) { return n }'],
    [
      'nested arrow default',
      `function h(n: 0, cb = (x = '${MARKER}') => x) { return n }`,
    ],
    [
      // DEFENSIVE, and says so: the slice ends at the body, so this one cannot fail
      // today and passes against the unfixed emitter too. It is here because "the scan
      // is bounded to the parameter list" is a property of the current slice, not a
      // promise, and widening that slice is an easy accident. The other four DO fail
      // against the unfixed code.
      'string in the body',
      `function h(n: 0) { const doc = '${MARKER}'; return doc && n }`,
    ],
  ]
  for (const [label, src] of HIDDEN) {
    it(`${label} does not disable validation`, () => {
      expect(unsafeFlag(src)).toBe(false)
    })
  }
  it('the `(!` marker still means unsafe', () => {
    // Positive control. Masking comments as well as literals would pass every case above
    // and quietly delete the feature.
    expect(unsafeFlag('function h(! n: 0) { return n }')).toBe(true)
  })
  it('a real marker comment in the parameter list still means unsafe', () => {
    expect(unsafeFlag(`function h(n: 0 ${MARKER}) { return n }`)).toBe(true)
  })
  it('an ordinary function is neither', () => {
    // Guards against `unsafeFlag` matching nothing at all, which would make the hostile
    // cases pass for the wrong reason.
    expect(unsafeFlag('function h(n: 0) { return n }')).toBe(false)
    expect(
      tjs('function h(n: 0) { return n }', {
        filename: 'u.tjs',
        runTests: false,
      }).code
    ).toContain('typeError')
  })
})

describe('a declaration inside a literal is not a .d.ts export', () => {
  const REAL = 'export function real(n: 0) { return n }'
  const dtsFor = (src) =>
    generateDTS(tjs(src, { filename: 'g.tjs', runTests: false }), src)
  const GHOSTS = [
    [
      'FunctionPredicate',
      'export FunctionPredicate Ghost { params: { x: 0 }, returns: 0 }',
    ],
    ['Generic', 'export Generic Ghost<T> { value: T }'],
  ]
  for (const [kw, decl] of GHOSTS) {
    it(`a real ${kw} IS exported (control)`, () => {
      // Without this, scanning a view where nothing ever matches would pass every case
      // below by emitting no declarations at all.
      expect(dtsFor(`${decl}\n${REAL}`)).toContain('Ghost')
    })
    it(`${kw} inside a template is not exported`, () => {
      // At column 0 inside the template, because the scanners are `^`-anchored per line —
      // which is exactly how a documentation string is written.
      expect(
        dtsFor(`export const doc = \`\n${decl}\n\`\n${REAL}`)
      ).not.toContain('Ghost')
    })
    it(`${kw} inside a string is not exported`, () => {
      expect(dtsFor(`export const doc = '${decl}'\n${REAL}`)).not.toContain(
        'Ghost'
      )
    })
  }
  it('the real declaration keeps its real types', () => {
    expect(
      dtsFor(
        `export FunctionPredicate Ghost { params: { x: 0 }, returns: 0 }\n${REAL}`
      )
    ).toContain('(x: number) => number')
  })
})

describe("the parser's sentinels are not stripped from user data", () => {
  const MARKER = ['/*', '!tjs-req', '*', '/'].join('')
  const run = (src, expr) => {
    const saved = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return new Function(
        `${
          tjs(src, { filename: 'm.tjs', runTests: false }).code
        }\nreturn ${expr}`
      )()
    } finally {
      globalThis.__tjs = saved
    }
  }
  it('survives in a returned string', () => {
    const f = run(`function f(a: 0) { return 'x${MARKER}y' }`, 'f')
    expect(f(1)).toBe(`x${MARKER}y`)
  })
  it('survives in a template literal', () => {
    const f = run('function f(a: 0) { return `x' + MARKER + 'y` }', 'f')
    expect(f(1)).toBe(`x${MARKER}y`)
  })
  it('required and defaulted params still work (control)', () => {
    const g = run(`function g(a: 0, b = 2) { return a + b }`, 'g')
    expect(g(1)).toBe(3)
    expect(String(g())).toContain('MonadicError')
  })
})

describe('the fromTS provenance annotation is a comment, not a string', () => {
  const mention = String.raw`const BANNER = '/* tjs <- ${'${name}'} */'` + '\n'

  const coerces = (src) =>
    new Function(
      tjs(src + `\nfunction f(a: 0) { return a == '1' }`, { runTests: false })
        .code + '\nreturn f'
    )()(1)
  it('a mention in a string does not turn off TJS semantics', () => {
    expect(coerces(mention)).toBe(false)
  })
  it('a REAL annotation still turns them off (control)', () => {
    expect(coerces('/* tjs <- x.ts */')).toBe(true)
  })
})

describe('a declaration keyword must start at a word boundary', () => {
  const identical = [
    [
      're-export whose name ends in Type',
      'export * as EntityType from "/Users/tonioloewald/tjs-lang/src/lang/x.js"',
    ],
    [
      '…in Union',
      'export * as MyUnion from "/Users/tonioloewald/tjs-lang/src/lang/u.js"',
    ],
    [
      '…in Enum',
      'export * as ColorEnum from "/Users/tonioloewald/tjs-lang/src/lang/c.js"',
    ],
    [
      '…in Generic',
      'export * as MyGeneric from "/Users/tonioloewald/tjs-lang/src/lang/g.js"',
    ],
    ['identifier containing a keyword', 'const prototypeEnum = 1'],
    ['property names', 'const t = { myType: 1, aUnion: 2, anEnum: 3 }'],
  ]
  for (const [name, src] of identical) {
    it(`${name} survives byte-identical`, () => {
      const out = tjs(src, { runTests: false }).code.trim()
      expect(out).toBe(src)
    })
  }
  it('a REAL declaration still transforms (control)', () => {
    const out = tjs('Type Foo { example: 0 }', { runTests: false }).code
    expect(out).toContain('Foo')
    expect(out).not.toContain('Type Foo {')
  })
})

describe('a method head must not be preceded by an expression keyword', () => {
  const cases = [
    ['static field', 'class C { static x = new E({ message: "hi" }) }'],
    ['instance field', 'class C { x = new E({ message: "hi" }) }'],
    ['nested new', 'class C { x = new A(new B({ message: "hi" })) }'],
    ['throw', 'class C { x = (() => { throw E({ message: "hi" }) })() }'],
  ].map((c) => [c[0], c[1]])
  for (const [name, src] of cases) {
    it(`${name}: the object literal is not rewritten as a parameter list`, () => {
      const out = preprocess(src, { filename: 'a.tjs' }).source
      expect(out).toContain('message: "hi"')
      expect(out).not.toContain('message = "hi"')
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })
  }
  it('a real method still has its parameters transformed', () => {
    expect(
      preprocess('class C { m(a: 1) { return a } }', { filename: 'a.tjs' })
        .source
    ).toContain('a = 1')
  })
})

describe('a generated comment cannot be terminated by the text it quotes', () => {
  it('a doc comment inside a degraded type does not end the diagnostic', () => {
    const src = `export const f = (
  params: Omit<Part, 'type'> & {
    /** Optional provider-specific options. */
    readonly options?: Part['options'] | undefined
  }
): Part => params
`
    const out = fromTS(src, { emitTJS: true, filename: 'a.ts' }).code

    expect(out).toContain('TS types degraded')

    const body = out.slice(out.indexOf('TS types degraded'))
    expect(body).toContain('readonly options')
    expect(body.slice(0, body.indexOf('readonly options'))).not.toContain('*/')
    expect(() => tjs(out, { runTests: false })).not.toThrow()
  })
  it('commentSafe neutralizes every terminator, not just the first', () => {
    expect(commentSafe('a */ b */ c')).toBe('a * / b * / c')
    expect(commentSafe('no terminator')).toBe('no terminator')
  })
})

describe('a generic type-parameter list is split depth-aware', () => {
  it('an object-typed default survives with its commas intact', () => {
    const out = preprocess(
      `Generic Foo<Name, Config = { a: 0, b: 0 }> {\n  description: 'f'\n  predicate(x, Name, Config) { return true }\n}`,
      { filename: 'a.tjs' }
    ).source

    expect(out).toContain("['Config', { a: 0, b: 0 }]")
    expect(out).not.toMatch(/\{[^}]*\]/)
  })
  it('two type params still split into two entries', () => {
    const out = preprocess(
      `Generic Foo<A, B = 0> {\n  description: 'f'\n  predicate(x, A, B) { return true }\n}`,
      { filename: 'a.tjs' }
    ).source
    expect(out).toContain("'A'")
    expect(out).toContain("['B', 0]")
  })
})

describe('a `$` in a name does not defeat the transforms', () => {
  const shapes = [
    ['leading $', 'function $foo(name: 0) { return name }'],
    ['trailing $', 'function foo$(name: 0) { return name }'],
    ['interior $', 'function fo$o(name: 0) { return name }'],
    ['only $', 'function $(name: 0) { return name }'],
    ['leading underscore', 'function _foo(name: 0) { return name }'],
    ['method', 'class C { $m(a: 0) { return a } }'],
    ['getter', 'class C { get $x() { return 1 } }'],
    ['async method', 'class C { async $go(a: 0) { return a } }'],
    ['class name', 'class $C { m(a: 0) { return a } }'],
  ]

  const typePositions = [
    ['return type', 'function f(a: 0):! Record$ { return 1 }'],
    ['return type, leading $', 'function f(a: 0):! $Rec { return 1 }'],
    ['param type', 'function f(a: Record$) { return a }'],
    ['both', 'function f$(a: Rec$):! Out$ { return a }'],
  ]
  for (const [label, src] of typePositions) {
    it(`${label}: no stray character survives the annotation`, () => {
      const out = preprocess(src, { filename: 'a.tjs' }).source

      expect(out).not.toMatch(/\)\s*\$/)
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })
  }
  for (const [label, src] of shapes) {
    it(`${label}: the parameter annotation is still transformed`, () => {
      expect(() => tjs(src, { runTests: false })).not.toThrow()

      const out = preprocess(src, { filename: 'a.tjs' }).source
      if (src.includes(': 0')) expect(out).toContain('= 0')
    })
  }
})

describe('bang access is code, not text — and `${}` must not desync the scan', () => {
  const BANG = ['o', '!', '.a'].join('')
  for (const [where, hide] of HIDING_PLACES) {
    it(`${where}: the bang comes out byte-identical`, () => {
      const src = hide(`function f(o) { return ${BANG} }`)
      expect(transformBangAccess(src)).toBe(src)
    })
    it(`${where}: still byte-identical after a template with a substitution`, () => {
      const src = `const t = \`a\${x}b\`\n${hide(
        `function f(o) { return ${BANG} }`
      )}`
      expect(transformBangAccess(src)).toBe(src)
    })
  }
  it('a regex containing a quote does not open a phantom string', () => {
    const src = `const r = /['\`]/\nconst s = 'return ${BANG}'`
    expect(transformBangAccess(src)).toBe(src)
  })
  it('a division after a value is not read as a regex (control)', () => {
    const out = transformBangAccess('const q = a / b\nconst c = x!.foo')
    expect(out).toContain(`__tjs.bang(x,'foo')`)
  })

  const REAL = [
    ['a bare bang', 'const a = x!.foo', `__tjs.bang(x,'foo')`],
    [
      'a chained bang',
      'const a = x!.foo!.bar',
      `__tjs.bang(__tjs.bang(x,'foo'),'bar')`,
    ],
    [
      'inside a template substitution',
      'const s = `v=${o!.a}`',
      `\`v=\${__tjs.bang(o,'a')}\``,
    ],
    [
      'inside a NESTED template substitution',
      'const s = `a${ `b${ c!.d }e` }f`',
      `__tjs.bang(c,'d')`,
    ],
    [
      'after a template that closed',
      'const s = `a${b}c`\nconst d = x!.foo',
      `__tjs.bang(x,'foo')`,
    ],
    [
      'after an object literal inside a substitution',
      'const s = `${ {a:1}.a }`\nconst z = x!.foo',
      `__tjs.bang(x,'foo')`,
    ],
  ]
  for (const [label, src, expected] of REAL) {
    it(`${label}: is still transformed`, () => {
      expect(transformBangAccess(src)).toContain(expected)
    })
  }
  it('the whole thing through the public path', () => {
    const src = [
      'function f(o: 0) {',
      '  const label = `n=${o}`',
      `  const quoted = 'return ${BANG}'`,
      '  return label.length + quoted.length',
      '}',
    ].join('\n')
    const out = tjs(src, { filename: 'a.tjs', runTests: false }).code
    expect(out).toContain(`'return ${BANG}'`)
    expect(out).not.toContain('__tjs.bang')
  })
})

describe('a comment mentioning `export` does not consume the real one', () => {
  /**
   * tjs-lang#51, reported by tosijs: `tjs convert` emitted a module with no
   * `export withAttributes`, a bundler refused to link it, and rewording a COMMENT inside
   * the function brought the export back.
   *
   * `fromTS` decided whether an arrow-function const was already exported with
   * `tjsFunc.includes('export ')` — a substring test over the whole rendered function,
   * leading comments included. So a comment quoting `` `export interface Sub extends …` ``
   * satisfied the guard and the real `export` was never added. Silent, and invisible to
   * unit tests that exercise the source rather than the converted output.
   *
   * The report says it could not be reduced. It reduces fine — the reduction was measured
   * by looking for the FUNCTION, which is still there. Only the `export` is lost.
   */
  const MENTION = '`' + 'export interface Sub extends ComponentAttrs' + '`'
  const shapes = [
    [
      'line comment in an arrow body',
      `export const f = (x: number): number => {\n  // see ${MENTION} for the shape\n  return x\n}`,
    ],
    [
      'generic arrow, as reported',
      `export const g = <A extends Record<string, any>>(a: A): A => {\n  // see ${MENTION}\n  return a\n}`,
    ],
    [
      'block comment in the body',
      `export const h = (x: number): number => {\n  /* see ${MENTION} */\n  return x\n}`,
    ],
    [
      'leading comment above the declaration',
      `// see ${MENTION}\nexport const i = (x: number): number => {\n  return x\n}`,
    ],
    [
      'the word alone, no backticks',
      `export const j = (x: number): number => {\n  // this is not an export interface\n  return x\n}`,
    ],
    [
      'async arrow',
      `export const k = async (x: number): Promise<number> => {\n  // see ${MENTION}\n  return x\n}`,
    ],
  ]
  for (const [label, src] of shapes) {
    it(`${label}: the export survives`, () => {
      const code = fromTS(src, { emitTJS: true }).code
      expect(/^export\s+(async\s+)?function/m.test(code)).toBe(true)
    })
  }
  it('a function that is NOT exported does not become exported (control)', () => {
    const src = `const priv = (x: number): number => {\n  // see ${MENTION}\n  return x\n}\nexport const pub = (y: number): number => y`
    const code = fromTS(src, { emitTJS: true }).code
    expect(code).not.toMatch(/^export\s+(async\s+)?function priv/m)
    expect(code).toMatch(/^export\s+(async\s+)?function pub/m)
  })
  it('the export is not doubled when it is already there', () => {
    const src = `export const m = (x: number): number => {\n  return x\n}`
    const code = fromTS(src, { emitTJS: true }).code
    expect(code).not.toContain('export export')
  })
})
