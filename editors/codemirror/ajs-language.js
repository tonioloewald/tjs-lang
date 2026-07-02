// editors/codemirror/ajs-language.ts
import { javascript } from "@codemirror/lang-javascript";
import {
  HighlightStyle,
  LanguageSupport
} from "@codemirror/language";
import {
  EditorView,
  Decoration,
  ViewPlugin
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import {
  autocompletion,
  snippetCompletion
} from "@codemirror/autocomplete";

// editors/ajs-syntax.ts
var KEYWORDS = [
  "function",
  "return",
  "if",
  "else",
  "while",
  "for",
  "of",
  "in",
  "try",
  "catch",
  "finally",
  "let",
  "const",
  "true",
  "false",
  "null",
  "undefined"
];
var FORBIDDEN_KEYWORDS = [
  // Object-oriented constructs
  "new",
  "class",
  "extends",
  "super",
  "this",
  "implements",
  "interface",
  "abstract",
  "static",
  "private",
  "protected",
  "public",
  // Async constructs (not needed - runtime handles async)
  "async",
  "await",
  "yield",
  // Module system (not supported)
  "import",
  "export",
  "require",
  "module",
  // Other unsupported
  "var",
  // use let/const
  "throw",
  // use Error() for monadic error flow
  "switch",
  // use if/else chains
  "case",
  "default",
  // (as switch keyword)
  "with",
  "delete",
  "void",
  "typeof",
  // use type-by-example instead
  "instanceof",
  "debugger",
  "eval",
  // TypeScript-specific (not supported)
  "type",
  "enum",
  "namespace",
  "declare",
  "readonly",
  "as",
  "is",
  "keyof",
  "infer",
  "never",
  "unknown"
];
var TYPE_CONSTRUCTORS = [
  "Date",
  "Set",
  "Map",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Error",
  "JSON",
  "Math",
  "Schema"
  // AsyncJS-specific
];
var OPERATORS = [
  // Assignment
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  // Comparison
  "==",
  "===",
  "!=",
  "!==",
  "<",
  ">",
  "<=",
  ">=",
  // Arithmetic
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  // Logical
  "&&",
  "||",
  "??",
  "!",
  // Bitwise (limited support)
  "&",
  "|",
  "^",
  "~",
  "<<",
  ">>",
  ">>>",
  // Other
  "?",
  ":",
  ".",
  "?.",
  "?.(",
  "?.[",
  "..."
];
var FORBIDDEN_SET = new Set(FORBIDDEN_KEYWORDS);
var KEYWORDS_SET = new Set(KEYWORDS);
var FORBIDDEN_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`,
  "g"
);

// editors/tjs-syntax.ts
var TJS_KEYWORDS = [
  "test",
  // inline tests
  "mock",
  // test setup blocks
  "unsafe",
  // exception-catching blocks
  "async",
  // TJS allows async (unlike sandboxed AJS)
  "await",
  "throw",
  "import",
  "export",
  // Class support
  "class",
  "extends",
  "super",
  "this",
  "new",
  "static",
  // JS operators
  "typeof",
  "instanceof",
  "delete"
];
var KEYWORDS2 = [...KEYWORDS, ...TJS_KEYWORDS];
var FORBIDDEN_KEYWORDS2 = FORBIDDEN_KEYWORDS.filter(
  (k) => ![
    "async",
    "await",
    "throw",
    "import",
    "export",
    // Class support (TjsClass mode)
    "class",
    "extends",
    "super",
    "this",
    "new",
    "static",
    // Valid JS operators
    "typeof",
    "instanceof",
    "delete"
  ].includes(k)
);
var TYPE_CONSTRUCTORS2 = [
  ...TYPE_CONSTRUCTORS,
  "expect",
  // test assertions
  "assert"
  // simple assertions
];
var OPERATORS2 = [...OPERATORS, "->"];

// editors/scope-symbols.ts
import * as acorn from "acorn";
import * as acornLoose from "acorn-loose";
import * as walk from "acorn-walk";
function parse3(source) {
  try {
    return acorn.parse(source, { ecmaVersion: "latest" });
  } catch {
    try {
      return acornLoose.parse(source, { ecmaVersion: "latest" });
    } catch {
      return null;
    }
  }
}
function collectPattern(pat, onName, member) {
  if (!pat) return;
  switch (pat.type) {
    case "Identifier":
      onName(pat.name, member);
      return;
    case "ObjectPattern":
      for (const p of pat.properties) {
        if (p.type === "RestElement") {
          collectPattern(p.argument, onName);
        } else {
          const key = p.key && (p.key.name ?? p.key.value);
          collectPattern(
            p.value,
            onName,
            typeof key === "string" ? key : void 0
          );
        }
      }
      return;
    case "ArrayPattern":
      for (const el of pat.elements) collectPattern(el, onName);
      return;
    case "AssignmentPattern":
      collectPattern(pat.left, onName, member);
      return;
    case "RestElement":
      collectPattern(pat.argument, onName);
      return;
  }
}
var inRange = (node, position) => typeof node.start === "number" && typeof node.end === "number" && node.start <= position && position <= node.end;
function collectScopeSymbols(source, position = source.length) {
  const ast = parse3(source);
  if (!ast) return [];
  const byName = /* @__PURE__ */ new Map();
  const add = (s) => byName.set(s.name, s);
  walk.full(ast, (node) => {
    switch (node.type) {
      case "VariableDeclaration": {
        if (node.start >= position) return;
        for (const decl of node.declarations) {
          const initText = decl.init && typeof decl.init.start === "number" ? source.slice(decl.init.start, decl.init.end) : void 0;
          collectPattern(
            decl.id,
            (name, member) => add({
              name,
              kind: "variable",
              origin: {
                via: member != null ? "destructure" : "init",
                expr: initText,
                member
              }
            })
          );
        }
        return;
      }
      case "FunctionDeclaration": {
        if (node.id && node.start < position)
          add({
            name: node.id.name,
            kind: "function",
            origin: { via: "function" }
          });
        if (inRange(node, position))
          for (const p of node.params)
            collectPattern(
              p,
              (name) => add({ name, kind: "parameter", origin: { via: "param" } })
            );
        return;
      }
      case "FunctionExpression":
      case "ArrowFunctionExpression": {
        if (inRange(node, position))
          for (const p of node.params)
            collectPattern(
              p,
              (name) => add({ name, kind: "parameter", origin: { via: "param" } })
            );
        return;
      }
      case "ImportDeclaration": {
        const module = String(node.source?.value ?? "");
        for (const spec of node.specifiers) {
          add({
            name: spec.local.name,
            kind: "import",
            origin: { via: "import", module }
          });
        }
        return;
      }
    }
  });
  return [...byName.values()];
}

// editors/codemirror/ajs-language.ts
var FORBIDDEN_KEYWORDS3 = new Set(FORBIDDEN_KEYWORDS);
var TJS_FORBIDDEN_KEYWORDS = new Set(FORBIDDEN_KEYWORDS2);
var forbiddenMark = Decoration.mark({
  class: "cm-ajs-forbidden"
});
var tjsSpecialMark = Decoration.mark({
  class: "cm-tjs-special"
});
function findSkipRegions(doc) {
  const regions = [];
  const len = doc.length;
  let i = 0;
  while (i < len) {
    const ch = doc[i];
    const next = doc[i + 1];
    if (ch === "/" && next === "/") {
      const start = i;
      i += 2;
      while (i < len && doc[i] !== "\n") i++;
      regions.push([start, i]);
      continue;
    }
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i < len - 1 && !(doc[i] === "*" && doc[i + 1] === "/")) i++;
      i += 2;
      regions.push([start, i]);
      continue;
    }
    if (ch === "`") {
      let stringStart = i;
      i++;
      while (i < len) {
        if (doc[i] === "\\") {
          i += 2;
          continue;
        }
        if (doc[i] === "`") {
          regions.push([stringStart, i + 1]);
          i++;
          break;
        }
        if (doc[i] === "$" && doc[i + 1] === "{") {
          regions.push([stringStart, i]);
          i += 2;
          let braceDepth = 1;
          while (i < len && braceDepth > 0) {
            if (doc[i] === "{") braceDepth++;
            else if (doc[i] === "}") braceDepth--;
            if (braceDepth > 0) i++;
          }
          i++;
          stringStart = i;
          continue;
        }
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < len) {
        if (doc[i] === "\\") {
          i += 2;
          continue;
        }
        if (doc[i] === quote) {
          i++;
          break;
        }
        if (doc[i] === "\n") break;
        i++;
      }
      regions.push([start, i]);
      continue;
    }
    i++;
  }
  return regions;
}
function isInSkipRegion(pos, regions) {
  for (const [start, end] of regions) {
    if (pos >= start && pos < end) return true;
    if (start > pos) break;
  }
  return false;
}
function createForbiddenHighlighter(forbiddenSet) {
  const pattern = new RegExp(`\\b(${[...forbiddenSet].join("|")})\\b`, "g");
  return ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const doc = view.state.doc.toString();
        const skipRegions = findSkipRegions(doc);
        const regex = new RegExp(pattern.source, "g");
        let match;
        while ((match = regex.exec(doc)) !== null) {
          if (!isInSkipRegion(match.index, skipRegions)) {
            builder.add(
              match.index,
              match.index + match[0].length,
              forbiddenMark
            );
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );
}
var forbiddenHighlighter = createForbiddenHighlighter(FORBIDDEN_KEYWORDS3);
var tjsForbiddenHighlighter = createForbiddenHighlighter(
  TJS_FORBIDDEN_KEYWORDS
);
var tryWithoutCatchHighlighter = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    buildDecorations(view) {
      const builder = new RangeSetBuilder();
      const doc = view.state.doc.toString();
      const skipRegions = findSkipRegions(doc);
      const tryPattern = /\btry\s*\{/g;
      let match;
      while ((match = tryPattern.exec(doc)) !== null) {
        if (isInSkipRegion(match.index, skipRegions)) continue;
        const braceStart = match.index + match[0].length - 1;
        let depth = 1;
        let j = braceStart + 1;
        while (j < doc.length && depth > 0) {
          const char = doc[j];
          if (char === "{") depth++;
          else if (char === "}") depth--;
          j++;
        }
        if (depth !== 0) continue;
        const afterTry = doc.slice(j).match(/^\s*(catch|finally)\b/);
        if (!afterTry) {
          const tryKeywordEnd = match.index + 3;
          builder.add(match.index, tryKeywordEnd, tjsSpecialMark);
        }
      }
      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations
  }
);
var ajsTheme = EditorView.theme({
  ".cm-ajs-forbidden": {
    color: "#dc2626",
    textDecoration: "wavy underline #dc2626",
    backgroundColor: "rgba(220, 38, 38, 0.1)"
  },
  ".cm-tjs-special": {
    color: "#7c3aed",
    fontWeight: "bold",
    backgroundColor: "rgba(124, 58, 237, 0.1)"
  }
});
var ajsHighlightStyle = HighlightStyle.define([
  // Standard highlighting is inherited from JavaScript
  // Add any AsyncJS-specific overrides here
]);
function memberToCompletion(m) {
  if (m.type === "method") {
    const hasArgs = m.detail !== "()";
    return snippetCompletion(`${m.label}(${hasArgs ? "${1}" : ""})`, {
      label: m.label,
      type: "method",
      detail: m.detail
    });
  }
  return { label: m.label, type: "property", detail: m.detail };
}
var TJS_COMPLETIONS = [
  { label: "function", type: "keyword", detail: "Declare a function" },
  { label: "const", type: "keyword", detail: "Declare a constant" },
  { label: "let", type: "keyword", detail: "Declare a variable" },
  { label: "if", type: "keyword", detail: "Conditional statement" },
  { label: "else", type: "keyword", detail: "Else branch" },
  { label: "while", type: "keyword", detail: "While loop" },
  { label: "for", type: "keyword", detail: "For loop" },
  { label: "return", type: "keyword", detail: "Return from function" },
  { label: "try", type: "keyword", detail: "Try block" },
  { label: "catch", type: "keyword", detail: "Catch block" },
  { label: "import", type: "keyword", detail: "Import module" },
  { label: "export", type: "keyword", detail: "Export declaration" },
  snippetCompletion("test('${description}') {\n	${}\n}", {
    label: "test",
    type: "keyword",
    detail: "Inline test block"
  }),
  snippetCompletion("mock {\n	${}\n}", {
    label: "mock",
    type: "keyword",
    detail: "Mock setup block"
  }),
  snippetCompletion("unsafe {\n	${}\n}", {
    label: "unsafe",
    type: "keyword",
    detail: "Skip type validation"
  })
];
var TJS_TYPES = [
  { label: "''", type: "type", detail: "String type" },
  { label: "0", type: "type", detail: "Number type" },
  { label: "true", type: "type", detail: "Boolean type" },
  { label: "null", type: "type", detail: "Null type" },
  { label: "undefined", type: "type", detail: "Undefined type" },
  { label: "['']", type: "type", detail: "Array of strings" },
  { label: "[0]", type: "type", detail: "Array of numbers" },
  { label: "{}", type: "type", detail: "Object type" },
  { label: "any", type: "type", detail: "Any type" }
];
var RUNTIME_COMPLETIONS = [
  snippetCompletion("isError(${value})", {
    label: "isError",
    type: "function",
    detail: "(value: any) -> boolean",
    info: "Check if a value is a TJS error"
  }),
  snippetCompletion("error('${message}')", {
    label: "error",
    type: "function",
    detail: "(message: string) -> TJSError",
    info: "Create a TJS error object"
  }),
  snippetCompletion("typeOf(${value})", {
    label: "typeOf",
    type: "function",
    detail: "(value: any) -> string",
    info: "Get type name (fixed typeof)"
  }),
  snippetCompletion("expect(${actual})", {
    label: "expect",
    type: "function",
    detail: "(actual: any) -> Matchers",
    info: "Test assertion"
  })
];
var GLOBAL_COMPLETIONS = [
  // Console
  {
    label: "console",
    type: "variable",
    detail: "Console object",
    info: "Logging and debugging"
  },
  // Math
  {
    label: "Math",
    type: "variable",
    detail: "Math object",
    info: "Mathematical functions and constants"
  },
  // JSON
  {
    label: "JSON",
    type: "variable",
    detail: "JSON object",
    info: "JSON parse and stringify"
  },
  // Constructors / types
  {
    label: "Array",
    type: "class",
    detail: "Array constructor",
    info: "Create arrays"
  },
  {
    label: "Object",
    type: "class",
    detail: "Object constructor",
    info: "Object utilities"
  },
  {
    label: "String",
    type: "class",
    detail: "String constructor",
    info: "String utilities"
  },
  {
    label: "Number",
    type: "class",
    detail: "Number constructor",
    info: "Number utilities"
  },
  { label: "Boolean", type: "class", detail: "Boolean constructor" },
  {
    label: "Date",
    type: "class",
    detail: "Date constructor",
    info: "Date and time"
  },
  {
    label: "RegExp",
    type: "class",
    detail: "RegExp constructor",
    info: "Regular expressions"
  },
  {
    label: "Map",
    type: "class",
    detail: "Map constructor",
    info: "Key-value collection"
  },
  {
    label: "Set",
    type: "class",
    detail: "Set constructor",
    info: "Unique value collection"
  },
  { label: "WeakMap", type: "class", detail: "WeakMap constructor" },
  { label: "WeakSet", type: "class", detail: "WeakSet constructor" },
  { label: "Symbol", type: "class", detail: "Symbol constructor" },
  { label: "BigInt", type: "class", detail: "BigInt constructor" },
  // Error types
  { label: "Error", type: "class", detail: "Error constructor" },
  { label: "TypeError", type: "class", detail: "TypeError constructor" },
  { label: "RangeError", type: "class", detail: "RangeError constructor" },
  { label: "SyntaxError", type: "class", detail: "SyntaxError constructor" },
  {
    label: "ReferenceError",
    type: "class",
    detail: "ReferenceError constructor"
  },
  // Typed arrays
  { label: "ArrayBuffer", type: "class", detail: "ArrayBuffer constructor" },
  { label: "Uint8Array", type: "class", detail: "Uint8Array constructor" },
  { label: "Int8Array", type: "class", detail: "Int8Array constructor" },
  { label: "Uint16Array", type: "class", detail: "Uint16Array constructor" },
  { label: "Int16Array", type: "class", detail: "Int16Array constructor" },
  { label: "Uint32Array", type: "class", detail: "Uint32Array constructor" },
  { label: "Int32Array", type: "class", detail: "Int32Array constructor" },
  { label: "Float32Array", type: "class", detail: "Float32Array constructor" },
  { label: "Float64Array", type: "class", detail: "Float64Array constructor" },
  // Promises (though async/await is forbidden, Promise itself may be useful)
  { label: "Promise", type: "class", detail: "Promise constructor" },
  // Global functions
  { label: "parseInt", type: "function", detail: "(string, radix?) -> number" },
  { label: "parseFloat", type: "function", detail: "(string) -> number" },
  { label: "isNaN", type: "function", detail: "(value) -> boolean" },
  { label: "isFinite", type: "function", detail: "(value) -> boolean" },
  { label: "encodeURI", type: "function", detail: "(uri) -> string" },
  { label: "decodeURI", type: "function", detail: "(encodedURI) -> string" },
  {
    label: "encodeURIComponent",
    type: "function",
    detail: "(component) -> string"
  },
  {
    label: "decodeURIComponent",
    type: "function",
    detail: "(encoded) -> string"
  },
  // Global values
  { label: "undefined", type: "keyword", detail: "Undefined value" },
  { label: "null", type: "keyword", detail: "Null value" },
  { label: "NaN", type: "keyword", detail: "Not a Number" },
  { label: "Infinity", type: "keyword", detail: "Positive infinity" },
  { label: "globalThis", type: "variable", detail: "Global object" }
];
var EXPECT_MATCHERS = [
  snippetCompletion("toBe(${expected})", {
    label: "toBe",
    type: "method",
    detail: "(expected: any)",
    info: "Strict equality (===)"
  }),
  snippetCompletion("toEqual(${expected})", {
    label: "toEqual",
    type: "method",
    detail: "(expected: any)",
    info: "Deep equality"
  }),
  snippetCompletion("toContain(${item})", {
    label: "toContain",
    type: "method",
    detail: "(item: any)",
    info: "Array/string contains"
  }),
  { label: "toThrow", type: "method", detail: "()", info: "Throws an error" },
  { label: "toBeTruthy", type: "method", detail: "()", info: "Is truthy" },
  { label: "toBeFalsy", type: "method", detail: "()", info: "Is falsy" },
  { label: "toBeNull", type: "method", detail: "()", info: "Is null" },
  {
    label: "toBeUndefined",
    type: "method",
    detail: "()",
    info: "Is undefined"
  }
];
function extractFunctions(source) {
  const completions = [];
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(source)) !== null) {
    const [, name, params] = match;
    completions.push(
      snippetCompletion(`${name}(${params ? "${1}" : ""})`, {
        label: name,
        type: "function",
        detail: `(${params})`
      })
    );
  }
  return completions;
}
function extractVariables(source, position) {
  const completions = [];
  const before = source.slice(0, position);
  const varRegex = /(?:const|let)\s+(\w+)\s*=/g;
  let match;
  while ((match = varRegex.exec(before)) !== null) {
    completions.push({
      label: match[1],
      type: "variable"
    });
  }
  return completions;
}
function completionsFromScope(source, position) {
  const symbols = collectScopeSymbols(source, position);
  if (symbols.length === 0) {
    return [...extractFunctions(source), ...extractVariables(source, position)];
  }
  return symbols.map((s) => {
    const detail = s.origin?.member && s.origin.expr ? `\u2208 ${s.origin.expr}` : s.kind === "import" && s.origin?.module ? `import '${s.origin.module}'` : s.kind === "parameter" ? "parameter" : void 0;
    if (s.kind === "function") {
      return snippetCompletion(`${s.name}($1)`, {
        label: s.name,
        type: "function",
        detail
      });
    }
    return { label: s.name, type: "variable", detail };
  });
}
var CURATED_PROPERTIES = {
  console: [
    snippetCompletion("log(${1:message})", {
      label: "log",
      type: "method",
      detail: "(...args: any[]) -> void",
      info: "Log to console"
    }),
    snippetCompletion("error(${1:message})", {
      label: "error",
      type: "method",
      detail: "(...args: any[]) -> void",
      info: "Log error"
    }),
    snippetCompletion("warn(${1:message})", {
      label: "warn",
      type: "method",
      detail: "(...args: any[]) -> void",
      info: "Log warning"
    }),
    snippetCompletion("info(${1:message})", {
      label: "info",
      type: "method",
      detail: "(...args: any[]) -> void",
      info: "Log info"
    }),
    snippetCompletion("debug(${1:message})", {
      label: "debug",
      type: "method",
      detail: "(...args: any[]) -> void",
      info: "Log debug"
    }),
    snippetCompletion("table(${1:data})", {
      label: "table",
      type: "method",
      detail: "(data: any) -> void",
      info: "Display as table"
    }),
    snippetCompletion("time('${1:label}')", {
      label: "time",
      type: "method",
      detail: "(label: string) -> void",
      info: "Start timer"
    }),
    snippetCompletion("timeEnd('${1:label}')", {
      label: "timeEnd",
      type: "method",
      detail: "(label: string) -> void",
      info: "End timer"
    }),
    snippetCompletion("group('${1:label}')", {
      label: "group",
      type: "method",
      detail: "(label?: string) -> void",
      info: "Start group"
    }),
    {
      label: "groupEnd",
      type: "method",
      detail: "() -> void",
      info: "End group"
    },
    {
      label: "clear",
      type: "method",
      detail: "() -> void",
      info: "Clear console"
    }
  ],
  Math: [
    // Common operations
    snippetCompletion("floor(${1:x})", {
      label: "floor",
      type: "method",
      detail: "(x: number) -> number",
      info: "Round down"
    }),
    snippetCompletion("ceil(${1:x})", {
      label: "ceil",
      type: "method",
      detail: "(x: number) -> number",
      info: "Round up"
    }),
    snippetCompletion("round(${1:x})", {
      label: "round",
      type: "method",
      detail: "(x: number) -> number",
      info: "Round to nearest"
    }),
    snippetCompletion("trunc(${1:x})", {
      label: "trunc",
      type: "method",
      detail: "(x: number) -> number",
      info: "Remove decimals"
    }),
    snippetCompletion("abs(${1:x})", {
      label: "abs",
      type: "method",
      detail: "(x: number) -> number",
      info: "Absolute value"
    }),
    snippetCompletion("sign(${1:x})", {
      label: "sign",
      type: "method",
      detail: "(x: number) -> number",
      info: "Sign of number (-1, 0, 1)"
    }),
    // Min/max
    snippetCompletion("min(${1:a}, ${2:b})", {
      label: "min",
      type: "method",
      detail: "(...values: number[]) -> number",
      info: "Minimum value"
    }),
    snippetCompletion("max(${1:a}, ${2:b})", {
      label: "max",
      type: "method",
      detail: "(...values: number[]) -> number",
      info: "Maximum value"
    }),
    snippetCompletion("clamp(${1:x}, ${2:min}, ${3:max})", {
      label: "clamp",
      type: "method",
      detail: "(x, min, max) -> number",
      info: "Clamp to range (ES2024)"
    }),
    // Powers and roots
    snippetCompletion("pow(${1:base}, ${2:exp})", {
      label: "pow",
      type: "method",
      detail: "(base, exp) -> number",
      info: "Power"
    }),
    snippetCompletion("sqrt(${1:x})", {
      label: "sqrt",
      type: "method",
      detail: "(x: number) -> number",
      info: "Square root"
    }),
    snippetCompletion("cbrt(${1:x})", {
      label: "cbrt",
      type: "method",
      detail: "(x: number) -> number",
      info: "Cube root"
    }),
    snippetCompletion("hypot(${1:a}, ${2:b})", {
      label: "hypot",
      type: "method",
      detail: "(...values: number[]) -> number",
      info: "Hypotenuse"
    }),
    // Logarithms
    snippetCompletion("log(${1:x})", {
      label: "log",
      type: "method",
      detail: "(x: number) -> number",
      info: "Natural log"
    }),
    snippetCompletion("log10(${1:x})", {
      label: "log10",
      type: "method",
      detail: "(x: number) -> number",
      info: "Base 10 log"
    }),
    snippetCompletion("log2(${1:x})", {
      label: "log2",
      type: "method",
      detail: "(x: number) -> number",
      info: "Base 2 log"
    }),
    snippetCompletion("exp(${1:x})", {
      label: "exp",
      type: "method",
      detail: "(x: number) -> number",
      info: "e^x"
    }),
    // Trig
    snippetCompletion("sin(${1:x})", {
      label: "sin",
      type: "method",
      detail: "(radians: number) -> number"
    }),
    snippetCompletion("cos(${1:x})", {
      label: "cos",
      type: "method",
      detail: "(radians: number) -> number"
    }),
    snippetCompletion("tan(${1:x})", {
      label: "tan",
      type: "method",
      detail: "(radians: number) -> number"
    }),
    snippetCompletion("atan2(${1:y}, ${2:x})", {
      label: "atan2",
      type: "method",
      detail: "(y, x) -> number",
      info: "Angle in radians"
    }),
    // Random
    {
      label: "random",
      type: "method",
      detail: "() -> number",
      info: "Random 0-1"
    },
    // Constants
    { label: "PI", type: "property", detail: "number", info: "3.14159..." },
    { label: "E", type: "property", detail: "number", info: "2.71828..." }
  ],
  JSON: [
    snippetCompletion("parse(${1:text})", {
      label: "parse",
      type: "method",
      detail: "(text: string) -> any",
      info: "Parse JSON string"
    }),
    snippetCompletion("stringify(${1:value})", {
      label: "stringify",
      type: "method",
      detail: "(value: any, replacer?, space?) -> string",
      info: "Convert to JSON"
    })
  ],
  Object: [
    snippetCompletion("keys(${1:obj})", {
      label: "keys",
      type: "method",
      detail: "(obj: object) -> string[]",
      info: "Get property names"
    }),
    snippetCompletion("values(${1:obj})", {
      label: "values",
      type: "method",
      detail: "(obj: object) -> any[]",
      info: "Get property values"
    }),
    snippetCompletion("entries(${1:obj})", {
      label: "entries",
      type: "method",
      detail: "(obj: object) -> [string, any][]",
      info: "Get key-value pairs"
    }),
    snippetCompletion("fromEntries(${1:entries})", {
      label: "fromEntries",
      type: "method",
      detail: "(entries: [string, any][]) -> object",
      info: "Create from entries"
    }),
    snippetCompletion("assign(${1:target}, ${2:source})", {
      label: "assign",
      type: "method",
      detail: "(target, ...sources) -> object",
      info: "Copy properties"
    }),
    snippetCompletion("hasOwn(${1:obj}, ${2:prop})", {
      label: "hasOwn",
      type: "method",
      detail: "(obj, prop: string) -> boolean",
      info: "Has own property"
    }),
    snippetCompletion("freeze(${1:obj})", {
      label: "freeze",
      type: "method",
      detail: "(obj: T) -> T",
      info: "Make immutable"
    })
  ],
  Array: [
    snippetCompletion("isArray(${1:value})", {
      label: "isArray",
      type: "method",
      detail: "(value: any) -> boolean",
      info: "Check if array"
    }),
    snippetCompletion("from(${1:iterable})", {
      label: "from",
      type: "method",
      detail: "(iterable, mapFn?) -> any[]",
      info: "Create from iterable"
    }),
    snippetCompletion("of(${1:items})", {
      label: "of",
      type: "method",
      detail: "(...items) -> any[]",
      info: "Create from arguments"
    })
  ],
  String: [
    snippetCompletion("fromCharCode(${1:code})", {
      label: "fromCharCode",
      type: "method",
      detail: "(...codes: number[]) -> string"
    }),
    snippetCompletion("fromCodePoint(${1:code})", {
      label: "fromCodePoint",
      type: "method",
      detail: "(...codes: number[]) -> string"
    })
  ],
  Number: [
    snippetCompletion("isFinite(${1:value})", {
      label: "isFinite",
      type: "method",
      detail: "(value: any) -> boolean"
    }),
    snippetCompletion("isInteger(${1:value})", {
      label: "isInteger",
      type: "method",
      detail: "(value: any) -> boolean"
    }),
    snippetCompletion("isNaN(${1:value})", {
      label: "isNaN",
      type: "method",
      detail: "(value: any) -> boolean"
    }),
    snippetCompletion("parseFloat(${1:string})", {
      label: "parseFloat",
      type: "method",
      detail: "(string: string) -> number"
    }),
    snippetCompletion("parseInt(${1:string})", {
      label: "parseInt",
      type: "method",
      detail: "(string: string, radix?) -> number"
    }),
    {
      label: "MAX_SAFE_INTEGER",
      type: "property",
      detail: "number",
      info: "2^53 - 1"
    },
    {
      label: "MIN_SAFE_INTEGER",
      type: "property",
      detail: "number",
      info: "-(2^53 - 1)"
    },
    {
      label: "EPSILON",
      type: "property",
      detail: "number",
      info: "Smallest difference"
    }
  ],
  Date: [
    {
      label: "now",
      type: "method",
      detail: "() -> number",
      info: "Current timestamp"
    },
    snippetCompletion("parse(${1:dateString})", {
      label: "parse",
      type: "method",
      detail: "(dateString: string) -> number"
    }),
    snippetCompletion("UTC(${1:year}, ${2:month})", {
      label: "UTC",
      type: "method",
      detail: "(year, month, ...) -> number"
    })
  ],
  Promise: [
    snippetCompletion("resolve(${1:value})", {
      label: "resolve",
      type: "method",
      detail: "(value: T) -> Promise<T>"
    }),
    snippetCompletion("reject(${1:reason})", {
      label: "reject",
      type: "method",
      detail: "(reason: any) -> Promise<never>"
    }),
    snippetCompletion("all(${1:promises})", {
      label: "all",
      type: "method",
      detail: "(promises: Promise[]) -> Promise<any[]>",
      info: "Wait for all"
    }),
    snippetCompletion("allSettled(${1:promises})", {
      label: "allSettled",
      type: "method",
      detail: "(promises: Promise[]) -> Promise<Result[]>",
      info: "Wait for all to settle"
    }),
    snippetCompletion("race(${1:promises})", {
      label: "race",
      type: "method",
      detail: "(promises: Promise[]) -> Promise<any>",
      info: "First to resolve/reject"
    }),
    snippetCompletion("any(${1:promises})", {
      label: "any",
      type: "method",
      detail: "(promises: Promise[]) -> Promise<any>",
      info: "First to resolve"
    })
  ]
};
var INTROSPECTABLE_GLOBALS = {
  // Core JS globals (always available)
  console,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date,
  RegExp,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Promise,
  Reflect,
  Proxy,
  Symbol,
  Error,
  TypeError,
  RangeError,
  SyntaxError,
  ReferenceError,
  ArrayBuffer,
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Intl
};
if (typeof globalThis !== "undefined") {
  if (typeof crypto !== "undefined") INTROSPECTABLE_GLOBALS.crypto = crypto;
  if (typeof navigator !== "undefined")
    INTROSPECTABLE_GLOBALS.navigator = navigator;
  if (typeof localStorage !== "undefined")
    INTROSPECTABLE_GLOBALS.localStorage = localStorage;
  if (typeof sessionStorage !== "undefined")
    INTROSPECTABLE_GLOBALS.sessionStorage = sessionStorage;
  if (typeof fetch !== "undefined") INTROSPECTABLE_GLOBALS.fetch = fetch;
  if (typeof URL !== "undefined") INTROSPECTABLE_GLOBALS.URL = URL;
  if (typeof URLSearchParams !== "undefined")
    INTROSPECTABLE_GLOBALS.URLSearchParams = URLSearchParams;
  if (typeof Headers !== "undefined") INTROSPECTABLE_GLOBALS.Headers = Headers;
  if (typeof Request !== "undefined") INTROSPECTABLE_GLOBALS.Request = Request;
  if (typeof Response !== "undefined")
    INTROSPECTABLE_GLOBALS.Response = Response;
  if (typeof FormData !== "undefined")
    INTROSPECTABLE_GLOBALS.FormData = FormData;
  if (typeof Blob !== "undefined") INTROSPECTABLE_GLOBALS.Blob = Blob;
  if (typeof File !== "undefined") INTROSPECTABLE_GLOBALS.File = File;
  if (typeof FileReader !== "undefined")
    INTROSPECTABLE_GLOBALS.FileReader = FileReader;
  if (typeof AbortController !== "undefined")
    INTROSPECTABLE_GLOBALS.AbortController = AbortController;
  if (typeof TextEncoder !== "undefined")
    INTROSPECTABLE_GLOBALS.TextEncoder = TextEncoder;
  if (typeof TextDecoder !== "undefined")
    INTROSPECTABLE_GLOBALS.TextDecoder = TextDecoder;
  if (typeof Element !== "undefined") INTROSPECTABLE_GLOBALS.Element = Element;
  if (typeof HTMLElement !== "undefined")
    INTROSPECTABLE_GLOBALS.HTMLElement = HTMLElement;
  if (typeof Document !== "undefined")
    INTROSPECTABLE_GLOBALS.Document = Document;
  if (typeof Node !== "undefined") INTROSPECTABLE_GLOBALS.Node = Node;
  if (typeof Event !== "undefined") INTROSPECTABLE_GLOBALS.Event = Event;
  if (typeof CustomEvent !== "undefined")
    INTROSPECTABLE_GLOBALS.CustomEvent = CustomEvent;
  if (typeof MutationObserver !== "undefined")
    INTROSPECTABLE_GLOBALS.MutationObserver = MutationObserver;
  if (typeof ResizeObserver !== "undefined")
    INTROSPECTABLE_GLOBALS.ResizeObserver = ResizeObserver;
  if (typeof IntersectionObserver !== "undefined")
    INTROSPECTABLE_GLOBALS.IntersectionObserver = IntersectionObserver;
  if (typeof CanvasRenderingContext2D !== "undefined")
    INTROSPECTABLE_GLOBALS.CanvasRenderingContext2D = CanvasRenderingContext2D;
  if (typeof ImageData !== "undefined")
    INTROSPECTABLE_GLOBALS.ImageData = ImageData;
  if (typeof AudioContext !== "undefined")
    INTROSPECTABLE_GLOBALS.AudioContext = AudioContext;
  if (typeof performance !== "undefined")
    INTROSPECTABLE_GLOBALS.performance = performance;
  if (typeof PerformanceObserver !== "undefined")
    INTROSPECTABLE_GLOBALS.PerformanceObserver = PerformanceObserver;
  if (typeof document !== "undefined")
    INTROSPECTABLE_GLOBALS.document = document;
  if (typeof window !== "undefined") INTROSPECTABLE_GLOBALS.window = window;
}
function introspectObject(obj) {
  if (!obj || typeof obj !== "object" && typeof obj !== "function") {
    return [];
  }
  const completions = [];
  const seen = /* @__PURE__ */ new Set();
  try {
    const objectKeys = Object.keys(obj);
    if (objectKeys.length > 0) {
      for (const key of objectKeys) {
        if (key === "constructor" || key.startsWith("_") || seen.has(key))
          continue;
        seen.add(key);
        try {
          const value = obj[key];
          const valueType = typeof value;
          if (valueType === "function") {
            completions.push(
              snippetCompletion(`${key}(\${1})`, {
                label: key,
                type: "method",
                detail: "(...)"
              })
            );
          } else {
            completions.push({
              label: key,
              type: "property",
              detail: valueType
            });
          }
        } catch {
        }
      }
    }
  } catch {
  }
  let current = obj;
  while (current && current !== Object.prototype && current !== Function.prototype) {
    const keys = Object.getOwnPropertyNames(current);
    for (const key of keys) {
      if (key === "constructor" || key.startsWith("_") || seen.has(key)) {
        continue;
      }
      seen.add(key);
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        const value = descriptor?.value ?? (descriptor?.get ? "[getter]" : void 0);
        const valueType = typeof value;
        if (valueType === "function") {
          const fn = value;
          const paramCount = fn.length;
          const params = paramCount > 0 ? Array.from(
            { length: paramCount },
            (_, i) => `arg${i + 1}`
          ).join(", ") : "";
          completions.push(
            snippetCompletion(`${key}(${paramCount > 0 ? "${1}" : ""})`, {
              label: key,
              type: "method",
              detail: `(${params})`,
              boost: key.startsWith("to") ? -1 : 0
              // Demote toString, etc.
            })
          );
        } else {
          completions.push({
            label: key,
            type: "property",
            detail: valueType
          });
        }
      } catch {
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return completions;
}
function getPropertyCompletions(objName) {
  if (CURATED_PROPERTIES[objName]) {
    return CURATED_PROPERTIES[objName];
  }
  const obj = INTROSPECTABLE_GLOBALS[objName];
  if (!obj) return [];
  return introspectObject(obj);
}
function getCompletionsFromLiveBinding(name, liveBindings) {
  if (liveBindings && name in liveBindings) {
    return introspectObject(liveBindings[name]);
  }
  const elementTypeMap = {
    // Common variable names that are likely specific element types
    div: "HTMLDivElement",
    span: "HTMLSpanElement",
    input: "HTMLInputElement",
    button: "HTMLButtonElement",
    form: "HTMLFormElement",
    img: "HTMLImageElement",
    link: "HTMLLinkElement",
    anchor: "HTMLAnchorElement",
    table: "HTMLTableElement",
    canvas: "HTMLCanvasElement",
    video: "HTMLVideoElement",
    audio: "HTMLAudioElement",
    select: "HTMLSelectElement",
    textarea: "HTMLTextAreaElement"
    // iframe, etc.
  };
  const lowerName = name.toLowerCase();
  const elementType = elementTypeMap[lowerName];
  if (elementType && typeof globalThis !== "undefined") {
    const ElementClass = globalThis[elementType];
    if (ElementClass?.prototype) {
      return introspectObject(ElementClass.prototype);
    }
  }
  return [];
}
function getPathBeforeDot(source, dotPos) {
  const before = source.slice(0, dotPos);
  const match = before.match(
    /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*$/
  );
  return match ? match[1].replace(/\s+/g, "") : null;
}
function resolvePath(path, bindings) {
  if (!bindings) return void 0;
  const parts = path.split(".");
  let value = bindings[parts[0]];
  for (let i = 1; i < parts.length && value != null; i++) {
    try {
      value = value[parts[i]];
    } catch {
      return void 0;
    }
  }
  return value;
}
function getCompletionsFromPath(path, liveBindings) {
  const value = resolvePath(path, liveBindings);
  if (value != null && (typeof value === "object" || typeof value === "function")) {
    return introspectObject(value);
  }
  if (!path.includes(".")) {
    return getCompletionsFromLiveBinding(path, liveBindings);
  }
  return [];
}
function getPlaceholderForParam(name, info) {
  if (info.example !== void 0 && info.example !== null) {
    const ex = info.example;
    if (typeof ex === "string") return `'${ex}'`;
    if (typeof ex === "number" || typeof ex === "boolean") return String(ex);
    if (Array.isArray(ex)) return JSON.stringify(ex);
    if (typeof ex === "object") return JSON.stringify(ex);
    return String(ex);
  }
  const examples = info.type?.examples || info.examples;
  if (Array.isArray(examples) && examples.length > 0) {
    const ex = examples[0];
    if (typeof ex === "string") return `'${ex}'`;
    if (typeof ex === "number" || typeof ex === "boolean") return String(ex);
    if (Array.isArray(ex)) return JSON.stringify(ex);
    if (typeof ex === "object") return JSON.stringify(ex);
    return String(ex);
  }
  if (info.default !== void 0 && info.default !== null) {
    const def = info.default;
    if (typeof def === "string") return `'${def}'`;
    if (typeof def === "number" || typeof def === "boolean") return String(def);
    if (Array.isArray(def)) return JSON.stringify(def);
    if (typeof def === "object") return JSON.stringify(def);
    return String(def);
  }
  const kind = info.type?.kind || info.type?.type || "any";
  switch (kind) {
    case "string":
      return `'${name}'`;
    case "number":
      return "0";
    case "boolean":
      return "true";
    case "null":
      return "null";
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      return name;
  }
}
function tjsCompletionSource(config = {}) {
  return async (context) => {
    try {
      const word = context.matchBefore(/[\w$]*/);
      if (!word) return null;
      const source = context.state.doc.toString();
      const pos = context.pos;
      const skipRegions = findSkipRegions(source);
      if (isInSkipRegion(pos, skipRegions)) {
        return null;
      }
      const lineStart = context.state.doc.lineAt(pos).from;
      const lineBefore = source.slice(lineStart, word.from);
      const charBefore = source.slice(Math.max(0, word.from - 1), word.from);
      if (word.from === word.to && !context.explicit && charBefore !== ".") {
        return null;
      }
      let options = [];
      if (charBefore === ".") {
        const before = source.slice(Math.max(0, word.from - 50), word.from);
        if (/expect\s*\([^)]*\)\s*\.$/.test(before)) {
          options = EXPECT_MATCHERS;
        } else {
          const path = getPathBeforeDot(source, word.from - 1);
          if (path) {
            if (!path.includes(".")) {
              options = getPropertyCompletions(path);
            }
            if (options.length === 0) {
              const liveBindings = config.getLiveBindings?.();
              options = getCompletionsFromPath(path, liveBindings);
            }
            if (options.length === 0 && config.getMembers) {
              const members = await config.getMembers(path);
              if (members && members.length) {
                options = members.map(memberToCompletion);
              }
            }
          }
        }
      } else if (/:\s*$/.test(lineBefore)) {
        options = TJS_TYPES;
      } else if (/->\s*$/.test(lineBefore)) {
        options = TJS_TYPES;
      } else {
        options = [
          ...TJS_COMPLETIONS,
          ...RUNTIME_COMPLETIONS,
          ...GLOBAL_COMPLETIONS,
          ...completionsFromScope(source, pos)
        ];
        const metadata = config.getMetadata?.();
        if (metadata) {
          for (const [name, meta] of Object.entries(metadata)) {
            const paramEntries = meta.params ? Object.entries(meta.params) : [];
            const paramList = paramEntries.map(([pName, pInfo]) => {
              const pType = pInfo.type?.kind || pInfo.type?.type || "any";
              const optional = !pInfo.required;
              return optional ? `${pName}?: ${pType}` : `${pName}: ${pType}`;
            }).join(", ");
            const snippetParams = paramEntries.map(([pName, pInfo], i) => {
              const placeholder = getPlaceholderForParam(pName, pInfo);
              return `\${${i + 1}:${placeholder}}`;
            }).join(", ");
            const returnType = meta.returns?.type || meta.returns?.kind || "void";
            let infoText = meta.description || "";
            for (const [pName, pInfo] of paramEntries) {
              const pExamples = pInfo.type?.examples || pInfo.examples;
              if (Array.isArray(pExamples) && pExamples.length > 0) {
                const formatted = pExamples.map(
                  (ex) => typeof ex === "string" ? `'${ex}'` : String(ex)
                ).join(", ");
                infoText += `${infoText ? "\n" : ""}${pName}: e.g. ${formatted}`;
              }
            }
            options.push(
              snippetCompletion(`${name}(${snippetParams})`, {
                label: name,
                type: "function",
                detail: `(${paramList}) -> ${returnType}`,
                info: infoText || void 0,
                boost: 2
                // Boost user-defined functions above globals
              })
            );
          }
        }
      }
      if (options.length === 0) return null;
      return {
        from: word.from,
        options,
        validFor: /^[\w$]*$/
      };
    } catch (e) {
      console.warn("TJS autocomplete error:", e);
      return null;
    }
  };
}
function ajsEditorExtension(config = {}) {
  return [
    javascript({ jsx: config.jsx, typescript: config.typescript }),
    // Syntax highlighting comes from customSetup (defaultHighlightStyle with fallback)
    // or from the active theme (e.g. oneDark)
    forbiddenHighlighter,
    tryWithoutCatchHighlighter,
    ajsTheme,
    autocompletion({
      override: [tjsCompletionSource(config.autocomplete || {})],
      activateOnTyping: true
    })
  ];
}
function tjsEditorExtension(config = {}) {
  return [
    javascript({ jsx: config.jsx, typescript: config.typescript }),
    // Syntax highlighting comes from customSetup (defaultHighlightStyle with fallback)
    // or from the active theme (e.g. oneDark)
    tjsForbiddenHighlighter,
    // Use TJS forbidden list (more permissive)
    tryWithoutCatchHighlighter,
    ajsTheme,
    autocompletion({
      override: [tjsCompletionSource(config.autocomplete || {})],
      activateOnTyping: true
    })
  ];
}
function ajsLanguage(config = {}) {
  const jsLang = javascript({ jsx: config.jsx, typescript: config.typescript });
  return new LanguageSupport(jsLang.language, [
    forbiddenHighlighter,
    tryWithoutCatchHighlighter,
    ajsTheme
  ]);
}
export {
  FORBIDDEN_KEYWORDS3 as FORBIDDEN_KEYWORDS,
  ajsEditorExtension as ajs,
  ajsEditorExtension,
  ajsLanguage,
  tjsCompletionSource,
  tjsEditorExtension
};
