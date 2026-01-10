/**
 * Dev Channel Bookmarklet
 * 
 * Minimal loader that fetches and executes the injector from the server.
 * 
 * Usage:
 * 1. Start server: bun run packages/dev-channel/bin/server.ts
 * 2. Create bookmark with: javascript:(function(){fetch('http://localhost:8700/inject.js').then(r=>r.text()).then(eval)})()
 * 3. Click bookmark on any page to inject dev-channel
 */

// The bookmarklet is just this one line:
// javascript:(function(){fetch('http://localhost:8700/inject.js').then(r=>r.text()).then(eval)})()

// This file contains the actual injection code that gets served from /inject.js
export const injectorCode = `
(function() {
  if (document.querySelector('dev-channel')) {
    console.log('[dev-channel] Already active');
    const existing = document.querySelector('dev-channel');
    if (existing && existing.show) existing.show();
    return;
  }
  
  const script = document.createElement('script');
  script.src = 'http://localhost:8700/component.js';
  script.onload = function() {
    if (window.DevChannel) {
      const el = document.createElement('dev-channel');
      document.body.appendChild(el);
    }
  };
  document.head.appendChild(script);
})();
`;
