/**
 * TypeScript Playground - Interactive TypeScript to TJS to JS editor
 *
 * Demonstrates the full transpiler pipeline:
 * 1. TypeScript input (user edits)
 * 2. TJS intermediate output (read-only, with copy button)
 * 3. JavaScript final output (with __tjs metadata)
 * 4. Preview execution
 */

import { Component, ElementCreator, PartsMap, elements, vars } from 'tosijs'
import {
  tabSelector,
  TabSelector,
  icons,
  markdownViewer,
  MarkdownViewer,
} from 'tosijs-ui'
import { codeMirror, CodeMirror } from '../../editors/codemirror/component'
import { fromTS } from '../../src/lang/emitters/from-ts'
import { tjs } from '../../src/lang'
import { extractImports, resolveImports } from './imports'
import { generateDocsMarkdown } from './docs-utils'
import {
  buildIframeDoc,
  createIframeMessageHandler,
  renderConsoleMessages,
  renderTestResults,
  formatExecTime,
  sharedPlaygroundStyles,
} from './playground-shared'

const { div, button, span, pre, input } = elements

// Default TypeScript example
const DEFAULT_TS = `// TypeScript Example - Types become runtime validation
function greet(name: string): string {
  return \`Hello, \${name}!\`
}

function add(a: number, b: number): number {
  return a + b
}

// Try calling with wrong types - TJS catches it at runtime!
console.log(greet('World'))
console.log(add(2, 3))
`

const DEFAULT_HTML = ``

const DEFAULT_CSS = `body {
  margin: 1rem;
  font-family: system-ui, sans-serif;
}`

interface TSPlaygroundParts extends PartsMap {
  tsEditor: CodeMirror
  htmlEditor: CodeMirror
  cssEditor: CodeMirror
  inputTabs: TabSelector
  outputTabs: TabSelector
  tjsOutput: HTMLElement
  jsOutput: HTMLElement
  previewFrame: HTMLIFrameElement
  docsOutput: MarkdownViewer
  testsOutput: HTMLElement
  consoleHeader: HTMLElement
  console: HTMLElement
  runBtn: HTMLButtonElement
  revertBtn: HTMLButtonElement
  copyTjsBtn: HTMLButtonElement
  openTjsBtn: HTMLButtonElement
  statusBar: HTMLElement
  // Build flags
  testsToggle: HTMLInputElement
  debugToggle: HTMLInputElement
  safetyToggle: HTMLInputElement
}

export class TSPlayground extends Component<TSPlaygroundParts> {
  private lastTjsCode: string = ''
  private lastJsCode: string = ''
  private consoleMessages: string[] = []

  // Editor state persistence
  private currentExampleName: string | null = null
  private originalCode: string = DEFAULT_TS
  private editorCache: Map<string, string> = new Map()

  // Build flags state
  private buildFlags = {
    tests: true, // Run tests at transpile time
    debug: false, // Debug mode (call stack tracking)
    safe: true, // Safe mode (validates inputs)
  }

