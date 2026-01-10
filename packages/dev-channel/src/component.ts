/**
 * Dev Channel Browser Component
 * 
 * A floating widget that:
 * - Connects to local dev-channel server via WebSocket
 * - Exposes DOM query/manipulation capabilities
 * - Captures console output
 * - Watches and dispatches DOM events
 * - Records interaction sessions
 * 
 * Security:
 * - Always shows itself when channel becomes active (no silent snooping)
 * - User can pause/resume/kill the channel
 * - Option+Tab toggles visibility (but active state always shows briefly)
 * - Localhost only by default
 */

import type {
  DevMessage,
  DevResponse,
  DomElement,
  DomQueryRequest,
  ConsoleEntry,
  RecordedEvent,
  EventWatchRequest,
  SyntheticEventRequest,
  RecordingSession,
} from './types'

// Generate unique IDs
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// Get a stable CSS selector path to an element
function getSelector(el: Element): string {
  if (el.id) return `#${el.id}`
  
  const parts: string[] = []
  let current: Element | null = el
  
  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase()
    
    if (current.id) {
      selector = `#${current.id}`
      parts.unshift(selector)
      break
    }
    
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.')
      if (classes) selector += `.${classes}`
    }
    
    // Add nth-child if needed for uniqueness
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName)
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-child(${index})`
      }
    }
    
    parts.unshift(selector)
    current = current.parentElement
  }
  
  return parts.join(' > ')
}

// Extract element info for serialization
function extractElement(el: Element): DomElement {
  const rect = el.getBoundingClientRect()
  const attrs: Record<string, string> = {}
  
  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value
  }
  
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id,
    className: el.className?.toString() || '',
    textContent: el.textContent?.slice(0, 1000) || '',
    innerText: (el as HTMLElement).innerText?.slice(0, 1000) || '',
    outerHTML: el.outerHTML.slice(0, 5000),
    attributes: attrs,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      toJSON: () => rect,
    },
  }
}

type ChannelState = 'disconnected' | 'connecting' | 'connected' | 'paused'

export class DevChannel extends HTMLElement {
  private ws: WebSocket | null = null
  private state: ChannelState = 'disconnected'
  private consoleBuffer: ConsoleEntry[] = []
  private eventWatchers: Map<string, () => void> = new Map()
  private recording: RecordingSession | null = null
  private originalConsole: Partial<Console> = {}
  private widgetHidden = false
  private serverUrl = 'ws://localhost:8700/ws/browser'
  private browserId = uid() // Unique ID for this browser instance
  private killed = false // Prevents reconnection after kill()
  
  // Pending requests waiting for response
  private pending = new Map<string, { resolve: (r: DevResponse) => void, reject: (e: Error) => void }>()
  
  static get observedAttributes() {
    return ['server', 'hidden']
  }
  
  /**
   * Run browser-side tests
   * Usage: DevChannel.runTests() or from agent: POST /eval { code: "DevChannel.runTests()" }
   */
  static async runTests() {
    const el = document.querySelector('dev-channel') as DevChannel
    if (!el) {
      console.error('[dev-channel] No dev-channel element found. Inject first.')
      return { passed: 0, failed: 1, error: 'No dev-channel element' }
    }
    
    const results: Array<{ name: string; passed: boolean; error?: string }> = []
    
    const test = (name: string, fn: () => void | Promise<void>) => {
      return async () => {
        try {
          await fn()
          results.push({ name, passed: true })
          console.log(`  %c✓ ${name}`, 'color: #22c55e')
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          results.push({ name, passed: false, error })
          console.log(`  %c✗ ${name}: ${error}`, 'color: #ef4444')
        }
      }
    }
    
    console.log('%c[dev-channel] Running tests...', 'color: #6366f1; font-weight: bold')
    
    // Run tests
    await test('element exists', () => {
      if (!document.querySelector('dev-channel')) throw new Error('Missing')
    })()
    
    await test('has shadow root', () => {
      if (!el.shadowRoot) throw new Error('No shadow root')
    })()
    
    await test('widget visible', () => {
      const widget = el.shadowRoot?.querySelector('.widget')
      if (!widget) throw new Error('No widget')
    })()
    
    await test('status indicator', () => {
      const status = el.shadowRoot?.querySelector('.status')
      if (!status) throw new Error('No status')
    })()
    
    await test('control buttons', () => {
      const btns = el.shadowRoot?.querySelectorAll('.btn')
      if (!btns || btns.length < 3) throw new Error(`Expected 3 buttons, got ${btns?.length}`)
    })()
    
    await test('bookmark link', () => {
      const link = el.shadowRoot?.querySelector('a[href^="javascript:"]')
      if (!link) throw new Error('No bookmark link')
    })()
    
    await test('console interception', async () => {
      const marker = `test-${Date.now()}`
      const before = el.consoleBuffer.length
      console.log(marker)
      await new Promise(r => setTimeout(r, 50))
      if (el.consoleBuffer.length <= before) throw new Error('Console not captured')
    })()
    
    await test('DOM query', () => {
      const body = document.querySelector('body')
      if (!body) throw new Error('No body element')
      // Test that extractElement works (used internally)
    })()
    
    await test('connection state valid', () => {
      const valid = ['disconnected', 'connecting', 'connected', 'paused']
      if (!valid.includes(el.state)) throw new Error(`Invalid state: ${el.state}`)
    })()
    
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    const color = failed === 0 ? '#22c55e' : '#ef4444'
    
    console.log(`%c[dev-channel] ${passed}/${results.length} tests passed`, `color: ${color}; font-weight: bold`)
    
    return { passed, failed, results }
  }
  
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }
  
  connectedCallback() {
    this.serverUrl = this.getAttribute('server') || this.serverUrl
    this.render()
    this.setupKeyboardShortcut()
    this.interceptConsole()
    this.connect()
  }
  
  disconnectedCallback() {
    this.killed = true // Prevent any reconnection attempts
    this.disconnect()
    this.restoreConsole()
    this.clearEventWatchers()
  }
  
  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === 'server') {
      this.serverUrl = value
      if (this.state !== 'disconnected') {
        this.disconnect()
        this.connect()
      }
    }
  }
  
  // ==========================================
  // UI Rendering
  // ==========================================
  
  private render() {
    const shadow = this.shadowRoot!
    shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 16px;
          right: 16px;
          z-index: 999999;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
        }
        
        .widget {
          background: #1a1a2e;
          color: #eee;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          overflow: hidden;
          min-width: 200px;
          transition: opacity 0.2s, transform 0.2s;
        }
        
        .widget.hidden {
          opacity: 0;
          transform: scale(0.9) translateY(10px);
          pointer-events: none;
        }
        
        .widget.flash {
          animation: flash 0.5s ease-out;
        }
        
        @keyframes flash {
          0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.8); }
        }
        
        .header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #16213e;
          cursor: move;
          user-select: none;
        }
        
        .status {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
        }
        
        .status.connected { background: #22c55e; }
        .status.connecting { background: #eab308; animation: pulse 1s infinite; }
        .status.paused { background: #f97316; }
        .status.disconnected { background: #ef4444; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .title {
          flex: 1;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .controls {
          display: flex;
          gap: 4px;
        }
        
        .btn {
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          font-size: 14px;
          line-height: 1;
        }
        
        .btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .btn.active { color: #6366f1; }
        .btn.danger:hover { color: #ef4444; }
        
        .body {
          padding: 8px 12px;
          font-size: 11px;
          color: #aaa;
        }
        
        .stats {
          display: flex;
          gap: 12px;
        }
        
        .stat {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .stat-value {
          color: #fff;
          font-weight: 500;
        }
        
        .hint {
          margin-top: 6px;
          font-size: 10px;
          color: #666;
        }
      </style>
      
      <div class="widget ${this.widgetHidden ? 'hidden' : ''}">
        <div class="header">
          <div class="status ${this.state}"></div>
          <div class="title">Dev Channel</div>
          <div class="controls">
            <button class="btn" data-action="pause" title="Pause/Resume">
              ${this.state === 'paused' ? '▶' : '⏸'}
            </button>
            <button class="btn" data-action="hide" title="Hide (Option+Tab)">─</button>
            <button class="btn danger" data-action="kill" title="Kill connection">✕</button>
          </div>
        </div>
        <div class="body">
          <div class="stats">
            <div class="stat">
              <span>Console:</span>
              <span class="stat-value">${this.consoleBuffer.length}</span>
            </div>
            <div class="stat">
              <span>Watchers:</span>
              <span class="stat-value">${this.eventWatchers.size}</span>
            </div>
            ${this.recording ? `
            <div class="stat">
              <span>Recording:</span>
              <span class="stat-value" style="color: #ef4444;">●</span>
            </div>
            ` : ''}
          </div>
          <div class="hint">
            Option+Tab to toggle | 
            <a href="javascript:(function(){fetch('${this.serverUrl.replace('ws:', 'http:').replace('wss:', 'https:').replace('/ws/browser', '')}/inject.js').then(r=>r.text()).then(eval).catch(e=>alert('Dev Channel: Cannot reach server'))})();" 
               style="color: #6366f1; text-decoration: none;"
               title="Drag to bookmarks bar">Bookmark</a>
          </div>
        </div>
      </div>
    `
    
    // Event handlers
    shadow.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action
        if (action === 'pause') this.togglePause()
        if (action === 'hide') this.toggleHidden()
        if (action === 'kill') this.kill()
      })
    })
    
    // Drag support
    this.setupDrag(shadow.querySelector('.header')!)
  }
  
  private setupDrag(handle: Element) {
    let startX = 0, startY = 0, startRight = 0, startBottom = 0
    
    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      this.style.right = `${startRight - dx}px`
      this.style.bottom = `${startBottom - dy}px`
    }
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    
    handle.addEventListener('mousedown', (e: Event) => {
      const me = e as MouseEvent
      startX = me.clientX
      startY = me.clientY
      const style = getComputedStyle(this)
      startRight = parseInt(style.right) || 16
      startBottom = parseInt(style.bottom) || 16
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })
  }
  
  private setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      // Option+Tab to toggle visibility
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault()
        this.toggleHidden()
      }
    })
  }
  
  private flash() {
    const widget = this.shadowRoot?.querySelector('.widget')
    widget?.classList.add('flash')
    setTimeout(() => widget?.classList.remove('flash'), 500)
  }
  
  private show() {
    this.widgetHidden = false
    this.render()
    this.flash()
  }
  
  private toggleHidden() {
    this.widgetHidden = !this.widgetHidden
    this.render()
  }
  
  private togglePause() {
    if (this.state === 'paused') {
      this.state = 'connected'
      this.show() // Always show when resuming
    } else if (this.state === 'connected') {
      this.state = 'paused'
    }
    this.render()
  }
  
  private kill() {
    this.killed = true // Prevent reconnection
    this.restoreConsole()
    this.clearEventWatchers()
    this.disconnect()
    this.remove()
  }
  
  // ==========================================
  // WebSocket Connection
  // ==========================================
  
  private connect() {
    if (this.ws) return
    if (this.killed) return // Don't connect if killed
    
    this.state = 'connecting'
    this.render()
    
    try {
      this.ws = new WebSocket(this.serverUrl)
      
      this.ws.onopen = () => {
        this.state = 'connected'
        this.show() // Always show when connection established
        this.send('system', 'connected', { browserId: this.browserId, url: location.href, title: document.title })
      }
      
      this.ws.onmessage = (e) => {
        if (this.state === 'paused') return
        
        try {
          const msg: DevMessage = JSON.parse(e.data)
          this.handleMessage(msg)
        } catch {
          // Invalid message, ignore
        }
      }
      
      this.ws.onclose = () => {
        this.ws = null
        this.state = 'disconnected'
        this.render()
        // Reconnect after delay (unless killed)
        if (!this.killed) {
          setTimeout(() => this.connect(), 3000)
        }
      }
      
      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch (err) {
      this.state = 'disconnected'
      this.render()
    }
  }
  
  private disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.state = 'disconnected'
    this.pending.forEach(p => p.reject(new Error('Disconnected')))
    this.pending.clear()
  }
  
  private send(channel: string, action: string, payload: any, id?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    
    const msg: DevMessage = {
      id: id || uid(),
      channel,
      action,
      payload,
      timestamp: Date.now(),
      source: 'browser',
    }
    
    this.ws.send(JSON.stringify(msg))
  }
  
  private respond(requestId: string, success: boolean, data?: any, error?: string) {
    const response: DevResponse = {
      id: requestId,
      success,
      data,
      error,
      timestamp: Date.now(),
    }
    this.ws?.send(JSON.stringify(response))
  }
  
  // ==========================================
  // Message Handling
  // ==========================================
  
  private handleMessage(msg: DevMessage) {
    // Always show when receiving commands (no silent snooping)
    if (msg.source === 'agent' || msg.source === 'server') {
      this.show()
    }
    
    switch (msg.channel) {
      case 'system':
        this.handleSystemMessage(msg)
        break
      case 'dom':
        this.handleDomMessage(msg)
        break
      case 'events':
        this.handleEventsMessage(msg)
        break
      case 'console':
        this.handleConsoleMessage(msg)
        break
      case 'eval':
        this.handleEvalMessage(msg)
        break
      case 'recording':
        this.handleRecordingMessage(msg)
        break
      case 'navigation':
        this.handleNavigationMessage(msg)
        break
    }
    
    this.render()
  }
  
  private handleSystemMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    // When we see another browser connect, kill ourselves
    if (action === 'connected' && payload?.browserId && payload.browserId !== this.browserId) {
      this.kill()
    }
  }
  
  private handleNavigationMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    if (action === 'refresh') {
      if (payload.hard) {
        // Hard refresh - bypass cache
        location.reload()
      } else {
        location.reload()
      }
      this.respond(msg.id, true)
    } else if (action === 'goto') {
      location.href = payload.url
      this.respond(msg.id, true)
    } else if (action === 'location') {
      this.respond(msg.id, true, {
        url: location.href,
        title: document.title,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      })
    }
  }
  
  private handleDomMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    if (action === 'query') {
      const req = payload as DomQueryRequest
      try {
        if (req.all) {
          const elements = document.querySelectorAll(req.selector)
          this.respond(msg.id, true, Array.from(elements).map(extractElement))
        } else {
          const el = document.querySelector(req.selector)
          this.respond(msg.id, true, el ? extractElement(el) : null)
        }
      } catch (err: any) {
        this.respond(msg.id, false, null, err.message)
      }
    }
  }
  
  private handleEventsMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    if (action === 'watch') {
      const req = payload as EventWatchRequest
      this.watchEvents(req, msg.id)
    } else if (action === 'unwatch') {
      const unwatcher = this.eventWatchers.get(payload.watchId)
      if (unwatcher) {
        unwatcher()
        this.eventWatchers.delete(payload.watchId)
      }
      this.respond(msg.id, true)
    } else if (action === 'dispatch') {
      this.dispatchSyntheticEvent(payload as SyntheticEventRequest, msg.id)
    }
  }
  
  private handleConsoleMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    if (action === 'get') {
      const since = payload?.since || 0
      const entries = this.consoleBuffer.filter(e => e.timestamp > since)
      this.respond(msg.id, true, entries)
    } else if (action === 'clear') {
      this.consoleBuffer = []
      this.respond(msg.id, true)
    }
  }
  
  private handleEvalMessage(msg: DevMessage) {
    try {
      // Note: eval is dangerous but this is a dev tool for localhost
      const result = eval(msg.payload.code)
      this.respond(msg.id, true, result)
    } catch (err: any) {
      this.respond(msg.id, false, null, err.message)
    }
  }
  
  private handleRecordingMessage(msg: DevMessage) {
    const { action, payload } = msg
    
    if (action === 'start') {
      this.recording = {
        id: uid(),
        name: payload.name || 'Recording',
        startTime: Date.now(),
        events: [],
        consoleEntries: [],
      }
      // Watch common interaction events
      this.watchEvents({
        events: ['click', 'input', 'change', 'keydown', 'submit', 'focus', 'blur'],
      }, `recording-${this.recording.id}`)
      this.respond(msg.id, true, { sessionId: this.recording.id })
    } else if (action === 'stop') {
      if (this.recording) {
        this.recording.endTime = Date.now()
        this.recording.consoleEntries = [...this.consoleBuffer]
        const session = this.recording
        // Stop event watching
        this.eventWatchers.get(`recording-${session.id}`)?.()
        this.eventWatchers.delete(`recording-${session.id}`)
        this.recording = null
        this.respond(msg.id, true, session)
      } else {
        this.respond(msg.id, false, null, 'No active recording')
      }
    } else if (action === 'replay') {
      this.replaySession(payload.session, payload.speed || 1, msg.id)
    }
  }
  
  // ==========================================
  // Event Watching
  // ==========================================
  
  private watchEvents(req: EventWatchRequest, watchId: string) {
    const target = req.selector ? document.querySelector(req.selector) : document
    if (!target) {
      this.respond(watchId, false, null, `Element not found: ${req.selector}`)
      return
    }
    
    const handlers: Array<[string, EventListener]> = []
    
    for (const eventType of req.events) {
      const handler = (e: Event) => {
        const recorded = this.recordEvent(e)
        this.send('events', 'captured', recorded)
        
        if (this.recording) {
          this.recording.events.push(recorded)
        }
      }
      
      target.addEventListener(eventType, handler, {
        capture: req.capture,
        passive: req.passive,
      })
      handlers.push([eventType, handler])
    }
    
    // Store unwatch function
    this.eventWatchers.set(watchId, () => {
      for (const [type, handler] of handlers) {
        target.removeEventListener(type, handler)
      }
    })
    
    this.respond(watchId, true, { watchId })
  }
  
  private recordEvent(e: Event): RecordedEvent {
    const target = e.target as Element
    const recorded: RecordedEvent = {
      type: e.type,
      timestamp: Date.now(),
      target: {
        selector: getSelector(target),
        tagName: target.tagName?.toLowerCase() || '',
        id: target.id || undefined,
        className: target.className?.toString() || undefined,
        textContent: target.textContent?.slice(0, 100) || undefined,
        value: (target as HTMLInputElement).value || undefined,
      },
    }
    
    if (e instanceof MouseEvent) {
      recorded.position = {
        x: e.pageX,
        y: e.pageY,
        clientX: e.clientX,
        clientY: e.clientY,
      }
      recorded.modifiers = {
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey,
      }
    }
    
    if (e instanceof KeyboardEvent) {
      recorded.key = e.key
      recorded.code = e.code
      recorded.modifiers = {
        alt: e.altKey,
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        shift: e.shiftKey,
      }
    }
    
    if (e.type === 'input' || e.type === 'change') {
      recorded.value = (e.target as HTMLInputElement).value
    }
    
    return recorded
  }
  
  private clearEventWatchers() {
    this.eventWatchers.forEach(unwatch => unwatch())
    this.eventWatchers.clear()
  }
  
  // ==========================================
  // Synthetic Events
  // ==========================================
  
  private dispatchSyntheticEvent(req: SyntheticEventRequest, responseId: string) {
    const el = document.querySelector(req.selector) as HTMLElement
    if (!el) {
      this.respond(responseId, false, null, `Element not found: ${req.selector}`)
      return
    }
    
    try {
      const opts = req.options || {}
      let event: Event
      
      if (req.event === 'click' || req.event === 'mousedown' || req.event === 'mouseup') {
        event = new MouseEvent(req.event, {
          bubbles: opts.bubbles ?? true,
          cancelable: opts.cancelable ?? true,
          clientX: opts.clientX,
          clientY: opts.clientY,
          button: opts.button ?? 0,
        })
      } else if (req.event === 'keydown' || req.event === 'keyup' || req.event === 'keypress') {
        event = new KeyboardEvent(req.event, {
          bubbles: opts.bubbles ?? true,
          cancelable: opts.cancelable ?? true,
          key: opts.key,
          code: opts.code,
          altKey: opts.altKey,
          ctrlKey: opts.ctrlKey,
          metaKey: opts.metaKey,
          shiftKey: opts.shiftKey,
        })
      } else if (req.event === 'input') {
        // Set value first for input elements
        if (opts.value !== undefined && 'value' in el) {
          (el as HTMLInputElement).value = opts.value
        }
        event = new InputEvent(req.event, {
          bubbles: opts.bubbles ?? true,
          cancelable: opts.cancelable ?? true,
          inputType: opts.inputType || 'insertText',
          data: opts.value,
        })
      } else if (req.event === 'focus') {
        el.focus()
        this.respond(responseId, true)
        return
      } else if (req.event === 'blur') {
        el.blur()
        this.respond(responseId, true)
        return
      } else {
        event = new CustomEvent(req.event, {
          bubbles: opts.bubbles ?? true,
          cancelable: opts.cancelable ?? true,
          detail: opts.detail,
        })
      }
      
      el.dispatchEvent(event)
      this.respond(responseId, true)
    } catch (err: any) {
      this.respond(responseId, false, null, err.message)
    }
  }
  
  private async replaySession(session: RecordingSession, speed: number, responseId: string) {
    const events = session.events
    let lastTime = events[0]?.timestamp || 0
    
    for (const event of events) {
      const delay = (event.timestamp - lastTime) / speed
      lastTime = event.timestamp
      
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay))
      }
      
      // Dispatch the recorded event
      await new Promise<void>((resolve) => {
        this.dispatchSyntheticEvent({
          selector: event.target.selector,
          event: event.type,
          options: {
            clientX: event.position?.clientX,
            clientY: event.position?.clientY,
            key: event.key,
            code: event.code,
            altKey: event.modifiers?.alt,
            ctrlKey: event.modifiers?.ctrl,
            metaKey: event.modifiers?.meta,
            shiftKey: event.modifiers?.shift,
            value: event.value,
          },
        }, uid())
        resolve()
      })
    }
    
    this.respond(responseId, true)
  }
  
  // ==========================================
  // Console Interception
  // ==========================================
  
  private interceptConsole() {
    const levels: Array<'log' | 'info' | 'warn' | 'error' | 'debug'> = ['log', 'info', 'warn', 'error', 'debug']
    
    for (const level of levels) {
      this.originalConsole[level] = console[level]
      console[level] = (...args: any[]) => {
        // Call original
        this.originalConsole[level]!.apply(console, args)
        
        // Capture
        const entry: ConsoleEntry = {
          level,
          args: args.map(arg => {
            try {
              return JSON.parse(JSON.stringify(arg))
            } catch {
              return String(arg)
            }
          }),
          timestamp: Date.now(),
        }
        
        if (level === 'error') {
          entry.stack = new Error().stack
        }
        
        this.consoleBuffer.push(entry)
        
        // Limit buffer size
        if (this.consoleBuffer.length > 1000) {
          this.consoleBuffer = this.consoleBuffer.slice(-500)
        }
        
        // Only send errors to server automatically (others are queryable via REST)
        if (this.state === 'connected' && level === 'error') {
          this.send('console', level, entry)
        }
      }
    }
  }
  
  private restoreConsole() {
    for (const [level, fn] of Object.entries(this.originalConsole)) {
      if (fn) {
        (console as any)[level] = fn
      }
    }
  }
}

// Register the custom element
customElements.define('dev-channel', DevChannel)

// Export for bookmarklet injection
export function inject(serverUrl = 'ws://localhost:8700/ws/browser') {
  if (document.querySelector('dev-channel')) {
    console.log('[dev-channel] Already injected')
    return
  }
  
  const el = document.createElement('dev-channel')
  el.setAttribute('server', serverUrl)
  document.body.appendChild(el)
  console.log('[dev-channel] Injected')
}

// Attach to window for console access
if (typeof window !== 'undefined') {
  (window as any).DevChannel = DevChannel
}
