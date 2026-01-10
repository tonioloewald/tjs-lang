/**
 * dev-channel - Browser-Agent Communication Bridge
 * 
 * This package provides real-time communication between AI agents and browser pages.
 * 
 * Components:
 * - Server: WebSocket + REST server for message routing
 * - Component: Web component that runs in the browser
 * - Client: REST client for agents to communicate with the browser
 * - Bookmarklet: Injects the component into any page
 * 
 * Usage:
 * 
 * 1. Start the server:
 *    bun run packages/dev-channel/bin/server.ts
 * 
 * 2. Add the component to your page:
 *    <script type="module" src="http://localhost:8700/component.js"></script>
 *    <dev-channel></dev-channel>
 * 
 *    Or use the bookmarklet to inject into any page.
 * 
 * 3. From your agent code:
 *    import { devChannel } from 'dev-channel'
 *    
 *    await devChannel.query('#my-element')
 *    await devChannel.click('button.submit')
 *    await devChannel.type('input[name="email"]', 'test@example.com')
 *    
 *    const logs = await devChannel.getConsole()
 *    await devChannel.eval('window.myApp.getState()')
 *    
 *    await devChannel.startRecording('test-login')
 *    // ... user interacts with page ...
 *    const recording = await devChannel.stopRecording()
 */

// Types
export type {
  DevMessage,
  DevResponse,
  DomElement,
  DomQueryRequest,
  ConsoleEntry,
  EventWatchRequest,
  RecordedEvent,
  RecordingSession,
  BuildEvent,
  TestEvent,
  SyntheticEventRequest,
  ActionSequence,
  DomSnapshot,
  DevChannelClient as IDevChannelClient,
} from './types.js'

// Server
export { server as devChannelServer } from './server.js'

// Client (for agents)
export { DevChannelClient, devChannel } from './client.js'

// Re-export default port
export const DEFAULT_PORT = 8700
