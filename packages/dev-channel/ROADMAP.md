# Dev Channel Roadmap

## Completed

### Phase 1: Core Infrastructure ✅
- WebSocket server with REST API
- Browser component (bookmarklet injection)
- Basic DOM queries, clicks, typing, eval
- Console capture (buffered locally, errors sent to server)
- Playwright tests (13 passing)

### Phase 2: Tab Switching ✅
- Browser generates unique `browserId`
- On seeing another browser's `connected` message, kill self
- Prevents reconnect loops with `killed` flag
- Tested with Playwright (2 dedicated tests)

### Phase 3: Clean Message Architecture ✅
- Removed debug logging spam
- System messages only go to browsers (tab coordination)
- Non-system messages only go to agents (via REST)
- Console.log only sends errors automatically (rest queryable via REST)
- Clean separation: browsers↔server for coordination, agent→browser via REST

### Phase 4: JSON Test Format Types ✅
- `DevChannelTest` type defined in types.ts
- Steps: navigate, click, type, key, wait, assert, eval
- Assertions: exists, text, value, visible, url, console-contains
- `TestResult` / `StepResult` for reporting

## In Progress

### Phase 5: Test Runner Implementation
- **TODO**: Add `runTest(test: DevChannelTest)` to client.ts
- **TODO**: Execute steps sequentially with delays
- **TODO**: Run assertions and collect results
- **TODO**: REST endpoint for running tests

## Planned

### Phase 6: Smart Event Streams (THE BIG ONE)

**Problem**: Current approach is "log everything" which is noisy and useless.

**Principle**: SPAM IS EVIL, NOISE KILLS SIGNAL

**Solution**: Source-side aggregation + semantic events

#### Event Categories (subscribe to what you need)
```
interaction   - clicks, submits, form changes (always useful)
navigation    - page loads, hash changes, history
input         - keystrokes aggregated into "typed X" (debounced)
hover         - only boundary crossings + dwell (not every mousemove)
scroll        - only meaningful stops, not every pixel
console       - errors always, logs optional
system        - internal only, never broadcast to agents
```

#### Smart Aggregation (at source, before sending)
- "user typed 'hello'" not 5 keydown events
- "user scrolled to #pricing" not 200 scroll events  
- "user hovered on .btn for 1.2s" not mousemove spam
- "cursor entered #submit-btn" / "cursor left .dropdown-menu"
- Dwell detection: "hovered for 500ms"
- Gesture recognition: "drag from #item-3 to #trash"

#### Semantic Events (what AI actually needs to see)
- "User hesitated" (mouse stopped, no click)
- "User abandoned" (started typing, cleared, left)
- "User explored" (moused over several options before clicking)
- "User confidently clicked" vs "User hesitated then clicked"

#### Filtering/Debouncing
- Debounce tiny movements (< 5px)
- Collapse sequential keystrokes into single "typed" event
- Group related events: click + focus + input = "filled in field"
- Configurable thresholds

#### Clean Message Format
```
user:click       not events:dispatch
user:typed       not console:log  
page:loaded      not system:connected
user:entered     (element boundary crossing)
user:dwelled     (hovered > threshold)
```

### Phase 7: Log Viewer Widget

Use xinjs-ui `data-table` patterns:
- Virtual scrolling (handle thousands of events)
- Filterable by category
- Color-coded by type
- Expandable details
- Real-time streaming
- Compact by default, expand on click

### Phase 8: Recording & Test Generation

With smart events, recording becomes useful:
- Record semantic actions, not raw events
- Generate readable test steps
- AI can understand *intent* not just actions
- Suggest assertions based on observed behavior

### Phase 9: AI-Assisted Testing

The holy grail - AI that can:
- Watch you use a UI
- Understand intent, not just actions
- Generate robust tests that survive UI changes
- Suggest better UX based on observed behavior
- "User seemed confused here" insights

## Architecture Principles

1. **No spam** - Aggregate at source, not destination
2. **Semantic over raw** - Events should mean something
3. **Subscribe to what you need** - Don't broadcast everything
4. **System messages are internal** - Don't leak implementation details
5. **AI-readable** - Events a model can reason about
6. **Efficient** - Virtual rendering, debouncing, batching

## Files

- `src/types.ts` - All type definitions
- `src/server.ts` - WebSocket + REST server
- `src/component.ts` - Browser widget
- `src/client.ts` - Agent/CLI client
- `src/bookmarklet.ts` - Injection code

## Ideas Parking Lot

- Sourcemaps for transpiled code debugging
- Session replay (video-like scrubbing)
- Heatmaps from hover/click data
- A/B test integration
- Performance metrics (LCP, FID, CLS)
- Network request monitoring
- Screenshot capture on events
- Diff between expected/actual DOM
