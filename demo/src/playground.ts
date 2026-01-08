/*
 * playground.ts - Interactive AsyncJS playground component
 */

import { elements, Component, PartsMap } from 'tosijs'

import { icons } from 'tosijs-ui'

import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { ajs } from '../../editors/codemirror/ajs-language'

import { examples, type Example } from './examples'
import { AgentVM, transpile, type TranspileResult } from '../../src'

const { div, button, span, select, option, optgroup, input } = elements

// localStorage key for custom examples
const STORAGE_KEY = 'agent-playground-examples'

// Load custom examples from localStorage
function loadCustomExamples(): Example[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save custom examples to localStorage
function saveCustomExamples(customExamples: Example[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customExamples))
}

// Parts interface for typed access
interface PlaygroundParts extends PartsMap {
  editorContainer: HTMLElement
  resultContainer: HTMLElement
  statusBar: HTMLElement
  tabResult: HTMLButtonElement
  tabAst: HTMLButtonElement
  tabTrace: HTMLButtonElement
  runBtn: HTMLButtonElement
  clearBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  deleteBtn: HTMLButtonElement
  exampleSelect: HTMLSelectElement
}

export class Playground extends Component<PlaygroundParts> {
  private editor: EditorView | null = null
  private vm = new AgentVM()
  private currentTab = 'result'
  private lastResult: any = null
  private lastAst: TranspileResult | null = null
  private lastError: string | null = null
  private isRunning = false

  // Use Shadow DOM styles (static styleSpec)
  static styleSpec = {
    ':host': {
      display: 'block',
      height: '100%',
      position: 'relative',
    },

    '.playground': {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '10px',
    },

    '.playground-toolbar': {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px',
      background: '#f3f4f6',
      borderRadius: '6px',
      flexWrap: 'wrap',
    },

    '.run-btn': {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 12px',
      background: '#3d4a6b',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
    },

    '.playground-main': {
      display: 'flex',
      flex: '1 1 auto',
      gap: '10px',
      minHeight: 0,
    },

    '.playground-editor': {
      flex: '1 1 50%',
      minWidth: '300px',
      minHeight: '300px',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      overflow: 'hidden',
      position: 'relative',
    },

    // Critical CodeMirror styles
    '.playground-editor .cm-editor': {
      height: '100%',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },

    '.playground-editor .cm-scroller': {
      outline: 'none',
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
    },

    '.playground-output': {
      flex: '1 1 50%',
      display: 'flex',
      flexDirection: 'column',
      minWidth: '300px',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      overflow: 'hidden',
    },

    '.playground-tabs': {
      display: 'flex',
      background: '#f3f4f6',
      borderBottom: '1px solid #e5e7eb',
    },

    '.playground-tab': {
      padding: '5px 10px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'inherit',
      opacity: 0.7,
      transition: 'opacity 0.15s, background 0.15s',
    },

    '.playground-tab:hover': {
      opacity: 1,
      background: 'rgba(99, 102, 241, 0.1)',
    },

    '.playground-tab.active': {
      opacity: 1,
      borderBottom: '2px solid #3d4a6b',
      marginBottom: '-1px',
    },

    '.playground-result': {
      flex: '1 1 auto',
      overflow: 'auto',
      padding: '10px',
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
      fontSize: '13px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },

    '.playground-result.error': {
      color: '#dc2626',
    },

    '.playground-result.success': {
      color: '#16a34a',
    },

    '.playground-status': {
      padding: '5px 10px',
      background: '#f3f4f6',
      borderTop: '1px solid #e5e7eb',
      fontSize: '12px',
      opacity: 0.7,
    },

    '@media (max-width: 768px)': {
      '.playground-main': {
        flexDirection: 'column',
      },
      '.playground-editor, .playground-output': {
        flex: '1 1 auto',
        minHeight: '250px',
      },
    },
  }

  content = () => [
    div(
      { class: 'playground' },
      // Toolbar
      div(
        { class: 'playground-toolbar' },
        button(
          {
            part: 'runBtn',
            class: 'run-btn',
          },
          icons.play({ size: 16 }),
          'Run'
        ),

        button(
          {
            part: 'clearBtn',
            class: 'iconic',
            title: 'Clear',
          },
          icons.x()
        ),

        span({ style: { flex: '1' } }),

        select(
          {
            part: 'exampleSelect',
            style: { padding: '4px 8px', borderRadius: '4px' },
          },
          option({ value: '' }, '-- Load Example --'),
          ...examples.map((ex, i) =>
            option(
              { value: i.toString() },
              ex.requiresApi ? `${ex.name} 🔑` : ex.name
            )
          )
        )
      ),

      // Main area
      div(
        { class: 'playground-main' },
        div({ part: 'editorContainer', class: 'playground-editor' }),

        div(
          { class: 'playground-output' },
          div(
            { class: 'playground-tabs' },
            button(
              { part: 'tabResult', class: 'playground-tab active' },
              'Result'
            ),
            button({ part: 'tabAst', class: 'playground-tab' }, 'AST'),
            button({ part: 'tabTrace', class: 'playground-tab' }, 'Trace')
          ),
          div(
            { part: 'resultContainer', class: 'playground-result' },
            '// Run code to see results'
          ),
          div({ part: 'statusBar', class: 'playground-status' }, 'Ready')
        )
      )
    ),
  ]

  connectedCallback() {
    super.connectedCallback()

    // Bind event handlers manually for Shadow DOM
    this.parts.runBtn.addEventListener('click', this.runCode)
    this.parts.clearBtn.addEventListener('click', this.clearEditor)
    this.parts.exampleSelect.addEventListener('change', this.loadExample)
    this.parts.tabResult.addEventListener('click', () =>
      this.switchTab('result')
    )
    this.parts.tabAst.addEventListener('click', () => this.switchTab('ast'))
    this.parts.tabTrace.addEventListener('click', () => this.switchTab('trace'))

    // Listen for hash changes
    window.addEventListener('hashchange', this.handleHashChange)

    // Initialize CodeMirror after hydration
    this.initEditor()
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.handleHashChange)
  }

