/**
 * CodeMirror 6 Language Support for AsyncJS
 *
 * This extends the JavaScript language with custom highlighting for AsyncJS:
 * - Forbidden keywords (new, class, async, etc.) are marked as errors
 * - Standard JS syntax highlighting otherwise
 *
 * Usage:
 * ```typescript
 * import { EditorState } from '@codemirror/state'
 * import { EditorView, basicSetup } from 'codemirror'
 * import { ajs } from 'tjs-lang/editors/codemirror/ajs-language'
 *
 * new EditorView({
 *   state: EditorState.create({
 *     doc: 'function agent(topic: "string") { ... }',
 *     extensions: [basicSetup, ajs()]
 *   }),
 *   parent: document.body
 * })
 * ```
 */
import { LanguageSupport } from '@codemirror/language';
import { Extension } from '@codemirror/state';
import { CompletionContext as CMCompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { IntrospectMember } from '../introspect-value';
/**
 * Forbidden keywords in AsyncJS - these will be highlighted as errors
 */
declare const FORBIDDEN_KEYWORDS: Set<"new" | "class" | "extends" | "super" | "this" | "implements" | "interface" | "abstract" | "static" | "private" | "protected" | "public" | "async" | "await" | "yield" | "import" | "export" | "require" | "module" | "var" | "throw" | "switch" | "case" | "default" | "with" | "delete" | "void" | "typeof" | "instanceof" | "debugger" | "eval" | "type" | "enum" | "namespace" | "declare" | "readonly" | "as" | "is" | "keyof" | "infer" | "never" | "unknown">;
/**
 * Autocomplete configuration
 */
export interface AutocompleteConfig {
    /** Function to get __tjs metadata from current source */
    getMetadata?: () => Record<string, any> | undefined;
    /** Function to get imported module metadata */
    getImports?: () => Record<string, Record<string, any>> | undefined;
    /**
     * Function to get live module exports for runtime introspection.
     * Returns a map of import names to their actual runtime values.
     * e.g., { elements: Proxy, div: HTMLDivElement }
     */
    getLiveBindings?: () => Record<string, any> | undefined;
    /**
     * Async member completion from the introspection bridge: given a dotted path
     * (`todoApp.items`), returns the value's REAL runtime members from the user's
     * executed scope in a sandbox — including proxy-generated ones nothing static
     * can see. Used as a fallback when the path doesn't resolve in sync bindings.
     */
    getMembers?: (path: string) => Promise<IntrospectMember[] | undefined>;
}
/**
 * Create TJS/AJS completion source.
 * Exported for headless testing — it touches only DOM-free CodeMirror APIs.
 */
export declare function tjsCompletionSource(config?: AutocompleteConfig): (context: CMCompletionContext) => Promise<CompletionResult | null>;
/**
 * Create AsyncJS language support for CodeMirror 6
 *
 * @param config Optional configuration
 * @returns Extension array for CodeMirror
 */
export declare function ajsEditorExtension(config?: {
    jsx?: boolean;
    typescript?: boolean;
    autocomplete?: AutocompleteConfig;
}): Extension;
export { ajsEditorExtension as ajs };
/**
 * TJS editor extension - like AJS but with fewer restrictions
 * Allows: import/export, async/await, throw
 */
export declare function tjsEditorExtension(config?: {
    jsx?: boolean;
    typescript?: boolean;
    autocomplete?: AutocompleteConfig;
}): Extension;
/**
 * AsyncJS language support wrapped as LanguageSupport
 * Use this if you need access to the language object
 */
export declare function ajsLanguage(config?: {
    jsx?: boolean;
    typescript?: boolean;
}): LanguageSupport;
export { FORBIDDEN_KEYWORDS };
