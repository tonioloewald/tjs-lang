# Editor Integration for AsyncJS

This directory contains syntax highlighting definitions for AsyncJS (the JavaScript subset used by tjs-lang).

## Quick Install

After installing `tjs-lang`, run one of these commands:

```bash
# VS Code
npx ajs-install-vscode

# Cursor
npx ajs-install-cursor
```

If npx has issues resolving paths, run directly from node_modules:

```bash
./node_modules/tjs-lang/bin/install-vscode.sh
./node_modules/tjs-lang/bin/install-cursor.sh
```

Then restart your editor.

## VS Code / Cursor Extension

The `vscode/` directory contains an extension that provides:

- Syntax highlighting for `.ajs` files
- Embedded highlighting in `ajs`...`` template literals within TypeScript/JavaScript files
- Red squiggly highlighting for forbidden syntax (`new`, `class`, `async`, etc.)

### Manual Installation

1. Open VS Code / Cursor
2. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type "Developer: Install Extension from Location..."
4. Select the `editors/vscode` directory

### Features

**Forbidden syntax is highlighted as an error:**

```javascript
// These will show red squiggles
new Date() // Use Date.now() or Date.parse()
class Foo {} // Use functions and objects
async function x() {} // Not needed, all calls are implicitly async
```

**Template literal injection:**

When you write `ajs`...`` in a TypeScript file, the content gets AsyncJS highlighting:

```typescript
import { ajs } from 'tjs-lang'

const agent = ajs`
  function search(query: 'string', limit = 10) {
    let results = storeSearch({ query })
    return { results }
  }
`
```

## Monaco Editor (Web)

The `monaco/` directory contains Monarch tokenizer definitions for the Monaco Editor (used in VS Code Web, CodeSandbox, etc.).

### Usage (TypeScript)

```typescript
import * as monaco from 'monaco-editor'
import { registerAjsLanguage } from 'tjs-lang/editors/monaco/ajs-monarch'

// Register the language
registerAjsLanguage(monaco)

// Create an editor with AsyncJS
monaco.editor.create(document.getElementById('container'), {
  value: `function agent(topic: 'string') {
  let results = storeSearch({ query: topic })
  return { results }
}`,
  language: 'ajs',
})
```

### Usage (Browser)

```html
<script src="https://unpkg.com/monaco-editor/min/vs/loader.js"></script>
<script src="path/to/ajs-monarch.js"></script>
<script>
  require(['vs/editor/editor.main'], function () {
    registerAjsLanguage(monaco)
    monaco.editor.create(document.getElementById('container'), {
      value: 'function agent(topic: "string") { ... }',
      language: 'ajs',
    })
  })
</script>
```

## Syntax Highlighting Rules

### Keywords (blue/purple)

```
function, return, if, else, while, for, of, in,
try, catch, finally, throw, let, const
```

### Literals (orange/green)

```
true, false, null, numbers, strings
```

### Forbidden (red/error)

These are JavaScript features not allowed in AsyncJS:

```
new, class, async, await, var, this, super,
extends, implements, interface, type, yield,
import, export, require
```

### Type Constructors (teal)

Used as factories, not with `new`:

```
Date, Set, Map, Array, Object
```

## CodeMirror 6 (Web)

The `codemirror/` directory extends CodeMirror's JavaScript language with AsyncJS error highlighting.

### Usage (TypeScript)

```typescript
import { EditorState } from '@codemirror/state'
import { EditorView, basicSetup } from 'codemirror'
import { ajs } from 'tjs-lang/editors/codemirror/ajs-language'

new EditorView({
  state: EditorState.create({
    doc: `function agent(topic: 'string') {
  let results = storeSearch({ query: topic })
  return { results }
}`,
    extensions: [basicSetup, ajs()],
  }),
  parent: document.getElementById('editor'),
})
```

### How It Works

CodeMirror 6 uses Lezer grammars (compiled parsers). Rather than creating a full AsyncJS grammar, we:

1. Use the standard JavaScript language
2. Add a view plugin that marks forbidden keywords as errors
3. Apply custom styling to show red squiggly underlines

This gives you full JS syntax highlighting with AsyncJS-specific error marking.

## Ace Editor (Web)

The `ace/` directory contains a custom mode for the Ace Editor.

### Usage (ES Module)

