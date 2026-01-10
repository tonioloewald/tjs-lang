/**
 * Dev Channel Client
 * 
 * REST client for agents/CLI to communicate with the dev-channel server.
 * This is what Claude Code or other agents would use.
 */

import type {
  DevResponse,
  DomElement,
  ConsoleEntry,
  RecordingSession,
  SyntheticEventRequest,
  DevChannelTest,
  TestStep,
  TestResult,
  StepResult,
  TestAssertion,
} from './types'

export class DevChannelClient {
  private baseUrl: string
  
  constructor(serverUrl = 'http://localhost:8700') {
    this.baseUrl = serverUrl
  }
  
  // ==========================================
  // Low-level API
  // ==========================================
  
  async status(): Promise<{ browsers: number; agents: number; bufferedMessages: number }> {
    const res = await fetch(`${this.baseUrl}/status`)
    return res.json()
  }
  
  async send(channel: string, action: string, payload: any): Promise<{ success: boolean; id: string }> {
    const res = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, action, payload }),
    })
    return res.json()
  }
  
  async request(channel: string, action: string, payload: any, timeout = 5000): Promise<DevResponse> {
    const res = await fetch(`${this.baseUrl}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, action, payload, timeout }),
    })
    return res.json()
  }
  
  // ==========================================
  // DOM Queries
  // ==========================================
  
  async query(selector: string): Promise<DomElement | null> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, all: false }),
    })
    const response: DevResponse = await res.json()
    return response.success ? response.data : null
  }
  
  async queryAll(selector: string): Promise<DomElement[]> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, all: true }),
    })
    const response: DevResponse = await res.json()
    return response.success ? response.data : []
  }
  
  // ==========================================
  // Console
  // ==========================================
  
  async getConsole(since = 0): Promise<ConsoleEntry[]> {
    const res = await fetch(`${this.baseUrl}/console?since=${since}`)
    const response: DevResponse = await res.json()
    return response.success ? response.data : []
  }
  
  async clearConsole(): Promise<void> {
    await this.request('console', 'clear', {})
  }
  
  // ==========================================
  // Eval
  // ==========================================
  
  async eval(code: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Eval failed')
    }
    return response.data
  }
  
  // ==========================================
  // Interactions
  // ==========================================
  
  async click(selector: string, options?: { x?: number; y?: number }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, options }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || `Click failed on ${selector}`)
    }
  }
  
  async type(selector: string, text: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, text }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || `Type failed on ${selector}`)
    }
  }
  
  async dispatch(event: SyntheticEventRequest): Promise<void> {
    const response = await this.request('events', 'dispatch', event)
    if (!response.success) {
      throw new Error(response.error || 'Dispatch failed')
    }
  }
  
  async focus(selector: string): Promise<void> {
    await this.dispatch({ selector, event: 'focus' })
  }
  
  async blur(selector: string): Promise<void> {
    await this.dispatch({ selector, event: 'blur' })
  }
  
  async press(key: string, modifiers?: { alt?: boolean; ctrl?: boolean; meta?: boolean; shift?: boolean }): Promise<void> {
    await this.dispatch({
      selector: 'body',
      event: 'keydown',
      options: {
        key,
        altKey: modifiers?.alt,
        ctrlKey: modifiers?.ctrl,
        metaKey: modifiers?.meta,
        shiftKey: modifiers?.shift,
      },
    })
  }
  
  // ==========================================
  // Navigation
  // ==========================================
  
  async refresh(hard = false): Promise<void> {
    const res = await fetch(`${this.baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hard }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Refresh failed')
    }
  }
  
  async navigate(url: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Navigate failed')
    }
  }
  
  async getLocation(): Promise<{ url: string; title: string; pathname: string; search: string; hash: string }> {
    const res = await fetch(`${this.baseUrl}/location`)
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Get location failed')
    }
    return response.data
  }
  
  // ==========================================
  // Recording
  // ==========================================
  
  async startRecording(name: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/recording/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Start recording failed')
    }
    return response.data.sessionId
  }
  
  async stopRecording(): Promise<RecordingSession> {
    const res = await fetch(`${this.baseUrl}/recording/stop`, {
      method: 'POST',
    })
    const response: DevResponse = await res.json()
    if (!response.success) {
      throw new Error(response.error || 'Stop recording failed')
    }
    return response.data
  }
  
  async replayRecording(session: RecordingSession, speed = 1): Promise<void> {
    const response = await this.request('recording', 'replay', { session, speed })
    if (!response.success) {
      throw new Error(response.error || 'Replay failed')
    }
  }
  
  // ==========================================
  // Build Events
  // ==========================================
  
  async publishBuild(event: { type: 'start' | 'complete' | 'error' | 'warning'; message?: string; file?: string; line?: number }): Promise<void> {
    await fetch(`${this.baseUrl}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })
  }
  
  // ==========================================
  // Event Watching
  // ==========================================
  
  async watchEvents(options: { selector?: string; events: string[] }): Promise<string> {
    const response = await this.request('events', 'watch', options)
    if (!response.success) {
      throw new Error(response.error || 'Watch failed')
    }
    return response.data.watchId
  }
  
  async unwatchEvents(watchId: string): Promise<void> {
    const response = await this.request('events', 'unwatch', { watchId })
    if (!response.success) {
      throw new Error(response.error || 'Unwatch failed')
    }
  }
}

// Default export for easy usage
export const devChannel = new DevChannelClient()
