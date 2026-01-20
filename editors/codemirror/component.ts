/**
 * CodeMirror 6 Web Component
 *
 * A light-DOM web component wrapper for CodeMirror 6.
 * Supports multiple language modes including AJS, TJS, JavaScript, CSS, HTML, and Markdown.
 *
 * Usage:
 * ```html
 * <code-mirror mode="tjs">function foo(x: 0) { return x }</code-mirror>
 * ```
 *
 * Attributes:
 * - mode: Language mode (ajs, tjs, js, css, html, markdown)
 * - disabled: Make editor read-only
 * - name: Tab name (for use with tab-selector)
 *
 * Properties:
 * - value: Get/set editor content
 * - editor: Access the underlying CodeMirror EditorView
 *
 * Events:
 * - change: Fired when content changes, detail contains { value }
 */

import { Component, ElementCreator } from 'tosijs'
import { EditorView, minimalSetup } from 'codemirror'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from '@codemirror/view'
import {
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldKeymap,
} from '@codemirror/language'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { lintKeymap } from '@codemirror/lint'
import { ajsEditorExtension, AutocompleteConfig } from './ajs-language'

// Custom setup without autocompletion (we add our own via ajsEditorExtension)
// Based on basicSetup but excludes autocompletion()
const customSetup: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
]

// Note: Compartments must be per-instance, not module-level
// Each editor needs its own compartments to avoid interference

// Map of mode names to extensions
function getLanguageExtension(
  mode: string,
  autocomplete?: AutocompleteConfig
): Extension {
  switch (mode) {
    case 'ajs':
      return ajsEditorExtension({ autocomplete })
    case 'tjs':
      // TJS uses same syntax as AJS for now (colon params, return arrows)
      // TODO: Add TJS-specific highlighting (unsafe blocks, try-without-catch)
      return ajsEditorExtension({ autocomplete })
    case 'js':
    case 'javascript':
      return javascript()
    case 'ts':
    case 'typescript':
      return javascript({ typescript: true })
    case 'css':
      return css()
    case 'html':
      return html()
    case 'md':
    case 'markdown':
      return markdown()
    default:
      return javascript()
  }
}

export class CodeMirror extends Component {
  // Shadow DOM styles - matching xin-codemirror blueprint pattern
  static styleSpec = {
    ':host': {
      display: 'block',
      width: '100%',
      height: '100%',
      position: 'relative',
      textAlign: 'left',
      fontSize: '14px',
      overflow: 'hidden',
      // Let CodeMirror theme control background, or fall back to transparent
      backgroundColor: 'transparent',
    },
    '.cm-editor': {
      height: '100%',
    },
    '.cm-scroller': {
      outline: 'none',
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
    },
  }

  private _source: string = ''
  private _editor: EditorView | undefined
  private _autocompleteConfig: AutocompleteConfig = {}
  private _darkModeObserver: MutationObserver | null = null

  // Per-instance compartments for language, readonly state, and theme
  private languageCompartment = new Compartment()
  private readonlyCompartment = new Compartment()
  private themeCompartment = new Compartment()

  mode = 'javascript'
  disabled = false
  role = 'code editor'

  /** Configure autocomplete callbacks for metadata extraction */
  set autocomplete(config: AutocompleteConfig) {
    this._autocompleteConfig = config
    // Reconfigure if editor exists
    if (this._editor) {
      this._editor.dispatch({
        effects: [
          this.languageCompartment.reconfigure(
            getLanguageExtension(this.mode, this._autocompleteConfig)
          ),
        ],
      })
    }
  }

  get autocomplete(): AutocompleteConfig {
    return this._autocompleteConfig
  }

  get value(): string {
    return this._editor !== undefined
      ? this._editor.state.doc.toString()
      : this._source
  }

  set value(text: string) {
    if (this._editor !== undefined) {
      const currentValue = this._editor.state.doc.toString()
      if (currentValue !== text) {
        this._editor.dispatch({
          changes: {
            from: 0,
            to: this._editor.state.doc.length,
            insert: text,
          },
        })
      }
    } else {
      this._source = text
    }
  }

  get editor(): EditorView | undefined {
    return this._editor
  }

  constructor() {
    super()
    this.initAttributes('mode', 'disabled')
  }

  private isDarkMode(): boolean {
    return document.body.classList.contains('darkmode')
  }

  private getThemeExtension(): Extension {
    return this.isDarkMode() ? oneDark : []
  }

  private updateTheme() {
    if (!this._editor) return
    this._editor.dispatch({
      effects: this.themeCompartment.reconfigure(this.getThemeExtension()),
    })
  }

  connectedCallback() {
    super.connectedCallback()

    // Get initial value from textContent if not already set
    if (
      this._source === '' &&
      this.textContent &&
      this.textContent.trim().length > 0
    ) {
      this._source = this.textContent.trim()
      this.textContent = ''
    }

    if (!this._editor) {
      this.createEditor()
    }
  }

  private createEditor() {
    const startState = EditorState.create({
      doc: this._source,
      extensions: [
        customSetup,
        this.languageCompartment.of(
          getLanguageExtension(this.mode, this._autocompleteConfig)
        ),
        this.readonlyCompartment.of(EditorState.readOnly.of(this.disabled)),
        this.themeCompartment.of(this.getThemeExtension()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }),
      ],
    })

    this._editor = new EditorView({
      state: startState,
      parent: this.shadowRoot || this,
    })

    // Watch for dark mode changes on body
    this._darkModeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          this.updateTheme()
        }
      }
    })
    this._darkModeObserver.observe(document.body, { attributes: true })
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this._darkModeObserver?.disconnect()
  }

  onResize() {
    if (this._editor) this._editor.requestMeasure()
  }

  render(): void {
    super.render()

    // Update language and readonly state when properties change
    if (this._editor) {
      this._editor.dispatch({
        effects: [
          this.languageCompartment.reconfigure(
            getLanguageExtension(this.mode, this._autocompleteConfig)
          ),
          this.readonlyCompartment.reconfigure(
            EditorState.readOnly.of(this.disabled)
          ),
        ],
      })
    }
  }

  // Focus the editor
  focus() {
    this._editor?.focus()
  }

  // Insert text at cursor
  insert(text: string) {
    if (!this._editor) return
    const { from } = this._editor.state.selection.main
    this._editor.dispatch({
      changes: { from, insert: text },
    })
  }

  // Get selected text
  getSelection(): string {
    if (!this._editor) return ''
    const { from, to } = this._editor.state.selection.main
    return this._editor.state.doc.sliceString(from, to)
  }

  // Replace selection
  replaceSelection(text: string) {
    if (!this._editor) return
    const { from, to } = this._editor.state.selection.main
    this._editor.dispatch({
      changes: { from, to, insert: text },
    })
  }
}

// Element creator for tosijs - shadow DOM for proper CodeMirror style encapsulation
// CodeMirror's StyleModule.mount needs to inject styles into the shadow root
export const codeMirror: ElementCreator<CodeMirror> = CodeMirror.elementCreator(
  {
    tag: 'code-mirror',
  }
)
