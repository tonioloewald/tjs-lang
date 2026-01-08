/**
 * Monaco Editor Monarch Tokenizer for AsyncJS
 *
 * Usage:
 * ```typescript
 * import * as monaco from 'monaco-editor'
 * import { languageId, languageConfiguration, monarchLanguage } from 'tosijs-agent/editors/monaco/ajs-monarch'
 *
 * monaco.languages.register({ id: languageId })
 * monaco.languages.setLanguageConfiguration(languageId, languageConfiguration)
 * monaco.languages.setMonarchTokensProvider(languageId, monarchLanguage)
 * ```
 */

import type * as Monaco from 'monaco-editor'

export const languageId = 'ajs'

export const languageConfiguration: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
    { open: '`', close: '`', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
  folding: {
    markers: {
      start: /^\s*\/\/\s*#region\b/,
      end: /^\s*\/\/\s*#endregion\b/,
    },
  },
}

export const monarchLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: 'source',
  ignoreCase: false,

  // Good parts - standard keywords
  keywords: [
    'function',
    'return',
    'if',
    'else',
    'while',
    'for',
    'of',
    'in',
    'try',
    'catch',
    'finally',
    'let',
    'const',
    'true',
    'false',
    'null',
  ],

  // Bad parts - forbidden in AsyncJS (highlighted as errors)
  forbidden: [
    'new',
    'class',
    'async',
    'await',
    'var',
    'this',
    'super',
    'extends',
    'implements',
    'interface',
    'type',
    'yield',
    'import',
    'export',
    'require',
    'throw',
  ],

  // Built-in type constructors used as factories
  typeKeywords: ['Date', 'Set', 'Map', 'Array', 'Object', 'String', 'Number'],

  operators: [
    '=',
    '>',
    '<',
    '!',
    '~',
    '?',
    ':',
    '==',
    '<=',
    '>=',
    '!=',
    '&&',
    '||',
    '++',
    '--',
    '+',
    '-',
    '*',
    '/',
    '&',
    '|',
    '^',
    '%',
    '<<',
    '>>',
    '>>>',
    '+=',
    '-=',
    '*=',
    '/=',
    '&=',
    '|=',
    '^=',
    '%=',
    '<<=',
    '>>=',
    '>>>=',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  escapes:
    /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Identifiers and keywords
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            '@forbidden': 'invalid', // Red squiggly for bad parts
            '@keywords': 'keyword',
            '@typeKeywords': 'type.identifier',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters and operators
      [/[{}()\[\]]/, '@brackets'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        },
      ],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      // Delimiter: after number because of .\d floats
      [/[;,.]/, 'delimiter'],

      // Strings
      [/'/, { token: 'string.quote', bracket: '@open', next: '@stringSingle' }],
      [/"/, { token: 'string.quote', bracket: '@open', next: '@stringDouble' }],
      [
        /`/,
        {
          token: 'string.quote',
          bracket: '@open',
          next: '@stringBacktick',
        },
      ],
    ],

    stringSingle: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    stringDouble: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    stringBacktick: [
      [/[^\\`$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [
        /\$\{/,
        {
          token: 'delimiter.bracket',
          next: '@stringTemplateExpression',
        },
      ],
      [/`/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    stringTemplateExpression: [
      [/[^}]+/, 'identifier'],
      [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*\*(?!\/)/, 'comment.doc', '@docComment'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],

    docComment: [
      [/@\w+/, 'comment.doc.tag'],
      [/[^\/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[\/*]/, 'comment.doc'],
    ],
  },
}

/**
 * Register AsyncJS language with Monaco editor
 */
export function registerAjsLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({ id: languageId })
  monaco.languages.setLanguageConfiguration(languageId, languageConfiguration)
  monaco.languages.setMonarchTokensProvider(languageId, monarchLanguage)
}
