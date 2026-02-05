/**
 * TJS Playground - Interactive TJS editor and runner
 *
 * A light-DOM web component for editing and running TJS code.
 * Features:
 * - CodeMirror editor with TJS syntax highlighting
 * - Tabbed output: JS output, Preview, Docs, Tests
 * - CSS/HTML editing for preview customization
 * - Console output panel
 */

import * as tosijs from 'tosijs'
import { Component, ElementCreator, PartsMap, elements, vars } from 'tosijs'
import * as tosisjsUi from 'tosijs-ui'
import {
  tabSelector,
  TabSelector,
  icons,
  markdownViewer,
  MarkdownViewer,
} from 'tosijs-ui'

// Available modules for autocomplete introspection
// These are the actual runtime values that can be introspected
import { codeMirror, CodeMirror } from '../../editors/codemirror/component'
import { tjs, type TJSTranspileOptions } from '../../src/lang'
import { generateDocsMarkdown } from './docs-utils'
import { extractImports, generateImportMap, resolveImports } from './imports'
import { ModuleStore, type ValidationResult } from './module-store'
import {
  buildAutocompleteContext,
  type AutocompleteContext,
} from './autocomplete-context'

// Available modules for autocomplete introspection
const AVAILABLE_MODULES: Record<string, any> = {
  tosijs,
  'tosijs-ui': tosisjsUi,
}

const { div, button, span, pre, style, input, template } = elements

/**
 * Convert TypeDescriptor to readable string
 * Handles both old format (type: 'string') and new format (type: { kind: 'string', ... })
 */
function typeToString(type: any): string {
  if (!type) return 'unknown'
  // Old format: type was just a string like 'string', 'number', etc.
  if (typeof type === 'string') return type

  // New format: type is an object with kind, shape, items, members
  switch (type.kind) {
    case 'string':
      return type.nullable ? 'string | null' : 'string'
    case 'number':
      return type.nullable ? 'number | null' : 'number'
    case 'boolean':
      return type.nullable ? 'boolean | null' : 'boolean'
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'any':
      return 'any'
    case 'array': {
      const itemType = type.items ? typeToString(type.items) : 'any'
      return type.nullable ? `${itemType}[] | null` : `${itemType}[]`
    }
    case 'object': {
      if (!type.shape) return type.nullable ? 'object | null' : 'object'
      const props = Object.entries(type.shape)
        .map(([k, v]) => `${k}: ${typeToString(v)}`)
        .join(', ')
      const objStr = `{ ${props} }`
      return type.nullable ? `${objStr} | null` : objStr
    }
    case 'union':
      return type.members?.map(typeToString).join(' | ') || 'unknown'
    default:
      return type.kind || 'unknown'
  }
}

// Example TJS code
const DEFAULT_TJS = `// TJS Example - Type annotations via examples
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}

// Call it
greet('TJS')`

const DEFAULT_HTML = ``

const DEFAULT_CSS = `body {
  margin: 1rem;
  font-family: system-ui, sans-serif;
}`

interface TJSPlaygroundParts extends PartsMap {
  tjsEditor: CodeMirror
  htmlEditor: CodeMirror
  cssEditor: CodeMirror
  inputTabs: TabSelector
  outputTabs: TabSelector
  jsOutput: HTMLElement
  previewFrame: HTMLIFrameElement
  docsOutput: MarkdownViewer
  testsOutput: HTMLElement
  consoleHeader: HTMLElement
  console: HTMLElement
  runBtn: HTMLButtonElement
  revertBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  moduleNameInput: HTMLInputElement
  statusBar: HTMLElement
  // Build flags
  testsToggle: HTMLInputElement
  debugToggle: HTMLInputElement
  safetyToggle: HTMLInputElement
  wasmToggle: HTMLInputElement
}

export class TJSPlayground extends Component<TJSPlaygroundParts> {
  private lastTranspileResult: any = null
  private consoleMessages: string[] = []
  private functionMetadata: Record<string, any> = {}

  // Editor state persistence
  private currentExampleName: string | null = null
  private originalCode: string = DEFAULT_TJS
  private editorCache: Map<string, string> = new Map()

  // Build flags state
  private buildFlags = {
    tests: true, // Run tests at transpile time
    debug: false, // Debug mode (call stack tracking)
    safe: true, // Safe mode (validates inputs)
    wasm: true, // Compile WASM blocks (false = use JS fallback)
  }

  // Transpilation sequence number to handle race conditions
  private transpileSeq = 0

  // Autocomplete context - live bindings from import resolution
  private autocompleteContext: AutocompleteContext | null = null
  private contextUpdateTimer: ReturnType<typeof setTimeout> | null = null
  private contextBuildPromise: Promise<void> | null = null

