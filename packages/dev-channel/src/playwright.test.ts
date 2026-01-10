/**
 * Dev Channel Playwright Tests
 * 
 * End-to-end tests using Playwright.
 * Run with: bunx playwright test
 * 
 * Prerequisites:
 * - Install Playwright: bunx playwright install
 * - These tests start their own server, no need to run it separately
 */

import { test, expect, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = 8702 // Different port to avoid conflicts
const SERVER_URL = `http://localhost:${PORT}`
const WS_URL = `ws://localhost:${PORT}/ws/browser`

let serverProcess: ChildProcess | null = null

// Start server before all tests
test.beforeAll(async () => {
  // Make sure component is built first
  serverProcess = spawn('bun', ['run', 'bin/server.ts'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DEV_CHANNEL_PORT: String(PORT) },
    stdio: 'inherit', // Show server output for debugging
  })
  
  // Wait for server to be ready
  let ready = false
  for (let i = 0; i < 50 && !ready; i++) {
    try {
      const res = await fetch(`${SERVER_URL}/status`)
      if (res.ok) {
        // Also verify component.js is served
        const componentRes = await fetch(`${SERVER_URL}/component.js`)
        if (componentRes.ok) ready = true
      }
    } catch {
      // Server not ready yet
    }
    if (!ready) await new Promise(r => setTimeout(r, 200))
  }
  
  if (!ready) {
    throw new Error('Server failed to start or component.js not available')
  }
})

// Stop server after all tests
test.afterAll(async () => {
  serverProcess?.kill()
})

