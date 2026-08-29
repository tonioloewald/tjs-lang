/**
 * Everything the editors CLAIM about the language, checked against the language.
 *
 * Highlighting is an assertion. A token painted as a keyword tells the reader "this is a
 * construct" — so an editor that colours a form the compiler rejects teaches it, and one
 * that leaves a real construct plain says it is ordinary code. Both are wrong, and neither
 * shows up in any test that only looks at the compiler.
 *
 * This repo has now shipped that defect twice, in the same release:
 *   - `->` was in `OPERATORS` and in two grammar rules, long after the parser stopped
 *     accepting it. It was a return-type arrow that was never implemented.
 *   - `TJS_PATTERNS.returnType` matched `) -> Type`, so REAL return types (`): Type`) went
 *     unhighlighted while the abandoned spelling was highlighted. Fixing the grammar
 *     builder did not fix this one — two copies, one wrong fact.
 *
 * And the larger finding: the lists described **AJS plus a handful of JS keywords**. A
 * `.tjs` file got nothing for `Type`, `Generic`, `Enum`, `predicate`, `wasm`, `extend`,
 * `int` — the entire distinctive surface of the language.
 *
 * ## The corpus is two-directional
 *
 * Every row carries a SNIPPET, so a claim cannot be made without proof, and the same row
 * is checked from both sides:
 *
 *   forward  — the snippet compiles, so the token is real
 *   backward — the token appears in the list that claims it, so the editor knows it
 *
 * The backward direction is the one that catches silent omissions, which is the failure
 * mode that let the TJS vocabulary go missing entirely: nothing was wrong, just absent.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { tjs } from '../src/lang'
import { ALL_COMPLETIONS } from './codemirror/ajs-language'
import {
  TJS_CONSTRUCT_KEYWORDS,
  TJS_STATEMENT_KEYWORDS,
} from '../src/lang/keywords'
import {
  KEYWORDS,
  TYPE_CONSTRUCTORS,
  TYPE_NAMES,
  OPERATORS,
  TJS_PATTERNS,
} from './tjs-syntax'

type List = 'keyword' | 'constructor' | 'typeName'

/** A token the editors claim, and source that proves the compiler agrees. */
const VOCABULARY: Array<{ token: string; list: List; snippet: string }> = [
  // --- declaration forms ---
  { token: 'Type', list: 'keyword', snippet: `Type N { example: 1 }` },
  {
    token: 'Generic',
    list: 'keyword',
    snippet: `Generic Box<T> { predicate(x, T) { return T(x.v) } }`,
  },
  { token: 'Enum', list: 'keyword', snippet: `Enum C 'c' {\n  Red = 'red'\n}` },
  { token: 'Union', list: 'keyword', snippet: `Union U 'u' { 1 | 2 }` },
  {
    token: 'FunctionPredicate',
    list: 'keyword',
    snippet: `FunctionPredicate Cb {\n  params: { x: 0 }\n  returns: 0\n}`,
  },

  // --- Type/Generic block members ---
  {
    token: 'predicate',
    list: 'keyword',
    snippet: `Type E { example: 2\n  predicate(x) { return x % 2 === 0 } }`,
  },
  { token: 'example', list: 'keyword', snippet: `Type E { example: 2 }` },
  {
    // `.d.ts` metadata, stripped before parsing — so it is invisible at runtime and was
    // invisible in the editor too.
    token: 'declaration',
    list: 'keyword',
    snippet: `Generic U<T> {\n  predicate(x, T) { return true }\n  declaration {\n    // TS: T extends Promise<infer V> ? V : T\n  }\n}`,
  },
  {
    token: 'description',
    list: 'keyword',
    snippet: `Type E { description: 'd'\n  example: 2 }`,
  },

  // --- other TJS-only constructs ---
  {
    token: 'extend',
    list: 'keyword',
    snippet: `class K {}\nextend K { hi() { return 1 } }`,
  },
  {
    token: 'wasm',
    list: 'keyword',
    snippet: `wasm function sq(n: 0): 0 { return n * n }`,
  },
  { token: 'test', list: 'keyword', snippet: `test 'x' { expect(1).toBe(1) }` },
  { token: 'unsafe', list: 'keyword', snippet: `const d = unsafe new Date(0)` },
  {
    token: 'given',
    list: 'keyword',
    snippet: `function f(x: 0):! 0 {\n  given x {\n    1 { return 2 }\n  } else {\n    return 0\n  }\n}`,
  },
  { token: 'mock', list: 'keyword', snippet: `mock { const x = 1 }` },

  // --- runtime functions ---
  {
    token: 'Timestamp',
    list: 'constructor',
    snippet: `const t = Timestamp(0)`,
  },
  { token: 'Is', list: 'constructor', snippet: `const r = Is([1], [1])` },
  { token: 'IsNot', list: 'constructor', snippet: `const r = IsNot([1], [2])` },
  {
    // `fromTS` EMITS this into converted TJS for every TS literal type, so it is on screen in
    // files nobody hand-wrote — and it was in no editor list.
    token: 'Exactly',
    list: 'constructor',
    snippet: `Type L { example: Exactly(1) }`,
  },

  // --- type names (the numeric-narrowing story, none of it highlighted before) ---
  {
    token: 'int',
    list: 'typeName',
    snippet: `function f(n: int) { return n }`,
  },
  {
    token: 'unsigned',
    list: 'typeName',
    snippet: `function f(n: unsigned) { return n }`,
  },
  {
    token: 'float',
    list: 'typeName',
    snippet: `function f(n: float) { return n }`,
  },
  {
    token: 'string',
    list: 'typeName',
    snippet: `function f(s: string) { return s }`,
  },
  {
    token: 'boolean',
    list: 'typeName',
    snippet: `function f(b: boolean) { return b }`,
  },
]