  content = () => [
    // Toolbar
    div(
      { class: 'ts-toolbar' },
      button(
        { part: 'runBtn', class: 'run-btn', onClick: this.run },
        icons.play({ size: 16 }),
        'Run'
      ),
      span({ class: 'toolbar-separator' }),
      // Build flags
      div(
        { class: 'build-flags' },
        elements.label(
          { class: 'flag-label', title: 'Run tests at transpile time' },
          input({
            part: 'testsToggle',
            type: 'checkbox',
            checked: true,
            onChange: this.toggleTests,
          }),
          'Tests'
        ),
        elements.label(
          { class: 'flag-label', title: 'Debug mode (call stack tracking)' },
          input({
            part: 'debugToggle',
            type: 'checkbox',
            onChange: this.toggleDebug,
          }),
          'Debug'
        ),
        elements.label(
          { class: 'flag-label', title: 'Safe mode (validates inputs)' },
          input({
            part: 'safetyToggle',
            type: 'checkbox',
            checked: true,
            onChange: this.toggleSafety,
          }),
          'Safe'
        )
      ),
      span({ class: 'toolbar-separator' }),
      button(
        {
          part: 'revertBtn',
          class: 'revert-btn',
          onClick: this.revertToOriginal,
          title: 'Revert to original example code',
        },
        icons.cornerUpLeft({ size: 16 }),
        'Revert'
      ),
      span({ class: 'elastic' }),
      span({ part: 'statusBar', class: 'status-bar' }, 'Ready')
    ),

    // Main area - split into input (left) and output (right)
    div(
      { class: 'ts-main' },

      // Input side - TS, HTML, CSS editors
      div(
        { class: 'ts-input' },
        tabSelector(
          { part: 'inputTabs' },
          div(
            { name: 'TS', class: 'editor-wrapper' },
            codeMirror({
              part: 'tsEditor',
              mode: 'typescript',
            })
          ),
          div(
            { name: 'HTML', class: 'editor-wrapper' },
            codeMirror({
              part: 'htmlEditor',
              mode: 'html',
            })
          ),
          div(
            { name: 'CSS', class: 'editor-wrapper' },
            codeMirror({
              part: 'cssEditor',
              mode: 'css',
            })
          )
        )
      ),

      // Output side - TJS, JS, Preview, Docs, Tests
      div(
        { class: 'ts-output' },
        tabSelector(
          { part: 'outputTabs' },
          div(
            { name: 'TJS' },
            div(
              { class: 'output-toolbar' },
              button(
                {
                  part: 'copyTjsBtn',
                  class: 'small-btn',
                  onClick: this.copyTjs,
                  title: 'Copy TJS to clipboard',
                },
                icons.copy({ size: 14 }),
                'Copy'
              ),
              button(
                {
                  part: 'openTjsBtn',
                  class: 'small-btn',
                  onClick: this.openInTjsPlayground,
                  title: 'Open in TJS Playground',
                },
                icons.externalLink({ size: 14 }),
                'Open in TJS'
              )
            ),
            pre(
              { part: 'tjsOutput', class: 'code-output' },
              '// TJS intermediate will appear here'
            )
          ),
          div(
            { name: 'JS' },
            pre(
              { part: 'jsOutput', class: 'code-output' },
              '// Final JavaScript will appear here'
            )
          ),
          div(
            { name: 'Preview' },
            div(
              { class: 'preview-container' },
              elements.iframe({
                part: 'previewFrame',
                class: 'preview-frame',
                sandbox: 'allow-scripts',
              })
            )
          ),
          markdownViewer({
            name: 'Docs',
            part: 'docsOutput',
            class: 'docs-output',
            value: '*Documentation will appear here*',
          }),
          div(
            { name: 'Tests' },
            div(
              { part: 'testsOutput', class: 'tests-output' },
              'Test results will appear here'
            )
          )
        )
      )
    ),

    // Console panel at bottom
    div(
      { class: 'ts-console' },
      div({ part: 'consoleHeader', class: 'console-header' }, 'Console'),
      pre({ part: 'console', class: 'console-output' })
    ),
  ]

