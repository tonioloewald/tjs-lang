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

import { Component, ElementCreator, PartsMap, elements } from 'tosijs'
import { tabSelector, TabSelector, icons } from 'tosijs-ui'
import { codeMirror, CodeMirror } from '../../editors/codemirror/component'
import { tjs } from '../../src/lang'
import { extractImports, generateImportMap, resolveImports } from './imports'
import { ModuleStore, type ValidationResult } from './module-store'

const { div, button, span, pre, style, input } = elements

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

interface TJSPlaygroundParts extends PartsMap {
  tjsEditor: CodeMirror
  htmlEditor: CodeMirror
  cssEditor: CodeMirror
  inputTabs: TabSelector
  outputTabs: TabSelector
  jsOutput: HTMLElement
  previewFrame: HTMLIFrameElement
  docsOutput: HTMLElement
  testsOutput: HTMLElement
  console: HTMLElement
  runBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  moduleNameInput: HTMLInputElement
  statusBar: HTMLElement
}

export class TJSPlayground extends Component<TJSPlaygroundParts> {
  private lastTranspileResult: any = null
  private consoleMessages: string[] = []
  private functionMetadata: Record<string, any> = {}

  constructor() {
    super()
  }

  /**
   * Get metadata for autocomplete - returns all discovered functions
   */
  private getMetadataForAutocomplete = (): Record<string, any> | undefined => {
    if (Object.keys(this.functionMetadata).length === 0) {
      return undefined
    }
    return this.functionMetadata
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
          { part: 'inputTabs' },
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
          { part: 'outputTabs' },
          div(
            { name: 'JS' },
            pre(
              { part: 'jsOutput', class: 'js-output' },
              '// Transpiled JavaScript will appear here'
            )
          ),
          div(
            { name: 'Preview' },
            div(
              { class: 'preview-container' },
              // Using an iframe for isolation
              elements.iframe({
                part: 'previewFrame',
                class: 'preview-frame',
                sandbox: 'allow-scripts',
              })
            )
          ),
          div(
            { name: 'Docs' },
            div(
              { part: 'docsOutput', class: 'docs-output' },
              'Generated documentation will appear here'
            )
          ),
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
      { class: 'tjs-console' },
      div({ class: 'console-header' }, 'Console'),
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

      // Wire up autocomplete to get metadata from transpiler
      this.parts.tjsEditor.autocomplete = {
        getMetadata: this.getMetadataForAutocomplete,
      }

      // Auto-transpile on load
      this.transpile()
    }, 0)

    // Listen for changes
    this.parts.tjsEditor.addEventListener('change', () => this.transpile())
  }

  log = (message: string) => {
    this.consoleMessages.push(message)
    this.parts.console.textContent = this.consoleMessages.join('\n')
    this.parts.console.scrollTop = this.parts.console.scrollHeight
  }

  clearConsole = () => {
    this.consoleMessages = []
    this.parts.console.textContent = ''
  }

  transpile = () => {
    const source = this.parts.tjsEditor.value

    // Extract function metadata for autocomplete (even if transpile fails)
    this.extractFunctionMetadata(source)

    try {
      const result = tjs(source)
      this.lastTranspileResult = result
      this.parts.jsOutput.textContent = result.code
      this.parts.statusBar.textContent = 'Transpiled successfully'
      this.parts.statusBar.classList.remove('error')

      // Update docs
      this.updateDocs(result)

      // If we got metadata from transpiler, use it (more accurate)
      if (result.metadata?.name) {
        this.functionMetadata[result.metadata.name] = result.metadata
      }
    } catch (e: any) {
      // Format error with location info if available
      const errorInfo = this.formatTranspileError(e, source)
      this.parts.jsOutput.textContent = errorInfo.detailed
      this.parts.statusBar.textContent = errorInfo.short
      this.parts.statusBar.classList.add('error')
      this.lastTranspileResult = null
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
    if (!result?.types) {
      this.parts.docsOutput.textContent = 'No type information available'
      return
    }

    const { name, params, returns } = result.types
    let docs = `## ${name || 'Function'}\n\n`

    if (params && Object.keys(params).length > 0) {
      docs += '### Parameters\n\n'
      for (const [paramName, paramInfo] of Object.entries(params) as any) {
        const required = paramInfo.required ? '(required)' : '(optional)'
        const typeStr = typeToString(paramInfo.type)
        docs += `- **${paramName}**: \`${typeStr}\` ${required}\n`
        if (paramInfo.default !== undefined && paramInfo.default !== null) {
          docs += `  - Default: \`${JSON.stringify(paramInfo.default)}\`\n`
        }
      }
      docs += '\n'
    }

    if (returns) {
      const returnType = typeToString(returns)
      docs += `### Returns\n\n- \`${returnType}\`\n`
    }

    this.parts.docsOutput.textContent = docs
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
    this.clearConsole()
    this.transpile()

    if (!this.lastTranspileResult) {
      this.log('Cannot run - transpilation failed')
      return
    }

    this.parts.statusBar.textContent = 'Running...'

    try {
      // Build the preview HTML
      const htmlContent = this.parts.htmlEditor.value
      const cssContent = this.parts.cssEditor.value
      const jsCode = this.lastTranspileResult.code

      // Resolve imports from the transpiled code
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

      // Create a complete HTML document for the iframe
      const iframeDoc = `<!DOCTYPE html>
<html>
<head>
  <style>${cssContent}</style>
  ${importMapScript}
</head>
<body>
  ${htmlContent}
  <script type="module">
    // Capture console.log
    const _log = console.log;
    console.log = (...args) => {
      _log(...args);
      parent.postMessage({ type: 'console', message: args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ') }, '*');
    };

    try {
      ${jsCode}

      // Try to call the function if it exists and show result
      const funcName = Object.keys(window).find(k => {
        try { return typeof window[k] === 'function' && window[k].__tjs; }
        catch { return false; }
      });
      if (funcName) {
        const result = window[funcName]();
        if (result !== undefined) {
          const output = document.getElementById('output');
          if (output) {
            output.textContent = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
          }
          console.log('Result:', result);
        }
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
        } else if (event.data?.type === 'error') {
          this.log(`Error: ${event.data.message}`)
          this.parts.statusBar.textContent = 'Runtime error'
          this.parts.statusBar.classList.add('error')
        }
      }
      window.addEventListener('message', messageHandler)

      // Set iframe content
      const iframe = this.parts.previewFrame
      iframe.srcdoc = iframeDoc

      // Wait a bit for execution
      setTimeout(() => {
        window.removeEventListener('message', messageHandler)
        if (!this.parts.statusBar.classList.contains('error')) {
          this.parts.statusBar.textContent = 'Done'
        }
      }, 1000)
    } catch (e: any) {
      this.log(`Error: ${e.message}`)
      this.parts.statusBar.textContent = 'Error'
      this.parts.statusBar.classList.add('error')
    }
  }

  render(): void {
    super.render()
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

    ':host .run-btn:hover': {
      filter: 'brightness(1.1)',
    },

    ':host .toolbar-separator': {
      width: '1px',
      height: '20px',
      background: 'var(--code-border, #d1d5db)',
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

    ':host .tjs-input xin-tabs, :host .tjs-output xin-tabs': {
      flex: '1 1 auto',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '0',
    },

    // Tab content panels need explicit background for dark mode
    ':host xin-tabs > [name]': {
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

    ':host .preview-container': {
      height: '100%',
      background: 'var(--background, #fff)',
    },

    ':host .preview-frame': {
      width: '100%',
      height: '100%',
      border: 'none',
    },

    ':host .docs-output, :host .tests-output': {
      padding: '12px',
      fontSize: '14px',
      whiteSpace: 'pre-wrap',
      fontFamily: 'system-ui, sans-serif',
      color: 'var(--text-color, inherit)',
      background: 'var(--background, #fff)',
      height: '100%',
      overflow: 'auto',
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
    },
  },
}) as ElementCreator<TJSPlayground>