const listFor = (l: List): readonly string[] =>
  l === 'keyword'
    ? KEYWORDS
    : l === 'constructor'
    ? TYPE_CONSTRUCTORS
    : TYPE_NAMES

describe('every token the editors claim is real', () => {
  for (const { token, list, snippet } of VOCABULARY) {
    it(`${token} — the compiler accepts it`, () => {
      // Forward direction: no claim without proof. A row whose snippet stops compiling is
      // reporting that the language moved, which is exactly when the editors must too.
      expect(() =>
        tjs(snippet, { filename: 'v.tjs', runTests: false })
      ).not.toThrow()
    })

    it(`${token} — the editors know about it (${list})`, () => {
      // Backward direction: catches SILENT OMISSION, which is how the whole TJS
      // vocabulary went missing — nothing was wrong, it simply was not there.
      expect(`${token}:${listFor(list).includes(token)}`).toBe(`${token}:true`)
    })
  }

  it('EVERY construct the language defines has a row here', () => {
    // The converse direction, and the one that was missing. The corpus above is
    // hand-written, so "every token the editors claim is real" could stay green while a new
    // construct shipped with no highlighting and no proof — which is exactly what `given`
    // did. Registering a keyword now FORCES a snippet the compiler accepts.
    const proven = new Set(VOCABULARY.map((v) => v.token))
    for (const kw of TJS_CONSTRUCT_KEYWORDS) {
      expect(`${kw}:${proven.has(kw)}`).toBe(`${kw}:true`)
    }
  })

  it('the corpus covers the distinctive surface, not just a sample', () => {
    // A corpus that shrank to two rows would make every assertion above vacuous.
    expect(VOCABULARY.length).toBeGreaterThan(15)
    for (const l of ['keyword', 'constructor', 'typeName'] as List[]) {
      expect(VOCABULARY.some((v) => v.list === l)).toBe(true)
    }
  })
})

/**
 * The hole a registry cannot close by itself: a construct that never reached the registry.
 *
 * Statement-keyword detection has a distinctive shape — a word-boundary or
 * start-of-statement match on a bare word followed by required whitespace — because the
 * keyword has to be told apart from an identifier that merely starts the same way. Scanning
 * the language's own source for that shape finds the constructs, and every word it finds must
 * be one the editors know. Measured over `src/lang`: ten words, nine of them expected. The
 * tenth was `given`.
 */
