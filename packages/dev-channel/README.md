# dev-channel

A real-time communication bridge between AI agents and browser pages.

## What It Does

dev-channel lets AI agents (like Claude) see and interact with web pages:

- **Query the DOM** - Find elements, read their content and attributes
- **Click and type** - Interact with buttons, inputs, links
- **See console output** - Monitor logs, errors, warnings in real-time
- **Execute JavaScript** - Run arbitrary code in the browser context
- **Record sessions** - Capture user interactions for replay/testing

## Quick Start

### 1. Start the server

```bash
# From anywhere
bunx dev-channel

# Or with custom port
bunx dev-channel 3000
```

The CLI shows you everything you need:
- Test page URL
- Bookmarklet to copy
- REST API endpoints
- Path to documentation

### 2. Open the test page

Visit `http://localhost:8700/` to see the test page with the widget.

### 3. Or inject into any page

Copy the bookmarklet from the CLI output, create a bookmark, and paste it as the URL. Click it on any page to inject the widget.

## Setup in Your Project

### Option A: Script tag

```html
<script src="http://localhost:8700/component.js"></script>
<dev-channel server="ws://localhost:8700/ws/browser"></dev-channel>
```

### Option B: Bookmarklet

```javascript
javascript:(function(){fetch('http://localhost:8700/inject.js').then(r=>r.text()).then(eval)})();
```

### Option C: Dev server integration

Add to your dev server's HTML template:

```html
<!-- Only in development -->
<script src="http://localhost:8700/component.js"></script>
<dev-channel></dev-channel>
```

## REST API Reference

All endpoints support CORS and return JSON.

### Status & Messages

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Server status (connected browsers/agents, buffered messages) |
| `/messages?since=N` | GET | Get buffered messages since timestamp N |
| `/console?since=N` | GET | Get console entries since timestamp N |

### DOM Queries

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/query` | POST | `{selector: string, all?: boolean}` | Query DOM elements |

**Response:**
```json
{
  "success": true,
  "data": {
    "tagName": "BUTTON",
    "id": "submit",
    "className": "btn primary",
    "textContent": "Submit",
    "innerText": "Submit",
    "outerHTML": "<button id=\"submit\" class=\"btn primary\">Submit</button>",
    "attributes": {"id": "submit", "class": "btn primary"},
    "rect": {}
  }
}
```

### Interactions

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/click` | POST | `{selector: string}` | Click an element |
| `/type` | POST | `{selector: string, text: string}` | Type into an input |
| `/eval` | POST | `{code: string}` | Execute JavaScript |

### Navigation

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/refresh` | POST | `{hard?: boolean}` | Refresh the page |
| `/navigate` | POST | `{url: string}` | Navigate to URL |
| `/location` | GET | - | Get current location |

### Recording

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/recording/start` | POST | `{name: string}` | Start recording session |
| `/recording/stop` | POST | - | Stop and return recording |

### Build Events

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/build` | POST | `{type, message?, file?, line?}` | Publish build event |

## For AI Agents

### Connecting

The dev-channel server must be running, and a browser must have the widget injected.

```bash
# Check if ready
curl http://127.0.0.1:8700/status
# {"browsers":1,"agents":0,"bufferedMessages":3}
```

### Finding Elements

```bash
# Find by selector
curl -X POST http://127.0.0.1:8700/query \
  -H "Content-Type: application/json" \
  -d '{"selector": "#login-button"}'

# Find all matching elements
curl -X POST http://127.0.0.1:8700/query \
  -H "Content-Type: application/json" \
  -d '{"selector": ".error-message", "all": true}'
```

### Interacting

```bash
# Click a button
curl -X POST http://127.0.0.1:8700/click \
  -H "Content-Type: application/json" \
  -d '{"selector": "#submit"}'

# Type into an input
curl -X POST http://127.0.0.1:8700/type \
  -H "Content-Type: application/json" \
  -d '{"selector": "#email", "text": "user@example.com"}'

# Execute JavaScript
curl -X POST http://127.0.0.1:8700/eval \
  -H "Content-Type: application/json" \
  -d '{"code": "document.title"}'
```

### Monitoring

```bash
# Get console output
curl http://127.0.0.1:8700/console

# Get recent messages
curl http://127.0.0.1:8700/messages
```

### Typical Workflow

1. **Check connection**: `GET /status` - ensure `browsers >= 1`
2. **Understand the page**: `POST /query` with `body`, then key elements
3. **Read console**: `GET /console` to see any errors
4. **Interact**: Use `/click`, `/type`, `/eval` as needed
5. **Verify results**: Query DOM again or check console

### Tips for Agents

- **Always check `/status` first** - if `browsers: 0`, ask the user to inject the widget
- **Use specific selectors** - IDs are best, then unique classes, then tag+attribute combos
- **Check results** - After clicking/typing, query the DOM to verify the action worked
- **Monitor console** - Errors often appear here before visible UI changes
- **Use eval sparingly** - Prefer `/query` and `/click` when possible

## Widget Controls

The widget appears in the bottom-right corner:

- **Status indicator** - Green = connected, Yellow = connecting, Red = disconnected
- **Pause button** - Temporarily stop responding to agent commands
- **Hide button** - Minimize the widget (Option+Tab to toggle)
- **Kill button** - Completely disconnect and remove the widget

**Security**: The widget always shows when an agent sends commands - no silent snooping.

## Tab Switching

Only one browser tab is active at a time. When you inject the widget into a new tab, the previous tab's widget automatically deactivates. This lets you jump between tabs to change context.

## Running Tests

```bash
# Server unit tests
bun test packages/dev-channel/src/server.test.ts

# End-to-end Playwright tests
cd packages/dev-channel && bunx playwright test

# Browser tests (in console after injecting widget)
DevChannel.runTests()
```

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐     REST API     ┌─────────────┐
│   Browser   │◄──────────────────►│   Server    │◄────────────────►│    Agent    │
│  Component  │    (real-time)     │  (Bun.js)   │   (curl/fetch)   │  (Claude)   │
└─────────────┘                    └─────────────┘                  └─────────────┘
      │                                   │
      ├─ Intercepts console               ├─ Routes messages
      ├─ Handles DOM queries              ├─ Buffers recent messages
      ├─ Dispatches events                ├─ Manages connections
      └─ Records sessions                 └─ Serves static files
```

## Configuration

Environment variables:

- `DEV_CHANNEL_PORT` - Server port (default: 8700)

Component attributes:

- `server` - WebSocket URL (default: `ws://localhost:8700/ws/browser`)

## License

MIT
