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
var FORBIDDEN_SET = new Set(FORBIDDEN_KEYWORDS);
var KEYWORDS_SET = new Set(KEYWORDS);
var FORBIDDEN_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`,
  "g"
);

// editors/monaco/ajs-monarch.ts
var languageId = "ajs";
var languageConfiguration = {
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"]
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: '"', close: '"', notIn: ["string", "comment"] },
    { open: "`", close: "`", notIn: ["string", "comment"] }
  ],
  surroundingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: "`", close: "`" }
  ],
  folding: {
    markers: {
      start: /^\s*\/\/\s*#region\b/,
      end: /^\s*\/\/\s*#endregion\b/
    }
  }
};
var monarchLanguage = {
  defaultToken: "source",
  ignoreCase: false,
  // Good parts - standard keywords (from shared definition)
  keywords: [...KEYWORDS],
  // Bad parts - forbidden in AsyncJS (from shared definition)
  forbidden: [...FORBIDDEN_KEYWORDS],
  // Built-in type constructors used as factories (from shared definition)
  typeKeywords: [...TYPE_CONSTRUCTORS],
  operators: [
    "=",
    ">",
    "<",
    "!",
    "~",
    "?",
    ":",
    "==",
    "<=",
    ">=",
    "!=",
    "&&",
    "||",
    "++",
    "--",
    "+",
    "-",
    "*",
    "/",
    "&",
    "|",
    "^",
    "%",
    "<<",
    ">>",
    ">>>",
    "+=",
    "-=",
    "*=",
    "/=",
    "&=",
    "|=",
    "^=",
    "%=",
    "<<=",
    ">>=",
    ">>>="
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  tokenizer: {
    root: [
      // Identifiers and keywords
      [
        /[a-zA-Z_$][\w$]*/,
        {
          cases: {
            "@forbidden": "invalid",
            // Red squiggly for bad parts
            "@keywords": "keyword",
            "@typeKeywords": "type.identifier",
            "@default": "identifier"
          }
        }
      ],
      // Whitespace
      { include: "@whitespace" },
      // Delimiters and operators
      [/[{}()\[\]]/, "@brackets"],
      [
        /@symbols/,
        {
          cases: {
            "@operators": "operator",
            "@default": ""
          }
        }
      ],
      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
      [/0[xX][0-9a-fA-F]+/, "number.hex"],
      [/\d+/, "number"],
      // Delimiter: after number because of .\d floats
      [/[;,.]/, "delimiter"],
      // Strings
      [/'/, { token: "string.quote", bracket: "@open", next: "@stringSingle" }],
      [/"/, { token: "string.quote", bracket: "@open", next: "@stringDouble" }],
      [
        /`/,
        {
          token: "string.quote",
          bracket: "@open",
          next: "@stringBacktick"
        }
      ]
    ],
    stringSingle: [
      [/[^\\']+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/'/, { token: "string.quote", bracket: "@close", next: "@pop" }]
    ],
    stringDouble: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }]
    ],
    stringBacktick: [
      [/[^\\`$]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [
        /\$\{/,
        {
          token: "delimiter.bracket",
          next: "@stringTemplateExpression"
        }
      ],
      [/`/, { token: "string.quote", bracket: "@close", next: "@pop" }]
    ],
    stringTemplateExpression: [
      [/[^}]+/, "identifier"],
      [/\}/, { token: "delimiter.bracket", next: "@pop" }]
    ],
    whitespace: [
      [/[ \t\r\n]+/, "white"],
      [/\/\*\*(?!\/)/, "comment.doc", "@docComment"],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"]
    ],
    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"]
    ],
    docComment: [
      [/@\w+/, "comment.doc.tag"],
      [/[^\/*]+/, "comment.doc"],
      [/\*\//, "comment.doc", "@pop"],
      [/[\/*]/, "comment.doc"]
    ]
  }
};
function registerAjsLanguage(monaco) {
  monaco.languages.register({ id: languageId });
  monaco.languages.setLanguageConfiguration(languageId, languageConfiguration);
  monaco.languages.setMonarchTokensProvider(languageId, monarchLanguage);
}
export {
  languageConfiguration,
  languageId,
  monarchLanguage,
  registerAjsLanguage
};
