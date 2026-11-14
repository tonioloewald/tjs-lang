/**
 * Import-resolver routing core — the single source of truth.
 *
 * Pure string/URL logic with ZERO dependencies and ZERO browser globals, so it
 * is importable from every environment that needs to agree on routing:
 *   - the reusable service worker (worker.ts / worker-core.ts)
 *   - the demo's playground worker (demo/src/tfs-worker.ts)
 *   - the dev server's fallback handler (bin/dev.ts)
 *   - the client (index.ts → rewriteImports)
 *
 * Before this module existed, the routing lived in THREE diverged copies
 * (demo/src/imports.ts, demo/src/tfs-worker.js, and a materially different
 * reimplementation in bin/dev.ts that used raw JSDelivr + its own
 * package.json-exports resolution). Issue #20 is the promotion of this
 * machinery to a real export; keeping the logic here — and only here — is
 * what prevents the next divergence.
 *
 * Resolution strategy (the service worker's, now canonical everywhere):
 *   - Default CDN: JSDelivr `/+esm` — returns a self-contained Rollup-bundled
 *     ESM module; works for ESM-native AND CJS packages, deps inlined.
 *   - esm.sh allowlist: packages with peer-dep dedup requirements (react +
 *     react-dom must share one React; esm.sh builds with `external: react`).
 *   - Explicit CDN hints as the first path segment: `jsdelivr/`, `esmsh/`,
 *     `unpkg/`, `github/`.
 */

import { maskLiterals } from '../strip-comments'

/** Runtime configuration shared by the client and the service worker. */
export interface ResolverConfig {
  /**
   * Same-origin path prefix bare imports are rewritten to and the worker
   * intercepts. tjs-lang's playground uses '/tfs/'; a consumer (e.g.
   * tosijs-ui's doc system) can choose '/lib/'.
   */
  prefix: string
  /** Default CDN routing: 'jsdelivr' (the `/+esm` bundles) or 'esmsh'. */
  defaultCdn: string
  /** Packages that must route to esm.sh for peer-dependency dedup. */
  esmShPackages: string[]
  /** Cache-API cache name (bump to invalidate cached modules). */
  cacheName: string
}

export const DEFAULT_CONFIG: ResolverConfig = {
  prefix: '/tfs/',
  defaultCdn: 'jsdelivr',
  esmShPackages: ['react', 'react-dom'],
  cacheName: 'tfs-v4',
}

export const JSDELIVR = 'https://cdn.jsdelivr.net/npm'
export const ESM_SH = 'https://esm.sh'

/**
 * Explicit per-import CDN hints (first path segment of the spec).
 *
 *   import x from 'jsdelivr/tosijs@1.6'        → JSDelivr
 *   import x from 'esmsh/react@18'             → esm.sh
 *   import x from 'unpkg/preact'               → UNPKG
 *   import x from 'github/user/repo@main/file' → esm.sh's /gh/ route
 *
 * Hint name `esm` would collide with the popular `esm` npm package, so it is
 * `esmsh`. `jsdelivr`, `unpkg`, `github` are not taken as bare top-level npm
 * package names.
 */
export const CDN_HINTS: Record<string, (rest: string) => string> = {
  jsdelivr: (rest) => `${JSDELIVR}/${rest}/+esm`,
  esmsh: (rest) => `${ESM_SH}/${rest}`,
  unpkg: (rest) => `https://unpkg.com/${rest}?module`,
  github: (rest) => `${ESM_SH}/gh/${rest}`,
}

export interface ParsedSpec {
  name: string
  version: string
  subpath: string
}

/**
 * Parse a resolver path (the part after the prefix) into package name,
 * version, and subpath.
 *
 *   tosijs@1.3.11         → { name: 'tosijs', version: '1.3.11', subpath: '' }
 *   tosijs                → { name: 'tosijs', version: '', subpath: '' }
 *   tosijs@1.3.11/utils   → { name: 'tosijs', version: '1.3.11', subpath: '/utils' }
 *   @scope/pkg@1.0.0      → { name: '@scope/pkg', version: '1.0.0', subpath: '' }
 *   @scope/pkg@1.0.0/sub  → { name: '@scope/pkg', version: '1.0.0', subpath: '/sub' }
 */
export function parseTfsPath(path: string): ParsedSpec | null {
  if (path.startsWith('@')) {
    const m = path.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/)
    if (m) return { name: m[1], version: m[2] || '', subpath: m[3] || '' }
    return null
  }
  const m = path.match(/^([^/@]+)(?:@([^/]+))?(\/.*)?$/)
  if (m) return { name: m[1], version: m[2] || '', subpath: m[3] || '' }
  return null
}

