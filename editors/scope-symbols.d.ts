export interface SymbolOrigin {
    /** How the binding was produced. */
    via: 'init' | 'destructure' | 'param' | 'import' | 'function';
    /** Source text of the initializer expression (e.g. `elements`, `tosi({...})`). */
    expr?: string;
    /** For object-destructuring: the key on `expr` this name came from (`elements.h1` → `h1`). */
    member?: string;
    /** Module specifier, for imports. */
    module?: string;
}
export interface ScopeSymbol {
    name: string;
    kind: 'variable' | 'function' | 'parameter' | 'import';
    origin?: SymbolOrigin;
}
/**
 * Collect the symbols in scope at `position` (defaults to end of source):
 * variable/function/import bindings declared before the cursor, plus the
 * parameters of any function whose body the cursor sits inside. Destructuring
 * is fully handled; results are de-duplicated by name (last declaration wins).
 */
export declare function collectScopeSymbols(source: string, position?: number): ScopeSymbol[];