describe('no construct reaches the language without reaching the editors', () => {
  /** Words matched this way that are NOT TJS constructs, each with why. */
  const NOT_CONSTRUCTS: Record<string, string> = {
    class: 'JavaScript keyword — the base grammar paints it',
    for: 'JavaScript keyword',
    function: 'JavaScript keyword',
    new: 'JavaScript keyword',
    constructor:
      'a forbidden PROPERTY name, not a construct (forbidden-keys.ts)',
    type: 'an ordinary identifier in TJS — measured, and painting it red gave a shipped example three false squiggles',
  }

  const words = (() => {
    const files = execSync('git ls-files src/lang')
      .toString()
      .trim()
      .split('\n')
      .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    const RX = /\/(?:\^|\\b|\(\^\|\[[^\]]*\]\))([a-zA-Z][a-zA-Z]{1,20})\\s/g
    const found = new Set<string>()
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, '..', f), 'utf-8')
      let m: RegExpExecArray | null
      while ((m = RX.exec(src))) found.add(m[1])
    }
    return [...found].sort()
  })()

  it('the scan finds something — apparatus check', () => {
    // A regex that matched nothing would make the assertion below vacuously green, which is
    // the failure mode this whole file exists to catch.
    expect(words.length).toBeGreaterThan(5)
    expect(words).toContain('given')
  })

  it('every keyword-shaped word in the language is known to the editors', () => {
    const known = new Set<string>([
      ...KEYWORDS,
      ...TYPE_CONSTRUCTORS,
      ...TYPE_NAMES,
      ...Object.keys(NOT_CONSTRUCTS),
    ])
    for (const w of words) {
      expect(
        `${w}:${known.has(w)}`,
        `\`${w}\` is detected as a keyword in src/lang but no editor list carries it. ` +
          `Register it in src/lang/keywords.ts (which highlights it AND demands a proof ` +
          `row), or add it to NOT_CONSTRUCTS here with a reason.`
      ).toBe(`${w}:true`)
    }
  })
})

describe('no editor surface advertises abandoned syntax', () => {
  it('`->` appears in no list and no pattern', () => {
    // It was in OPERATORS *and* in TJS_PATTERNS.returnType *and* in two grammar rules.
    // Fixing one did not fix the others, so all four are asserted together.
    expect((OPERATORS as readonly string[]).includes('->')).toBe(false)
    expect(TJS_PATTERNS.returnType.source).not.toContain('->')
  })

  it('`->` is genuinely rejected, so the exclusion is justified', () => {
    // The control. If the arrow were ever implemented, the assertions above would be
    // removing legitimate highlighting and this row says so.
    expect(() =>
      tjs(`function f(n: 0) -> 0 { return n }`, {
        filename: 'v.tjs',
        runTests: false,
      })
    ).toThrow()
  })

  it('the built grammar CARRIES every claimed token', () => {
    // The direction a spot-check caught and this file originally did not: `TYPE_NAMES`
    // was added to the source list, and the grammar builder — which never knew about that
    // list — emitted none of it. A list nothing reads is not a fix, and asserting only on
    // the list would have called it one.
    const path = join(
      import.meta.dir,
      'vscode',
      'syntaxes',
      'tjs.tmLanguage.json'
    )
    if (!existsSync(path)) return
    const grammar = readFileSync(path, 'utf-8')
    for (const { token } of VOCABULARY) {
      expect(`${token}:${grammar.includes(token)}`).toBe(`${token}:true`)
    }
  })

  it('the built grammar artifacts are free of it too', () => {
    // Source lists and built artifacts are separate things, and this repo has shipped a
    // stale committed artifact before (`demo/docs.json` taught nine abolished directives
    // for days after its sources were rewritten).
    const dir = join(import.meta.dir, 'vscode', 'syntaxes')
    for (const f of ['tjs.tmLanguage.json', 'ajs.tmLanguage.json']) {
      const path = join(dir, f)
      if (!existsSync(path)) continue
      expect(`${f}:${readFileSync(path, 'utf-8').includes('->')}`).toBe(
        `${f}:false`
      )
    }
  })
})

describe('patterns match the spellings that actually exist', () => {
  it('returnType matches `): Type`, and the safety-marked forms', () => {
    for (const src of ['): 0 {', '):! 0 {', '):? 0 {']) {
      expect(`${src}:${TJS_PATTERNS.returnType.test(src)}`).toBe(`${src}:true`)
    }
  })

  it('testBlock matches BOTH real spellings', () => {
    // `test 'x' { }` is canonical and used throughout the docs; only the parenthesised
    // form was matched, so every example in the repo went unhighlighted.
    expect(TJS_PATTERNS.testBlock.test(`test 'x' {`)).toBe(true)
    expect(TJS_PATTERNS.testBlock.test(`test('x') {`)).toBe(true)
  })

  it('both test spellings really do compile', () => {
    for (const src of [
      `test 'x' { expect(1).toBe(1) }`,
      `test('x') { expect(1).toBe(1) }`,
    ]) {
      expect(() =>
        tjs(src, { filename: 'v.tjs', runTests: false })
      ).not.toThrow()
    }
  })
})

