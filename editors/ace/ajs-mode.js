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

// editors/ace/ajs-mode.ts
var FORBIDDEN_KEYWORDS2 = [...FORBIDDEN_KEYWORDS];
var KEYWORDS2 = [...KEYWORDS];
var CONSTANTS = ["true", "false", "null", "undefined"];
var BUILTINS = [...TYPE_CONSTRUCTORS];
function createAjsHighlightRules(ace) {
  const oop = ace.require("ace/lib/oop");
  const TextHighlightRules = ace.require(
    "ace/mode/text_highlight_rules"
  ).TextHighlightRules;
  function AjsHighlightRules() {
    const keywordMapper = this.createKeywordMapper(
      {
        "invalid.illegal": FORBIDDEN_KEYWORDS2.join("|"),
        keyword: KEYWORDS2.join("|"),
        "constant.language": CONSTANTS.join("|"),
        "support.function": BUILTINS.join("|")
      },
      "identifier"
    );
    this.$rules = {
      start: [
        // Comments
        {
          token: "comment.line",
          regex: /\/\/.*$/
        },
        {
          token: "comment.block.documentation",
          regex: /\/\*\*/,
          next: "doc_comment"
        },
        {
          token: "comment.block",
          regex: /\/\*/,
          next: "block_comment"
        },
        // Strings - must come before keywords to avoid highlighting inside strings
        {
          token: "string.quoted.single",
          regex: /'(?:[^'\\]|\\.)*'/
        },
        {
          token: "string.quoted.double",
          regex: /"(?:[^"\\]|\\.)*"/
        },
        // Template literals with embedded expressions
        {
          token: "string.template",
          regex: /`/,
          next: "template_string"
        },
        // Numbers
        {
          token: "constant.numeric.float",
          regex: /\d+\.\d+(?:[eE][+-]?\d+)?/
        },
        {
          token: "constant.numeric.hex",
          regex: /0[xX][0-9a-fA-F]+/
        },
        {
          token: "constant.numeric",
          regex: /\d+/
        },
        // Function definition
        {
          token: ["keyword", "text", "entity.name.function"],
          regex: /(function)(\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)/
        },
        // Keywords and identifiers
        {
          token: keywordMapper,
          regex: /[a-zA-Z_$][a-zA-Z0-9_$]*/
        },
        // Operators
        {
          token: "keyword.operator",
          regex: /\+\+|--|\*\*|&&|\|\||==|!=|>=|<=|=>|[+\-*/%=<>!&|^~?:]/
        },
        // Brackets
        {
          token: "paren.lparen",
          regex: /[{(\[]/
        },
        {
          token: "paren.rparen",
          regex: /[})\]]/
        },
        // Punctuation
        {
          token: "punctuation",
          regex: /[;,.:]/
        }
      ],
      block_comment: [
        {
          token: "comment.block",
          regex: /\*\//,
          next: "start"
        },
        {
          defaultToken: "comment.block"
        }
      ],
      doc_comment: [
        {
          token: "comment.block.documentation",
          regex: /\*\//,
          next: "start"
        },
        {
          token: "keyword.other.documentation",
          regex: /@(?:param|returns?|description|example)\b/
        },
        {
          defaultToken: "comment.block.documentation"
        }
      ],
      template_string: [
        {
          token: "string.template",
          regex: /`/,
          next: "start"
        },
        {
          token: "constant.character.escape",
          regex: /\\./
        },
        {
          token: "paren.quasi.start",
          regex: /\$\{/,
          push: "template_expression"
        },
        {
          defaultToken: "string.template"
        }
      ],
      template_expression: [
        {
          token: "paren.quasi.end",
          regex: /\}/,
          next: "pop"
        },
        {
          include: "start"
        }
      ]
    };
    this.normalizeRules();
  }
  oop.inherits(AjsHighlightRules, TextHighlightRules);
  return AjsHighlightRules;
}
function createAjsMode(ace) {
  const oop = ace.require("ace/lib/oop");
  const TextMode = ace.require("ace/mode/text").Mode;
  const MatchingBraceOutdent = ace.require(
    "ace/mode/matching_brace_outdent"
  ).MatchingBraceOutdent;
  const CstyleBehaviour = ace.require(
    "ace/mode/behaviour/cstyle"
  ).CstyleBehaviour;
  const CStyleFoldMode = ace.require("ace/mode/folding/cstyle").FoldMode;
  const AjsHighlightRules = createAjsHighlightRules(ace);
  function AjsMode() {
    this.HighlightRules = AjsHighlightRules;
    this.$outdent = new MatchingBraceOutdent();
    this.$behaviour = new CstyleBehaviour();
    this.foldingRules = new CStyleFoldMode();
  }
  oop.inherits(AjsMode, TextMode);
  (function() {
    this.lineCommentStart = "//";
    this.blockComment = { start: "/*", end: "*/" };
    this.getNextLineIndent = function(state, line, tab) {
      let indent = this.$getIndent(line);
      if (state === "start") {
        const match = line.match(/^.*[{(\[]\s*$/);
        if (match) {
          indent += tab;
        }
      }
      return indent;
    };
    this.checkOutdent = function(state, line, input) {
      return this.$outdent.checkOutdent(line, input);
    };
    this.autoOutdent = function(state, doc, row) {
      this.$outdent.autoOutdent(doc, row);
    };
    this.$id = "ace/mode/ajs";
  }).call(AjsMode.prototype);
  return AjsMode;
}
function registerAjsMode(ace) {
  const AjsMode = createAjsMode(ace);
  ace.define(
    "ace/mode/ajs",
    ["require", "exports", "module"],
    function(_require, exports) {
      exports.Mode = AjsMode;
    }
  );
}
export {
  BUILTINS,
  CONSTANTS,
  FORBIDDEN_KEYWORDS2 as FORBIDDEN_KEYWORDS,
  KEYWORDS2 as KEYWORDS,
  registerAjsMode
};
