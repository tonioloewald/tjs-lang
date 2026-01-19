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

const { div, button, span, pre, style } = elements

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
      this.parts.jsOutput.textContent = `// Error: ${e.message}`
      this.parts.statusBar.textContent = `Error: ${e.message}`
      this.parts.statusBar.classList.add('error')
      this.lastTranspileResult = null
    }
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

      // Create a complete HTML document for the iframe
      const iframeDoc = `<!DOCTYPE html>
<html>
<head>
  <style>${cssContent}</style>
</head>
<body>
  ${htmlContent}
  <script>
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
