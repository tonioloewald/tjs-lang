/**
 * Shared helpers for TJS and TS playgrounds
 *
 * Extracted from duplicated code in tjs-playground.ts and ts-playground.ts.
 * Uses composition (exported functions), not inheritance.
 */

import type { CodeMirror } from '../../editors/codemirror/component'

// ---------------------------------------------------------------------------
// TJS Runtime Stub (injected into iframe <script>)
// ---------------------------------------------------------------------------

/** The globalThis.__tjs runtime stub for iframe execution. Must stay in sync with src/lang/runtime.ts */
export const TJS_RUNTIME_STUB = `
    globalThis.__tjs = {
      version: '0.0.0',
      pushStack: () => {},
      popStack: () => {},
      getStack: () => [],
      typeError: (path, expected, value) => {
        const actual = value === null ? 'null' : typeof value;
        const err = new Error("Expected " + expected + " for '" + path + "', got " + actual);
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
    };`

// ---------------------------------------------------------------------------
// Console capture script (injected into iframe <script>)
// ---------------------------------------------------------------------------

/** Console.log capture that posts messages to parent. Handles objects with try/catch. */
export const CONSOLE_CAPTURE_SCRIPT = `
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
    };`

// ---------------------------------------------------------------------------
// Iframe document builder
// ---------------------------------------------------------------------------

export interface IframeDocOptions {
  cssContent: string
  htmlContent: string
  importMapScript: string
  jsCode: string
  /** Import statements extracted from code (TJS separates these) */
  importStatements?: string[]
  /** Expose parent.run/runAgent/getIdToken in iframe */
  parentBindings?: boolean
  /** Auto-find and call TJS-annotated functions, append DOM results */
  autoCallTjsFunction?: boolean
  /** Whether parent is in dark mode — sets color-scheme on iframe */
  darkMode?: boolean
}

/**
 * Build the iframe HTML document for code execution.
 * Includes TJS runtime stub, console capture, DOM content detection,
 * execution timing, and error boundary.
 */
