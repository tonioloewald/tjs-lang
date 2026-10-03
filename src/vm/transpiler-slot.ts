/**
 * The AJS source → AST transpiler the VM uses for `vm.run(source)`, supplied by an ENTRY POINT.
 *
 * Internal, on purpose: no public entry re-exports this module. `setTranspiler` used to live in
 * `vm.ts`, and every entry does `export * from './vm'`, so it was public API everywhere —
 * including `tjs-lang/vm-ast`, whose one promise is that it contains no parser (board #2247).
 * A public `setTranspiler` on that entry let any importer arm a parser in the sandbox's process.
 * The entries that DO want a parser (`tjs-lang/vm`, the main entry, `tjs-lang/eval`) import it
 * from here.
 */
let transpileImpl:
  | ((source: string, options?: { atoms?: unknown }) => { ast: unknown })
  | null = null

/** Supply the transpiler. Called by `tjs-lang/vm`'s entry; deliberately NOT by `vm-ast`. */
export function setTranspiler(
  fn: (source: string, options?: { atoms?: unknown }) => { ast: unknown }
): void {
  transpileImpl = fn
}

/** The transpiler an entry supplied, or null (the AST-only VM). */
export function getTranspiler():
  | ((source: string, options?: { atoms?: unknown }) => { ast: unknown })
  | null {
  return transpileImpl
}