/**
 * Build the CDN URL for a parsed spec.
 *
 *   react            → https://esm.sh/react            (allowlist)
 *   react-dom/client → https://esm.sh/react-dom/client
 *   tosijs           → https://cdn.jsdelivr.net/npm/tosijs@latest/+esm
 *   tosijs@1.6.1     → https://cdn.jsdelivr.net/npm/tosijs@1.6.1/+esm
 *   lodash-es/get    → https://cdn.jsdelivr.net/npm/lodash-es@latest/get/+esm
 *   jsdelivr/x@1     → hint routing (version slot unused — the inner spec
 *                      carries its own version)
 */
export function buildCdnUrl(
  name: string,
  version: string,
  subpath: string,
  config: ResolverConfig = DEFAULT_CONFIG
): string {
  // Explicit hint: `<cdn>/<rest>` where <cdn> is a known CDN name
  if (CDN_HINTS[name] && subpath) {
    return CDN_HINTS[name](subpath.slice(1))
  }
  // Allowlist override (peer-dep packages must use esm.sh)
  if (config.esmShPackages.includes(name)) {
    const versionPart = version ? `@${version}` : ''
    return `${ESM_SH}/${name}${versionPart}${subpath}`
  }
  // Default routing
  if (config.defaultCdn === 'esmsh') {
    const versionPart = version ? `@${version}` : ''
    return `${ESM_SH}/${name}${versionPart}${subpath}`
  }
  // 'jsdelivr' (and anything unrecognized falls back to it — the safe default)
  const versionPart = version ? `@${version}` : '@latest'
  return `${JSDELIVR}/${name}${versionPart}${subpath}/+esm`
}

/**
 * Extract bare import specifiers from source code.
 * (Relative and absolute specifiers are skipped — they resolve without us.)
 */
export function extractImports(source: string): string[] {
  return [
    ...new Set(
      importSpecifiers(source)
        .map(([start, end]) => source.slice(start, end))
        .filter(isBareSpecifier)
    ),
  ]
}

/**
 * Whether a specifier names a PACKAGE, the kind the resolver routes: not relative (`./`),
 * absolute (`/`) or a URL with a scheme (`http:`, `https:`, `data:`, `node:`, `blob:` …).
 */
function isBareSpecifier(spec: string): boolean {
  return !(
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(spec)
  )
}

/**
 * The [start, end) offsets of every module specifier in `source`: after `from`, after a
 * side-effect `import`, and inside a dynamic `import(…)`. Found in a view with string and comment
 * contents blanked (`maskLiterals`, offsets preserved), so text that merely MENTIONS an import
 * inside a string or comment is not one (#4122: it used to be rewritten), and the import clause is
 * never parsed, so `$`-names and minified `from"x"` need nothing special. A member call such as
 * `Array.from('x')` is not an import.
 */