  /**
   * Get metadata for autocomplete - returns all discovered functions
   */
  private getMetadataForAutocomplete = (): Record<string, any> | undefined => {
    if (Object.keys(this.functionMetadata).length === 0) {
      return undefined
    }
    return this.functionMetadata
  }

  /**
   * Get live bindings for autocomplete introspection
   * Returns actual runtime values that can be introspected
   */
  private getLiveBindings = (): Record<string, any> | undefined => {
    return this.autocompleteContext?.bindings
  }

  /**
   * Update autocomplete context (debounced)
   * Called when editor content changes.
   * Keeps last good context if new build fails.
   */
  private updateAutocompleteContext = (immediate = false) => {
    if (this.contextUpdateTimer) {
      clearTimeout(this.contextUpdateTimer)
    }

    const doBuild = async () => {
      const source = this.parts.tjsEditor.value

      try {
        const newContext = await buildAutocompleteContext(source)
        // Only update if we got bindings (keep last good context otherwise)
        if (Object.keys(newContext.bindings).length > 0) {
          this.autocompleteContext = newContext
        } else if (!this.autocompleteContext) {
          // No previous context, use this one even if empty
          this.autocompleteContext = newContext
        }
      } catch {
        // Keep last good context on error
      }
    }

    if (immediate) {
      // Build immediately (used on initial load)
      this.contextBuildPromise = doBuild()
    } else {
      // Debounce updates during typing
      this.contextUpdateTimer = setTimeout(() => {
        this.contextBuildPromise = doBuild()
      }, 100)
    }
  }