/**
 * The completions are claims too, and the noisiest kind — a completion does not merely
 * colour existing text, it WRITES the text for you.
 *
 * This surface had shipped `unsafe { }`, a form the compiler rejects outright, as the
 * completion for the language's headline feature. It also offered the deprecated
 * `isError` with no `isMonadicError` beside it, and none of the declaration forms at all.
 */
describe('completions do not suggest what the compiler rejects', () => {
  /**
   * The snippet TEMPLATES, read from source.
   *
   * `snippetCompletion` keeps its template in a closure, so it cannot be recovered from
   * the completion object — an earlier version of this test read `.apply`, silently fell
   * back to the label, and would have passed while asserting nothing about the inserted
   * text. What ships is the source, so check the source.
   */
  const source = readFileSync(
    join(import.meta.dir, 'codemirror', 'ajs-language.ts'),
    'utf-8'
  )
  const templates = [
    ...source.matchAll(/snippetCompletion\(\s*(['"`])([\s\S]*?)\1/g),
  ].map((m) => m[2])

  it('offers the distinctive TJS vocabulary, not just JS keywords', () => {
    // The silent-omission direction. `Type`/`Generic`/`Enum` had no completion, so the
    // constructs that make this a different language were undiscoverable in its own editor.
    //
    // Driven off the REGISTRY rather than a second hand-written list, so a new construct is
    // undiscoverable-by-default for exactly as long as it takes this to go red. Highlighting
    // and completion fail together or not at all — the earlier hardcoded list would have let
    // `given` be painted correctly and still be unofferable.
    const labels = new Set(ALL_COMPLETIONS.map((c: any) => String(c.label)))
    // STATEMENT keywords only. The block members (`example`, `predicate`, …) are legal only
    // inside a `Type`/`Generic` block, so a top-level completion for them would be the same
    // kind of false claim as an unpainted keyword, pointing the other way. They get no
    // contextual completion today — a real gap, named in `keywords.ts` rather than hidden.
    for (const t of [...TJS_STATEMENT_KEYWORDS, 'int', 'unsigned', 'float']) {
      expect(`${t}:${labels.has(t)}`).toBe(`${t}:true`)
    }
  })

  it('there are snippet templates to check at all', () => {
    // Guards the reader above: a regex that matched nothing would make the next test
    // vacuously green, which is the apparatus-fails-closed hazard.
    expect(templates.length).toBeGreaterThan(10)
  })

  it('no template inserts `unsafe { }` or the abandoned arrow', () => {
    for (const t of templates) {
      expect(`${t.slice(0, 24)}:${/unsafe\s*\{/.test(t)}`).toBe(
        `${t.slice(0, 24)}:false`
      )
      expect(`${t.slice(0, 24)}:${t.includes('->')}`).toBe(
        `${t.slice(0, 24)}:false`
      )
    }
  })

  it('prefers the current API over the deprecated one', () => {
    // `isError` may stay for compatibility, but it must not be the only thing offered,
    // and it must say what it is.
    const byLabel = new Map(
      ALL_COMPLETIONS.map((c: any) => [String(c.label), c])
    )
    expect(byLabel.has('isMonadicError')).toBe(true)
    expect(String(byLabel.get('isError')?.detail ?? '')).toContain('DEPRECATED')
  })

  it('the `test` snippet uses the canonical spelling', () => {
    // Both compile, but only one is written anywhere in the docs or examples.
    expect(templates.some((t) => t.startsWith("test '"))).toBe(true)
    expect(templates.some((t) => t.startsWith('test('))).toBe(false)
  })
})

/**
 * A diagnostic is a teaching moment, so its remedy has to WORK.
 *
 * `new Date()` told the reader to use `Timestamp.now()`. `Timestamp` is exported from
 * `tjs-lang` but is not a global, so following the advice verbatim produced a second
 * error — `Timestamp is not defined` — from the message meant to resolve the first.
 */
describe('the `new Date()` remedy is runnable', () => {
  it('names the import, not just the call', () => {
    try {
      tjs(`const d = new Date(0)`, { filename: 'v.tjs', runTests: false })
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.message).toContain("from 'tjs-lang'")
      expect(e.message).toContain('Timestamp.now()')
    }
  })

  it('and `Timestamp` really is exported from there', () => {
    // The control: if it stopped being exported, the remedy would be wrong in the other
    // direction and this says so.
    expect(typeof (require('../src/index') as any).Timestamp).toBe('object')
  })
})
