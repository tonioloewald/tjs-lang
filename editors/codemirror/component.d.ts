/**
 * CodeMirror 6 Web Component
 *
 * A light-DOM web component wrapper for CodeMirror 6.
 * Supports multiple language modes including AJS, TJS, JavaScript, CSS, HTML, and Markdown.
 *
 * Usage:
 * ```html
 * <code-mirror mode="tjs">function foo(x: 0) { return x }</code-mirror>
 * ```
 *
 * Attributes:
 * - mode: Language mode (ajs, tjs, js, css, html, markdown)
 * - disabled: Make editor read-only
 * - name: Tab name (for use with tab-selector)
 *
 * Properties:
 * - value: Get/set editor content
 * - editor: Access the underlying CodeMirror EditorView
 *
 * Events:
 * - change: Fired when content changes, detail contains { value }
 */
import { Component, ElementCreator } from 'tosijs';
import { EditorView } from 'codemirror';
import { AutocompleteConfig } from './ajs-language';
export declare class CodeMirror extends Component {
    static styleSpec: {
        ':host': {
            display: string;
            width: string;
            height: string;
            position: string;
            textAlign: string;
            fontSize: string;
            overflow: string;
            backgroundColor: string;
        };
        '.cm-editor': {
            height: string;
        };
        '.cm-scroller': {
            outline: string;
            fontFamily: string;
        };
    };
    private _source;
    private _editor;
    private _autocompleteConfig;
    private _darkModeObserver;
    private languageCompartment;
    private readonlyCompartment;
    private themeCompartment;
    mode: string;
    disabled: boolean;
    role: string;
    /** Configure autocomplete callbacks for metadata extraction */
    set autocomplete(config: AutocompleteConfig);
    get autocomplete(): AutocompleteConfig;
    get value(): string;
    set value(text: string);
    get editor(): EditorView | undefined;
    constructor();
    private isDarkMode;
    private getThemeExtension;
    private updateTheme;
    connectedCallback(): void;
    private createEditor;
    disconnectedCallback(): void;
    onResize(): void;
    render(): void;
    focus(): void;
    insert(text: string): void;
    getSelection(): string;
    replaceSelection(text: string): void;
    goToLine(line: number, column?: number): void;
    setMarkers(markers: Array<{
        line: number;
        message: string;
        severity?: 'error' | 'warning' | 'info';
    }>): void;
    clearMarkers(): void;
}
export declare const codeMirror: ElementCreator<CodeMirror>;