```typescript
import ace from 'ace-builds'
import { registerAjsMode } from 'tjs-lang/editors/ace/ajs-mode'

// Register the mode
registerAjsMode(ace)

// Create an editor with AsyncJS
const editor = ace.edit('editor')
editor.session.setMode('ace/mode/ajs')
editor.setValue(`function agent(topic: 'string') {
  let results = storeSearch({ query: topic })
  return { results }
}`)
```

### Usage (Browser CDN)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.32.2/ace.js"></script>
<script src="path/to/ajs-mode.js"></script>
<script>
  // Mode auto-registers when ace is global
  const editor = ace.edit('editor')
  editor.session.setMode('ace/mode/ajs')
</script>
```

### Features

- Full JavaScript syntax highlighting
- Forbidden keywords (`new`, `class`, `async`, etc.) highlighted as errors
- Template literal support with embedded expression highlighting
- Auto-indent and brace matching
- Code folding

## Tree-sitter Editors (Zed, Nova, Helix)

These editors use Tree-sitter grammars, which require compiled C/WASM parsers. Since AsyncJS is a JavaScript subset, we recommend:

### Option 1: Use JavaScript Mode

Associate `.ajs` files with JavaScript syntax:

**Zed** (`~/.config/zed/settings.json`):

```json
{
  "file_types": {
    "JavaScript": ["ajs"]
  }
}
```

**Nova**: In Preferences → Languages, add `.ajs` to JavaScript extensions.

**Helix** (`~/.config/helix/languages.toml`):

```toml
[[language]]
name = "javascript"
file-types = ["js", "mjs", "cjs", "ajs"]
```

### Option 2: Custom Highlighting Queries (Advanced)

If you want forbidden keywords highlighted as errors, you can override the JavaScript highlights query. This varies by editor and requires knowledge of Tree-sitter queries.

Example query addition for `highlights.scm`:

```scheme
; Mark forbidden keywords as errors
((identifier) @error
 (#match? @error "^(new|class|async|await|var|this|super)$"))
```

### Why Not a Full Tree-sitter Grammar?

Tree-sitter grammars require:

- Writing a grammar DSL that compiles to C
- Building WASM binaries for web editors
- Maintaining compatibility with each editor's Tree-sitter version
- Complex injection queries for template literals

Since AsyncJS is JavaScript with restrictions (not additions), the effort doesn't pay off. The JavaScript grammar already parses everything correctly—we just want to mark certain constructs as errors, which is better done at the linting/transpiler level.

## Syntax Highlighting Rules

### Keywords (blue/purple)

```
function, return, if, else, while, for, of, in,
try, catch, finally, throw, let, const
```

### Literals (orange/green)

```
true, false, null, numbers, strings
```

### Forbidden (red/error)

These are JavaScript features not allowed in AsyncJS:

```
new, class, async, await, var, this, super,
extends, implements, interface, type, yield,
import, export, require
```

### Type Constructors (teal)

Used as factories, not with `new`:

```
Date, Set, Map, Array, Object
```

## Contributing

The grammars are defined in:

- `vscode/syntaxes/ajs-injection.tmLanguage.json` - TextMate injection grammar (VS Code, Cursor)
- `vscode/syntaxes/ajs.tmLanguage.json` - Standalone .ajs file grammar
- `monaco/ajs-monarch.ts` - Monarch tokenizer (Monaco Editor)
- `codemirror/ajs-language.ts` - CodeMirror 6 extension

### Keeping Grammars in Sync

When modifying AsyncJS syntax, update **all** grammar files:

1. **Forbidden keywords** - If you add/remove keywords from the transpiler's forbidden list, update:

   - `vscode/syntaxes/ajs-injection.tmLanguage.json` → `forbidden` pattern
   - `monaco/ajs-monarch.ts` → `forbidden` array
   - `codemirror/ajs-language.ts` → `FORBIDDEN_KEYWORDS` set

2. **New syntax** - If you add new syntax constructs, add corresponding patterns to each grammar.

3. **Test after changes** - Reinstall the VS Code extension and verify highlighting works.

### Testing Changes

1. VS Code: Use "Developer: Inspect TM Scopes" to debug token scopes
2. Monaco: Use the [Monaco Playground](https://microsoft.github.io/monaco-editor/playground.html)
3. CodeMirror: Use the [CodeMirror Try](https://codemirror.net/try/) page