  connectedCallback(): void {
    super.connectedCallback()

    // Set default content
    setTimeout(() => {
      this.parts.tsEditor.value = DEFAULT_TS
      this.parts.htmlEditor.value = DEFAULT_HTML
      this.parts.cssEditor.value = DEFAULT_CSS

      // Auto-transpile on load
      this.transpile()
    }, 0)

    // Listen for changes (debounced)
    let debounceTimer: ReturnType<typeof setTimeout>
    this.parts.tsEditor.addEventListener('change', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        this.transpile()
        this.updateRevertButton()
      }, 300)
    })
  }

  log = (message: string) => {
    this.consoleMessages.push(message)
    this.renderConsole()
  }

  clearConsole = () => {
    this.consoleMessages = []
    this.parts.console.innerHTML = ''
    this.parts.consoleHeader.textContent = 'Console'
  }

  private renderConsole() {
    renderConsoleMessages(
      this.consoleMessages,
      this.parts.console,
      (line, col) => this.goToSourceLine(line, col)
    )
  }

  // Navigate to a specific line in the source editor
  goToSourceLine(line: number, column: number = 1) {
    this.parts.inputTabs.value = 0 // Switch to TS tab (first tab)
    // Wait for tab switch and editor resize before scrolling
    setTimeout(() => {
      this.parts.tsEditor.goToLine(line, column)
    }, 50)
  }

  // Build flag toggle handlers
  toggleTests = () => {
    this.buildFlags.tests = this.parts.testsToggle.checked
    this.transpile()
  }

  toggleDebug = () => {
    this.buildFlags.debug = this.parts.debugToggle.checked
    this.transpile()
  }

  toggleSafety = () => {
    this.buildFlags.safe = this.parts.safetyToggle.checked
    this.transpile()
  }

  lastTranspileTime = 0
  lastTsToTjsTime = 0
  lastTjsToJsTime = 0

  transpile = () => {
    const tsSource = this.parts.tsEditor.value

    try {
      // Step 1: TS -> TJS (timed)
      const tsStart = performance.now()
      const tjsResult = fromTS(tsSource, { emitTJS: true })
      this.lastTsToTjsTime = performance.now() - tsStart

      this.lastTjsCode = tjsResult.code
      this.parts.tjsOutput.textContent = tjsResult.code

      // Show warnings if any
      if (tjsResult.warnings && tjsResult.warnings.length > 0) {
        this.parts.tjsOutput.textContent +=
          '\n\n// Warnings:\n// ' + tjsResult.warnings.join('\n// ')
      }

      // Step 2: TJS -> JS (timed)
      // Note: fromTS already emits -! for return types, so no workaround needed
      let tjsCodeForJs = tjsResult.code

      // Inject safety directive if unsafe mode is enabled
      if (!this.buildFlags.safe) {
        tjsCodeForJs = 'safety none\n' + tjsCodeForJs
      }

      try {
        const tjsStart = performance.now()
        // Build transpiler options from flags
        const options: { runTests: boolean | 'report'; debug?: boolean } = {
          runTests: this.buildFlags.tests ? 'report' : false,
          debug: this.buildFlags.debug,
        }
        const jsResult = tjs(tjsCodeForJs, options)
        this.lastTjsToJsTime = performance.now() - tjsStart
        this.lastTranspileTime = this.lastTsToTjsTime + this.lastTjsToJsTime

        this.lastJsCode = jsResult.code
        this.parts.jsOutput.textContent = jsResult.code

        // Update test results
        this.updateTestResults(jsResult.testResults || [])

        // Update docs
        this.updateDocs(jsResult)

        // Show timing: TS->TJS + TJS->JS = total
        this.parts.statusBar.textContent = `TS→TJS ${formatExecTime(
          this.lastTsToTjsTime
        )} + TJS→JS ${formatExecTime(this.lastTjsToJsTime)} = ${formatExecTime(
          this.lastTranspileTime
        )}`
        this.parts.statusBar.classList.remove('error')
      } catch (jsError: any) {
        this.parts.jsOutput.textContent = `// TJS -> JS Error:\n// ${jsError.message}`
        this.parts.statusBar.textContent = `TJS->JS error: ${jsError.message}`
        this.parts.statusBar.classList.add('error')
        this.lastJsCode = ''
      }
    } catch (tsError: any) {
      // TS -> TJS failed
      const errorInfo = this.formatError(tsError, tsSource)
      this.parts.tjsOutput.textContent = errorInfo
      this.parts.jsOutput.textContent =
        '// Cannot generate JS - TS transpilation failed'
      this.parts.statusBar.textContent = `TS error: ${tsError.message}`
      this.parts.statusBar.classList.add('error')
      this.lastTjsCode = ''
      this.lastJsCode = ''

      // Set error marker in gutter
      if (tsError.line) {
        this.parts.tsEditor.setMarkers([
          {
            line: tsError.line,
            message: tsError.message || 'Transpilation error',
          },
        ])
      } else {
        this.parts.tsEditor.clearMarkers()
      }
    }
  }

  private formatError(e: any, source: string): string {
    const lines = ['// Transpilation Error', '// ' + '='.repeat(50), '']
    lines.push(`// ${e.message}`)
    if (e.line) {
      lines.push(`// at line ${e.line}, column ${e.column || 0}`)
    }
    return lines.join('\n')
  }

  private updateTestResults(tests: any[]) {
    renderTestResults(
      tests,
      this.parts.testsOutput,
      this.parts.tsEditor,
      (line) => this.goToSourceLine(line)
    )
  }

  private updateDocs(result: any) {
    const source = this.parts.tsEditor.value
    const types = result?.types || result?.metadata
    this.parts.docsOutput.value = generateDocsMarkdown(source, types)
    this.parts.docsOutput.render?.()
  }

  copyTjs = () => {
    if (this.lastTjsCode) {
      navigator.clipboard.writeText(this.lastTjsCode)
      this.parts.statusBar.textContent = 'TJS copied to clipboard'
    }
  }

  openInTjsPlayground = () => {
    if (this.lastTjsCode) {
      // Store the TJS code and navigate to TJS playground
      // For now, we'll use a custom event that the parent can handle
      this.dispatchEvent(
        new CustomEvent('open-tjs', {
          detail: { code: this.lastTjsCode },
          bubbles: true,
        })
      )
    }
  }

  run = async () => {
    this.clearConsole()
    this.transpile()

    if (!this.lastJsCode) {
      this.log('Cannot run - transpilation failed')
      return
    }

    // Show JS output immediately after successful transpilation
    this.parts.outputTabs.value = 1 // JS is second tab (index 1)

    this.parts.statusBar.textContent = 'Running...'

    try {
      const htmlContent = this.parts.htmlEditor.value
      const cssContent = this.parts.cssEditor.value
      const jsCode = this.lastJsCode

      // Resolve imports
      const imports = extractImports(jsCode)
      let importMapScript = ''

      if (imports.length > 0) {
        this.log(`Resolving imports: ${imports.join(', ')}`)
        const { importMap, errors } = await resolveImports(jsCode)

        if (errors.length > 0) {
          for (const err of errors) {
            this.log(`Import error: ${err}`)
          }
        }

        if (Object.keys(importMap.imports).length > 0) {
          importMapScript = `<script type="importmap">${JSON.stringify(
            importMap
          )}</script>`
        }
      }

      // Create iframe document
      const iframeDoc = buildIframeDoc({
        cssContent,
        htmlContent,
        importMapScript,
        jsCode,
      })

      // Listen for messages from iframe
      const messageHandler = createIframeMessageHandler({
        onConsole: (message) => this.log(message),
        onTiming: (execTime) => {
          this.parts.consoleHeader.textContent = `Console — executed in ${formatExecTime(
            execTime
          )}`
        },
        onPreviewContent: () => {
          this.parts.outputTabs.value = 2 // Preview is third tab (index 2)
        },
        onError: (message) => {
          this.log(`Error: ${message}`)
          this.parts.statusBar.textContent = 'Runtime error'
          this.parts.statusBar.classList.add('error')
        },
      })
      window.addEventListener('message', messageHandler)

      // Set iframe content
      this.parts.previewFrame.srcdoc = iframeDoc

      // Wait a bit for execution, then clean up listener
      setTimeout(() => {
        window.removeEventListener('message', messageHandler)
      }, 1000)
    } catch (e: any) {
      this.log(`Error: ${e.message}`)
      this.parts.statusBar.textContent = 'Error'
      this.parts.statusBar.classList.add('error')
    }
  }

  // Public method to set source code (auto-runs when examples are loaded)
  setSource(code: string, exampleName?: string) {
    // Save current edits before switching
    if (this.currentExampleName) {
      this.editorCache.set(this.currentExampleName, this.parts.tsEditor.value)
    }

    // Update current example tracking
    this.currentExampleName = exampleName || null
    this.originalCode = code

    // Check if we have cached edits for this example
    const cachedCode = exampleName ? this.editorCache.get(exampleName) : null
    this.parts.tsEditor.value = cachedCode || code

    // Update revert button visibility
    this.updateRevertButton()

    this.transpile()
    // Auto-run when source is loaded externally (e.g., from example selection)
    this.run()
  }

  // Revert to the original example code
  revertToOriginal = () => {
    if (this.currentExampleName) {
      this.editorCache.delete(this.currentExampleName)
    }
    this.parts.tsEditor.value = this.originalCode
    this.updateRevertButton()
    this.transpile()
  }

  // Update revert button state based on whether code has changed
  private updateRevertButton() {
    const hasChanges = this.parts.tsEditor.value !== this.originalCode
    this.parts.revertBtn.disabled = !hasChanges
    this.parts.revertBtn.style.opacity = hasChanges ? '1' : '0.5'
  }
}