export function buildIframeDoc(options: IframeDocOptions): string {
  const {
    cssContent,
    htmlContent,
    importMapScript,
    jsCode,
    importStatements = [],
    parentBindings = false,
    autoCallTjsFunction = false,
    darkMode = false,
  } = options

  const colorScheme = darkMode ? 'dark' : 'light dark'

  const parentBindingsScript = parentBindings
    ? `
    if (parent.run) window.run = parent.run.bind(parent);
    if (parent.runAgent) window.runAgent = parent.runAgent.bind(parent);
    if (parent.getIdToken) window.getIdToken = parent.getIdToken.bind(parent);`
    : ''

  // When imports are separated, use two script blocks:
  // 1. Regular script for runtime stub (must execute before module imports)
  // 2. Module script for imports + code
  const useSeparateScripts = importStatements.length > 0

  const executionCode = autoCallTjsFunction
    ? `
      const __execStart = performance.now();
      ${jsCode}

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
          if (result instanceof Node) {
            document.body.append(result);
            parent.postMessage({ type: 'hasPreviewContent' }, '*');
          } else {
            console.log('Result:', result);
          }
        }
      } else {
        const __execTime = performance.now() - __execStart;
        parent.postMessage({ type: 'timing', execTime: __execTime }, '*');
      }`
    : `
      const __execStart = performance.now();
      ${jsCode}
      const __execTime = performance.now() - __execStart;
      parent.postMessage({ type: 'timing', execTime: __execTime }, '*');`

  if (useSeparateScripts) {
    return `<!DOCTYPE html>
<html>
<head>
  <style>:root { color-scheme: ${colorScheme} }</style>
  <style>${cssContent}</style>
  ${importMapScript}
</head>
<body>
  ${htmlContent}
  <script>${parentBindingsScript}
${TJS_RUNTIME_STUB}
  </script>
  <script type="module">
    ${importStatements.join('\n    ')}
${CONSOLE_CAPTURE_SCRIPT}

    const __childrenBefore = document.body.children.length;
    try {${executionCode}
      if (document.body.children.length > __childrenBefore) {
        parent.postMessage({ type: 'hasPreviewContent' }, '*');
      }
    } catch (e) {
      parent.postMessage({ type: 'error', message: e.message }, '*');
    }
  </script>
</body>
</html>`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <style>:root { color-scheme: ${colorScheme} }</style>
  <style>${cssContent}</style>
  ${importMapScript}
</head>
<body>
  ${htmlContent}
  <script type="module">${parentBindingsScript}
${TJS_RUNTIME_STUB}
${CONSOLE_CAPTURE_SCRIPT}

    const __childrenBefore = document.body.children.length;
    try {${executionCode}
      if (document.body.children.length > __childrenBefore) {
        parent.postMessage({ type: 'hasPreviewContent' }, '*');
      }
    } catch (e) {
      parent.postMessage({ type: 'error', message: e.message }, '*');
    }
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Iframe message handler
// ---------------------------------------------------------------------------

export interface IframeMessageCallbacks {
  onConsole: (message: string) => void
  onTiming: (execTime: number) => void
  onPreviewContent: () => void
  onError: (message: string) => void
}

/**
 * Create a message event handler for iframe postMessage communication.
 * Returns the handler function (caller is responsible for addEventListener/removeEventListener).
 */
export function createIframeMessageHandler(
  callbacks: IframeMessageCallbacks
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (event.data?.type === 'console') {
      callbacks.onConsole(event.data.message)
    } else if (event.data?.type === 'timing') {
      callbacks.onTiming(event.data.execTime)
    } else if (event.data?.type === 'hasPreviewContent') {
      callbacks.onPreviewContent()
    } else if (event.data?.type === 'error') {
      callbacks.onError(event.data.message)
    }
  }
}

// ---------------------------------------------------------------------------
// Console rendering
// ---------------------------------------------------------------------------

/**
 * Render console messages with clickable line references.
 * Parses patterns like "at line X", "line X:", "Line X", ":X:Y" (line:col).
 */
export function renderConsoleMessages(
  messages: string[],
  consoleEl: HTMLElement,
  goToLine: (line: number, col: number) => void
): void {
  const linePattern =
    /(?:at line |line |Line )(\d+)(?:[:,]?\s*(?:column |col )?(\d+))?|:(\d+):(\d+)/g

  const html = messages
    .map((msg) => {
      const escaped = msg
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      return escaped.replace(linePattern, (match, l1, c1, l2, c2) => {
        const line = l1 || l2
        const col = c1 || c2 || '1'
        return `<span class="clickable-line" data-line="${line}" data-col="${col}">${match}</span>`
      })
    })
    .join('\n')

  consoleEl.innerHTML = html
  consoleEl.scrollTop = consoleEl.scrollHeight

  consoleEl.querySelectorAll('.clickable-line').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement
      const line = parseInt(target.dataset.line || '0', 10)
      const col = parseInt(target.dataset.col || '1', 10)
      if (line > 0) {
        goToLine(line, col)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Test results rendering
// ---------------------------------------------------------------------------

/**
 * Render test results HTML with clickable error links and editor gutter markers.
 * Returns pass/fail counts so callers can update tab indicators.
 */
export function renderTestResults(
  tests: any[],
  outputEl: HTMLElement,
  editor: CodeMirror,
  goToLine: (line: number) => void
): { passed: number; failed: number } {
  if (!tests || tests.length === 0) {
    outputEl.textContent = 'No tests defined'
    editor.clearMarkers()
    return { passed: 0, failed: 0 }
  }

  const passed = tests.filter((t: any) => t.passed).length
  const failed = tests.filter((t: any) => !t.passed).length

  // Set gutter markers for failed tests
  const failedTests = tests.filter((t: any) => !t.passed && t.line)
  if (failedTests.length > 0) {
    editor.setMarkers(
      failedTests.map((t: any) => ({
        line: t.line,
        message: t.error || t.description,
        severity: 'error' as const,
      }))
    )
  } else {
    editor.clearMarkers()
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

  outputEl.innerHTML = html

  // Add click handlers for clickable errors
  outputEl.querySelectorAll('.clickable-error').forEach((el) => {
    el.addEventListener('click', (e) => {
      const line = parseInt(
        (e.currentTarget as HTMLElement).dataset.line || '0',
        10
      )
      if (line > 0) {
        goToLine(line)
      }
    })
  })

  return { passed, failed }
}

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

/** Format execution time as human-readable string (μs for <1ms, ms otherwise) */
export function formatExecTime(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : `${ms.toFixed(2)}ms`
}

// ---------------------------------------------------------------------------
// Shared CSS styles
// ---------------------------------------------------------------------------

/**
 * Shared playground CSS styles. Spread into each playground's styleSpec.
 *
 * Class names that differ between playgrounds (e.g. .tjs-toolbar vs .ts-toolbar,
 * .tjs-main vs .ts-main) are NOT included here - those stay in each playground.
 */
export const sharedPlaygroundStyles: Record<string, Record<string, string>> = {
  ':host': {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    flex: '1 1 auto',
    background: 'var(--background, #fff)',
    color: 'var(--text-color, #1f2937)',
    fontFamily: 'system-ui, sans-serif',
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

  ':host tosi-tabs > [name]': {
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
    padding: '0',
    margin: '0',
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
}
