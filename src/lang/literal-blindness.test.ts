import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'
import { generateDocs } from './docs'
import { generateDTS } from './emitters/dts'
import { lint } from './linter'
import { fromTS } from './emitters/from-ts'
import {
  maskWasmBodies,
  unmaskWasmBodies,
  transformBangAccess,
} from './parser-transforms'
import { preprocess } from './parser'
import { commentSafe } from '../strip-comments'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The literal-blindness class, pinned in `test:fast`.
 *
 * tjs-lang is code about code, so its source-processing passes constantly encounter source
 * that MENTIONS the syntax they are scanning for. A scanner that does not understand string
 * literals, template literals, regex literals and comments will eventually read one of them
 * as structure — and the failures are characteristically silent: not a parse error at the
 * offending line, but a desynchronised scan that drops a test, blanks a document, or
 * swallows a function, tens of lines away.
 *
 * Five bugs of this class were fixed in the 0.13.0 cycle and at least six more were still
 * live at `0.13.0-beta.1`, in eight different files, because each pass had hand-rolled its
 * own partial tracking. The fix was to consolidate on `src/strip-comments.ts`; this file is
 * what stops the next one, and it is deliberately CHEAP (no LLM, no benchmark, no build) so
 * it runs in the lane developers actually use.
 *
 * The trigger is placed in each hiding place in turn — a string, a template, a regex
 * character class, a comment, a `wasm{}` body — and the pass must behave as if the trigger
 * were not there at all.
 *
 * When you add a source-rewriting pass, add a row. When one of these fails, the pass has
 * hand-rolled literal tracking again: route it through `strip-comments.ts` instead.
 */

/** Ways to hide a piece of text so that a correct scanner ignores it. */
const HIDING_PLACES: Array<[label: string, hide: (text: string) => string]> = [
  ['in a single-quoted string', (t) => `const hidden = '${t}'`],
  ['in a double-quoted string', (t) => `const hidden = "${t}"`],
  ['in a template literal', (t) => `const hidden = \`${t}\``],
  ['in a line comment', (t) => `// ${t}`],
  ['in a block comment', (t) => `/* ${t} */`],
]

