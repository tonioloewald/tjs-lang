/**
 * Build-time stand-in for the `typescript` module, used ONLY by the
 * `tjs-browser-from-ts` bundle (via an esbuild `alias`). `from-ts.ts` does
 * `import ts from 'typescript'` and accesses `ts.<x>` at call time; this Proxy
 * forwards every access to the compiler that `browser-from-ts.ts` lazy-loads
 * from a CDN and stashes on `globalThis.__TJS_TS__`.
 *
 * Because all of from-ts's `ts.<x>` uses are inside functions (run when `fromTS`
 * is called, never at module load), the access is always deferred to after the
 * compiler is loaded — so the swap needs no changes to `from-ts.ts`. tsc still
 * typechecks `from-ts.ts` against the real `typescript` types; only the browser
 * BUILD aliases the runtime to this shim.
 */
const TS_GLOBAL = '__TJS_TS__'

function compiler(): any {
  const ts = (globalThis as any)[TS_GLOBAL]
  if (!ts) {
    throw new Error(
      'TypeScript not loaded. Use fromTS() from tjs-lang/browser/from-ts, ' +
        'which lazy-loads the compiler before transpiling.'
    )
  }
  return ts
}

const shim: any = new Proxy(
  {},
  {
    get: (_t, prop) => compiler()[prop],
    has: (_t, prop) => prop in compiler(),
  }
)

export default shim
