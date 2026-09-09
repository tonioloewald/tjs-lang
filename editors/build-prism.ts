#!/usr/bin/env bun
/**
 * Prism language definitions for TJS and AJS, generated from the same source of truth.
 *
 * A fifth emitter beside the TextMate one (`build-grammars.ts`), not a new grammar: keywords,
 * forbidden keywords, type constructors and the TJS-specific patterns all come from
 * `tjs-syntax.ts` / `ajs-syntax.ts`, so a keyword added there reaches VSCode, Monaco,
 * CodeMirror, Ace *and* Prism without anyone remembering to.
 *
 * ## Why Prism specifically, and why the token choices matter more than usual
 *
 * Prism is what renders non-executable fences in the tosijs-ui doc system, and it is being
 * baked into **printed and ePub** output. On the web a wrong token colour is cosmetic; in a
 * printed book it is permanent, and highlighting is the main thing a reader uses to decode
 * unfamiliar syntax.
 *
 * That makes one decision load-bearing. In TJS, `function greet(name: 'Alice')` declares an
 * **example value** — `'Alice'` is a real string that survives to runtime — and reading it as
 * a type annotation is the single most common mistake people make with this language. Highlight
 * it with TypeScript's token model and the page argues, in colour, for the misreading the text
 * is trying to correct. So colon examples get their own token (`example-value`), aliased to
 * `string` so any existing theme renders them as the values they are rather than as types.
 *
 * The deliberately-ugly escapes (`DangerousLegacyEquals`, `LegacyDefault`, `unsafe`) get
 * `keyword.dangerous`, because looking alarming is their job — see "Make stupid stuff stand
 * out" in PRINCIPLES.md. Forbidden keywords keep the `invalid` scope the TextMate grammar
 * already gives them.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import {
  KEYWORDS as TJS_KEYWORDS,
  FORBIDDEN_KEYWORDS as TJS_FORBIDDEN,
  TYPE_CONSTRUCTORS as TJS_TYPE_CONSTRUCTORS,
  TYPE_NAMES as TJS_TYPE_NAMES,
  TJS_PATTERNS,
} from './tjs-syntax'
import {
  KEYWORDS as AJS_KEYWORDS,
  FORBIDDEN_KEYWORDS as AJS_FORBIDDEN,
  TYPE_CONSTRUCTORS as AJS_TYPE_CONSTRUCTORS,
  BUILTIN_ATOMS,
} from './ajs-syntax'

const editorsDir = dirname(new URL(import.meta.url).pathname)

/** The escapes that are meant to look alarming. */
const DANGEROUS = [
  'unsafe',
  'DangerousLegacyEquals',
  'DangerousLegacyNot',
  'LegacyExactly',
  'LegacyNotExactly',
  'LegacyDefault',
]

/** Declaration forms that introduce a runtime type. */
const DECLARATIONS = [
  'Type',
  'Generic',
  'Enum',
  'Union',
  'FunctionPredicate',
  'Exactly',
]

/** Block constructs with their own scanner in the compiler. */
const BLOCKS = ['test', 'mock', 'wasm', 'given', 'extend']

const alt = (words: readonly string[]) => words.join('|')
/** Serialise a regex literal for embedding in generated source. */
const re = (r: RegExp) => r.toString()