  // Get example index from hash (e.g., #example=2 or #example=Hello%20World)
  getExampleFromHash(): number {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const value = params.get('example')
    if (value === null) return 0

    // Try parsing as number first
    const idx = parseInt(value, 10)
    if (!isNaN(idx) && idx >= 0 && idx < examples.length) {
      return idx
    }

    // Try matching by name
    const decodedName = decodeURIComponent(value).toLowerCase()
    const nameIdx = examples.findIndex(
      (ex) => ex.name.toLowerCase() === decodedName
    )
    return nameIdx >= 0 ? nameIdx : 0
  }

  // Update hash when example changes
  setHashForExample(idx: number) {
    const example = examples[idx]
    if (example) {
      const hash = `example=${encodeURIComponent(example.name)}`
      history.replaceState(null, '', `#${hash}`)
    }
  }

  handleHashChange = () => {
    const idx = this.getExampleFromHash()
    this.loadExampleByIndex(idx)
  }

  initEditor() {
    const container = this.parts.editorContainer
    if (!container) return

    const extensions = [basicSetup, ajs()]

    // Get initial example from hash or default to first
    const initialIdx = this.getExampleFromHash()
    const startDoc =
      examples[initialIdx]?.code || '// Write your AsyncJS code here\n'

    this.editor = new EditorView({
      state: EditorState.create({
        doc: startDoc,
        extensions,
      }),
      parent: container,
    })

    // Sync the select to show current example
    this.parts.exampleSelect.selectedIndex = initialIdx + 1

    // Set hash if not already set
    if (!window.location.hash.includes('example=')) {
      this.setHashForExample(initialIdx)
    }
  }

  loadExampleByIndex(idx: number) {
    if (idx >= 0 && idx < examples.length && this.editor) {
      const example = examples[idx]
      this.editor.dispatch({
        changes: {
          from: 0,
          to: this.editor.state.doc.length,
          insert: example.code,
        },
      })
      // Sync select
      this.parts.exampleSelect.selectedIndex = idx + 1
      // Update hash
      this.setHashForExample(idx)
    }
  }

  loadExample = (e: Event) => {
    const idx = (e.target as HTMLSelectElement).selectedIndex - 1
    if (idx >= 0) {
      this.loadExampleByIndex(idx)
    }
  }

  clearEditor = () => {
    if (this.editor) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: '' },
      })
    }
    this.parts.resultContainer.textContent = ''
    this.parts.statusBar.textContent = 'Ready'
  }

  switchTab(tab: string) {
    this.currentTab = tab
    this.parts.tabResult.classList.toggle('active', tab === 'result')
    this.parts.tabAst.classList.toggle('active', tab === 'ast')
    this.parts.tabTrace.classList.toggle('active', tab === 'trace')
    this.updateOutput()
  }

  updateOutput() {
    const container = this.parts.resultContainer
    container.className = 'playground-result'

    if (this.lastError) {
      container.className += ' error'
      container.textContent = this.lastError
      return
    }

    switch (this.currentTab) {
      case 'ast':
        container.textContent = this.lastAst
          ? JSON.stringify(this.lastAst.ast, null, 2)
          : '// Run code to see AST'
        break

      case 'trace':
        container.textContent = this.lastResult?.trace
          ? this.lastResult.trace
              .map((t: any) => `${t.op}: ${JSON.stringify(t.result)}`)
              .join('\n')
          : '// Run code with tracing enabled to see execution trace'
        break

      case 'result':
      default:
        if (this.lastResult) {
          container.className += this.lastResult.error ? ' error' : ' success'
          const output = this.lastResult.error || this.lastResult.result
          container.textContent =
            typeof output === 'string'
              ? output
              : JSON.stringify(output, null, 2)
        } else {
          container.textContent = '// Run code to see results'
        }
        break
    }
  }

  runCode = async () => {
    console.log('runCode called', {
      isRunning: this.isRunning,
      editor: this.editor,
    })
    if (this.isRunning || !this.editor) return

    this.isRunning = true
    this.lastError = null
    this.lastAst = null
    this.lastResult = null

    const code = this.editor.state.doc.toString()
    this.parts.statusBar.textContent = 'Transpiling...'

    try {
      const transpileResult = transpile(code)
      this.lastAst = transpileResult

      this.parts.statusBar.textContent = 'Running...'

      // Build args from signature defaults
      const args: Record<string, any> = {}
      if (transpileResult.signature?.parameters) {
        for (const [key, param] of Object.entries(
          transpileResult.signature.parameters
        )) {
          if ('default' in param) {
            args[key] = param.default
          }
        }
      }

      const result = await this.vm.run(transpileResult.ast, args, {
        trace: true,
        fuel: 10000,
        capabilities: {
          fetch: async (url: string, options?: any) => {
            const response = await fetch(url, options)
            return response.json()
          },
        },
      })

      this.lastResult = result
      this.parts.statusBar.textContent = `Done (${result.fuelUsed} fuel used)`
    } catch (e: any) {
      this.lastError = e.message || String(e)
      this.parts.statusBar.textContent = 'Error'
    }

    this.updateOutput()
    this.isRunning = false
  }

  render() {
    super.render()
  }
}

// Register component with Shadow DOM (uses static styleSpec)
console.log('Registering agent-playground component')
export const playground = Playground.elementCreator({
  tag: 'agent-playground',
})
