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
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { ajsEditorExtension } from './ajs-language'

// Note: Compartments must be per-instance, not module-level
// Each editor needs its own compartments to avoid interference

// Map of mode names to extensions
function getLanguageExtension(mode: string): Extension {
  switch (mode) {
    case 'ajs':
      return ajsEditorExtension()
    case 'tjs':
      // TJS uses same syntax as AJS for now (colon params, return arrows)
      // TODO: Add TJS-specific highlighting (unsafe blocks, try-without-catch)
      return ajsEditorExtension()
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
      backgroundColor: '#fff',
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

  // Per-instance compartments for language and readonly state
  private languageCompartment = new Compartment()
  private readonlyCompartment = new Compartment()

  mode = 'javascript'
  disabled = false
  role = 'code editor'

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

  onResize() {
    // CodeMirror handles resize automatically via CSS
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
        basicSetup,
        this.languageCompartment.of(getLanguageExtension(this.mode)),
        this.readonlyCompartment.of(EditorState.readOnly.of(this.disabled)),
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
          this.languageCompartment.reconfigure(getLanguageExtension(this.mode)),
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
