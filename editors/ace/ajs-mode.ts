/**
 * Ace Editor Mode for AsyncJS
 *
 * Usage:
 * ```typescript
 * import ace from 'ace-builds'
 * import { registerAjsMode } from 'tjs-lang/editors/ace/ajs-mode'
 *
 * registerAjsMode(ace)
 * const editor = ace.edit('editor')
 * editor.session.setMode('ace/mode/ajs')
 * ```
 */

import {
  KEYWORDS as KEYWORDS_LIST,
  FORBIDDEN_KEYWORDS as FORBIDDEN_LIST,
  TYPE_CONSTRUCTORS,
} from '../ajs-syntax'

// Re-export from shared definition for backwards compatibility
export const FORBIDDEN_KEYWORDS = [...FORBIDDEN_LIST]
export const KEYWORDS = [...KEYWORDS_LIST]
export const CONSTANTS = ['true', 'false', 'null', 'undefined']
export const BUILTINS = [...TYPE_CONSTRUCTORS]

type AceEditor = typeof import('ace-builds')

/**
 * Create the AsyncJS highlight rules for Ace
 */
function createAjsHighlightRules(ace: AceEditor) {
  const oop = ace.require('ace/lib/oop')
  const TextHighlightRules = ace.require(
    'ace/mode/text_highlight_rules'
  ).TextHighlightRules

  function AjsHighlightRules(this: any) {
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
function createAjsMode(ace: AceEditor) {
  const oop = ace.require('ace/lib/oop')
  const TextMode = ace.require('ace/mode/text').Mode
  const MatchingBraceOutdent = ace.require(
    'ace/mode/matching_brace_outdent'
  ).MatchingBraceOutdent
  const CstyleBehaviour = ace.require(
    'ace/mode/behaviour/cstyle'
  ).CstyleBehaviour
  const CStyleFoldMode = ace.require('ace/mode/folding/cstyle').FoldMode

  const AjsHighlightRules = createAjsHighlightRules(ace)

  function AjsMode(this: any) {
    this.HighlightRules = AjsHighlightRules
    this.$outdent = new MatchingBraceOutdent()
    this.$behaviour = new CstyleBehaviour()
    this.foldingRules = new CStyleFoldMode()
  }

  oop.inherits(AjsMode, TextMode)
  ;(function (this: any) {
    this.lineCommentStart = '//'
    this.blockComment = { start: '/*', end: '*/' }

    this.getNextLineIndent = function (
      state: string,
      line: string,
      tab: string
    ) {
      let indent = this.$getIndent(line)
      if (state === 'start') {
        const match = line.match(/^.*[{(\[]\s*$/)
        if (match) {
          indent += tab
        }
      }
      return indent
    }

    this.checkOutdent = function (state: string, line: string, input: string) {
      return this.$outdent.checkOutdent(line, input)
    }

    this.autoOutdent = function (state: string, doc: any, row: number) {
      this.$outdent.autoOutdent(doc, row)
    }

    this.$id = 'ace/mode/ajs'
  }).call(AjsMode.prototype)

  return AjsMode
}

/**
 * Register AsyncJS mode with Ace editor
 *
 * @param ace - The Ace editor instance
 */
export function registerAjsMode(ace: AceEditor): void {
  const AjsMode = createAjsMode(ace)
  ace.define(
    'ace/mode/ajs',
    ['require', 'exports', 'module'],
    function (_require: any, exports: any) {
      exports.Mode = AjsMode
    }
  )
}
