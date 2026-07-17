/**
 * tjs-lang/import-resolver — bundler-free bare imports in the browser.
 *
 * Lets browser code `import` npm packages with no bundler and no
 * node_modules: `rewriteImports` rewrites bare specifiers to a same-origin
 * `<prefix><spec>` path, and a service worker (the raw asset
 * `tjs-lang/import-resolver/worker`) resolves those to a CDN — JSDelivr
 * `/+esm` by default, esm.sh for peer-dep-sensitive packages, with
 * `jsdelivr/` · `esmsh/` · `unpkg/` · `github/` hints — and caches the
 * responses. This is the machinery behind the tjs playground
 * (guides/playground-imports.md documents the user-facing behavior), promoted
 * to a real export (#20) so doc systems like tosijs-ui can own import
 * resolution without hand-rolling it.
 *
 * Consumer setup:
 *   1. Copy `node_modules/tjs-lang/dist/import-resolver-worker.js` into your
 *      public root (a service worker is origin-scoped — it cannot load from a
 *      CDN). From a subdirectory you'd also need the
 *      `Service-Worker-Allowed: /` response header; the root needs nothing.
 *   2. Early in app startup:
 *        await registerImportResolver({ prefix: '/lib/' })   // or defaults
 *   3. Before executing user/example code:
 *        const runnable = rewriteImports(source, '/lib/')
 *
 * The config you pass to registerImportResolver travels to the worker as a
 * query string on its script URL, so the client rewrite and the worker's
 * routing cannot disagree.
 *
 * SECURITY: the resolver executes arbitrary CDN-fetched modules. That is the
 * point — it is a playground/doc-system tool. Do not wire it into an origin
 * where running unvetted npm code is unacceptable.
 */

export {
  extractImports,
  rewriteImports,
  rewriteEsmShBody,
  parseTfsPath,
  buildCdnUrl,
  serializeConfig,
  parseConfig,
  DEFAULT_CONFIG,
  JSDELIVR,
  ESM_SH,
  CDN_HINTS,
  type ResolverConfig,
  type ParsedSpec,
} from './resolve'

export { handleResolverFetch } from './worker-core'

import { serializeConfig, type ResolverConfig } from './resolve'

export interface RegisterOptions extends Partial<ResolverConfig> {
  /** URL the worker script is served from (default '/import-resolver-worker.js'). */
  workerUrl?: string
  /** Service-worker scope (default '/'). Must cover `prefix`. */
  scope?: string
  /**
   * Reload the page on first install so the worker controls it immediately
   * (default true — without a controller, nothing is intercepted until the
   * next navigation). Set false to manage the first-load experience yourself.
   */
  reloadOnFirstInstall?: boolean
}

/**
 * Register the import-resolver service worker. Call early in app startup.
 * Resolves true when the worker controls the page, false when service
 * workers are unavailable, registration failed, or a first-install reload is
 * about to happen.
 */
export async function registerImportResolver(
  options: RegisterOptions = {}
): Promise<boolean> {
  const {
    workerUrl = '/import-resolver-worker.js',
    scope = '/',
    reloadOnFirstInstall = true,
    ...config
  } = options

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('Service workers not supported — import resolver unavailable')
    return false
  }

  try {
    const query = serializeConfig(config)
    await navigator.serviceWorker.register(`${workerUrl}?${query}`, { scope })

    // First load — no controller yet. Reload so the worker can intercept.
    if (!navigator.serviceWorker.controller) {
      if (reloadOnFirstInstall) window.location.reload()
      return false
    }

    return true
  } catch (error) {
    console.error('Import-resolver registration failed:', error)
    return false
  }
}