  content = () => [
    // Toolbar
    div(
      { class: 'tjs-toolbar' },
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
        ),
        elements.label(
          {
            class: 'flag-label',
            title: 'Compile WASM blocks (uncheck to use JS fallback)',
          },
          input({
            part: 'wasmToggle',
            type: 'checkbox',
            checked: true,
            onChange: this.toggleWasm,
          }),
          'WASM'
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
      span({ class: 'toolbar-separator' }),
      input({
        part: 'moduleNameInput',
        class: 'module-name-input',
        type: 'text',
        placeholder: 'module-name',
        title: 'Module name for saving/importing',
      }),
      button(
        { part: 'saveBtn', class: 'save-btn', onClick: this.saveModule },
        icons.save({ size: 16 }),
        'Save'
      ),
      span({ class: 'elastic' }),
      span({ part: 'statusBar', class: 'status-bar' }, 'Ready')
    ),

    // Main area - split into input (left) and output (right)
    div(
      { class: 'tjs-main' },

      // Input side - TJS, HTML, CSS editors
      div(
        { class: 'tjs-input' },
        tabSelector(
          { part: 'inputTabs', style: { height: '100%' } },
          div(
            { name: 'TJS', class: 'editor-wrapper' },
            codeMirror({
              part: 'tjsEditor',
              mode: 'tjs',
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

      // Output side - JS, Preview, Docs, Tests
      div(
        { class: 'tjs-output' },
        tabSelector(
          { part: 'outputTabs', style: { height: '100%' } },
          div(
            { name: 'JS' },
            pre(
              { part: 'jsOutput', class: 'js-output' },
              '// Transpiled JavaScript will appear here'
            )
          ),
          elements.iframe({
            name: 'Preview',
            part: 'previewFrame',
            class: 'preview-frame',
            sandbox: 'allow-scripts allow-same-origin',
          }),
          markdownViewer({
            name: 'Docs',
            part: 'docsOutput',
            class: 'docs-output',
            value: '*Documentation will appear here*',
          }),
          div(
            { name: 'Tests' },
            template(
              { role: 'tab' },
              span({
                class: 'test-indicator',
                style: {
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  marginRight: '6px',
                  background: vars.testIndicatorColor,
                },
              }),
              'Tests'
            ),
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
      { class: 'tjs-console' },
      div({ part: 'consoleHeader', class: 'console-header' }, 'Console'),
      pre({ part: 'console', class: 'console-output' })
    ),
  ]

  connectedCallback(): void {
    super.connectedCallback()

    // Set default content
    setTimeout(() => {
      this.parts.tjsEditor.value = DEFAULT_TJS
      this.parts.htmlEditor.value = DEFAULT_HTML
      this.parts.cssEditor.value = DEFAULT_CSS

      // Wire up autocomplete to get metadata and live bindings
      this.parts.tjsEditor.autocomplete = {
        getMetadata: this.getMetadataForAutocomplete,
        getLiveBindings: this.getLiveBindings,
      }

      // Build initial autocomplete context immediately
      this.updateAutocompleteContext(true)

      // Auto-transpile on load
      this.transpile()
    }, 0)

    // Listen for changes (debounced to avoid excessive transpilation)
    let debounceTimer: ReturnType<typeof setTimeout>
    this.parts.tjsEditor.addEventListener('change', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        this.transpile()
        this.updateRevertButton()
      }, 300)

      // Update autocomplete context more frequently
      this.updateAutocompleteContext()
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

  clearPreview = () => {
    const iframe = this.parts.previewFrame
    // Revoke any existing blob URL
    if (iframe.dataset.blobUrl) {
      URL.revokeObjectURL(iframe.dataset.blobUrl)
      delete iframe.dataset.blobUrl
    }
    // Clear iframe by setting to blank
    iframe.src = 'about:blank'
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

  toggleWasm = () => {
    this.buildFlags.wasm = this.parts.wasmToggle.checked
    // No need to re-transpile - WASM is handled at run time
  }

  lastTranspileTime = 0

  transpile = () => {
    // Kick off async transpilation
    this.transpileAsync()
  }

  private transpileAsync = async () => {
    // Increment sequence number to track this transpilation
    const mySeq = ++this.transpileSeq

    let source = this.parts.tjsEditor.value

    // Extract function metadata for autocomplete (even if transpile fails)
    this.extractFunctionMetadata(source)

    // Inject safety directive if unsafe mode is enabled
    // This prepends "safety none" to skip all validation
    if (!this.buildFlags.safe) {
      source = 'safety none\n' + source
    }

    try {
      // Resolve local imports before transpilation (for test execution)
      const resolvedImports = await this.resolveImportsForTests(source)

      // Check if a newer transpilation has started - if so, abandon this one
      if (mySeq !== this.transpileSeq) {
        return
      }

      // Time the transpilation
      const startTime = performance.now()
      // Build transpiler options from flags
      const options: TJSTranspileOptions = {
        runTests: this.buildFlags.tests ? 'report' : false,
        debug: this.buildFlags.debug,
        resolvedImports,
      }
      const result = tjs(source, options)
      this.lastTranspileTime = performance.now() - startTime

      this.lastTranspileResult = result
      this.parts.jsOutput.textContent = result.code

      // Update docs
      this.updateDocs(result)

      // Update test results and status bar with timing
      const tests = result.testResults || []
      const failed = tests.filter((t: any) => !t.passed).length
      const timeStr =
        this.lastTranspileTime < 1
          ? `${(this.lastTranspileTime * 1000).toFixed(0)}μs`
          : `${this.lastTranspileTime.toFixed(2)}ms`
      if (failed > 0) {
        this.parts.statusBar.textContent = `Transpiled in ${timeStr} with ${failed} test failure${
          failed > 1 ? 's' : ''
        }`
        this.parts.statusBar.classList.add('error')
      } else {
        this.parts.statusBar.textContent = `Transpiled in ${timeStr}`
        this.parts.statusBar.classList.remove('error')
      }

      this.updateTestResults(result)

      // If we got metadata from transpiler, use it (more accurate)
      if (result.metadata?.name && typeof result.metadata.name === 'string') {
        this.functionMetadata[result.metadata.name] = result.metadata
      }
    } catch (e: any) {
      // Format error with location info if available
      const errorInfo = this.formatTranspileError(e, source)
      this.parts.jsOutput.textContent = errorInfo.detailed
      this.parts.statusBar.textContent = errorInfo.short
      this.parts.statusBar.classList.add('error')
      this.lastTranspileResult = null
      // Clear test results on error
      this.parts.testsOutput.textContent = 'Transpilation failed - no tests run'

      // Set error marker in gutter
      if (e.line) {
        this.parts.tjsEditor.setMarkers([
          { line: e.line, message: e.message || 'Transpilation error' },
        ])
      } else {
        this.parts.tjsEditor.clearMarkers()
      }
    }
  }

  /**
   * Resolve local imports for test execution
   * Returns a map of import specifier -> compiled code
   */
  private resolveImportsForTests = async (
    source: string
  ): Promise<Record<string, string>> => {
    const imports = extractImports(source)
    if (imports.length === 0) {
      return {}
    }

    const resolvedImports: Record<string, string> = {}
    const store = await ModuleStore.open()

    for (const specifier of imports) {
      // Only resolve local modules (not CDN packages)
      if (await store.exists(specifier)) {
        const compiled = await store.getCompiled(specifier)
        if (compiled) {
          resolvedImports[specifier] = compiled
        }
      }
    }

    return resolvedImports
  }

  private updateTestResults(result: any) {
    const tests = result.testResults
    if (!tests || tests.length === 0) {
      this.parts.testsOutput.textContent = 'No tests defined'
      this.updateTestsTabLabel(0, 0)
      this.parts.tjsEditor.clearMarkers()
      return
    }

    const passed = tests.filter((t: any) => t.passed).length
    const failed = tests.filter((t: any) => !t.passed).length

    // Update tab label with indicator
    this.updateTestsTabLabel(passed, failed)

    // Set gutter markers for failed tests
    const failedTests = tests.filter((t: any) => !t.passed && t.line)
    if (failedTests.length > 0) {
      this.parts.tjsEditor.setMarkers(
        failedTests.map((t: any) => ({
          line: t.line,
          message: t.error || t.description,
          severity: 'error' as const,
        }))
      )
    } else {
      this.parts.tjsEditor.clearMarkers()
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
      const clickable =
        !test.passed && test.line ? ' class="clickable-error"' : ''
      const dataLine = test.line ? ` data-line="${test.line}"` : ''
      html += `<li class="${cls}"${dataLine}>${icon} ${test.description}${sigBadge}`
      if (!test.passed && test.error) {
        html += `<div${clickable}${dataLine} class="test-error${
          test.line ? ' clickable-error' : ''
        }">${test.error}</div>`
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

  private updateTestsTabLabel(passed: number, failed: number) {
    const tabs = this.parts.outputTabs
    if (!tabs) return

    if (failed > 0) {
      tabs.style.setProperty('--test-indicator-color', '#dc2626')
    } else if (passed > 0) {
      tabs.style.setProperty('--test-indicator-color', '#16a34a')
    } else {
      tabs.style.setProperty('--test-indicator-color', 'transparent')
    }
  }

  /**
   * Format transpile error with helpful context
   */
  private formatTranspileError = (
    e: any,
    source: string
  ): { short: string; detailed: string } => {
    const lines = source.split('\n')
    const line = e.line ?? 1
    const column = e.column ?? 0
    const message = e.message || String(e)

    // Short version for status bar
    const short = e.line
      ? `Error at line ${line}: ${message}`
      : `Error: ${message}`

    // Detailed version with code context
    const detailedLines = ['// Transpilation Error', '// ' + '='.repeat(50), '']

    // Add the error message
    detailedLines.push(`// ${message}`)
    if (e.line) {
      detailedLines.push(`// at line ${line}, column ${column}`)
    }
    detailedLines.push('')

    // Show code context (3 lines before and after)
    if (e.line && lines.length > 0) {
      detailedLines.push('// Code context:')
      const start = Math.max(0, line - 3)
      const end = Math.min(lines.length, line + 2)

      for (let i = start; i < end; i++) {
        const lineNum = i + 1
        const prefix = lineNum === line ? '>> ' : '   '
        const lineContent = lines[i] ?? ''
        detailedLines.push(
          `// ${prefix}${lineNum.toString().padStart(3)}: ${lineContent}`
        )

        // Show caret pointing to error column
        if (lineNum === line && column > 0) {
          const caretPos = 10 + column // account for prefix
          detailedLines.push('// ' + ' '.repeat(caretPos) + '^')
        }
      }
    }

    // Add suggestions based on common errors
    const suggestions = this.getSuggestions(message, source)
    if (suggestions.length > 0) {
      detailedLines.push('')
      detailedLines.push('// Suggestions:')
      for (const suggestion of suggestions) {
        detailedLines.push(`//   - ${suggestion}`)
      }
    }

    return { short, detailed: detailedLines.join('\n') }
  }

  /**
   * Get helpful suggestions based on error message
   */
  private getSuggestions = (message: string, source: string): string[] => {
    const suggestions: string[] = []
    const msg = message.toLowerCase()

    if (msg.includes('unexpected token')) {
      suggestions.push('Check for missing brackets, parentheses, or quotes')
      suggestions.push('TJS uses : for type annotations, = for defaults')
      if (source.includes('=>')) {
        suggestions.push(
          'Arrow functions are not supported - use function keyword'
        )
      }
    }

    if (msg.includes('unexpected identifier')) {
      suggestions.push('Check for missing commas between parameters')
      suggestions.push(
        'Check for typos in keywords (function, return, if, while)'
      )
    }

    if (msg.includes('unterminated string')) {
      suggestions.push('Check for unmatched quotes')
      suggestions.push('Template literals use backticks (`), not quotes')
    }

    if (msg.includes('imports are not supported')) {
      suggestions.push('For TJS modules, imports work - this error is for AJS')
      suggestions.push('Make sure the module exists in the store')
    }

    if (msg.includes('required parameter') && msg.includes('optional')) {
      suggestions.push(
        'Required parameters (name: type) must come before optional (name = default)'
      )
    }

    if (msg.includes('duplicate parameter')) {
      suggestions.push('Each parameter must have a unique name')
    }

    return suggestions
  }

  /**
   * Extract function metadata from source for autocomplete
   * This runs even when transpilation fails (incomplete code)
   */
  private extractFunctionMetadata = (source: string) => {
    // Match function declarations with TJS syntax
    // function name(param: 'type', param2 = default) -> returnType { ... }
    const funcRegex =
      /function\s+(\w+)\s*\(\s*([^)]*)\s*\)\s*(?:->\s*([^\s{]+))?\s*\{/g

    const newMetadata: Record<string, any> = {}
    let match

    while ((match = funcRegex.exec(source)) !== null) {
      const [, funcName, paramsStr, returnType] = match

      // Parse parameters
      const params: Record<string, any> = {}
      if (paramsStr.trim()) {
        // Split on commas, but be careful of nested structures
        const paramParts = this.splitParams(paramsStr)

        for (const paramStr of paramParts) {
          const trimmed = paramStr.trim()
          if (!trimmed) continue

          // Match: name: 'type' or name = default or name: type = default
          const paramMatch = trimmed.match(
            /^(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/
          )
          if (paramMatch) {
            const [, paramName, typeExample, defaultValue] = paramMatch
            const hasDefault = defaultValue !== undefined
            const typeStr = typeExample?.trim() || defaultValue?.trim()

            params[paramName] = {
              type: this.inferTypeFromExample(typeStr),
              required: !hasDefault && typeExample !== undefined,
              default: hasDefault ? this.parseDefault(defaultValue) : undefined,
            }
          }
        }
      }

      newMetadata[funcName] = {
        name: funcName,
        params,
        returns: returnType ? this.inferTypeFromExample(returnType) : undefined,
      }
    }

    this.functionMetadata = newMetadata
  }

  /**
   * Split parameter string handling nested brackets
   */
  private splitParams = (paramsStr: string): string[] => {
    const result: string[] = []
    let current = ''
    let depth = 0

    for (const char of paramsStr) {
      if (char === '(' || char === '[' || char === '{') {
        depth++
        current += char
      } else if (char === ')' || char === ']' || char === '}') {
        depth--
        current += char
      } else if (char === ',' && depth === 0) {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
    if (current.trim()) {
      result.push(current)
    }
    return result
  }

  /**
   * Infer type descriptor from example value
   */
  private inferTypeFromExample = (
    example: string | undefined
  ): { kind: string } | undefined => {
    if (!example) return undefined
    const trimmed = example.trim()

    // String literal
    if (/^['"]/.test(trimmed)) {
      return { kind: 'string' }
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { kind: 'number' }
    }
    // Boolean
    if (trimmed === 'true' || trimmed === 'false') {
      return { kind: 'boolean' }
    }
    // Null
    if (trimmed === 'null') {
      return { kind: 'null' }
    }
    // Array
    if (trimmed.startsWith('[')) {
      return { kind: 'array' }
    }
    // Object
    if (trimmed.startsWith('{')) {
      return { kind: 'object' }
    }

    return { kind: 'any' }
  }

  /**
   * Parse default value to JS value
   */
  private parseDefault = (value: string): any => {
    const trimmed = value.trim()
    try {
      // Try to parse as JSON-like value
      if (
        trimmed === 'true' ||
        trimmed === 'false' ||
        trimmed === 'null' ||
        /^-?\d+(\.\d+)?$/.test(trimmed)
      ) {
        return JSON.parse(trimmed)
      }
      // String literal
      if (/^['"]/.test(trimmed)) {
        return trimmed.slice(1, -1)
      }
    } catch {
      // Return as-is if parsing fails
    }
    return trimmed
  }

  updateDocs = (result: any) => {
    const source = this.parts.tjsEditor.value
    const types = result?.types || result?.metadata
    this.parts.docsOutput.value = generateDocsMarkdown(source, types)
    this.parts.docsOutput.render?.()
  }

  saveModule = async () => {
    const name = this.parts.moduleNameInput.value.trim()
    if (!name) {
      this.parts.statusBar.textContent = 'Enter a module name to save'
      this.parts.statusBar.classList.add('error')
      this.parts.moduleNameInput.focus()
      return
    }

    // Validate module name format
    if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
      this.parts.statusBar.textContent =
        'Module name must start with letter, contain only letters, numbers, dashes'
      this.parts.statusBar.classList.add('error')
      return
    }

    this.parts.statusBar.textContent = 'Validating...'
    this.parts.statusBar.classList.remove('error')

    try {
      const store = await ModuleStore.open()
      const code = this.parts.tjsEditor.value

      // Validate first to get detailed results
      const validation = await store.validate(code, 'tjs')

      if (!validation.valid) {
        // Show validation errors
        const errorMessages = validation.errors.map((e) => e.message).join('; ')
        this.parts.statusBar.textContent = `Save failed: ${errorMessages}`
        this.parts.statusBar.classList.add('error')

        // Log detailed errors to console
        this.clearConsole()
        this.log('=== Save Validation Failed ===')
        for (const error of validation.errors) {
          if (error.line) {
            this.log(
              `${error.type} error at line ${error.line}: ${error.message}`
            )
          } else {
            this.log(`${error.type} error: ${error.message}`)
          }
        }
        if (validation.warnings.length > 0) {
          this.log('')
          this.log('Warnings:')
          for (const warning of validation.warnings) {
            this.log(`  - ${warning}`)
          }
        }
        return
      }

      // Validation passed, save (skip re-validation)
      await store.save({ name, type: 'tjs', code }, { skipValidation: true })

      // Success!
      this.parts.statusBar.textContent = `Saved as "${name}"`
      this.parts.statusBar.classList.remove('error')

      // Show test results if any
      if (validation.testResults && validation.testResults.length > 0) {
        this.clearConsole()
        this.log(`=== Module "${name}" saved successfully ===`)
        this.log('')
        this.log(`Tests: ${validation.testResults.length} passed`)
        for (const test of validation.testResults) {
          this.log(`  ✓ ${test.name}`)
        }
      }
    } catch (e: any) {
      this.parts.statusBar.textContent = `Save error: ${e.message}`
      this.parts.statusBar.classList.add('error')
    }
  }

  run = async () => {
    this.parts.runBtn.disabled = true
    this.clearConsole()
    this.transpile()

    if (!this.lastTranspileResult) {
      this.log('Cannot run - transpilation failed')
      this.parts.runBtn.disabled = false
      return
    }

    // Show JS output immediately after successful transpilation
    this.parts.outputTabs.value = 0 // JS is first tab (index 0)

    this.parts.statusBar.textContent = 'Running...'

    try {
      // Log WASM compilation results (WASM is now compiled at transpile time)
      const wasmCompiled = this.lastTranspileResult.wasmCompiled
      if (wasmCompiled && wasmCompiled.length > 0) {
        const success = wasmCompiled.filter((w) => w.success).length
        const failed = wasmCompiled.filter((w) => !w.success).length
        if (success > 0) {
          this.log(`WASM: ${success} block(s) compiled at transpile time`)
        }
        if (failed > 0) {
          this.log(`WASM: ${failed} failed (using JS fallback)`)
          for (const w of wasmCompiled.filter((w) => !w.success)) {
            this.log(`  ${w.id}: ${w.error}`)
          }
        }
      }

      // Build the preview HTML
      const htmlContent = this.parts.htmlEditor.value
      const cssContent = this.parts.cssEditor.value
      const jsCode = this.lastTranspileResult.code

      // Resolve imports from the transpiled code
      const imports = extractImports(jsCode)
      let importMapScript = ''

      if (imports.length > 0) {
        this.log(`Resolving imports: ${imports.join(', ')}`)
        const { importMap, errors, localModules } = await resolveImports(jsCode)

        if (errors.length > 0) {
          for (const err of errors) {
            this.log(`Import error: ${err}`)
          }
        }

        console.log('[run] importMap:', JSON.stringify(importMap, null, 2))
        if (Object.keys(importMap.imports).length > 0) {
          importMapScript = `<script type="importmap">${JSON.stringify(
            importMap
          )}</script>`
          console.log('[run] importMapScript:', importMapScript)
        }
      }

      // Extract import statements from jsCode - they must be at the top of the module
      // Matches: import ... from 'pkg', import 'pkg' (side-effect)
      const importStatements: string[] = []
      const codeWithoutImports = jsCode.replace(
        /^import\s+(?:.*?from\s+)?['"][^'"]+['"];?\s*$/gm,
        (match) => {
          importStatements.push(match)
          return ''
        }
      )

      // Create a complete HTML document for the iframe
      const iframeDoc = `<!DOCTYPE html>
<html>
<head>
  <style>${cssContent}</style>
  ${importMapScript}
</head>
<body>
  ${htmlContent}
  <!-- TJS Runtime stub must be set up BEFORE imports execute -->
  <script>
    // Expose parent's run/runAgent/getIdToken in iframe for playground convenience
    if (parent.run) window.run = parent.run.bind(parent);
    if (parent.runAgent) window.runAgent = parent.runAgent.bind(parent);
    if (parent.getIdToken) window.getIdToken = parent.getIdToken.bind(parent);

    // TJS runtime stub - must stay in sync with src/lang/runtime.ts
    // TODO: Eliminate this once transpiler emits self-contained code
    // See: src/lang/emitters/js.ts for the plan to inline runtime functions
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
  </script>
  <script type="module">
    // Import statements must be at the top of the module
    ${importStatements.join('\n    ')}

    // Capture console.log
    const _log = console.log;
    console.log = (...args) => {
      _log(...args);
      parent.postMessage({ type: 'console', message: args.map(a => {
        if (typeof a !== 'object' || a === null) return String(a);
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      }).join(' ') }, '*');
    };

    try {
      // WASM blocks are pre-compiled and embedded in the transpiled code
      // They auto-instantiate via the async IIFE at the top of the code

      const __execStart = performance.now();
      ${codeWithoutImports}

      // Try to call the function if it exists and show result
      const funcName = Object.keys(window).find(k => {
        try { return typeof window[k] === 'function' && window[k].__tjs; }
        catch { return false; }
      });
      if (funcName) {
        const __callStart = performance.now();
        const result = window[funcName]();
        const __execTime = performance.now() - __callStart;
        parent.postMessage({ type: 'timing', execTime: __execTime }, '*');
        if (result !== undefined) {
          // If result is a DOM node, append it; otherwise log it
          if (result instanceof Node) {
            document.body.append(result);
            parent.postMessage({ type: 'hasPreviewContent' }, '*');
          } else {
            console.log('Result:', result);
          }
        }
      } else {
        // No TJS function found, report total parse/exec time
        const __execTime = performance.now() - __execStart;
        parent.postMessage({ type: 'timing', execTime: __execTime }, '*');
      }
      // Check if body has content after execution
      if (document.body.children.length > 0) {
        parent.postMessage({ type: 'hasPreviewContent' }, '*');
      }
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
        } else if (event.data?.type === 'hasPreviewContent') {
          // Switch to Preview tab when content is added
          this.parts.outputTabs.value = 1 // Preview is second tab (index 1)
        } else if (event.data?.type === 'error') {
          this.log(`Error: ${event.data.message}`)
          this.parts.statusBar.textContent = 'Runtime error'
          this.parts.statusBar.classList.add('error')
        }
      }
      window.addEventListener('message', messageHandler)

      // Set iframe content using blob URL instead of srcdoc
      // This allows import maps to work with external URLs
      const iframe = this.parts.previewFrame
      const blob = new Blob([iframeDoc], { type: 'text/html' })
      const blobUrl = URL.createObjectURL(blob)

      // Clean up previous blob URL if any
      if (iframe.dataset.blobUrl) {
        URL.revokeObjectURL(iframe.dataset.blobUrl)
      }
      iframe.dataset.blobUrl = blobUrl
      iframe.src = blobUrl

      // Wait a bit for execution, then clean up listener
      setTimeout(() => {
        window.removeEventListener('message', messageHandler)
        this.parts.runBtn.disabled = false
      }, 1000)
    } catch (e: any) {
      this.parts.runBtn.disabled = false
      this.log(`Error: ${e.message}`)
      this.parts.statusBar.textContent = 'Error'
      this.parts.statusBar.classList.add('error')
    }
  }

  render(): void {
    super.render()
  }

  // Public method to set source code (auto-runs when examples are loaded)
  setSource(code: string, exampleName?: string) {
    // Save current edits before switching
    if (this.currentExampleName) {
      this.editorCache.set(this.currentExampleName, this.parts.tjsEditor.value)
    }

    // Clear previous output when switching examples
    this.clearPreview()
    this.clearConsole()

    // Update current example tracking
    this.currentExampleName = exampleName || null
    this.originalCode = code

    // Check if we have cached edits for this example
    const cachedCode = exampleName ? this.editorCache.get(exampleName) : null
    this.parts.tjsEditor.value = cachedCode || code

    // Update revert button visibility
    this.updateRevertButton()

    // Transpile and run sequentially to avoid race conditions
    this.transpileAndRun()
  }

  private transpileAndRun = async () => {
    const mySeq = this.transpileSeq // Capture current seq before transpile increments it
    await this.transpileAsync()
    // Only run if this is still the current transpilation
    if (this.transpileSeq === mySeq + 1) {
      await this.run()
    }
  }

  // Navigate to a specific line in the source editor
  goToSourceLine(line: number, column: number = 1) {
    this.parts.inputTabs.value = 0 // Switch to TJS tab (first tab)
    // Wait for tab switch and editor resize before scrolling
    setTimeout(() => {
      this.parts.tjsEditor.goToLine(line, column)
    }, 50)
  }

  // Revert to the original example code
  revertToOriginal = () => {
    if (this.currentExampleName) {
      this.editorCache.delete(this.currentExampleName)
    }
    this.parts.tjsEditor.value = this.originalCode
    this.updateRevertButton()
    this.transpile()
  }

  // Update revert button state based on whether code has changed
  private updateRevertButton() {
    const hasChanges = this.parts.tjsEditor.value !== this.originalCode
    this.parts.revertBtn.disabled = !hasChanges
    this.parts.revertBtn.style.opacity = hasChanges ? '1' : '0.5'
  }
}

export const tjsPlayground = TJSPlayground.elementCreator({
  tag: 'tjs-playground',
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

    ':host .tjs-toolbar': {
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
      background: 'var(--brand-color, #3d4a6b)',
      color: 'var(--brand-text-color, white)',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: '500',
      fontSize: '14px',
    },

    ':host .run-btn:hover:not(:disabled)': {
      filter: 'brightness(1.1)',
    },

    ':host .run-btn:disabled': {
      opacity: '0.6',
      cursor: 'not-allowed',
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
      accentColor: 'var(--brand-color, #3d4a6b)',
    },

    ':host .module-name-input': {
      padding: '6px 10px',
      border: '1px solid var(--code-border, #d1d5db)',
      borderRadius: '6px',
      fontSize: '14px',
      fontFamily: 'ui-monospace, monospace',
      background: 'var(--background, #fff)',
      color: 'var(--text-color, #1f2937)',
      width: '160px',
    },

    ':host .module-name-input:focus': {
      outline: 'none',
      borderColor: 'var(--brand-color, #3d4a6b)',
      boxShadow: '0 0 0 2px rgba(61, 74, 107, 0.2)',
    },

    ':host .module-name-input::placeholder': {
      color: 'var(--text-color, #9ca3af)',
      opacity: '0.6',
    },

    ':host .save-btn': {
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
    },

    ':host .save-btn:hover': {
      background: 'var(--brand-color, #3d4a6b)',
      color: 'var(--brand-text-color, white)',
      borderColor: 'var(--brand-color, #3d4a6b)',
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

    ':host .tjs-main': {
      display: 'flex',
      flex: '1 1 auto',
      minHeight: '0',
      gap: '1px',
      background: 'var(--code-border, #e5e7eb)',
    },

    ':host .tjs-input, :host .tjs-output': {
      flex: '1 1 50%',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background, #fff)',
      overflow: 'hidden',
    },

    // Tab content panels need explicit background for dark mode
    ':host tosi-tabs > [name]': {
      background: 'var(--background, #fff)',
      color: 'var(--text-color, #1f2937)',
    },

    // Editor wrapper - contains the shadow DOM code-mirror component
    ':host .editor-wrapper': {
      flex: '1 1 auto',
      height: '100%',
      minHeight: '300px',
      position: 'relative',
      overflow: 'hidden',
    },

    // code-mirror is shadow DOM, so we just size it - internal styles are handled by the component
    ':host .editor-wrapper code-mirror': {
      display: 'block',
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
    },

    ':host .js-output': {
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

    ':host .preview-frame': {
      width: '100%',
      height: '100%',
      border: 'none',
      background: 'var(--background, #fff)',
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

    ':host .docs-output h2': {
      fontSize: '1.25em',
      marginTop: '0',
      marginBottom: '0.5em',
      color: 'var(--text-color, #1f2937)',
    },

    ':host .docs-output pre': {
      background: 'var(--code-background, #f3f4f6)',
      padding: '8px 12px',
      borderRadius: '6px',
      overflow: 'auto',
      fontSize: '13px',
    },

    ':host .docs-output code': {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '0.9em',
    },

    ':host .docs-output p': {
      margin: '0.75em 0',
      lineHeight: '1.5',
    },

    ':host .docs-output h3': {
      fontSize: '1em',
      marginTop: '1em',
      marginBottom: '0.5em',
    },

    ':host .docs-output ul': {
      paddingLeft: '1.5em',
      margin: '0.5em 0',
    },

    ':host .docs-output li': {
      marginBottom: '0.25em',
    },

    ':host .docs-output hr': {
      border: 'none',
      borderTop: '1px solid var(--code-border, #e5e7eb)',
      margin: '1.5em 0',
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

    ':host .tjs-console': {
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
}) as ElementCreator<TJSPlayground>
