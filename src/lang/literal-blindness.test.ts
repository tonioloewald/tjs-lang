import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { generateDocs } from './docs'
import { lint } from './linter'
import { fromTS } from './emitters/from-ts'
import { maskWasmBodies, unmaskWasmBodies } from './parser-transforms'

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
      const src = 'class Foo {}\nconst d = new Foo()\nconsole.log(d)'
      expect(lint(src).diagnostics.map((d) => d.rule)).toContain(
        'no-explicit-new'
      )
    })
  })
})
