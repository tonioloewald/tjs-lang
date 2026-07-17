/**
 * Playground TFS glue — a thin shim over `tjs-lang/import-resolver`.
 *
 * The import-rewriting and CDN-routing logic that used to live here (one of
 * three diverged copies, #20) moved to src/import-resolver/ and is exported
 * as `tjs-lang/import-resolver`. This file keeps only what is playground-
 * specific:
 *   - registerTFS: registers the DEMO worker (/tfs-worker.js — the shared
 *     resolver composed with the /iframe/ protocol, see tfs-worker.ts)
 *   - registerIframeContent: the /iframe/ postMessage protocol client
 *
 * rewriteImports/extractImports are re-exported from the package source so
 * the playground consumers exercise the very code consumers get from npm.
 *
 * For this to work, the playground iframe must be SAME-ORIGIN with the page
 * (so the SW controls it). See tjs-playground.ts: the iframe loads from
 * /iframe/<sessionId>, which the SW serves from a postMessage-fed in-memory
 * store. blob: URLs do NOT work — Chrome SWs don't intercept fetches from
 * sandboxed blob iframes.
 */

import { registerImportResolver } from '../../src/import-resolver'

export { rewriteImports, extractImports } from '../../src/import-resolver'

/**
 * Register the playground's TFS service worker (the shared import resolver +
 * the /iframe/ protocol). Call this early in app startup. Auto-reloads on
 * first install so the worker is active immediately.
 */
export async function registerTFS(): Promise<boolean> {
  return registerImportResolver({ workerUrl: '/tfs-worker.js' })
}

/**
 * Register an iframe's HTML with the SW under a session ID, then resolve
 * once the SW confirms registration. The caller can then set the iframe's
 * src to `/iframe/<sessionId>` and the SW will serve the registered HTML.
 *
 * Resolves to false if the SW isn't active (caller should fall back to
 * blob: URL — the iframe will work but won't have SW interception).
 */
export async function registerIframeContent(
  sessionId: string,
  html: string
): Promise<boolean> {
  const sw = navigator.serviceWorker?.controller
  if (!sw) return false

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      channel.port1.close()
      resolve(ok)
    }
    channel.port1.onmessage = (e) => {
      settle(e.data?.type === 'iframe-registered')
    }
    // Safety: if the SW never replies, don't hang the playground forever
    setTimeout(() => settle(false), 500)
    sw.postMessage({ type: 'register-iframe', sessionId, html }, [
      channel.port2,
    ])
  })
}
