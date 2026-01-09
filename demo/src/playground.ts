/*
 * playground.ts - Interactive AsyncJS playground component
 */

import { elements, Component, PartsMap } from 'tosijs'

import { icons } from 'tosijs-ui'

import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { ajsEditorExtension } from '../../editors/codemirror/ajs-language'

import { examples, type Example } from './examples'
import {
  AgentVM,
  transpile,
  type TranspileResult,
  coreAtoms,
  batteryAtoms,
} from '../../src'
import { getStoreCapabilityDefault } from '../../src/batteries'
import {
  buildLLMCapability,
  buildLLMBattery,
  getSettings,
  type LLMProvider,
} from './capabilities'

// Default LM Studio URL
const DEFAULT_LM_STUDIO_URL = 'http://localhost:1234/v1'

// Initialize default LM Studio URL on HTTP if not already set
function initLLMDefaults() {
  const existingUrl = localStorage.getItem('customLlmUrl')
  const hasExistingUrl = existingUrl && existingUrl.trim() !== ''

  // On HTTP, default to LM Studio URL if nothing is configured
  if (!hasExistingUrl && window.location.protocol === 'http:') {
    localStorage.setItem('customLlmUrl', DEFAULT_LM_STUDIO_URL)
    console.log('🤖 Defaulting to LM Studio endpoint:', DEFAULT_LM_STUDIO_URL)
  }
}

// Set defaults on module load
initLLMDefaults()

const { div, button, span, select, option, optgroup, input } = elements

// localStorage key for custom examples
const STORAGE_KEY = 'agent-playground-examples'

// Default code for new examples
const NEW_EXAMPLE_CODE = `// Write your AsyncJS code here
function myFunction({ name = 'World' }) {
  let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
  return { message }
}`

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
  copyBtn: HTMLButtonElement
  runBtn: HTMLButtonElement
  newBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  deleteBtn: HTMLButtonElement
  exampleSelect: HTMLSelectElement
}

