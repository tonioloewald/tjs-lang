/**
 * Build the bookmarklet as a javascript: URL
 * 
 * The bookmarklet loads inject.js from the dev-channel server.
 * The server can be local (localhost:8700) or any hosted instance.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DEFAULT_SERVER = 'http://localhost:8700'

// The bookmarklet - just fetches and evals inject.js
function makeBookmarklet(server: string) {
  return `javascript:(function(){fetch('${server}/inject.js').then(r=>r.text()).then(eval).catch(e=>alert('Dev Channel: Cannot reach ${server}'))})();`
}

const bookmarklet = makeBookmarklet(DEFAULT_SERVER)

// Ensure dist exists
mkdirSync(join(import.meta.dir, '../dist'), { recursive: true })

// Output
console.log('\n=== Dev Channel Bookmarklet ===\n')
console.log('Bookmarklet (default server ' + DEFAULT_SERVER + '):')
console.log(bookmarklet)
console.log('\n')

// Write HTML page
const html = `<!DOCTYPE html>
<html>
<head>
  <title>Dev Channel Bookmarklet</title>
  <style>
    body { font-family: system-ui; max-width: 700px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #555; margin-top: 2em; }
    .bookmarklet { 
      display: inline-block;
      padding: 12px 24px;
      background: #6366f1;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin: 10px 0;
    }
    .bookmarklet:hover { background: #4f46e5; }
    pre { 
      background: #f3f4f6; 
      padding: 16px; 
      border-radius: 8px; 
      overflow-x: auto;
      font-size: 11px;
      word-break: break-all;
    }
    code { background: #e5e7eb; padding: 2px 6px; border-radius: 4px; }
    .instructions { color: #666; line-height: 1.6; }
    .note { background: #fef3c7; padding: 12px; border-radius: 6px; margin: 1em 0; }
  </style>
</head>
<body>
  <h1>Dev Channel</h1>
  <p class="instructions">
    A communication bridge between AI agents and browser pages. 
    Allows querying the DOM, watching events, and automating interactions.
  </p>
  
  <h2>Bookmarklet</h2>
  <p class="instructions">Drag this to your bookmarks bar:</p>
  <a class="bookmarklet" href="${bookmarklet}">Dev Channel</a>
  
  <div class="note">
    <strong>Note:</strong> Start the server first:
    <code>bun run packages/dev-channel/bin/server.ts</code>
  </div>
  
  <h2>How It Works</h2>
  <ol class="instructions">
    <li>Start the dev-channel server</li>
    <li>Click the bookmarklet on any page</li>
    <li>A floating widget appears in the bottom-right corner</li>
    <li>The widget connects via WebSocket to the server</li>
    <li>AI agents can now query the DOM, dispatch events, and record interactions</li>
    <li>Use <kbd>Option+Tab</kbd> to toggle widget visibility</li>
    <li>Click "Kill" to completely remove the channel</li>
  </ol>
  
  <h2>Security</h2>
  <p class="instructions">
    The widget is <strong>always visible</strong> when an agent is connected - there's no silent snooping.
    You can pause, resume, or kill the connection at any time.
  </p>
  
  <h2>Raw URL</h2>
  <pre>${bookmarklet}</pre>
  
  <h2>Custom Server</h2>
  <p class="instructions">
    To use a different server, create a bookmarklet with this pattern:<br>
    <code>javascript:(function(){fetch('YOUR_SERVER/inject.js').then(r=>r.text()).then(eval).catch(e=>alert('Cannot reach server'))})();</code>
  </p>
</body>
</html>`

writeFileSync(join(import.meta.dir, '../dist/bookmarklet.html'), html)
console.log('Wrote dist/bookmarklet.html\n')
