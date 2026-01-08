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
import { AgentVM, transpile, type TranspileResult } from '../../src'
import { getStoreCapabilityDefault } from '../../src/batteries'

// Build LLM capability from settings (simple predict interface)
function buildLLMCapability(settings: {
  openaiKey: string
  anthropicKey: string
  customLlmUrl: string
}) {
  const { openaiKey, anthropicKey, customLlmUrl } = settings

  // Determine which provider to use
  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''

  if (!hasCustomUrl && !hasOpenAI && !hasAnthropic) {
    return null
  }

  return {
    async predict(prompt: string, options?: any): Promise<string> {
      // Prefer custom URL (LM Studio), then OpenAI, then Anthropic
      if (hasCustomUrl) {
        try {
          const response = await fetch(`${customLlmUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: options?.model || 'local-model',
              messages: [{ role: 'user', content: prompt }],
              temperature: options?.temperature ?? 0.7,
            }),
          })
          if (!response.ok) {
            throw new Error(
              `LLM Error: ${response.status} - Check that LM Studio is running at ${customLlmUrl}`
            )
          }
          const data = await response.json()
          return data.choices?.[0]?.message?.content ?? ''
        } catch (e: any) {
          if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
            throw new Error(
              `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled (Server settings → Enable CORS).`
            )
          }
          throw e
        }
      }

      if (hasOpenAI) {
        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: options?.model || 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              temperature: options?.temperature ?? 0.7,
            }),
          }
        )
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `OpenAI Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
          )
        }
        const data = await response.json()
        return data.choices?.[0]?.message?.content ?? ''
      }

      if (hasAnthropic) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: options?.model || 'claude-3-haiku-20240307',
            max_tokens: options?.maxTokens || 1024,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `Anthropic Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
          )
        }
        const data = await response.json()
        return data.content?.[0]?.text ?? ''
      }

      throw new Error('No LLM provider configured')
    },
  }
}

// Build LLM Battery capability (supports system/user, tools, responseFormat)
function buildLLMBattery(settings: {
  openaiKey: string
  anthropicKey: string
  customLlmUrl: string
}) {
  const { openaiKey, anthropicKey, customLlmUrl } = settings

  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''

  if (!hasCustomUrl && !hasOpenAI && !hasAnthropic) {
    return null
  }

  return {
    async predict(
      system: string,
      user: string,
      tools?: any[],
      responseFormat?: any
    ): Promise<{ content?: string; tool_calls?: any[] }> {
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]

      if (hasCustomUrl) {
        try {
          const response = await fetch(`${customLlmUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'local-model',
              messages,
              temperature: 0.7,
              tools,
              response_format: responseFormat,
            }),
          })
          if (!response.ok) {
            throw new Error(
              `LLM Error: ${response.status} - Check that LM Studio is running`
            )
          }
          const data = await response.json()
          return data.choices?.[0]?.message ?? { content: '' }
        } catch (e: any) {
          if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
            throw new Error(
              `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled.`
            )
          }
          throw e
        }
      }

      if (hasOpenAI) {
        const body: any = {
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
        }
        if (tools?.length) body.tools = tools
        if (responseFormat) body.response_format = responseFormat

        const response = await fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify(body),
          }
        )
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `OpenAI Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
          )
        }
        const data = await response.json()
        return data.choices?.[0]?.message ?? { content: '' }
      }

      if (hasAnthropic) {
        // Anthropic has different tool format, simplified here
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        })
        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(
            `Anthropic Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
          )
        }
        const data = await response.json()
        return { content: data.content?.[0]?.text ?? '' }
      }

      throw new Error('No LLM provider configured')
    },

    async embed(text: string): Promise<number[]> {
      // Embedding support for custom URL only (LM Studio)
      if (hasCustomUrl) {
        try {
          const response = await fetch(`${customLlmUrl}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'text-embedding-model',
              input: text,
            }),
          })
          if (!response.ok) {
            throw new Error(`Embedding Error: ${response.status}`)
          }
          const data = await response.json()
          return data.data?.[0]?.embedding ?? []
        } catch {
          throw new Error('Embedding not available')
        }
      }
      throw new Error('Embedding requires LM Studio endpoint')
    },
  }
}

// Get settings from localStorage
function getSettings() {
  return {
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
    customLlmUrl: localStorage.getItem('customLlmUrl') || '',
  }
}

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
            button({ part: 'tabTrace', class: 'playground-tab' }, 'Trace'),
            span({ class: 'elastic' }),
            button(
              { part: 'copyBtn', class: 'copy-btn', title: 'Copy to clipboard' },
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
    this.parts.clearBtn.addEventListener('click', this.clearEditor)
    this.parts.exampleSelect.addEventListener('change', this.loadExample)
    this.parts.tabResult.addEventListener('click', () =>
      this.switchTab('result')
    )
    this.parts.tabAst.addEventListener('click', () => this.switchTab('ast'))
    this.parts.tabTrace.addEventListener('click', () => this.switchTab('trace'))
    this.parts.copyBtn.addEventListener('click', this.copyOutput)

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

    const extensions = [
      basicSetup,
      syntaxHighlighting(defaultHighlightStyle),
      ajsEditorExtension(),
    ]

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
    this.parts.resultContainer.innerHTML = '<span class="loading-spinner"></span> Running...'
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
      this.parts.statusBar.textContent = `Done in ${elapsed}s (${result.fuelUsed.toFixed(1)} fuel)`
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