describe('literal blindness — a trigger inside a literal is not structure', () => {
  describe('inline test blocks survive a comment marker in a literal', () => {
    // `const OPEN = '/*'` convinced the extractor the rest of the file was one giant
    // comment. Every test after it vanished — no error, no warning, no recorder entry.
    // For a language whose thesis is that tests live in the source, silently reporting
    // zero tests is the worst available failure mode.
    const triggers = ['/*', '*/', '**/*.ts', '// not a comment']
    for (const trigger of triggers) {
      for (const [where, hide] of HIDING_PLACES) {
        // A block comment cannot contain `*/` — it ends there. That is JavaScript, not a
        // scanner defect, and `/* */ */` is a syntax error in any engine. Skipping the
        // combination rather than asserting on it, because a test that demanded otherwise
        // would be demanding the language be different.
        if (where === 'in a block comment' && trigger.includes('*/')) continue
        it(`finds the test with ${JSON.stringify(trigger)} ${where}`, () => {
          const src = `${hide(
            trigger
          )}\nfunction f(x: 0) { return x }\ntest 'runs' { expect(1).toBe(1) }`
          const r = tjs(src)
          expect(r.testResults?.length ?? 0).toBe(1)
          expect(r.testResults?.[0]?.passed).toBe(true)
        })
      }
    }
  })

  describe('the == → Eq rewrite survives an escaped backslash', () => {
    // `sep == '\\'` failed with "Unexpected token" ~40 characters later: the naive
    // `source[i-1] !== '\\'` escape check read the escaped backslash as escaping the
    // closing quote, so the scanner ran past the end of the literal.
    const sources: Array<[string, string]> = [
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
    // `const R = /}/` drove the brace-depth count negative, so EVERY doc block and every
    // function signature failed the top-level test and generateDocs returned nothing.
    // `tjs emit` writes a sidecar .md per file, so a user's docs came out blank.
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
    // The language's own documentation contains illustrative `class`/`extend` blocks. They
    // were being picked up and transformed as real code — which only surfaced once the
    // body scanner became comment-aware and stopped accidentally compensating.
    const shapes: Array<[string, string]> = [
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
    const bodies: Array<[string, string]> = [
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
        // Both functions must survive — truncation drops the second one silently.
        expect(out).toContain('function f')
        expect(out).toContain('function g')
      })
    }
  })

  describe('a destructured parameter list splits on real commas only', () => {
    // `splitParameters` learned about COMMENTS and bracket depth and nothing else, so a
    // comma inside a string, template or regex split the member list mid-literal. The
    // pieces were then rejoined with `', '` — which put the comma back WITH A SPACE AFTER
    // IT, inside the literal:
    //
    //   {what = 'hello,', who: 'alice'}   →   { what = 'hello, ', who = 'alice' }
    //
    // Silent: the output parses, runs, and returns a plausible wrong answer. Found by
    // writing a hello-world example for the book, which is exactly the size of program
    // where `'hello,'` is the natural thing to type.
    const cases: Array<
      [label: string, src: string, call: string, expected: unknown]
    > = [
      [
        'comma in a string default',
        `function f({a = 'x,', b: 'y'}) { return a + b }`,
        // `b:` is REQUIRED, so it must be supplied; `a =` is defaulted, so omitting it
        // is what exercises the corrupted default.
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
        // The nastiest of the family: `/,/` became `/, /`, a regex that no longer
        // matches what it says. Nothing errors; it just stops finding commas.
        'comma in a regex default',
        `function f({a = /,/, b: 1}) { return a.test('x,y') }`,
        'f({b: 1})',
        true,
      ],
      [
        // Bracket depth was counted through literals too, so a lone brace in a string
        // unbalanced the scan and took the whole transpile down.
        'brace in a string default',
        `function f({a = '{', b: 'y'}) { return a + b }`,
        `f({b: 'y'})`,
        '{y',
      ],
      [
        // The one hiding place it DID know about — kept as a control, so a rewrite that
        // drops comment handling fails here rather than silently.
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
      // Behaviour above proves the value is right; this pins the SPELLING, because the
      // failure mode was a character migrating into a literal rather than a wrong result.
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
      // …and the mask must not eat the code between the two strings.
      expect(unmaskWasmBodies(r.source, r.masks)).toBe(src)
    })

    it('still masks a real block, losslessly', () => {
      const src = `function f(x: 0): 0 {\n  wasm { i32.const 1\n    return }\n  return x\n}\n`
      const r = maskWasmBodies(src)
      expect(r.masks).toHaveLength(1)
      expect(unmaskWasmBodies(r.source, r.masks)).toBe(src)
    })

    it('the == rewrite still reaches code near a quoted `wasm {`', () => {
      // The regression: the masker swallowed the function, so `==` was emitted raw and
      // `new Function(out)` parsed fine — silent at runtime, which is the worst kind.
      const src = `const open = 'wasm {'\nfunction g(a: 0, b: 0) { return a == b }\nconst close = '}'\n`
      const out = tjs(src, { runTests: false }).code
      expect(out).toMatch(/Eq\(/)
      expect(out).not.toMatch(/return a == b/)
    })
  })

  describe('TS conversion: embedded tests and doc comments survive a regex', () => {
    it('does not DROP a real embedded test', () => {
      const src = `const q = /['"]/\n/*test 'adds' {\n  expect(1 + 1).toBe(2)\n}*/\nexport function add(a: number, b: number) { return a + b }`
      expect(fromTS(src, { emitTJS: true }).code).toContain(`test 'adds'`)
    })

    it('does not PROMOTE a documentation example into a real test', () => {
      // The same blind spot produced both a false negative and a false positive.
      const src = `const q = /'/\n/**\n * Adds. Don't use for strings.\n * test 'not a real test' { expect(0).toBe(1) }\n */\nexport function add(a: number, b: number) { return a + b }`
      const out = fromTS(src, { emitTJS: true }).code
      expect(out).not.toMatch(/^\s*test 'not a real test'/m)
    })

    it('keeps a doc comment after a brace-bearing regex', () => {
      const src = `const R = /\\$\\{([^}]+)\\}/g\n/*#\n## Heading\nDocs.\n*/\nexport function f(x: number) { return x }`
      expect(fromTS(src, { emitTJS: true }).code).toContain('## Heading')
    })
  })

  describe('the linter agrees with the compiler about `unsafe`', () => {
    // The linter drives editor and playground diagnostics, so a disagreement here is what
    // a user sees FIRST — the compiler's own recommended remedy, underlined as a mistake.
    it('does not flag a construct the compiler accepts', () => {
      const src = 'const d = unsafe new Date(0)\nconsole.log(d)'
      expect(() => tjs(src, { runTests: false })).not.toThrow()
      expect(lint(src).diagnostics.map((d) => d.rule)).not.toContain(
        'no-explicit-new'
      )
    })

    it('still flags an unguarded one', () => {
      // `new Foo()` on a locally-declared class became a COMPILE ERROR, so the linter
      // now reports the parse failure rather than the `no-explicit-new` suggestion.
      // That is still agreement — which is what this test is about — and it is the
      // stronger form: the compiler enforces it instead of advising it.
      const src = 'class Foo {}\nconst d = new Foo()\nconsole.log(d)'
      const diags = lint(src).diagnostics
      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0].message).toContain('a class is CALLED')
    })
  })
})