export const tsPlayground = TSPlayground.elementCreator({
  tag: 'ts-playground',
  styleSpec: {
    ...sharedPlaygroundStyles,

    // TS-specific: toolbar
    ':host .ts-toolbar': {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      background: 'var(--code-background, #f3f4f6)',
      borderBottom: '1px solid var(--code-border, #e5e7eb)',
    },

    // TS-specific: TypeScript blue brand color for checkboxes
    ':host .flag-label input[type="checkbox"]': {
      margin: '0',
      cursor: 'pointer',
      accentColor: 'var(--brand-color, #3178c6)',
    },

    // TS-specific: layout
    ':host .ts-main': {
      display: 'flex',
      flex: '1 1 auto',
      minHeight: '0',
      gap: '1px',
      background: 'var(--code-border, #e5e7eb)',
    },

    ':host .ts-input, :host .ts-output': {
      flex: '1 1 50%',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background, #fff)',
      overflow: 'hidden',
    },

    ':host .ts-input tosi-tabs, :host .ts-output tosi-tabs': {
      flex: '1 1 auto',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '0',
      height: '100%',
    },

    // TS-specific: TJS output toolbar and buttons
    ':host .output-toolbar': {
      display: 'flex',
      gap: '8px',
      padding: '8px 12px',
      background: 'var(--code-background, #f3f4f6)',
      borderBottom: '1px solid var(--code-border, #e5e7eb)',
    },

    ':host .small-btn': {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      background: 'var(--background, #fff)',
      color: 'var(--text-color, #374151)',
      border: '1px solid var(--code-border, #d1d5db)',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
    },

    ':host .small-btn:hover': {
      background: 'var(--code-background, #f3f4f6)',
    },

    ':host .code-output': {
      margin: '0',
      padding: '12px',
      background: 'var(--code-background, #f3f4f6)',
      color: 'var(--text-color, #1f2937)',
      fontSize: '13px',
      fontFamily: 'ui-monospace, monospace',
      overflow: 'auto',
      height: '100%',
      whiteSpace: 'pre-wrap',
    },

    ':host .preview-container': {
      height: '100%',
      background: 'var(--background, #fff)',
    },

    // TS-specific: console container class name
    ':host .ts-console': {
      height: '120px',
      borderTop: '1px solid var(--code-border, #e5e7eb)',
      display: 'flex',
      flexDirection: 'column',
    },
  },
}) as ElementCreator<TSPlayground>
