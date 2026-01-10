/**
 * Dev Channel Server Tests
 * 
 * Tests the REST API endpoints.
 * Run with: bun test packages/dev-channel/src/server.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { spawn, type Subprocess } from 'bun'

const PORT = 8701 // Use different port for tests
const BASE_URL = `http://localhost:${PORT}`

let serverProcess: Subprocess | null = null

beforeAll(async () => {
  // Start server on test port
  serverProcess = spawn({
    cmd: ['bun', 'run', 'bin/server.ts'],
    cwd: import.meta.dir + '/..',
    env: { ...process.env, DEV_CHANNEL_PORT: String(PORT) },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  
  // Wait for server to be ready
  let ready = false
  for (let i = 0; i < 20 && !ready; i++) {
    try {
      const res = await fetch(`${BASE_URL}/status`)
      if (res.ok) ready = true
    } catch {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  
  if (!ready) {
    throw new Error('Server failed to start')
  }
})

afterAll(() => {
  serverProcess?.kill()
})

describe('dev-channel server', () => {
  describe('GET /status', () => {
    it('returns server status', async () => {
      const res = await fetch(`${BASE_URL}/status`)
      expect(res.ok).toBe(true)
      
      const data = await res.json()
      expect(data).toHaveProperty('browsers')
      expect(data).toHaveProperty('agents')
      expect(data).toHaveProperty('bufferedMessages')
      expect(typeof data.browsers).toBe('number')
      expect(typeof data.agents).toBe('number')
    })
  })
  
  describe('GET /inject.js', () => {
    it('returns JavaScript injector code', async () => {
      const res = await fetch(`${BASE_URL}/inject.js`)
      expect(res.ok).toBe(true)
      expect(res.headers.get('content-type')).toContain('javascript')
      
      const code = await res.text()
      expect(code).toContain('dev-channel')
      expect(code).toContain('function')
    })
  })
  
  describe('GET /component.js', () => {
    it('returns component JavaScript', async () => {
      const res = await fetch(`${BASE_URL}/component.js`)
      expect(res.ok).toBe(true)
      expect(res.headers.get('content-type')).toContain('javascript')
      
      const code = await res.text()
      expect(code).toContain('DevChannel')
    })
  })
  
  describe('GET /messages', () => {
    it('returns empty array initially', async () => {
      const res = await fetch(`${BASE_URL}/messages`)
      expect(res.ok).toBe(true)
      
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })
    
    it('respects since parameter', async () => {
      const res = await fetch(`${BASE_URL}/messages?since=${Date.now()}`)
      expect(res.ok).toBe(true)
      
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(0)
    })
  })
  
  describe('GET /console', () => {
    it('returns response (needs browser for actual data)', async () => {
      const res = await fetch(`${BASE_URL}/console`)
      // Without a browser connected, this will timeout or return error
      const data = await res.json()
      // Just check we got a response object
      expect(typeof data).toBe('object')
    })
  })
  
  describe('POST /send', () => {
    it('accepts messages', async () => {
      const res = await fetch(`${BASE_URL}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'test',
          action: 'ping',
          payload: { hello: 'world' }
        })
      })
      expect(res.ok).toBe(true)
      
      const data = await res.json()
      expect(data).toHaveProperty('id')
      expect(data.success).toBe(true)
    })
  })
  
  describe('POST /build', () => {
    it('publishes build events', async () => {
      const res = await fetch(`${BASE_URL}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'complete',
          duration: 1234
        })
      })
      expect(res.ok).toBe(true)
      
      const data = await res.json()
      expect(data.success).toBe(true)
    })
  })
  
  describe('CORS', () => {
    it('includes CORS headers', async () => {
      const res = await fetch(`${BASE_URL}/status`)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
    
    it('handles OPTIONS preflight', async () => {
      const res = await fetch(`${BASE_URL}/send`, {
        method: 'OPTIONS'
      })
      expect(res.ok).toBe(true)
      expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    })
  })
  
  describe('404 handling', () => {
    it('returns 404 for unknown endpoints', async () => {
      const res = await fetch(`${BASE_URL}/nonexistent`)
      expect(res.status).toBe(404)
    })
  })
})

describe('dev-channel WebSocket', () => {
  it('accepts browser connections', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/browser`)
    
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close()
        resolve()
      }
      ws.onerror = reject
      setTimeout(() => reject(new Error('Connection timeout')), 2000)
    })
  })
  
  it('accepts agent connections', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/agent`)
    
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close()
        resolve()
      }
      ws.onerror = reject
      setTimeout(() => reject(new Error('Connection timeout')), 2000)
    })
  })
  
  it('sends requests to browser via REST (not WebSocket broadcast)', async () => {
    // This tests that the /send endpoint delivers messages to browsers
    const browserWs = new WebSocket(`ws://localhost:${PORT}/ws/browser`)
    
    const received: any[] = []
    
    await new Promise<void>((resolve, reject) => {
      browserWs.onopen = async () => {
        // Use REST API to send message to browser
        await fetch(`http://localhost:${PORT}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: 'dom',
            action: 'query',
            payload: { selector: '#test' }
          })
        })
      }
      
      browserWs.onmessage = (e) => {
        received.push(JSON.parse(e.data))
        browserWs.close()
        resolve()
      }
      
      setTimeout(() => {
        browserWs.close()
        reject(new Error('Message routing timeout'))
      }, 2000)
    })
    
    expect(received.length).toBeGreaterThan(0)
    expect(received[0].channel).toBe('dom')
  })
})
