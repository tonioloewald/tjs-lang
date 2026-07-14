/**
 * Serializable runtime introspection — the in-sandbox half of the introspection
 * bridge. Given a live value, produce a flat list of member descriptors that
 * survive `postMessage` (plain strings, no functions). The introspection bridge
 * injects this function's SOURCE into the sandbox iframe (via `.toString()`), so
 * it must be **self-contained** — no imports, no outer references.
 *
 * It mirrors the editor's own `introspectObject` (own keys first — important for
 * proxies that cache accesses, like tosijs `elements` — then the prototype
 * chain), but returns data instead of CodeMirror completions. The provider maps
 * these descriptors back into completions on the parent side.
 */
export interface IntrospectMember {
    label: string;
    /** 'method' for callables, else 'property'. */
    type: 'method' | 'property';
    /** typeof for properties, an arg hint for methods. */
    detail: string;
}
export declare function introspectValue(value: unknown): IntrospectMember[];
/** The function source, for injection into the sandbox iframe. */
export declare const INTROSPECT_VALUE_SOURCE: string;
