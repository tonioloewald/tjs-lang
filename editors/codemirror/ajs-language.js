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

import { EditorView, Decoration, ViewPlugin } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'

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

// Alias for backwards compatibility
export { ajsEditorExtension as ajs }

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

/**
 * Find all string and comment regions in the document
 * Returns array of [start, end] ranges to skip
 */
function findSkipRegions(doc) {
  const regions = []
  const len = doc.length
  let i = 0
  
  while (i < len) {
    const ch = doc[i]
    const next = doc[i + 1]
    
    // Single-line comment
    if (ch === '/' && next === '/') {
      const start = i
      i += 2
      while (i < len && doc[i] !== '\n') i++
      regions.push([start, i])
      continue
    }
    
    // Multi-line comment
    if (ch === '/' && next === '*') {
      const start = i
      i += 2
      while (i < len - 1 && !(doc[i] === '*' && doc[i + 1] === '/')) i++
      i += 2 // skip */
      regions.push([start, i])
      continue
    }
    
    // Template literal - skip string parts but NOT ${...} expressions
    if (ch === '`') {
      let stringStart = i
      i++
      while (i < len) {
        if (doc[i] === '\\') {
          i += 2 // skip escaped char
          continue
        }
        if (doc[i] === '`') {
          // End of template - add final string region
          regions.push([stringStart, i + 1])
          i++
          break
        }
        if (doc[i] === '$' && doc[i + 1] === '{') {
          // Add string region before ${
          regions.push([stringStart, i])
          i += 2 // skip ${
          // Skip the expression inside ${...} (don't add to regions - it's code!)
          let braceDepth = 1
          while (i < len && braceDepth > 0) {
            if (doc[i] === '{') braceDepth++
            else if (doc[i] === '}') braceDepth--
            if (braceDepth > 0) i++
          }
          i++ // skip closing }
          stringStart = i // next string region starts here
          continue
        }
        i++
      }
      continue
    }
    
    // Single or double quoted string
    if (ch === '"' || ch === "'") {
      const quote = ch
      const start = i
      i++
      while (i < len) {
        if (doc[i] === '\\') {
          i += 2 // skip escaped char
          continue
        }
        if (doc[i] === quote) {
          i++
          break
        }
        if (doc[i] === '\n') break // unterminated string
        i++
      }
      regions.push([start, i])
      continue
    }
    
    i++
  }
  
  return regions
}

/**
 * Check if a position is inside any skip region
 */
function isInSkipRegion(pos, regions) {
  for (const [start, end] of regions) {
    if (pos >= start && pos < end) return true
    if (start > pos) break // regions are sorted, no need to check further
  }
  return false
}

/**
 * Ready-to-use AsyncJS language extension for CodeMirror 6
 * 
 * Returns an array of extensions that provide:
 * - JavaScript syntax highlighting
 * - Red underline highlighting for forbidden keywords (new, class, async, etc.)
 *   but NOT inside strings or comments
 * 
 * @returns {import('@codemirror/state').Extension[]}
 */
export function ajsEditorExtension() {
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
        const skipRegions = findSkipRegions(doc)
        const pattern = new RegExp(
          `\\b(${Array.from(FORBIDDEN_KEYWORDS).join('|')})\\b`,
          'g'
        )

        let match
        while ((match = pattern.exec(doc)) !== null) {
          // Skip if inside string or comment
          if (!isInSkipRegion(match.index, skipRegions)) {
            builder.add(match.index, match.index + match[0].length, forbiddenMark)
          }
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