/**
 * The ASI guard must not read a `//` inside a template literal as a comment.
 *
 *     const m = `a // b` +
 *       `c`
 *
 * It inspected the PREVIOUS line with `replace(/\/\/.*$/, '')` to decide whether that line
 * expects a continuation. On the line above, that yields ``const m = `a`` — which no longer
 * ends in `+` — so it inserted a defensive semicolon and split one expression into two:
 * ``+\n  ;`c` ``. The result did not parse.
 *
 * Cost: `parser-transforms.ts` could not self-host, because its own error messages are
 * multi-line template concatenations that document the predicate forms — and those lines
 * contain `// function form`. The error was reported several lines away from the cause,
 * which is why it survived repeated isolation attempts.
 */
describe('ASI guard is literal-aware', () => {
  const t = (src: string) => tjs(src, { filename: 'asi.tjs', runTests: false })

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
    // The control. A fix that stopped inserting semicolons entirely would satisfy the two
    // assertions above and remove the protection they exist alongside.
    expect(
      preprocess('const x = g\n(a)', { filename: 'a.tjs' }).source
    ).toContain(';(a)')
    expect(
      preprocess('const y = h\n`tpl`', { filename: 'a.tjs' }).source
    ).toContain(';`tpl`')
  })
})

/**
 * Nobody strips comments with a raw regex.
 *
 * `maskLiterals` exists precisely so that "where do the literals and comments end" is
 * answered ONCE. Every recurrence of this defect class has been a call site that
 * hand-rolled it anyway — most recently the ASI guard, whose
 * `prevLine.replace(/\/\/.*$/, '')` read a `//` inside a template literal as a comment and
 * split an expression in two (c64bcd3). Three more of the same shape were sitting in the
 * tree at that moment.
 *
 * So the rule is mechanical: outside `strip-comments.ts`, a raw `//`-stripping regex is a
 * bug waiting to be found. Any genuine exception must say why, in the source, where the
 * next reader will see it.
 */