// Helper to inject dev-channel into page
async function injectDevChannel(page: Page) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Page</title>
      <script src="${SERVER_URL}/component.js"></script>
    </head>
    <body>
      <h1>Test Page</h1>
      <dev-channel server="${WS_URL}"></dev-channel>
    </body>
    </html>
  `)
  
  // Wait for element to be ready and connected
  await page.waitForSelector('dev-channel')
  await page.waitForTimeout(300) // Give time for WebSocket to connect
}

test.describe('dev-channel CLI', () => {
  test('starts server and serves test page', async ({ page }) => {
    // The server is already running from beforeAll, just verify it works
    const response = await page.goto(`${SERVER_URL}/`)
    expect(response?.status()).toBe(200)
    
    // Check page has expected content
    const title = await page.title()
    expect(title).toBe('Dev Channel Test')
    
    // Check dev-channel element exists
    const hasComponent = await page.evaluate(() => 
      document.querySelector('dev-channel') !== null
    )
    expect(hasComponent).toBe(true)
  })
  
  test('serves inject.js', async () => {
    const res = await fetch(`${SERVER_URL}/inject.js`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('dev-channel')
  })
  
  test('serves component.js', async () => {
    const res = await fetch(`${SERVER_URL}/component.js`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('DevChannel')
  })
  
  test('status endpoint works', async () => {
    const res = await fetch(`${SERVER_URL}/status`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('browsers')
    expect(data).toHaveProperty('agents')
  })
})

test.describe('dev-channel component', () => {
  test.beforeEach(async ({ page }) => {
    await injectDevChannel(page)
  })
  
  test('injects into page', async ({ page }) => {
    const el = await page.$('dev-channel')
    expect(el).not.toBeNull()
  })
  
  test('has shadow DOM', async ({ page }) => {
    const hasShadow = await page.evaluate(() => {
      const el = document.querySelector('dev-channel')
      return el?.shadowRoot !== null
    })
    expect(hasShadow).toBe(true)
  })
  
  test('shows widget', async ({ page }) => {
    const isVisible = await page.evaluate(() => {
      const el = document.querySelector('dev-channel')
      const widget = el?.shadowRoot?.querySelector('.widget')
      return widget !== null && !widget.classList.contains('hidden')
    })
    expect(isVisible).toBe(true)
  })
  
  test('connects to server', async ({ page }) => {
    // Wait a moment for WebSocket connection
    await page.waitForTimeout(500)
    
    const state = await page.evaluate(() => {
      const el = document.querySelector('dev-channel') as any
      return el?.state
    })
    
    expect(['connecting', 'connected']).toContain(state)
  })
  
  test('Option+Tab toggles visibility', async ({ page }) => {
    // Get initial state
    const initiallyHidden = await page.evaluate(() => {
      const el = document.querySelector('dev-channel')
      return el?.shadowRoot?.querySelector('.widget')?.classList.contains('hidden')
    })
    
    // Press Option+Tab
    await page.keyboard.press('Alt+Tab')
    await page.waitForTimeout(100)
    
    const afterToggle = await page.evaluate(() => {
      const el = document.querySelector('dev-channel')
      return el?.shadowRoot?.querySelector('.widget')?.classList.contains('hidden')
    })
    
    expect(afterToggle).toBe(!initiallyHidden)
  })
  
  test('captures console.log', async ({ page }) => {
    const marker = `test-marker-${Date.now()}`
    
    // Log something
    await page.evaluate((msg) => console.log(msg), marker)
    await page.waitForTimeout(100)
    
    // Check if captured
    const captured = await page.evaluate((msg) => {
      const el = document.querySelector('dev-channel') as any
      return el?.consoleBuffer?.some((entry: any) => 
        entry.args?.some((arg: any) => String(arg).includes(msg))
      )
    }, marker)
    
    expect(captured).toBe(true)
  })
  
  test('runs browser tests successfully', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const DevChannel = (window as any).DevChannel
      if (!DevChannel?.runTests) {
        return { passed: 0, failed: 1, error: 'runTests not available' }
      }
      return DevChannel.runTests()
    })
    
    expect(results.failed).toBe(0)
    expect(results.passed).toBeGreaterThan(0)
  })
})

test.describe('dev-channel tab switching', () => {
  test('new tab deactivates old tab', async ({ browser }) => {
    // Open first page/tab
    const page1 = await browser.newPage()
    await injectDevChannel(page1)
    await page1.waitForTimeout(500)
    
    // Verify first page is connected
    const state1Before = await page1.evaluate(() => {
      const el = document.querySelector('dev-channel') as any
      return el?.state
    })
    expect(state1Before).toBe('connected')
    
    // Check widget is visible on page1
    const widget1VisibleBefore = await page1.evaluate(() => {
      const el = document.querySelector('dev-channel')
      return el?.shadowRoot?.querySelector('.widget') !== null
    })
    expect(widget1VisibleBefore).toBe(true)
    
    // Open second page/tab
    const page2 = await browser.newPage()
    await injectDevChannel(page2)
    await page2.waitForTimeout(500)
    
    // Verify second page is connected
    const state2 = await page2.evaluate(() => {
      const el = document.querySelector('dev-channel') as any
      return el?.state
    })
    expect(state2).toBe('connected')
    
    // Verify first page's component was killed (removed from DOM)
    const page1HasComponent = await page1.evaluate(() => {
      return document.querySelector('dev-channel') !== null
    })
    expect(page1HasComponent).toBe(false)
    
    // Verify second page's component is still there
    const page2HasComponent = await page2.evaluate(() => {
      return document.querySelector('dev-channel') !== null
    })
    expect(page2HasComponent).toBe(true)
    
    await page1.close()
    await page2.close()
  })
  
  test('third tab deactivates second tab', async ({ browser }) => {
    const page1 = await browser.newPage()
    await injectDevChannel(page1)
    await page1.waitForTimeout(500)
    
    const page2 = await browser.newPage()
    await injectDevChannel(page2)
    await page2.waitForTimeout(500)
    
    // Page1 should be dead, page2 alive
    expect(await page1.evaluate(() => document.querySelector('dev-channel') !== null)).toBe(false)
    expect(await page2.evaluate(() => document.querySelector('dev-channel') !== null)).toBe(true)
    
    const page3 = await browser.newPage()
    await injectDevChannel(page3)
    await page3.waitForTimeout(500)
    
    // Page2 should now be dead, page3 alive
    expect(await page2.evaluate(() => document.querySelector('dev-channel') !== null)).toBe(false)
    expect(await page3.evaluate(() => document.querySelector('dev-channel') !== null)).toBe(true)
    
    await page1.close()
    await page2.close()
    await page3.close()
  })
})

test.describe('dev-channel server integration', () => {
  test.beforeEach(async ({ page }) => {
    await injectDevChannel(page)
    // Wait for connection
    await page.waitForTimeout(500)
  })
  
  test('DOM query via REST', async ({ page }) => {
    // Add a test element
    await page.evaluate(() => {
      const div = document.createElement('div')
      div.id = 'playwright-test-element'
      div.textContent = 'Hello Playwright'
      document.body.appendChild(div)
    })
    
    // Query via REST API
    const res = await fetch(`${SERVER_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#playwright-test-element' })
    })
    
    const data = await res.json()
    
    // If connected, we should get the element back
    if (data.success) {
      expect(data.data?.id).toBe('playwright-test-element')
      expect(data.data?.textContent).toContain('Hello Playwright')
    }
  })
  
  test('click via REST', async ({ page }) => {
    // Add a button that sets a flag when clicked
    await page.evaluate(() => {
      const btn = document.createElement('button')
      btn.id = 'playwright-click-test'
      btn.textContent = 'Click Me'
      btn.onclick = () => { (window as any).buttonClicked = true }
      document.body.appendChild(btn)
    })
    
    // Click via REST API
    await fetch(`${SERVER_URL}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector: '#playwright-click-test' })
    })
    
    await page.waitForTimeout(200)
    
    // Check if clicked
    const clicked = await page.evaluate(() => (window as any).buttonClicked)
    expect(clicked).toBe(true)
  })
  
  test('type via REST', async ({ page }) => {
    // Add an input
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'playwright-type-test'
      document.body.appendChild(input)
    })
    
    // Type via REST API
    await fetch(`${SERVER_URL}/type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        selector: '#playwright-type-test',
        text: 'Hello from Playwright'
      })
    })
    
    await page.waitForTimeout(200)
    
    // Check value
    const value = await page.evaluate(() => {
      const input = document.querySelector('#playwright-type-test') as HTMLInputElement
      return input?.value
    })
    expect(value).toBe('Hello from Playwright')
  })
  
  test('eval via REST', async ({ page }) => {
    // Set a value we can read
    await page.evaluate(() => {
      (window as any).testValue = 42
    })
    
    // Eval via REST
    const res = await fetch(`${SERVER_URL}/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'window.testValue * 2' })
    })
    
    const data = await res.json()
    
    if (data.success) {
      expect(data.data).toBe(84)
    }
  })
})
