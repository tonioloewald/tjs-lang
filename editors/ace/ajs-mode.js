/**
 * Ace Editor Mode for AsyncJS
 *
 * Usage:
 * ```html
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.js"></script>
 * <script src="path/to/ajs-mode.js"></script>
 * <script>
 *   const editor = ace.edit("editor");
 *   editor.session.setMode("ace/mode/ajs");
 * </script>
 * ```
 *
 * Or as ES module:
 * ```javascript
 * import ace from 'ace-builds'
 * import { registerAjsMode } from 'tosijs-agent/editors/ace/ajs-mode'
 * registerAjsMode(ace)
 * editor.session.setMode('ace/mode/ajs')
 * ```
 */

// Forbidden keywords in AsyncJS - these will be highlighted as errors
const FORBIDDEN_KEYWORDS = [
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
]

// Valid keywords in AsyncJS
const KEYWORDS = [
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
]

// Language constants
const CONSTANTS = ['true', 'false', 'null']

// Built-in type constructors
const BUILTINS = ['Date', 'Set', 'Map', 'Array', 'Object', 'String', 'Number', 'Math', 'JSON']

/**
 * Create the AsyncJS highlight rules for Ace
 */
function createAjsHighlightRules(ace) {
  const oop = ace.require('ace/lib/oop')
  const TextHighlightRules = ace.require('ace/mode/text_highlight_rules').TextHighlightRules

  function AjsHighlightRules() {
    const keywordMapper = this.createKeywordMapper(
      {
        'invalid.illegal': FORBIDDEN_KEYWORDS.join('|'),
        keyword: KEYWORDS.join('|'),
        'constant.language': CONSTANTS.join('|'),
        'support.function': BUILTINS.join('|'),
      },
      'identifier'
    )

    this.$rules = {
      start: [
        // Comments
        {
          token: 'comment.line',
          regex: /\/\/.*$/,
        },
        {
          token: 'comment.block.documentation',
          regex: /\/\*\*/,
          next: 'doc_comment',
        },
        {
          token: 'comment.block',
          regex: /\/\*/,
          next: 'block_comment',
        },

        // Strings - must come before keywords to avoid highlighting inside strings
        {
          token: 'string.quoted.single',
          regex: /'(?:[^'\\]|\\.)*'/,
        },
        {
          token: 'string.quoted.double',
          regex: /"(?:[^"\\]|\\.)*"/,
        },
        // Template literals with embedded expressions
        {
          token: 'string.template',
          regex: /`/,
          next: 'template_string',
        },

        // Numbers
        {
          token: 'constant.numeric.float',
          regex: /\d+\.\d+(?:[eE][+-]?\d+)?/,
        },
        {
          token: 'constant.numeric.hex',
          regex: /0[xX][0-9a-fA-F]+/,
        },
        {
          token: 'constant.numeric',
          regex: /\d+/,
        },

        // Function definition
        {
          token: ['keyword', 'text', 'entity.name.function'],
          regex: /(function)(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)/,
        },

        // Keywords and identifiers
        {
          token: keywordMapper,
          regex: /[a-zA-Z_$][a-zA-Z0-9_$]*/,
        },

        // Operators
        {
          token: 'keyword.operator',
          regex: /\+\+|--|\*\*|&&|\|\||==|!=|>=|<=|=>|[+\-*/%=<>!&|^~?:]/,
        },

        // Brackets
        {
          token: 'paren.lparen',
          regex: /[{(\[]/,
        },
        {
          token: 'paren.rparen',
          regex: /[})\]]/,
        },

        // Punctuation
        {
          token: 'punctuation',
          regex: /[;,.:]/,
        },
      ],

      block_comment: [
        {
          token: 'comment.block',
          regex: /\*\//,
          next: 'start',
        },
        {
          defaultToken: 'comment.block',
        },
      ],

      doc_comment: [
        {
          token: 'comment.block.documentation',
          regex: /\*\//,
          next: 'start',
        },
        {
          token: 'keyword.other.documentation',
          regex: /@(?:param|returns?|description|example)\b/,
        },
        {
          defaultToken: 'comment.block.documentation',
        },
      ],

      template_string: [
        {
          token: 'string.template',
          regex: /`/,
          next: 'start',
        },
        {
          token: 'constant.character.escape',
          regex: /\\./,
        },
        {
          token: 'paren.quasi.start',
          regex: /\$\{/,
          push: 'template_expression',
        },
        {
          defaultToken: 'string.template',
        },
      ],

      template_expression: [
        {
          token: 'paren.quasi.end',
          regex: /\}/,
          next: 'pop',
        },
        {
          include: 'start',
        },
      ],
    }

    this.normalizeRules()
  }

  oop.inherits(AjsHighlightRules, TextHighlightRules)

  return AjsHighlightRules
}

/**
 * Create the AsyncJS mode for Ace
 */
function createAjsMode(ace) {
  const oop = ace.require('ace/lib/oop')
  const TextMode = ace.require('ace/mode/text').Mode
  const MatchingBraceOutdent = ace.require('ace/mode/matching_brace_outdent').MatchingBraceOutdent
  const CstyleBehaviour = ace.require('ace/mode/behaviour/cstyle').CstyleBehaviour
  const CStyleFoldMode = ace.require('ace/mode/folding/cstyle').FoldMode

  const AjsHighlightRules = createAjsHighlightRules(ace)

  function AjsMode() {
    this.HighlightRules = AjsHighlightRules
    this.$outdent = new MatchingBraceOutdent()
    this.$behaviour = new CstyleBehaviour()
    this.foldingRules = new CStyleFoldMode()
  }

  oop.inherits(AjsMode, TextMode)

  ;(function () {
    this.lineCommentStart = '//'
    this.blockComment = { start: '/*', end: '*/' }

    this.getNextLineIndent = function (state, line, tab) {
      let indent = this.$getIndent(line)
      if (state === 'start') {
        const match = line.match(/^.*[{(\[]\s*$/)
        if (match) {
          indent += tab
        }
      }
      return indent
    }

    this.checkOutdent = function (state, line, input) {
      return this.$outdent.checkOutdent(line, input)
    }

    this.autoOutdent = function (state, doc, row) {
      this.$outdent.autoOutdent(doc, row)
    }

    this.$id = 'ace/mode/ajs'
  }).call(AjsMode.prototype)

  return AjsMode
}

/**
 * Register AsyncJS mode with Ace editor
 *
 * @param {object} ace - The Ace editor instance
 */
export function registerAjsMode(ace) {
  const AjsMode = createAjsMode(ace)
  ace.define('ace/mode/ajs', ['require', 'exports', 'module'], function (require, exports) {
    exports.Mode = AjsMode
  })
}

// Auto-register if Ace is available globally
if (typeof window !== 'undefined' && window.ace) {
  registerAjsMode(window.ace)
}

// Export for CommonJS/AMD
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { registerAjsMode, FORBIDDEN_KEYWORDS, KEYWORDS, CONSTANTS, BUILTINS }
}
