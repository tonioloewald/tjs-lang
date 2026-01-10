/**
 * Dev Channel Browser Tests
 * 
 * These tests run inside the browser via the dev-channel widget.
 * They test the component's functionality from the browser's perspective.
 * 
 * Usage:
 * 1. Inject the dev-channel widget into any page
 * 2. Open browser console
 * 3. Run: DevChannel.runTests()
 * 
 * Or from an agent:
 * POST /eval { code: "DevChannel.runTests()" }
 */

interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration: number
}

interface TestSuite {
  name: string
  tests: TestResult[]
  passed: number
  failed: number
  duration: number
}

type TestFn = () => void | Promise<void>

class BrowserTestRunner {
  private tests: Array<{ name: string; fn: TestFn }> = []
  
  test(name: string, fn: TestFn) {
    this.tests.push({ name, fn })
  }
  
  async run(): Promise<TestSuite> {
    const results: TestResult[] = []
    const suiteStart = performance.now()
    
    console.log('%c[dev-channel tests] Starting...', 'color: #6366f1; font-weight: bold')
    
    for (const { name, fn } of this.tests) {
      const start = performance.now()
      try {
        await fn()
        const duration = performance.now() - start
        results.push({ name, passed: true, duration })
        console.log(`  %c✓ ${name}%c (${duration.toFixed(1)}ms)`, 'color: #22c55e', 'color: #666')
      } catch (err) {
        const duration = performance.now() - start
        const error = err instanceof Error ? err.message : String(err)
        results.push({ name, passed: false, error, duration })
        console.log(`  %c✗ ${name}%c: ${error}`, 'color: #ef4444', 'color: #666')
      }
    }
    
    const suite: TestSuite = {
      name: 'dev-channel browser tests',
      tests: results,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      duration: performance.now() - suiteStart
    }
    
    const color = suite.failed === 0 ? '#22c55e' : '#ef4444'
    console.log(
      `%c[dev-channel tests] ${suite.passed}/${results.length} passed (${suite.duration.toFixed(1)}ms)`,
      `color: ${color}; font-weight: bold`
    )
    
    return suite
  }
}

