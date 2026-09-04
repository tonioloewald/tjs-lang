/**
 * The namespace emitted code uses to reach its own inline runtime.
 *
 * ## Why this exists
 *
 * The preamble used to declare its helpers at module scope under their plain names —
 * `function Eq(a,b){…}`, `function Type(d,p,e){…}` — and generated code called them bare.
 * Those are ordinary JavaScript identifiers in the user's own module scope, so a file that
 * did either of
 *
 *     import { Eq } from 'tjs-lang/runtime'
 *     function Type(...) { … }
 *
 * and also used `==` (or declared a `Type`) got two top-level bindings of one name. Node
 * refuses to load such a module at all:
 *
 *     SyntaxError: Identifier 'Eq' has already been declared
 *
 * — a failure BEFORE any code runs, which is why the dogfood behaviour gate scored ten
 * affected suites as only six failures: most of their tests never ran to be counted. Filed
 * as #39, which names five of these; the gate found thirteen.
 *
 * ## Why the rename has to happen at generation time
 *
 * Once the preamble and the user's code are concatenated, a compiler-generated `Eq(` and a
 * user's own `Eq(` are the same five characters. There is no pass that can separate them
 * afterwards — not by masking literals, not by parsing, because both are genuine call
 * expressions in the same scope. The only moment the distinction exists is the moment a
 * transform WRITES one, so that is where the prefix goes on.
 *
 * ## Why not just reuse `__tjs`
 *
 * `__tjs` is `globalThis.__tjs?.createRuntime?.() ?? <inline fallback>`, so it is the SHARED
 * runtime whenever one is installed. The inline stubs are deliberately not drop-in
 * equivalents of the real ones — the real `Type` throws where the stub is permissive, the
 * real `FunctionPredicate.check()` returns a message where the stub returns `false` — and
 * emitted code has always called the stubs. Routing these through `__tjs` would therefore
 * change which implementation runs based on nothing but whether a runtime happened to be
 * loaded. See `docs/type-identity.md`: the stub is not a fallback, it IS the shipped
 * semantics. `__tjs_rt` is the inline object and only ever the inline object.
 *
 * `__tjs_rt` is a reserved name in emitted output. It carries the `__` prefix the emitter
 * already uses for its own bindings (`__ub`, `__ac`, `__proj`, `__oneOf`).
 */

/** The single binding emitted code reaches its inline runtime through. */
export const RT_NS = '__tjs_rt'

/** Prefix for a generated call site: `rt('Eq')` -> `'__tjs_rt.Eq'`. */
export function rt(name: string): string {
  return `${RT_NS}.${name}`
}

/**
 * Every helper reachable through the namespace — the canonical list.
 *
 * This is what `rt-namespace.test.ts` walks to assert, for each name, that the emitter
 * never writes it BARE into generated code. A name that is emitted bare is a name that can
 * collide, and the collision is a module that does not load.
 *
 * `tjsEquals` is a Symbol rather than a function, and is listed for the same reason: it was
 * `const tjsEquals = Symbol.for('tjs.equals')` at module scope, so it collided exactly like
 * the rest.
 */
export const RT_NAMES = [
  'Eq',
  'NotEq',
  'Is',
  'IsNot',
  'TypeOf',
  'Type',
  'Generic',
  'FunctionPredicate',
  'Enum',
  'Union',
  'Exactly',
  'toBool',
  'tjsEquals',
  'DangerousLegacyEquals',
  'DangerousLegacyNot',
  'LegacyExactly',
  'LegacyNotExactly',
  'LegacyDefault',
] as const

export type RtName = (typeof RT_NAMES)[number]
