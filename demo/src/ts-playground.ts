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

const DEFAULT_HTML = `<div class="preview-content">
  <h2>Preview</h2>
  <div id="output"></div>
</div>`

const DEFAULT_CSS = `.preview-content {
  padding: 1rem;
  font-family: system-ui, sans-serif;
}

h2 {
  color: #3d4a6b;
  margin-top: 0;
}

#output {
  padding: 0.5rem;
  background: #f5f5f5;
  border-radius: 4px;
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
    // Parse messages for line references and make them clickable
    // Patterns: "at line X", "line X:", "Line X", ":X:" (line:col)
    const linePattern =
      /(?:at line |line |Line )(\d+)(?:[:,]?\s*(?:column |col )?(\d+))?|:(\d+):(\d+)/g

    const html = this.consoleMessages
      .map((msg) => {
        // Escape HTML
        const escaped = msg
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')

        // Replace line references with clickable spans
        return escaped.replace(linePattern, (match, l1, c1, l2, c2) => {
          const line = l1 || l2
          const col = c1 || c2 || '1'
          return `<span class="clickable-line" data-line="${line}" data-col="${col}">${match}</span>`
        })
      })
      .join('\n')

    this.parts.console.innerHTML = html
    this.parts.console.scrollTop = this.parts.console.scrollHeight

    // Add click handlers
    this.parts.console.querySelectorAll('.clickable-line').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement
        const line = parseInt(target.dataset.line || '0', 10)
        const col = parseInt(target.dataset.col || '1', 10)
        if (line > 0) {
          this.goToSourceLine(line, col)
        }
      })
    })
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

      // Step 2: TJS -> JS (skip signature tests with -!) (timed)
      // Replace -> with -! to avoid signature test failures during transpilation
      let tjsCodeForJs = tjsResult.code.replace(/-> /g, '-! ')

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
        const formatTime = (t: number) =>
          t < 1 ? `${(t * 1000).toFixed(0)}μs` : `${t.toFixed(2)}ms`
        this.parts.statusBar.textContent = `TS→TJS ${formatTime(
          this.lastTsToTjsTime
        )} + TJS→JS ${formatTime(this.lastTjsToJsTime)} = ${formatTime(
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
    if (!tests || tests.length === 0) {
      this.parts.testsOutput.textContent = 'No tests defined'
      this.parts.tsEditor.clearMarkers()
      return
    }

    const passed = tests.filter((t) => t.passed).length
    const failed = tests.filter((t) => !t.passed).length

    // Set gutter markers for failed tests
    const failedTests = tests.filter((t: any) => !t.passed && t.line)
    if (failedTests.length > 0) {
      this.parts.tsEditor.setMarkers(
        failedTests.map((t: any) => ({
          line: t.line,
          message: t.error || t.description,
          severity: 'error' as const,
        }))
      )
    } else {
      this.parts.tsEditor.clearMarkers()
    }

    let html = `<div class="test-summary">`
    html += `<strong>${passed} passed</strong>`
    if (failed > 0) {
      html += `, <strong class="test-failed">${failed} failed</strong>`
    }
    html += `</div><ul class="test-list">`

    for (const test of tests) {
      const icon = test.passed ? '✓' : '✗'
      const cls = test.passed ? 'test-pass' : 'test-fail'
      const sigBadge = test.isSignatureTest
        ? ' <span class="sig-badge">signature</span>'
        : ''
      const dataLine = test.line ? ` data-line="${test.line}"` : ''
      html += `<li class="${cls}"${dataLine}>${icon} ${test.description}${sigBadge}`
      if (!test.passed && test.error) {
        html += `<div class="test-error${
          test.line ? ' clickable-error' : ''
        }"${dataLine}>${test.error}</div>`
      }
      html += `</li>`
    }
    html += `</ul>`

    this.parts.testsOutput.innerHTML = html

    // Add click handlers for clickable errors
    this.parts.testsOutput
      .querySelectorAll('.clickable-error')
      .forEach((el) => {
        el.addEventListener('click', (e) => {
          const line = parseInt(
            (e.currentTarget as HTMLElement).dataset.line || '0',
            10
          )
          if (line > 0) {
            this.goToSourceLine(line)
          }
        })
      })
  }

  private updateDocs(result: any) {
    if (!result?.types) {
      this.parts.docsOutput.value = '*No documentation available*'
      return
    }

    let docs = '# Generated Documentation\n\n'

    for (const [name, info] of Object.entries(result.types) as any) {
      docs += `## ${name}\n\n`

      if (info.params) {
        docs += '**Parameters:**\n'
        for (const [paramName, paramInfo] of Object.entries(
          info.params
        ) as any) {
          const required = paramInfo.required ? '' : ' *(optional)*'
          const typeStr = paramInfo.type?.kind || 'any'
          docs += `- \`${paramName}\`: ${typeStr}${required}\n`
        }
        docs += '\n'
      }

      if (info.returns) {
        docs += `**Returns:** ${info.returns.kind || 'void'}\n\n`
      }

      docs += '---\n\n'
    }

    this.parts.docsOutput.value = docs
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
      const iframeDoc = `<!DOCTYPE html>
<html>
<head>
  <style>${cssContent}</style>
  ${importMapScript}
</head>
<body>
  ${htmlContent}
  <script type="module">
    // TJS Runtime stub for iframe execution
    globalThis.__tjs = {
      version: '0.0.0',
      pushStack: () => {},
      popStack: () => {},
      getStack: () => [],
      typeError: (path, expected, value) => {
        const actual = value === null ? 'null' : typeof value;
        const err = new Error(\`Expected \${expected} for '\${path}', got \${actual}\`);
        err.name = 'MonadicError';
        err.path = path;
        err.expected = expected;
        err.actual = actual;
        return err;
      },
      createRuntime: function() { return this; },
      Is: (a, b) => {
        if (a === b) return true;
        if (a === null || b === null) return a === b;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object') return false;
        if (Array.isArray(a) && Array.isArray(b)) {
          if (a.length !== b.length) return false;
          return a.every((v, i) => globalThis.__tjs.Is(v, b[i]));
        }
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        return keysA.every(k => globalThis.__tjs.Is(a[k], b[k]));
      },
      IsNot: (a, b) => !globalThis.__tjs.Is(a, b),
    };

    // Capture console.log
    const _log = console.log;
    console.log = (...args) => {
      _log(...args);
      parent.postMessage({ type: 'console', message: args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ') }, '*');
    };

    try {
      const __execStart = performance.now();
      ${jsCode}
      const __execTime = performance.now() - __execStart;
      parent.postMessage({ type: 'timing', execTime: __execTime }, '*');
    } catch (e) {
      parent.postMessage({ type: 'error', message: e.message }, '*');
    }
  </script>
</body>
</html>`

      // Listen for messages from iframe
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'console') {
          this.log(event.data.message)
        } else if (event.data?.type === 'timing') {
          // Update console header with execution time
          const execTime = event.data.execTime
          const execStr =
            execTime < 1
              ? `${(execTime * 1000).toFixed(0)}μs`
              : `${execTime.toFixed(2)}ms`
          this.parts.consoleHeader.textContent = `Console — executed in ${execStr}`
        } else if (event.data?.type === 'error') {
          this.log(`Error: ${event.data.message}`)
          this.parts.statusBar.textContent = 'Runtime error'
          this.parts.statusBar.classList.add('error')
        }
      }
      window.addEventListener('message', messageHandler)

      // Set iframe content
      this.parts.previewFrame.srcdoc = iframeDoc

      // Wait a bit for execution, then clean up listener
      setTimeout(() => {
        window.removeEventListener('message', messageHandler)
        // Don't overwrite status bar - keep showing transpile time
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
    ':host': {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flex: '1 1 auto',
      background: 'var(--background, #fff)',
      color: 'var(--text-color, #1f2937)',
      fontFamily: 'system-ui, sans-serif',
    },

    ':host .ts-toolbar': {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      background: 'var(--code-background, #f3f4f6)',
      borderBottom: '1px solid var(--code-border, #e5e7eb)',
    },

    ':host .run-btn': {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 12px',
      background: 'var(--brand-color, #3178c6)', // TypeScript blue
      color: 'var(--brand-text-color, white)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '14px',
    },

    ':host .run-btn:hover': {
      filter: 'brightness(1.1)',
    },

    ':host .toolbar-separator': {
      width: '1px',
      height: '20px',
      background: 'var(--code-border, #d1d5db)',
    },

    ':host .build-flags': {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },

    ':host .flag-label': {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '13px',
      color: 'var(--text-color, #6b7280)',
      cursor: 'pointer',
      userSelect: 'none',
    },

    ':host .flag-label:hover': {
      color: 'var(--text-color, #374151)',
    },

    ':host .flag-label input[type="checkbox"]': {
      margin: '0',
      cursor: 'pointer',
      accentColor: 'var(--brand-color, #3178c6)',
    },

    ':host .revert-btn': {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '6px 12px',
      background: 'var(--code-background, #e5e7eb)',
      color: 'var(--text-color, #374151)',
      border: '1px solid var(--code-border, #d1d5db)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '14px',
      transition: 'opacity 0.2s',
    },

    ':host .revert-btn:hover:not(:disabled)': {
      background: '#fef3c7',
      borderColor: '#f59e0b',
      color: '#92400e',
    },

    ':host .revert-btn:disabled': {
      cursor: 'default',
    },

    ':host .elastic': {
      flex: '1',
    },

    ':host .status-bar': {
      fontSize: '13px',
      color: 'var(--text-color, #6b7280)',
      opacity: '0.7',
    },

    ':host .status-bar.error': {
      color: '#dc2626',
      opacity: '1',
    },

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

    ':host .ts-input xin-tabs, :host .ts-output xin-tabs': {
      flex: '1 1 auto',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '0',
    },

    ':host xin-tabs > [name]': {
      background: 'var(--background, #fff)',
      color: 'var(--text-color, #1f2937)',
    },

    ':host .editor-wrapper': {
      flex: '1 1 auto',
      height: '100%',
      minHeight: '300px',
      position: 'relative',
      overflow: 'hidden',
    },

    ':host .editor-wrapper code-mirror': {
      display: 'block',
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
    },

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

    ':host .preview-frame': {
      width: '100%',
      height: '100%',
      border: 'none',
    },

    ':host .docs-output': {
      display: 'block',
      padding: '12px 16px',
      fontSize: '14px',
      fontFamily: 'system-ui, sans-serif',
      color: 'var(--text-color, inherit)',
      background: 'var(--background, #fff)',
      height: '100%',
      overflow: 'auto',
    },

    ':host .tests-output': {
      padding: '12px',
      fontSize: '14px',
      fontFamily: 'system-ui, sans-serif',
      color: 'var(--text-color, inherit)',
      background: 'var(--background, #fff)',
      height: '100%',
      overflow: 'auto',
    },

    ':host .test-summary': {
      marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: '1px solid var(--code-border, #e5e7eb)',
    },

    ':host .test-failed': {
      color: '#dc2626',
    },

    ':host .test-list': {
      listStyle: 'none',
      padding: 0,
      margin: 0,
    },

    ':host .test-list li': {
      padding: '4px 0',
    },

    ':host .test-pass': {
      color: '#16a34a',
    },

    ':host .test-fail': {
      color: '#dc2626',
    },

    ':host .test-error': {
      marginLeft: '20px',
      marginTop: '4px',
      padding: '8px',
      background: 'rgba(220, 38, 38, 0.1)',
      borderRadius: '4px',
      fontSize: '13px',
      fontFamily: 'var(--font-mono, monospace)',
    },

    ':host .clickable-error': {
      cursor: 'pointer',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
    },

    ':host .clickable-error:hover': {
      background: 'rgba(220, 38, 38, 0.2)',
    },

    ':host .sig-badge': {
      fontSize: '11px',
      padding: '2px 6px',
      marginLeft: '8px',
      background: 'rgba(99, 102, 241, 0.1)',
      color: '#6366f1',
      borderRadius: '4px',
    },

    ':host .ts-console': {
      height: '120px',
      borderTop: '1px solid var(--code-border, #e5e7eb)',
      display: 'flex',
      flexDirection: 'column',
    },

    ':host .console-header': {
      padding: '4px 12px',
      background: 'var(--code-background, #f3f4f6)',
      fontSize: '12px',
      fontWeight: '500',
      color: 'var(--text-color, #6b7280)',
      opacity: '0.7',
      borderBottom: '1px solid var(--code-border, #e5e7eb)',
    },

    ':host .console-output': {
      flex: '1',
      margin: '0',
      padding: '8px 12px',
      background: 'var(--code-background, #f3f4f6)',
      color: 'var(--text-color, #1f2937)',
      fontSize: '12px',
      fontFamily: 'ui-monospace, monospace',
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
    },

    ':host .clickable-line': {
      cursor: 'pointer',
      color: '#2563eb',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
    },

    ':host .clickable-line:hover': {
      color: '#1d4ed8',
      background: 'rgba(37, 99, 235, 0.1)',
    },
  },
}) as ElementCreator<TSPlayground>