function assert(condition: boolean, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

function assertExists(value: unknown, message = 'Value should exist') {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}

/**
 * Create and register all browser tests
 */
export function createBrowserTests(): BrowserTestRunner {
  const runner = new BrowserTestRunner()
  
  // ==========================================
  // Component Tests
  // ==========================================
  
  runner.test('dev-channel element exists', () => {
    const el = document.querySelector('dev-channel')
    assertExists(el, 'dev-channel element should be in DOM')
  })
  
  runner.test('component has shadow root', () => {
    const el = document.querySelector('dev-channel') as HTMLElement
    assertExists(el?.shadowRoot, 'Component should have shadow root')
  })
  
  runner.test('widget is visible', () => {
    const el = document.querySelector('dev-channel') as HTMLElement
    const widget = el?.shadowRoot?.querySelector('.widget')
    assertExists(widget, 'Widget should exist')
    const style = getComputedStyle(el)
    assert(style.display !== 'none', 'Widget should be visible')
  })
  
  runner.test('status indicator exists', () => {
    const el = document.querySelector('dev-channel') as HTMLElement
    const status = el?.shadowRoot?.querySelector('.status')
    assertExists(status, 'Status indicator should exist')
  })
  
  runner.test('control buttons exist', () => {
    const el = document.querySelector('dev-channel') as HTMLElement
    const buttons = el?.shadowRoot?.querySelectorAll('.btn')
    assert((buttons?.length || 0) >= 3, 'Should have at least 3 control buttons')
  })
  
  runner.test('bookmark link exists', () => {
    const el = document.querySelector('dev-channel') as HTMLElement
    const link = el?.shadowRoot?.querySelector('a[href^="javascript:"]')
    assertExists(link, 'Bookmark link should exist')
  })
  
  // ==========================================
  // Console Interception Tests
  // ==========================================
  
  runner.test('console.log is intercepted', async () => {
    const testMsg = `test-${Date.now()}`
    console.log(testMsg)
    
    // Give it a moment to buffer
    await new Promise(r => setTimeout(r, 50))
    
    const el = document.querySelector('dev-channel') as any
    const buffer = el?.consoleBuffer || []
    const found = buffer.some((entry: any) => 
      entry.args?.some((arg: any) => String(arg).includes(testMsg))
    )
    assert(found, 'Console log should be captured in buffer')
  })
  
  runner.test('console.error is intercepted', async () => {
    const testMsg = `error-test-${Date.now()}`
    console.error(testMsg)
    
    await new Promise(r => setTimeout(r, 50))
    
    const el = document.querySelector('dev-channel') as any
    const buffer = el?.consoleBuffer || []
    const found = buffer.some((entry: any) => 
      entry.level === 'error' && entry.args?.some((arg: any) => String(arg).includes(testMsg))
    )
    assert(found, 'Console error should be captured with correct level')
  })
  
  // ==========================================
  // DOM Query Tests
  // ==========================================
  
  runner.test('DOM query returns element info', async () => {
    // Create a test element
    const testEl = document.createElement('div')
    testEl.id = 'dev-channel-test-element'
    testEl.className = 'test-class'
    testEl.textContent = 'Test Content'
    document.body.appendChild(testEl)
    
    try {
      const el = document.querySelector('dev-channel') as any
      if (el?.handleDomQuery) {
        const result = el.handleDomQuery({ selector: '#dev-channel-test-element' })
        assertExists(result, 'Query should return result')
        assertEqual(result.id, 'dev-channel-test-element')
        assertEqual(result.className, 'test-class')
      }
    } finally {
      testEl.remove()
    }
  })
  
  runner.test('DOM queryAll returns multiple elements', async () => {
    // Create test elements
    const container = document.createElement('div')
    container.innerHTML = `
      <span class="dev-channel-multi-test">One</span>
      <span class="dev-channel-multi-test">Two</span>
      <span class="dev-channel-multi-test">Three</span>
    `
    document.body.appendChild(container)
    
    try {
      const el = document.querySelector('dev-channel') as any
      if (el?.handleDomQuery) {
        const result = el.handleDomQuery({ 
          selector: '.dev-channel-multi-test',
          all: true 
        })
        assert(Array.isArray(result), 'QueryAll should return array')
        assertEqual(result.length, 3, 'Should find 3 elements')
      }
    } finally {
      container.remove()
    }
  })
  
  // ==========================================
  // Synthetic Event Tests
  // ==========================================
  
  runner.test('click dispatches event', async () => {
    const testEl = document.createElement('button')
    testEl.id = 'dev-channel-click-test'
    document.body.appendChild(testEl)
    
    let clicked = false
    testEl.addEventListener('click', () => { clicked = true })
    
    try {
      const el = document.querySelector('dev-channel') as any
      if (el?.handleSyntheticEvent) {
        await el.handleSyntheticEvent({
          selector: '#dev-channel-click-test',
          event: 'click'
        })
        assert(clicked, 'Click event should have fired')
      }
    } finally {
      testEl.remove()
    }
  })
  
  runner.test('type enters text into input', async () => {
    const testEl = document.createElement('input')
    testEl.id = 'dev-channel-type-test'
    document.body.appendChild(testEl)
    
    try {
      const el = document.querySelector('dev-channel') as any
      if (el?.handleSyntheticEvent) {
        await el.handleSyntheticEvent({
          selector: '#dev-channel-type-test',
          event: 'input',
          options: { value: 'Hello World' }
        })
        assertEqual(testEl.value, 'Hello World', 'Input should have typed text')
      }
    } finally {
      testEl.remove()
    }
  })
  
  // ==========================================
  // Keyboard Shortcut Tests
  // ==========================================
  
  runner.test('Option+Tab toggles visibility', async () => {
    const el = document.querySelector('dev-channel') as any
    const widget = el?.shadowRoot?.querySelector('.widget')
    const wasHidden = widget?.classList.contains('hidden')
    
    // Simulate Option+Tab
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      altKey: true,
      bubbles: true
    }))
    
    await new Promise(r => setTimeout(r, 100))
    
    const isHidden = widget?.classList.contains('hidden')
    assert(wasHidden !== isHidden, 'Visibility should have toggled')
    
    // Toggle back
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      altKey: true,
      bubbles: true
    }))
  })
  
  // ==========================================
  // Recording Tests
  // ==========================================
  
  runner.test('recording can start and stop', async () => {
    const el = document.querySelector('dev-channel') as any
    
    if (el?.startRecording && el?.stopRecording) {
      const sessionId = el.startRecording('test-recording')
      assertExists(sessionId, 'Should return session ID')
      
      // Click something
      document.body.click()
      
      await new Promise(r => setTimeout(r, 100))
      
      const session = el.stopRecording()
      assertExists(session, 'Should return recording session')
      assert(session.events?.length >= 0, 'Session should have events array')
    }
  })
  
  // ==========================================
  // Connection Tests
  // ==========================================
  
  runner.test('WebSocket connection state is tracked', () => {
    const el = document.querySelector('dev-channel') as any
    const state = el?.state
    assert(
      ['disconnected', 'connecting', 'connected', 'paused'].includes(state),
      `State should be valid, got: ${state}`
    )
  })
  
  return runner
}

/**
 * Run all browser tests
 * Call this from console or via eval endpoint
 */
export async function runBrowserTests(): Promise<TestSuite> {
  const runner = createBrowserTests()
  return runner.run()
}

// Attach to window for easy access
if (typeof window !== 'undefined') {
  (window as any).DevChannelTests = {
    run: runBrowserTests,
    createRunner: createBrowserTests
  }
}