describe('no shipped file strips comments with a raw regex', () => {
  const ROOT = resolve(import.meta.dir, '..')

  /** Every shipped `.ts` under src/, excluding tests and the scanner that owns this. */
  const files = (): string[] => {
    const out: string[] = []
    ;(function walk(d: string) {
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
    // Guards the assertion below: an empty sweep would pass vacuously.
    expect(files().length).toBeGreaterThan(30)
  })

  it('has no unexplained raw comment-stripping regex', () => {
    const offenders: string[] = []
    for (const f of files()) {
      const src = readFileSync(f, 'utf8')
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        // Skip comment lines FIRST. Without this the check flags the very comments that
        // explain the hazard — a literal-blindness bug in the literal-blindness guard,
        // which is funny exactly once and is also the whole argument for the shared
        // scanner: hand-rolled scanning gets this wrong even when getting it right is
        // the entire subject.
        const code = line.trim()
        if (code.startsWith('//') || code.startsWith('*')) return
        // A `.replace(...)` whose pattern strips `//` to end-of-line.
        if (!/\.replace\(\s*\/\\\/\\\/[^)]*\)/.test(line)) return
        // An exception must be justified in the ten lines above it — the next reader has
        // to be able to see WHY without archaeology.
        const context = lines.slice(Math.max(0, i - 10), i).join('\n')
        if (/NOT `maskLiterals`|literal-aware|missing primitive/.test(context))
          return
        offenders.push(`${f.replace(ROOT, 'src')}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

/**
 * Declaration keywords written inside a literal are DATA, and must come out byte-identical.
 *
 * All five declaration scanners (`Type`, `FunctionPredicate`, `Generic`, `Union`, `Enum`)
 * hand-rolled `source.slice(i).match(…)` over raw text while ~20 sibling call sites in the
 * same file already used `maskLiterals`. So a template literal containing
 * `Type Age { example: +0 }` came out as
 * `` `const Age = Type('Age', (v) => typeof v === 'number' && …)` `` — the user's string
 * CONTENTS silently rewritten. The single-quoted form was worse: unescaped quotes were
 * injected and the file failed to parse, so legal JavaScript was REJECTED, under
 * `dialect: 'js'` too — a JS ⊆ TJS breach (`PRINCIPLES.md`), not merely a bug.
 * `const!` had the same defect in `transformConstBang`'s final rewrite pass.
 *
 * This is a language whose own docs, tests and playground examples are full of illustrative
 * declarations, so "a declaration inside a string" is the normal case, not an exotic one.
 *
 * Two properties are asserted, and the second is the one the earlier corpus lacked:
 *
 *   1. it does not throw, and
 *   2. the literal survives **byte-identical**.
 *
 * `not.toThrow()` alone cannot see silent rewriting — the template cases all passed it
 * while being corrupted. When you add a declaration form, add a row here.
 */
describe('a declaration inside a literal is data, not a declaration', () => {
  /** Each is valid TJS on its own — pinned by the control below. */
  const DECLARATIONS: Array<[string, string]> = [
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
  const WRAPPERS: Array<[string, (t: string) => string]> = [
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

/**
 * A `/* unsafe *''/` written inside a STRING does not turn validation off.
 *
 * (That marker cannot be spelled in this comment without ending it — which is itself the
 * whole subject of the file.)
 *
 * The emitter decided per-function safety with a bare
 * `preprocessed.source.slice(func.start, body.start).includes(THE_MARKER)`. A parameter
 * DEFAULT is part of that slice, so a string containing the marker made the whole function
 * unsafe: `__tjs.unsafe` came out `true` and **no argument was checked at all**. A nested
 * arrow's default disarmed the OUTER function the same way.
 *
 * This is the one instance of the class where being literal-blind turns checks OFF rather
 * than garbling output — the failure is silent, and its whole effect is the absence of
 * something. It scanned raw text while ~38 call sites in the same codebase were already on
 * the shared scanner.
 *
 * The right view is `maskLiteralsKeepComments`, and the near-miss is instructive:
 * `maskLiterals` blanks comments too, so it erases the marker being searched for and
 * nothing is ever unsafe — a "fix" that passes every hostile case here and silently
 * disables the feature. Hence the positive controls.
 */
describe('the unsafe marker is a comment, not a string', () => {
  const MARKER = ['/*', ' unsafe ', '*/'].join('')
  const unsafeFlag = (src: string) =>
    /"unsafe": true/.test(tjs(src, { filename: 'u.tjs', runTests: false }).code)

  const HIDDEN: Array<[string, string]> = [
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

/**
 * A declaration written inside a literal does not become an exported TYPE.
 *
 * `dts.ts` grew five hand-rolled declaration scanners. Two of them —
 * `detectFunctionPredicates` and `detectGenerics` — computed a literal-masked view,
 * brace-matched on it, and then ran the DETECTION regex over raw source. Half a fix reads
 * as a whole one: the comment explaining why masking is necessary sits three lines above
 * the loop that ignores it.
 *
 * The consequence reaches consumers, which is what makes this worse than the transpiler
 * cases. A `.tjs` file whose documentation template contains an example declaration at
 * column 0 emitted a **phantom exported type** into its `.d.ts`:
 *
 *     export type Ghost = (x: number) => any;   // for a Ghost that does not exist
 *
 * — and degraded, too: `any` where the real declaration yields `number`. A consumer's
 * editor autocompletes it and their build accepts it, for a symbol with no runtime.
 *
 * `detectGenerics` also brace-matched the OUTER block on raw source while its own comment
 * described the template-literal truncation that motivated masking; only the inner
 * `declaration { … }` match had been converted.
 */
describe('a declaration inside a literal is not a .d.ts export', () => {
  const REAL = 'export function real(n: 0) { return n }'
  const dtsFor = (src: string) =>
    generateDTS(tjs(src, { filename: 'g.tjs', runTests: false }) as any, src)

  const GHOSTS: Array<[string, string]> = [
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
    // The phantom was also DEGRADED — `any` where the real one gives `number`. Pinning
    // the real one guards the fix from being "emit less".
    expect(
      dtsFor(
        `export FunctionPredicate Ghost { params: { x: 0 }, returns: 0 }\n${REAL}`
      )
    ).toContain('(x: number) => number')
  })
})

/**
 * The parser's own sentinel markers are not stripped out of user strings.
 *
 * `extractParamMarkers` removes the `/*!tjs-req*''/`-style comments the preprocessor emits
 * into parameter lists, and it walked RAW text — so a string that happened to contain one
 * lost it:
 *
 *     function f(a: 0) { return 'x' + MARKER + 'y' }   // returned "xy"
 *
 * The emitted program returned a different value than the source says, silently. Same
 * family as the `const!` rewrite that edited string contents, and the sharpest version of
 * it: the marker is OUR syntax, so nobody writing TJS would expect it to be load-bearing
 * inside their own data.
 */
describe("the parser's sentinels are not stripped from user data", () => {
  // Built rather than written, so this file does not contain a real marker that some other
  // pass might act on — and so the comment above can describe it without ending itself.
  const MARKER = ['/*', '!tjs-req', '*', '/'].join('')

  const run = (src: string, expr: string) => {
    const saved = (globalThis as any).__tjs
    ;(globalThis as any).__tjs = createRuntime()
    try {
      return new Function(
        `${
          tjs(src, { filename: 'm.tjs', runTests: false }).code
        }\nreturn ${expr}`
      )()
    } finally {
      ;(globalThis as any).__tjs = saved
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
    // Never stripping the markers would pass both cases above and break every signature.
    const g = run(`function g(a: 0, b = 2) { return a + b }`, 'g')
    expect(g(1)).toBe(3)
    expect(String(g())).toContain('MonadicError')
  })
})

describe('the fromTS provenance annotation is a comment, not a string', () => {
  // `/* tjs <- file */` in the output of `fromTS` means JS SEMANTICS — every TJS mode off.
  // The detector scanned RAW source, so any file that merely MENTIONED the annotation in a
  // string literal was misread as TS-originated and silently lost the whole language: `==`
  // stopped being `Eq`, `given` never lowered, dictionary defaults went atomic. `from-ts.ts`
  // itself is such a file — it emits the annotation from a template — so the converter's own
  // source was the first casualty, and nothing failed loudly enough to notice.
  const mention = String.raw`const BANNER = '/* tjs <- ${'${name}'} */'` + '\n'

  // `==` reports the mode directly: TJS's `Eq` does not coerce across types, JS's does. So
  // `1 == '1'` is FALSE in native TJS and TRUE under the annotation. (A boxed primitive is
  // the wrong probe here — JS `==` unboxes too, so both sides agree.)
  const coerces = (src: string) =>
    new Function(
      tjs(src + `\nfunction f(a: 0) { return a == '1' }`, { runTests: false })
        .code + '\nreturn f'
    )()(1)

  it('a mention in a string does not turn off TJS semantics', () => {
    expect(coerces(mention)).toBe(false)
  })

  it('a REAL annotation still turns them off (control)', () => {
    // Without this, deleting the detector entirely would pass the test above.
    expect(coerces('/* tjs <- x.ts */')).toBe(true)
  })
})

describe('a declaration keyword must start at a word boundary', () => {
  // `^\bType…` applied to `source.slice(i)` — where `\b` is VACUOUS, because position 0 of a
  // slice has no preceding character to compare against. So the scan matched the `Type`
  // inside `EntityType` and rewrote around it. The result was not a parse error, it was
  // SILENT CORRUPTION:
  //
  //   export * as EntityType from "./EntityType.js"
  //     ->  export * as Entityconst from = Type('from', "./EntityType.js")
  //
  // Unreachable while declaration names had to be capitalised (`from` is lowercase), and
  // reachable the moment they didn't. Rows assert byte-identical output, because
  // `not.toThrow()` cannot see a rewrite that still parses.
  const identical = [
    [
      're-export whose name ends in Type',
      'export * as EntityType from "./x.js"',
    ],
    ['…in Union', 'export * as MyUnion from "./u.js"'],
    ['…in Enum', 'export * as ColorEnum from "./c.js"'],
    ['…in Generic', 'export * as MyGeneric from "./g.js"'],
    ['identifier containing a keyword', 'const prototypeEnum = 1'],
    ['property names', 'const t = { myType: 1, aUnion: 2, anEnum: 3 }'],
  ] as const

  for (const [name, src] of identical) {
    it(`${name} survives byte-identical`, () => {
      const out = tjs(src, { runTests: false }).code.trim()
      expect(out).toBe(src)
    })
  }

  it('a REAL declaration still transforms (control)', () => {
    // Without this, refusing to match anything would pass every row above.
    const out = tjs('Type Foo { example: 0 }', { runTests: false }).code
    expect(out).toContain('Foo')
    expect(out).not.toContain('Type Foo {')
  })
})

describe('a method head must not be preceded by an expression keyword', () => {
  // Same family as the word-boundary block above, one level up: there the scan misread a
  // SUBSTRING as a keyword, here it misreads a CALL as a declaration. `new E({ x: 1 })` in a
  // class-field initializer has an identifier followed by `(` in a class body, which is the
  // shape of a method head — and the guard looked only at the preceding CHARACTER, which for
  // `new E` is `w`. So the argument was rewritten as a parameter list and `{ x: 1 }` became
  // `{ x = 1 }`: a shorthand assignment outside a pattern, which acorn rejects.
  //
  // Assert the object literal survives BYTE-IDENTICAL rather than merely that parsing
  // succeeds — a rewrite that happened to stay valid would pass a not-.toThrow() check while
  // silently changing the emitted object, which is how this class of defect ships.
  const cases: Array<[string, string]> = [
    ['static field', 'class C { static x = new E({ message: "hi" }) }'],
    ['instance field', 'class C { x = new E({ message: "hi" }) }'],
    ['nested new', 'class C { x = new A(new B({ message: "hi" })) }'],
    ['throw', 'class C { x = (() => { throw E({ message: "hi" }) })() }'],
  ].map((c) => [c[0], c[1]] as [string, string])

  for (const [name, src] of cases) {
    it(`${name}: the object literal is not rewritten as a parameter list`, () => {
      const out = preprocess(src, { filename: 'a.tjs' }).source
      expect(out).toContain('message: "hi"')
      expect(out).not.toContain('message = "hi"')
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })
  }

  it('a real method still has its parameters transformed', () => {
    // The guard must not be so broad it disables the transform it is protecting.
    expect(
      preprocess('class C { m(a: 1) { return a } }', { filename: 'a.tjs' })
        .source
    ).toContain('a = 1')
  })
})

describe('a generated comment cannot be terminated by the text it quotes', () => {
  // The mirror image of the defects above. There, a pass MISREADS code that mentions its own
  // syntax; here, a pass EMITS code that terminates its own. Block comments do not nest, so
  // the first `*/` wins — and TypeScript type text routinely carries one, because a member can
  // have a doc comment.
  //
  // effect's Prompt.ts and Response.ts both failed to parse on this, and the irony is the
  // point: the comment that broke them exists to EXPLAIN a degraded conversion.
  it('a doc comment inside a degraded type does not end the diagnostic', () => {
    const src = `export const f = (
  params: Omit<Part, 'type'> & {
    /** Optional provider-specific options. */
    readonly options?: Part['options'] | undefined
  }
): Part => params
`
    const out = fromTS(src, { emitTJS: true, filename: 'a.ts' }).code
    // The whole diagnostic must survive as ONE comment: the tail of the quoted type must not
    // reappear as code. Asserting it parses is not enough on its own — assert the terminator
    // was neutralized, since a future change could drop the type text entirely and still pass.
    expect(out).toContain('TS types degraded')
    // Between the start of the diagnostic and the tail of the type it quotes there must be no
    // terminator — anchor to the diagnostic, not to the file, or the `/* tjs <- … */`
    // provenance annotation above satisfies the match and the test passes vacuously.
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
  // `<Name, Config = { args: X, parameters: Y }>` — the list is comma-separated and its
  // members CONTAIN commas, so a plain `.split(',')` cut inside the braces and produced a
  // brace closed by a bracket:
  //
  //     Generic(['Name', ['Config', { args: null], 'parameters: null', …
  //
  // Not a parse gap — invalid JavaScript that we emitted. effect's `Tool.ts` failed on it.
  it('an object-typed default survives with its commas intact', () => {
    const out = preprocess(
      `Generic Foo<Name, Config = { a: 0, b: 0 }> {\n  description: 'f'\n  predicate(x, Name, Config) { return true }\n}`,
      { filename: 'a.tjs' }
    ).source
    // Byte-level: the members stay inside one object, and no bracket closes a brace.
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
  // `\w` is `[A-Za-z0-9_]` and excludes `$`, which is legal in a JavaScript identifier and
  // common in real code — zod declares `function $constructor(...)`, effect declares
  // `function Array$(...)`. Neither was recognised as a function at all, so its parameters
  // were never transformed and `name: string` reached acorn verbatim. The error pointed at
  // the parameter; the cause was the NAME.
  //
  // Same family as the rest of this file one level down: a regex standing in for a lexer,
  // right on the common case and silently wrong on the rest of the grammar. Two of zod's
  // corpus failures were this single character.
  const shapes: Array<[string, string]> = [
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
  // A TYPE NAME may end in `$` too, and that is a separate scan from the ones above — the
  // third site where `$` had to be added. `Record$` had `Record` consumed and the `$` left
  // between the parameter list and the body:
  //
  //     function makeRecordClass(key, value, ast):! Record$ {
  //     ->  function makeRecordClass(key, value, ast)$ {
  //
  // effect's `Schema.ts`, and the last file in the compat corpus that did not convert.
  const typePositions: Array<[string, string]> = [
    ['return type', 'function f(a: 0):! Record$ { return 1 }'],
    ['return type, leading $', 'function f(a: 0):! $Rec { return 1 }'],
    ['param type', 'function f(a: Record$) { return a }'],
    ['both', 'function f$(a: Rec$):! Out$ { return a }'],
  ]
  for (const [label, src] of typePositions) {
    it(`${label}: no stray character survives the annotation`, () => {
      const out = preprocess(src, { filename: 'a.tjs' }).source
      // The specific corruption: a bare `$` adrift between `)` and `{`.
      expect(out).not.toMatch(/\)\s*\$/)
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })
  }
  for (const [label, src] of shapes) {
    it(`${label}: the parameter annotation is still transformed`, () => {
      expect(() => tjs(src, { runTests: false })).not.toThrow()
      // Not just "it parses" — the annotation must actually have been rewritten, or this
      // would pass for a file the transform skipped entirely.
      const out = preprocess(src, { filename: 'a.tjs' }).source
      if (src.includes(': 0')) expect(out).toContain('= 0')
    })
  }
})

describe('bang access is code, not text — and `${}` must not desync the scan', () => {
  // `transformBangAccess` hand-rolled its own literal state machine, and the `${ … }` arm
  // set state to 'normal' with nothing to set it back. From a template's FIRST substitution
  // onward the rest of that template was scanned as code, so its closing backtick was read
  // as an opening one and every literal after it in the file carried inverted parity.
  //
  // The damage is the worst shape this class produces: not a wrong answer at the offending
  // line, but a rewrite tens of lines away that injects UNESCAPED QUOTES into a string —
  //
  //     ['bang access', 'function f(o) { return o!.a }']
  //  -> ['bang access', 'function f(o) { return __tjs.bang(o,'a') }']
  //
  // — so the parse dies at a position that has nothing to do with the cause. This cost a
  // session of bisection because every construct converted fine in isolation: the trigger
  // was a template literal 33 lines earlier.
  const BANG = ['o', '!', '.a'].join('')

  for (const [where, hide] of HIDING_PLACES) {
    it(`${where}: the bang comes out byte-identical`, () => {
      const src = hide(`function f(o) { return ${BANG} }`)
      expect(transformBangAccess(src)).toBe(src)
    })

    it(`${where}: still byte-identical after a template with a substitution`, () => {
      // The regression that actually shipped. The row above passes even with the bug,
      // because nothing has desynced the scanner yet.
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
    // The regex guard must not swallow real code: over-eager, `a / b … /` would consume
    // the span between two divisions and hide any bang inside it.
    const out = transformBangAccess('const q = a / b\nconst c = x!.foo')
    expect(out).toContain(`__tjs.bang(x,'foo')`)
  })

  // Controls. Every assertion above is satisfied by a transform that does nothing at all.
  const REAL: Array<[string, string, string]> = [
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
    // A template with a substitution, then a bang quoted as data, then a real bang — the
    // file shape that broke. Through `tjs()`, because that is what a consumer runs.
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

  const shapes: Array<[string, string]> = [
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
    // The guard must still do its job in the other direction: every assertion above is
    // satisfied by unconditionally prefixing `export `.
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

describe('a `test` block inside a literal is DATA — not extracted, not run', () => {
  /**
   * The inverse of the first block in this file, and the direction it did not cover.
   *
   * Those rows hide a TRIGGER in a literal and check a real `test` block outside it still
   * runs. This hides the TEST BLOCK ITSELF. `extractAndRunTests` scanned raw source, so a
   * `test '…' { … }` quoted as data was taken for a real one: its body was EXECUTED at
   * transpile time via `new Function`, and the text was DELETED from the emitted output.
   *
   *     tjs(`test 'uses toBe' {\n  expect(1).toBe(1)\n}`)   ->   tjs(``)
   *
   * A language whose own test fixtures are source code held in strings cannot survive that,
   * and it did not: 52 of the 99 failures in the dogfood behaviour gate were this, read for
   * months as "conversion loses assertions" when the assertions were being deleted on the
   * way through. Fixing it recovered 49 of them.
   */
  // The ANONYMOUS form (`test { … }`, also valid TJS), so the block carries no quote of its
  // own and can be embedded in all three literal kinds without escaping. A described block
  // is covered by the `test 'uses …'` row in the transpile-path test below.
  const BLOCK = ['test', ' { globalThis.__TJS_LEAK__ = true }'].join('')

  const hidden: Array<[string, string]> = [
    ['single-quoted string', `const fixture = '${BLOCK}'`],
    ['double-quoted string', `const fixture = "${BLOCK}"`],
    ['template literal', `const fixture = \`${BLOCK}\``],
    [
      'template with a substitution before it',
      `const n = 'x'\nconst fixture = \`\${n}: ${BLOCK}\``,
    ],
  ]

  for (const [where, decl] of hidden) {
    it(`${where}: survives byte-identical and does not run`, () => {
      const src = `${decl}\nfunction f(a: 0) { return a }`
      delete (globalThis as any).__TJS_LEAK__
      const out = tjs(src, { filename: 'a.tjs' })
      // Byte-identical, because `not.toThrow()` cannot see silent deletion — and silent
      // deletion is exactly what happened.
      expect(out.code).toContain(decl)
      expect((globalThis as any).__TJS_LEAK__).toBeUndefined()
      expect(out.testResults?.length ?? 0).toBe(0)
    })
  }

  it('a REAL test block is still extracted and still runs (control)', () => {
    // Every assertion above is satisfied by an extractor that does nothing at all.
    const src = `function f(a: 0) { return a }\ntest 'real' { expect(1).toBe(1) }`
    const out = tjs(src, { filename: 'a.tjs' })
    expect(out.testResults?.length ?? 0).toBe(1)
    expect(out.testResults?.[0]?.passed).toBe(true)
    expect(out.code).not.toContain('expect(1).toBe(1)')
  })

  it('a DESCRIBED block quoted as data survives too — the shape that shipped', () => {
    // Verbatim the shape from `test-harness-parity.test.ts`, which lost its entire fixture.
    const src = [
      'const cases = [',
      "  `test 'uses toBe' {\\n  expect(1).toBe(1)\\n}`,",
      ']',
      'function f(a: 0) { return a }',
    ].join('\n')
    const out = tjs(src, { filename: 'a.tjs' })
    expect(out.code).toContain("test 'uses toBe'")
    expect(out.code).toContain('expect(1).toBe(1)')
    expect(out.testResults?.length ?? 0).toBe(0)
  })

  it('`test` must be a whole word', () => {
    // `source.slice(i).match(/^\btest\s+/)` puts `\b` at the start of the sliced string,
    // where it is always satisfied — so the word boundary was never actually checked.
    const src = `const mytest = 1\nfunction mytest2(a: 0) { return a }`
    expect(tjs(src, { filename: 'a.tjs' }).code).toContain('mytest')
  })
})

describe('a quoted `@tjs-unsafe` annotation is DATA, not an annotation', () => {
  // `applyUnsafeAnnotations` was `code.replace(/\/\*\s*@tjs-unsafe\s*\*\//g, 'unsafe ')` over
  // raw source, so it rewrote the annotation wherever it appeared — including inside a
  // string that merely quotes it.
  //
  // The damage is delayed and therefore invisible at the site: `unsafe` is TJS-only syntax,
  // so once it is inside a TypeScript fixture that a test feeds back to `tsc`, the parser
  // reads it as a bare expression statement and ASI splits it from the expression it was
  // meant to mark — `unsafe new Date(x)` becomes `unsafe;` then `new Date(x);`. The
  // annotation's own test suite carries exactly that fixture, so the file documenting the
  // feature was the file that broke.
  const QUOTED = [
    [
      'template literal',
      'const ts = `const d = /* @tjs-unsafe */ new Date(x)`',
    ],
    ['single quotes', "const ts = 'const d = /* @tjs-unsafe */ new Date(x)'"],
    ['double quotes', 'const ts = "const d = /* @tjs-unsafe */ new Date(x)"'],
  ] as const

  for (const [label, decl] of QUOTED) {
    it(`leaves a quoted annotation byte-identical — ${label}`, async () => {
      const { fromTS } = await import('./emitters/from-ts')
      const out = fromTS(`${decl}\nexport const x = 1\n`, {
        emitTJS: true,
      }).code
      expect(out).toContain('/* @tjs-unsafe */')
      expect(out).not.toContain('unsafe new Date(')
    })
  }

  it('a REAL annotation is still converted (control)', async () => {
    // Every assertion above is satisfied by a pass that does nothing at all.
    const { fromTS } = await import('./emitters/from-ts')
    const out = fromTS(
      `export function f(x: number): number {\n  const d = /* @tjs-unsafe */ new Date(x)\n  return d.getTime()\n}\n`,
      { emitTJS: true }
    ).code
    expect(out).toContain('unsafe new Date(')
    expect(out).not.toContain('@tjs-unsafe')
  })
})

describe('a quoted `wasm function` is DATA — not compiled', () => {
  // `extractWasmFunctions` detected on RAW source, so a `wasm function` written inside a
  // template literal was COMPILED as if it were real code and replaced by the JS wrapper it
  // was supposed to produce. Four of this repo's own suites were being corrupted that way,
  // and only one of them showed up as a conversion failure — when a scanner mangles a
  // fixture into something that still parses, the file converts cleanly and lies at runtime
  // instead.
  const CASES = [
    [
      'template literal',
      'const SRC = `wasm function total(a: Float32Array, n: i32): f64 { return 1.0 }`',
    ],
    [
      'double-quoted',
      'const SRC = "wasm function total(a: Float32Array, n: i32): f64 { return 1.0 }"',
    ],
  ] as const

  for (const [label, decl] of CASES) {
    it(`leaves it byte-identical — ${label}`, () => {
      const src = `${decl}\nfunction f(a: 0) { return a }`
      const out = tjs(src, { filename: 'a.tjs' })
      // Byte-identical: `not.toThrow()` cannot see a fixture silently rewritten, and a
      // rewritten fixture is exactly what shipped.
      expect(out.code).toContain(decl)
      expect(out.code).not.toContain('__tjs_wasm_total')
    })
  }

  it('`wasm` must be a whole word', () => {
    // The regex opened with `^\b` against a SLICED string, where `\b` is satisfied by the
    // first character being a word character — so it never looked at what preceded the
    // match, and the comment claiming it stopped `mywasm` was wrong.
    const src = `const mywasm = 1\nfunction f(a: 0) { return a }`
    expect(tjs(src, { filename: 'a.tjs' }).code).toContain('mywasm')
  })
})

describe('a quoted `Is` operator is DATA — not an operator', () => {
  // `transformIsOperators` was two plain `source.replace(...)` calls, so `a Is b` inside a
  // string became `__tjs_rt.Is(a, b)`. It was the last failure standing on the dogfood
  // behaviour gate, in the suite whose entire job is to hold TJS constructs as data.
  const CASES = [
    ['single quotes', "const c = 'a Is b'"],
    ['double quotes', 'const c = "a IsNot b"'],
    ['template literal', 'const c = `x Is y`'],
  ] as const

  for (const [label, decl] of CASES) {
    it(`leaves it byte-identical — ${label}`, () => {
      const src = `${decl}\nfunction f(a: 0) { return a }`
      expect(tjs(src, { filename: 'a.tjs' }).code).toContain(decl)
    })
  }

  it('a REAL Is comparison still transforms, including against a literal (control)', () => {
    // The masking must not blind the transform to its own operands: `maskLiterals` blanks a
    // literal's interior but keeps the quotes, so this still matches.
    const out = tjs(`function f(a: [0]): false { return a Is 'lit' }`, {
      filename: 'a.tjs',
    })
    expect(out.code).toContain('.Is(')
    expect(out.code).toContain("'lit'")
  })
})