export class Playground extends Component<PlaygroundParts> {
  private editor: EditorView | null = null
  private vm = new AgentVM({ ...coreAtoms, ...batteryAtoms })
  private currentTab = 'result'
  private lastResult: any = null
  private lastAst: TranspileResult | null = null
  private lastError: string | null = null
  private isRunning = false
  private customExamples: Example[] = loadCustomExamples()
  private currentExampleIndex: number = -1 // -1 = new/unsaved

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
      alignItems: 'center',
    },

    '.playground-tabs .elastic': {
      flex: '1 1 auto',
    },

    '.copy-btn': {
      padding: '4px 8px',
      marginRight: '4px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      opacity: 0.6,
      transition: 'opacity 0.15s',
    },

    '.copy-btn:hover': {
      opacity: 1,
    },

    '.copy-btn.copied': {
      color: '#16a34a',
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

    '.loading-spinner': {
      display: 'inline-block',
      width: '14px',
      height: '14px',
      border: '2px solid #e5e7eb',
      borderTopColor: '#3d4a6b',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      verticalAlign: 'middle',
      marginRight: '8px',
    },

    '@keyframes spin': {
      to: { transform: 'rotate(360deg)' },
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
            part: 'newBtn',
            class: 'iconic',
            title: 'New',
          },
          icons.plus()
        ),

        button(
          {
            part: 'saveBtn',
            class: 'iconic',
            title: 'Save Example',
          },
          icons.save()
        ),

        button(
          {
            part: 'deleteBtn',
            class: 'iconic',
            title: 'Delete Custom Example',
            style: { display: 'none' },
          },
          icons.trash()
        ),

        span({ style: { flex: '1' } }),

        select(
          {
            part: 'exampleSelect',
            style: { padding: '4px 8px', borderRadius: '4px' },
          },
          option({ value: 'new' }, '-- New --')
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
            button({ part: 'tabTrace', class: 'playground-tab' }, 'Trace'),
            span({ class: 'elastic' }),
            button(
              {
                part: 'copyBtn',
                class: 'copy-btn',
                title: 'Copy to clipboard',
              },
              icons.copy({ size: 16 })
            )
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
    this.parts.newBtn.addEventListener('click', this.newExample)
    this.parts.saveBtn.addEventListener('click', this.saveExample)
    this.parts.deleteBtn.addEventListener('click', this.deleteExample)
    this.parts.exampleSelect.addEventListener('change', this.loadExample)
    this.parts.tabResult.addEventListener('click', () =>
      this.switchTab('result')
    )
    this.parts.tabAst.addEventListener('click', () => this.switchTab('ast'))
    this.parts.tabTrace.addEventListener('click', () => this.switchTab('trace'))
    this.parts.copyBtn.addEventListener('click', this.copyOutput)

    // Listen for hash changes
    window.addEventListener('hashchange', this.handleHashChange)

    // Populate the example select BEFORE initEditor (so select value can be set)
    this.rebuildExampleSelect()

    // Initialize CodeMirror after hydration
    this.initEditor()
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.handleHashChange)
  }

  // Get all examples (built-in + custom)
  getAllExamples(): Example[] {
    return [...examples, ...this.customExamples]
  }

  // Rebuild the example select dropdown
  rebuildExampleSelect() {
    const sel = this.parts.exampleSelect
    sel.innerHTML = ''

    // New option
    sel.appendChild(option({ value: 'new' }, '-- New --'))

    // Built-in examples
    const builtInGroup = optgroup({ label: 'Built-in Examples' })
    examples.forEach((ex, i) => {
      builtInGroup.appendChild(
        option(
          { value: `builtin:${i}` },
          ex.requiresApi ? `${ex.name} 🔑` : ex.name
        )
      )
    })
    sel.appendChild(builtInGroup)

    // Custom examples (if any)
    if (this.customExamples.length > 0) {
      const customGroup = optgroup({ label: 'My Examples' })
      this.customExamples.forEach((ex, i) => {
        customGroup.appendChild(option({ value: `custom:${i}` }, ex.name))
      })
      sel.appendChild(customGroup)
    }
  }

  // Get example index from hash (e.g., #example=2 or #example=Hello%20World)
  getExampleFromHash(): { type: 'new' | 'builtin' | 'custom'; index: number } {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const value = params.get('example')
    if (value === null || value === 'new') return { type: 'new', index: -1 }

    // Try matching by name in built-in examples
    const decodedName = decodeURIComponent(value).toLowerCase()
    const builtinIdx = examples.findIndex(
      (ex) => ex.name.toLowerCase() === decodedName
    )
    if (builtinIdx >= 0) return { type: 'builtin', index: builtinIdx }

    // Try matching in custom examples
    const customIdx = this.customExamples.findIndex(
      (ex) => ex.name.toLowerCase() === decodedName
    )
    if (customIdx >= 0) return { type: 'custom', index: customIdx }

    return { type: 'builtin', index: 0 }
  }

  // Update hash when example changes
  setHashForExample(type: 'new' | 'builtin' | 'custom', idx: number) {
    if (type === 'new') {
      history.replaceState(null, '', '#example=new')
      return
    }
    const allExamples = type === 'builtin' ? examples : this.customExamples
    const example = allExamples[idx]
    if (example) {
      const hash = `example=${encodeURIComponent(example.name)}`
      history.replaceState(null, '', `#${hash}`)
    }
  }

  handleHashChange = () => {
    const { type, index } = this.getExampleFromHash()
    this.loadExampleByTypeAndIndex(type, index)
  }

  initEditor() {
    const container = this.parts.editorContainer
    if (!container) return

    const extensions = [
      basicSetup,
      syntaxHighlighting(defaultHighlightStyle),
      ajsEditorExtension(),
    ]

    // Get initial example from hash or default to first built-in
    const { type, index } = this.getExampleFromHash()
    let startDoc = NEW_EXAMPLE_CODE
    if (type === 'builtin' && index >= 0) {
      startDoc = examples[index]?.code || startDoc
    } else if (type === 'custom' && index >= 0) {
      startDoc = this.customExamples[index]?.code || startDoc
    }

    this.editor = new EditorView({
      state: EditorState.create({
        doc: startDoc,
        extensions,
      }),
      parent: container,
    })

    // Update current example tracking
    this.currentExampleIndex = index
    this.updateDeleteButtonVisibility(type, index)

    // Update select to match the loaded example
    if (type === 'new') {
      this.parts.exampleSelect.value = 'new'
    } else if (type === 'builtin') {
      this.parts.exampleSelect.value = `builtin:${index}`
    } else if (type === 'custom') {
      this.parts.exampleSelect.value = `custom:${index}`
    }

    // Set hash if not already set
    if (!window.location.hash.includes('example=')) {
      this.setHashForExample(type, index)
    }
  }

  loadExampleByTypeAndIndex(type: 'new' | 'builtin' | 'custom', idx: number) {
    if (!this.editor) return

    let code = NEW_EXAMPLE_CODE
    if (type === 'builtin' && idx >= 0 && idx < examples.length) {
      code = examples[idx].code
    } else if (
      type === 'custom' &&
      idx >= 0 &&
      idx < this.customExamples.length
    ) {
      code = this.customExamples[idx].code
    }

    this.editor.dispatch({
      changes: {
        from: 0,
        to: this.editor.state.doc.length,
        insert: code,
      },
    })

    this.currentExampleIndex = idx
    this.updateDeleteButtonVisibility(type, idx)
    this.setHashForExample(type, idx)

    // Update select to match the loaded example
    if (type === 'new') {
      this.parts.exampleSelect.value = 'new'
    } else if (type === 'builtin') {
      this.parts.exampleSelect.value = `builtin:${idx}`
    } else if (type === 'custom') {
      this.parts.exampleSelect.value = `custom:${idx}`
    }

    // Clear results
    this.parts.resultContainer.textContent = '// Run code to see results'
    this.parts.statusBar.textContent = 'Ready'
  }

  updateDeleteButtonVisibility(
    type: 'new' | 'builtin' | 'custom',
    idx: number
  ) {
    // Only show delete button for custom examples
    const showDelete = type === 'custom' && idx >= 0
    this.parts.deleteBtn.style.display = showDelete ? '' : 'none'
  }

  loadExample = (e: Event) => {
    const value = (e.target as HTMLSelectElement).value
    if (value === 'new') {
      this.loadExampleByTypeAndIndex('new', -1)
      return
    }

    const [type, idxStr] = value.split(':')
    const idx = parseInt(idxStr, 10)
    if (type === 'builtin' || type === 'custom') {
      this.loadExampleByTypeAndIndex(type, idx)
    }
  }

  newExample = () => {
    if (this.editor) {
      this.editor.dispatch({
        changes: {
          from: 0,
          to: this.editor.state.doc.length,
          insert: NEW_EXAMPLE_CODE,
        },
      })
    }
    this.currentExampleIndex = -1
    this.parts.exampleSelect.value = 'new'
    this.updateDeleteButtonVisibility('new', -1)
    this.setHashForExample('new', -1)
    this.parts.resultContainer.textContent = '// Run code to see results'
    this.parts.statusBar.textContent = 'Ready'
  }

  saveExample = () => {
    if (!this.editor) return

    const code = this.editor.state.doc.toString()
    if (!code.trim()) {
      alert('Cannot save empty example')
      return
    }

    // Try to extract function name from code
    const funcMatch = code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/)
    const defaultName = funcMatch ? funcMatch[1] : 'My Example'

    const name = prompt('Enter a name for this example:', defaultName)
    if (!name) return

    // Check for duplicate names
    const existingIdx = this.customExamples.findIndex(
      (ex) => ex.name.toLowerCase() === name.toLowerCase()
    )

    if (existingIdx >= 0) {
      if (
        !confirm(`An example named "${name}" already exists. Overwrite it?`)
      ) {
        return
      }
      this.customExamples[existingIdx] = { name, description: '', code }
    } else {
      this.customExamples.push({ name, description: '', code })
    }

    saveCustomExamples(this.customExamples)
    this.rebuildExampleSelect()

    // Select the saved example
    const newIdx =
      existingIdx >= 0 ? existingIdx : this.customExamples.length - 1
    this.currentExampleIndex = newIdx
    this.parts.exampleSelect.value = `custom:${newIdx}`
    this.updateDeleteButtonVisibility('custom', newIdx)
    this.setHashForExample('custom', newIdx)

    this.parts.statusBar.textContent = `Saved "${name}"`
  }

  deleteExample = () => {
    const value = this.parts.exampleSelect.value
    if (!value.startsWith('custom:')) return

    const idx = parseInt(value.split(':')[1], 10)
    if (idx < 0 || idx >= this.customExamples.length) return

    const name = this.customExamples[idx].name
    if (!confirm(`Delete "${name}"?`)) return

    this.customExamples.splice(idx, 1)
    saveCustomExamples(this.customExamples)
    this.rebuildExampleSelect()

    // Go to new
    this.newExample()
    this.parts.statusBar.textContent = `Deleted "${name}"`
  }

  copyOutput = async () => {
    const text = this.parts.resultContainer.textContent || ''
    try {
      await navigator.clipboard.writeText(text)
      this.parts.copyBtn.classList.add('copied')
      setTimeout(() => {
        this.parts.copyBtn.classList.remove('copied')
      }, 1500)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
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
    const startTime = performance.now()

    // Show loading state
    this.parts.resultContainer.className = 'playground-result'
    this.parts.resultContainer.innerHTML =
      '<span class="loading-spinner"></span> Running...'
    this.parts.statusBar.textContent = 'Transpiling...'

    // Update elapsed time while running
    const updateTimer = setInterval(() => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      this.parts.statusBar.textContent = `Running... ${elapsed}s`
    }, 100)

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

      // Build capabilities from settings
      const settings = getSettings()
      const llmCapability = buildLLMCapability(settings)
      const llmBattery = buildLLMBattery(settings)

      const noLLMError = () => {
        const isHttps = window.location.protocol === 'https:'
        if (isHttps) {
          throw new Error(
            'No LLM configured. Go to Settings (⋮) > API Keys to add an OpenAI or Anthropic API key. Note: Local LLM endpoints require HTTP.'
          )
        } else {
          throw new Error(
            'No LLM configured. Go to Settings (⋮) > API Keys to add an OpenAI key, Anthropic key, or LM Studio endpoint (default: http://localhost:1234/v1).'
          )
        }
      }

      const result = await this.vm.run(transpileResult.ast, args, {
        trace: true,
        fuel: 10000,
        capabilities: {
          fetch: async (url: string, options?: any) => {
            const response = await fetch(url, options)

            // Handle dataUrl response type for vision/image fetching
            if (options?.responseType === 'dataUrl') {
              const buffer = await response.arrayBuffer()
              const bytes = new Uint8Array(buffer)
              let binary = ''
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i])
              }
              const base64 = btoa(binary)
              const ct =
                response.headers.get('content-type') ||
                'application/octet-stream'
              return `data:${ct};base64,${base64}`
            }

            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
              return response.json()
            }
            return response.text()
          },
          store: getStoreCapabilityDefault(),
          llm: {
            predict: async (prompt: string, options?: any) => {
              if (!llmCapability) noLLMError()
              return llmCapability!.predict(prompt, options)
            },
          },
          llmBattery: llmBattery || {
            predict: () => noLLMError(),
            embed: () => noLLMError(),
          },
        },
      })

      this.lastResult = result
      clearInterval(updateTimer)
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
      this.parts.statusBar.textContent = `Done in ${elapsed}s (${result.fuelUsed.toFixed(
        1
      )} fuel)`
    } catch (e: any) {
      clearInterval(updateTimer)
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2)
      this.lastError = e.message || String(e)
      this.parts.statusBar.textContent = `Error after ${elapsed}s`
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