function definition(dialect: 'tjs' | 'ajs'): string {
  const isTjs = dialect === 'tjs'
  const keywords = isTjs ? TJS_KEYWORDS : AJS_KEYWORDS
  const forbidden = isTjs ? TJS_FORBIDDEN : AJS_FORBIDDEN
  const types = isTjs ? TJS_TYPE_CONSTRUCTORS : AJS_TYPE_CONSTRUCTORS

  // ORDER IS THE GRAMMAR. Prism takes the first match, so anything that must win over a
  // broader rule is listed above it: comments before everything, forbidden keywords before
  // ordinary ones, the colon example before the plain string rule.
  const rules: string[] = []

  rules.push(`  comment: {
    pattern: /\\/\\/.*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)/,
    greedy: true,
  }`)

  if (isTjs) {
    // `/*# … */` is a DOC comment — markdown rendered above the code — and worth
    // distinguishing from an ordinary comment, especially in print.
    rules.unshift(`  'doc-comment': {
    pattern: /\\/\\*#[\\s\\S]*?\\*\\//,
    greedy: true,
    alias: 'comment',
  }`)
  }

  // The TJS rules go BEFORE `string`, and that order is the grammar.
  //
  // Prism takes the first match, so with `string` first the `'Alice'` in
  // `name: 'Alice'` is consumed as a bare string and the colon rule never sees the pair —
  // which loses precisely the distinction this definition exists to make.
  const stringRule = `  string: {
    pattern: /(["'\`])(?:\\\\[\\s\\S]|(?!\\1)[^\\\\])*\\1/,
    greedy: true,
  }`

  rules.push(`  forbidden: {
    pattern: /\\b(?:${alt(forbidden)})\\b/,
    alias: 'important',
  }`)

  if (isTjs) {
    rules.push(`  'block-construct': {
    pattern: /\\b(?:${alt(BLOCKS)})\\b(?=\\s*(?:['"\`]|\\{))/,
    alias: 'keyword',
  }`)
    rules.push(`  dangerous: {
    pattern: /\\b(?:${alt(DANGEROUS)})\\b/,
    alias: 'important',
  }`)
    rules.push(`  declaration: {
    pattern: /\\b(?:${alt(DECLARATIONS)})\\b/,
    alias: 'class-name',
  }`)
    // The whole point. `name: 'Alice'` — the value is an EXAMPLE, not a type.
    rules.push(`  'example-value': {
    pattern: ${re(TJS_PATTERNS.colonType)},
    inside: {
      parameter: /^[a-zA-Z_$][a-zA-Z0-9_$]*/,
      punctuation: /:/,
      value: { pattern: /[\\s\\S]+/, alias: 'string' },
    },
  }`)
    rules.push(`  'return-type': {
    pattern: ${re(TJS_PATTERNS.returnType)},
    inside: {
      'safety-marker': { pattern: /[!?]/, alias: 'important' },
      punctuation: /[):]/,
      value: { pattern: /[\\s\\S]+/, alias: 'string' },
    },
  }`)
    rules.push(`  'type-name': {
    pattern: /\\b(?:${alt(TJS_TYPE_NAMES)})\\b/,
    alias: 'builtin',
  }`)
  } else {
    rules.push(`  atom: {
    pattern: /\\b(?:${alt(BUILTIN_ATOMS)})\\b/,
    alias: 'function',
  }`)
  }

  rules.push(stringRule)
  rules.push(`  'class-name': /\\b(?:${alt(types)})\\b/`)
  rules.push(`  keyword: /\\b(?:${alt(keywords)})\\b/`)
  rules.push(`  boolean: /\\b(?:true|false)\\b/`)
  rules.push(
    `  number: /\\b0[xX][\\da-fA-F]+\\b|(?:\\b\\d+(?:\\.\\d*)?|\\B\\.\\d+)(?:[eE][+-]?\\d+)?/`
  )
  rules.push(`  operator: /[<>]=?|[!=]=?=?|--?|\\+\\+?|&&?|\\|\\|?|[?*/~^%]/`)
  rules.push(`  punctuation: /[{}[\\];(),.:]/`)

  const header = `/* GENERATED by editors/build-prism.ts — do not edit.
 * Source of truth: editors/${isTjs ? 'tjs' : 'ajs'}-syntax.ts
 */`

  return `${header}
export const ${dialect} = {
${rules.join(',\n')},
}

/* Register with a global Prism if one is present, so a <script> tag works too. */
if (typeof globalThis !== 'undefined' && globalThis.Prism) {
  globalThis.Prism.languages.${dialect} = ${dialect}
}

export default ${dialect}
`
}

for (const dialect of ['tjs', 'ajs'] as const) {
  const out = join(editorsDir, 'prism', `${dialect}.js`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, definition(dialect))
  console.log(`Generated: ${out}`)
}
