/**
 * CodeMirror 6 Language Support for AsyncJS
 *
 * This extends the JavaScript language with custom highlighting for AsyncJS:
 * - Forbidden keywords (new, class, async, etc.) are marked as errors
 * - Standard JS syntax highlighting otherwise
 *
 * Usage:
 * ```typescript
 * import { EditorState } from '@codemirror/state'
 * import { EditorView, basicSetup } from 'codemirror'
 * import { ajs } from 'tosijs-agent/editors/codemirror/ajs-language'
 *
 * new EditorView({
 *   state: EditorState.create({
 *     doc: 'function agent(topic: "string") { ... }',
 *     extensions: [basicSetup, ajs()]
 *   }),
 *   parent: document.body
 * })
 * ```
 */

import { javascript } from '@codemirror/lang-javascript'
import {
  HighlightStyle,
  syntaxHighlighting,
  LanguageSupport,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view'
import { Extension, RangeSetBuilder } from '@codemirror/state'

/**
 * Forbidden keywords in AsyncJS - these will be highlighted as errors
 */
const FORBIDDEN_KEYWORDS = new Set([
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
])

/**
 * Decoration for forbidden keywords
 */
const forbiddenMark = Decoration.mark({
  class: 'cm-ajs-forbidden',
})

/**
 * Plugin that highlights forbidden keywords as errors
 */
const forbiddenHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>()
      const doc = view.state.doc.toString()

      // Match word boundaries for forbidden keywords
      const pattern = new RegExp(
        `\\b(${Array.from(FORBIDDEN_KEYWORDS).join('|')})\\b`,
        'g'
      )

      let match
      while ((match = pattern.exec(doc)) !== null) {
        builder.add(match.index, match.index + match[0].length, forbiddenMark)
      }

      return builder.finish()
    }
  },
  {
    decorations: (v) => v.decorations,
  }
)

/**
 * Theme for AsyncJS - styles forbidden keywords as errors
 */
const ajsTheme = EditorView.theme({
  '.cm-ajs-forbidden': {
    color: '#dc2626',
    textDecoration: 'wavy underline #dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
})

/**
 * Custom highlight style that could be used for additional AsyncJS-specific highlighting
 */
const ajsHighlightStyle = HighlightStyle.define([
  // Standard highlighting is inherited from JavaScript
  // Add any AsyncJS-specific overrides here
])

/**
 * Create AsyncJS language support for CodeMirror 6
 *
 * @param config Optional configuration
 * @returns Extension array for CodeMirror
 */
export function ajs(
  config: { jsx?: boolean; typescript?: boolean } = {}
): Extension {
  return [
    javascript({ jsx: config.jsx, typescript: config.typescript }),
    forbiddenHighlighter,
    ajsTheme,
    syntaxHighlighting(ajsHighlightStyle),
  ]
}

/**
 * AsyncJS language support wrapped as LanguageSupport
 * Use this if you need access to the language object
 */
export function ajsLanguage(
  config: { jsx?: boolean; typescript?: boolean } = {}
): LanguageSupport {
  const jsLang = javascript({ jsx: config.jsx, typescript: config.typescript })
  return new LanguageSupport(jsLang.language, [
    forbiddenHighlighter,
    ajsTheme,
    syntaxHighlighting(ajsHighlightStyle),
  ])
}

export { FORBIDDEN_KEYWORDS }
