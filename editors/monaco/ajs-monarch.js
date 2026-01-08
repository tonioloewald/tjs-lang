/**
 * Monaco Editor Monarch Tokenizer for AsyncJS
 *
 * Usage in browser:
 * ```html
 * <script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
 * <script src="ajs-monarch.js"></script>
 * <script>
 *   require(['vs/editor/editor.main'], function() {
 *     registerAjsLanguage(monaco);
 *     monaco.editor.create(document.getElementById('container'), {
 *       value: 'function agent(topic: "string") { ... }',
 *       language: 'ajs'
 *     });
 *   });
 * </script>
 * ```
 */

const ajsLanguageId = 'ajs'

const ajsLanguageConfiguration = {
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
}

const ajsMonarchLanguage = {
  defaultToken: 'source',
  ignoreCase: false,

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
    'throw',
    'let',
    'const',
    'true',
    'false',
    'null',
  ],

  // Forbidden keywords - highlighted as errors
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
  ],

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
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4})/,

  tokenizer: {
    root: [
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            '@forbidden': 'invalid',
            '@keywords': 'keyword',
            '@typeKeywords': 'type.identifier',
            '@default': 'identifier',
          },
        },
      ],

      { include: '@whitespace' },

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

      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      [/[;,.]/, 'delimiter'],

      [/'/, { token: 'string.quote', bracket: '@open', next: '@stringSingle' }],
      [/"/, { token: 'string.quote', bracket: '@open', next: '@stringDouble' }],
      [
        /`/,
        { token: 'string.quote', bracket: '@open', next: '@stringBacktick' },
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
        { token: 'delimiter.bracket', next: '@stringTemplateExpression' },
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
 * @param {typeof import('monaco-editor')} monaco
 */
function registerAjsLanguage(monaco) {
  monaco.languages.register({ id: ajsLanguageId })
  monaco.languages.setLanguageConfiguration(
    ajsLanguageId,
    ajsLanguageConfiguration
  )
  monaco.languages.setMonarchTokensProvider(ajsLanguageId, ajsMonarchLanguage)
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    languageId: ajsLanguageId,
    languageConfiguration: ajsLanguageConfiguration,
    monarchLanguage: ajsMonarchLanguage,
    registerAjsLanguage,
  }
}

if (typeof window !== 'undefined') {
  window.registerAjsLanguage = registerAjsLanguage
  window.ajsMonarchLanguage = ajsMonarchLanguage
}
