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
  'throw',
])

/**
 * Decoration for forbidden keywords
 */
const forbiddenMark = Decoration.mark({
  class: 'cm-ajs-forbidden',
})

/**
 * Find all string and comment regions in the document
 * Returns array of [start, end] ranges to skip
 */
function findSkipRegions(doc: string): [number, number][] {
  const regions: [number, number][] = []
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
function isInSkipRegion(pos: number, regions: [number, number][]): boolean {
  for (const [start, end] of regions) {
    if (pos >= start && pos < end) return true
    if (start > pos) break // regions are sorted, no need to check further
  }
  return false
}

/**
 * Plugin that highlights forbidden keywords as errors
 * (but not inside strings or comments)
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
      const skipRegions = findSkipRegions(doc)

      // Match word boundaries for forbidden keywords
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
export function ajsEditorExtension(
  config: { jsx?: boolean; typescript?: boolean } = {}
): Extension {
  return [
    javascript({ jsx: config.jsx, typescript: config.typescript }),
    forbiddenHighlighter,
    ajsTheme,
    syntaxHighlighting(ajsHighlightStyle),
  ]
}

// Alias for backwards compatibility
export { ajsEditorExtension as ajs }

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
