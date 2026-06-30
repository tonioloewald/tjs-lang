/**
 * Browser TypeScript→TJS — lazy-loads the TypeScript compiler from a CDN on
 * demand, so the bundle stays small and only pays the (~MB) compiler download
 * when you actually transpile TS. `acorn` + `tosijs-schema` are bundled in; the
 * `typescript` import in `from-ts.ts` is aliased (at build time) to a Proxy that
 * forwards to the lazily-loaded compiler (see `ts-cdn-shim.ts`).
 *
 *   const { fromTS } = await import('https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser-from-ts.js')
 *   const { code } = await fromTS('const x: number = 1', { emitTJS: true })
 *
 * Zero config by default. Override the compiler source with `typescriptUrl` (or
 * preload it yourself onto `globalThis.__TJS_TS__`).
 */
import type { FromTSOptions, FromTSResult } from './emitters/from-ts'

/**
 * Default CDN for the TypeScript compiler. **esm.sh** — verified the only CDN
 * that reliably serves `typescript` as ESM (default export = the compiler
 * namespace), in ~700ms. The on-the-fly bundlers choke on typescript's ~10MB
 * CommonJS size: jsDelivr `+esm`, esm.run → timeout; skypack → dead. So esm.sh
 * it is. Override via `BrowserFromTSOptions.typescriptUrl` (e.g. a self-hosted
 * copy) or preload your own compiler onto `globalThis.__TJS_TS__`.
 *
 * NOTE: only the *TypeScript* path depends on this. The TJS/AJS transpiler
 * (`tjs-lang/browser`) is fully self-contained and loads from ANY CDN.
 */
export const DEFAULT_TYPESCRIPT_URL = 'https://esm.sh/typescript@5'

const TS_GLOBAL = '__TJS_TS__'

export interface BrowserFromTSOptions extends FromTSOptions {
  /** Override the CDN URL the TypeScript compiler is lazy-loaded from. */
  typescriptUrl?: string
}

let loading: Promise<void> | null = null

/** Lazy-load the TypeScript compiler (once) onto `globalThis.__TJS_TS__`. */
export function loadTypeScript(
  url: string = DEFAULT_TYPESCRIPT_URL
): Promise<void> {
  if ((globalThis as any)[TS_GLOBAL]) return Promise.resolve()
  if (!loading) {
    loading = import(/* @vite-ignore */ /* webpackIgnore: true */ url).then(
      (mod) => {
        const ts = mod?.default ?? mod
        if (!ts || typeof ts.createSourceFile !== 'function') {
          loading = null
          throw new Error(
            `Loaded ${url} but it is not a usable TypeScript compiler ` +
              `(no createSourceFile). Try a different typescriptUrl.`
          )
        }
        ;(globalThis as any)[TS_GLOBAL] = ts
      },
      (e) => {
        loading = null
        throw e
      }
    )
  }
  return loading
}

/**
 * Transpile TypeScript → TJS (or JS) in the browser. Lazy-loads the TypeScript
 * compiler on first call, then runs the same `fromTS` logic as Node.
 */
export async function fromTS(
  source: string,
  options: BrowserFromTSOptions = {}
): Promise<FromTSResult> {
  const { typescriptUrl, ...rest } = options
  await loadTypeScript(typescriptUrl)
  // Imported after the compiler is set; from-ts's `typescript` import is aliased
  // to the Proxy shim, which now forwards to the loaded compiler.
  const { fromTS: nodeFromTS } = await import('./emitters/from-ts')
  return nodeFromTS(source, rest)
}

export type { FromTSOptions, FromTSResult } from './emitters/from-ts'