function importSpecifiers(source: string): Array<[number, number]> {
  const masked = maskLiterals(source)
  const out: Array<[number, number]> = []
  for (const m of masked.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)(['"])/g)) {
    if (m.index! > 0 && masked[m.index! - 1] === '.') continue // `x.from('…')`
    // `from(` is a call, not a specifier: only `import(` takes a parenthesis
    if (m[0].startsWith('from') && /\(/.test(m[0])) continue
    const open = m.index! + m[0].length - 1
    const close = masked.indexOf(m[1], open + 1)
    if (close > open) out.push([open + 1, close])
  }
  return out
}

/**
 * Rewrite bare import specifiers to `<prefix><spec>` URLs the service worker
 * intercepts. Skips relative (./), absolute (/) and scheme-qualified (http:, data:, node: …)
 * specifiers, and anything inside a string or comment.
 *
 * Before: import { tosi } from 'tosijs'
 * After:  import { tosi } from '/tfs/tosijs'   (with the default prefix)
 */
export function rewriteImports(
  source: string,
  prefix: string = DEFAULT_CONFIG.prefix
): string {
  let out = source
  for (const [start, end] of importSpecifiers(source).reverse()) {
    const spec = source.slice(start, end)
    if (isBareSpecifier(spec))
      out = out.slice(0, start) + prefix + spec + out.slice(end)
  }
  return out
}

/**
 * The caches an activating worker may delete: earlier versions of ITS OWN cache (the current
 * name with an older trailing number: `tfs-v3` when the current one is `tfs-v4`). It used to
 * delete every cache on the origin that was not the current one, wiping a host site's own Cache
 * API data (2026-11-14). A name with no trailing number has no earlier versions.
 */
export function staleResolverCaches(
  keys: string[],
  cacheName: string
): string[] {
  const family = cacheName.replace(/\d+$/, '')
  if (family === cacheName) return []
  return keys.filter(
    (k) =>
      k !== cacheName &&
      k.startsWith(family) &&
      /^\d+$/.test(k.slice(family.length))
  )
}

/**
 * Rewrite esm.sh's root-relative import paths (`/react@18/...`) to absolute
 * esm.sh URLs. Served from the consumer's origin those relative paths would
 * resolve back to us instead of esm.sh; absolute URLs let the browser fetch
 * them directly AND dedupe cross-package peer-dep references (react ↔
 * react-dom resolve to the SAME URL). JSDelivr `/+esm` responses are
 * self-contained (no root-relative paths), so this is a no-op for them.
 */
/**
 * Point a CDN-served module's ROOT-RELATIVE imports back at the CDN it came from.
 *
 * CDN bundles import their dependencies by root-relative path (jsDelivr `+esm`:
 * `import*as I from"/npm/acorn@8.18.0/+esm"`; esm.sh: `"/react@18/…"`). The worker serves the
 * module from OUR origin, so unrewritten they resolve to `<our origin>/npm/…` and 404. Only
 * esm.sh used to be rewritten, by a regex that also missed minified output (no whitespace
 * after `import` or before the quote).
 *
 * Literal-safe: specifiers are found in a view with string/comment contents blanked
 * (`maskLiterals`, offsets preserved), so a string that merely mentions `from "/x"` is
 * untouched. Only `from "…"`, `import "…"` and `import("…")` with a single-`/` path change.
 */
export function rewriteCdnBody(body: string, moduleUrl: string): string {
  const masked = maskLiterals(body)
  const edits: Array<[number, number, string]> = []
  for (const m of masked.matchAll(/\b(?:from|import)\s*(?:\(\s*)?(['"])/g)) {
    const open = m.index! + m[0].length - 1
    const close = masked.indexOf(m[1], open + 1)
    if (close < 0) continue
    const spec = body.slice(open + 1, close)
    if (spec.startsWith('/') && !spec.startsWith('//'))
      edits.push([open + 1, close, new URL(spec, moduleUrl).href])
  }
  let out = body
  for (const [start, end, text] of edits.reverse())
    out = out.slice(0, start) + text + out.slice(end)
  return out
}

/** esm.sh's root-relative imports, against esm.sh (kept: public API; see `rewriteCdnBody`). */
export function rewriteEsmShBody(
  body: string,
  esmShBase: string = ESM_SH
): string {
  return rewriteCdnBody(body, `${esmShBase}/`)
}

/**
 * Config codec — how the client hands its config to the service worker.
 *
 * The config travels as a QUERY STRING on the worker's registered script URL
 * (`registerImportResolver` appends it; the worker reads `self.location`).
 * This is the one mechanism that is both available at SW startup — before the
 * first intercepted fetch — and durable across SW restarts: the browser
 * persists the registered script URL including its query, while a postMessage
 * would be lost on every cold restart and would race the first fetch.
 * Client and worker derive from the SAME ResolverConfig via this codec, so
 * their agreement is structural, not conventional.
 */
export function serializeConfig(cfg: Partial<ResolverConfig> = {}): string {
  const c = { ...DEFAULT_CONFIG, ...cfg }
  const params = new URLSearchParams()
  params.set('prefix', c.prefix)
  params.set('cdn', c.defaultCdn)
  params.set('esmsh', c.esmShPackages.join(','))
  params.set('cache', c.cacheName)
  return params.toString()
}

export function parseConfig(params: URLSearchParams): ResolverConfig {
  const esmsh = params.get('esmsh')
  return {
    prefix: params.get('prefix') || DEFAULT_CONFIG.prefix,
    defaultCdn: params.get('cdn') || DEFAULT_CONFIG.defaultCdn,
    // '' is a deliberate EMPTY allowlist, distinct from "not configured"
    esmShPackages:
      esmsh === null
        ? DEFAULT_CONFIG.esmShPackages
        : esmsh === ''
        ? []
        : esmsh.split(','),
    cacheName: params.get('cache') || DEFAULT_CONFIG.cacheName,
  }
}
