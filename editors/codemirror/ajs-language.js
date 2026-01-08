/**
 * CodeMirror 6 Language Support for AsyncJS (ES Module)
 *
 * Usage with CDN:
 * ```html
 * <script type="module">
 *   import { EditorView, basicSetup } from 'https://esm.sh/codemirror'
 *   import { EditorState } from 'https://esm.sh/@codemirror/state'
 *   import { javascript } from 'https://esm.sh/@codemirror/lang-javascript'
 *
 *   // Inline the forbidden keyword highlighter
 *   const FORBIDDEN = new Set(['new', 'class', 'async', 'await', 'var', 'this', 'super', 'extends', 'implements', 'interface', 'type', 'yield', 'import', 'export', 'require'])
 *
 *   // ... see full example below
 * </script>
 * ```
 *
 * For a complete working example, see the ajsExtension function below.
 */

/**
 * Forbidden keywords in AsyncJS
 */
export const FORBIDDEN_KEYWORDS = new Set([
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
 * Create the AsyncJS extension for CodeMirror 6
 *
 * This function creates the extension inline since CodeMirror 6's
 * modular architecture makes bundling complex.
 *
 * @param {Object} cm - Object containing CodeMirror imports
 * @param {typeof import('@codemirror/view')} cm.view
 * @param {typeof import('@codemirror/state')} cm.state
 * @param {typeof import('@codemirror/lang-javascript')} cm.langJs
 * @returns {import('@codemirror/state').Extension}
 */
export function createAjsExtension({ view, state, langJs }) {
  const { EditorView, Decoration, ViewPlugin } = view
  const { RangeSetBuilder } = state
  const { javascript } = langJs

  const forbiddenMark = Decoration.mark({ class: 'cm-ajs-forbidden' })

  const forbiddenHighlighter = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.buildDecorations(view)
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view)
        }
      }

      buildDecorations(view) {
        const builder = new RangeSetBuilder()
        const doc = view.state.doc.toString()
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
    { decorations: (v) => v.decorations }
  )

  const ajsTheme = EditorView.theme({
    '.cm-ajs-forbidden': {
      color: '#dc2626',
      textDecoration: 'wavy underline #dc2626',
      backgroundColor: 'rgba(220, 38, 38, 0.1)',
    },
  })

  return [javascript(), forbiddenHighlighter, ajsTheme]
}

/**
 * Minimal CSS for AsyncJS highlighting (can be added to page if theme doesn't work)
 */
export const ajsStyles = `
.cm-ajs-forbidden {
  color: #dc2626 !important;
  text-decoration: wavy underline #dc2626;
  background-color: rgba(220, 38, 38, 0.1);
}
`
