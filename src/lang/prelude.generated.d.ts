/** The content hash of the prelude code this copy of tjs-lang ships. */
export declare const PRELUDE_HASH: string
/**
 * A fresh instance of the inline runtime, for a module emitted with `prelude: 'import'`.
 * Throws if `hash` names different prelude code than this copy provides.
 */
export declare function createPrelude(hash: string): Record<string, any>
