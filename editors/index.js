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

// editors/introspect-value.ts
function introspectValue(value) {
  if (value == null || typeof value !== "object" && typeof value !== "function") {
    return [];
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (key, v) => {
    if (key === "constructor" || key.startsWith("_") || seen.has(key)) return;
    seen.add(key);
    if (typeof v === "function") {
      const arity = v.length ?? 0;
      const params = arity > 0 ? Array.from({ length: arity }, (_, i) => `arg${i + 1}`).join(", ") : "";
      out.push({ label: key, type: "method", detail: `(${params})` });
    } else {
      out.push({ label: key, type: "property", detail: typeof v });
    }
  };
  try {
    for (const key of Object.keys(value)) {
      try {
        push(key, value[key]);
      } catch {
      }
    }
  } catch {
  }
  let current = value;
  while (current && current !== Object.prototype && current !== Function.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor" || key.startsWith("_") || seen.has(key))
        continue;
      try {
        const d = Object.getOwnPropertyDescriptor(current, key);
        const v = d?.value ?? (d?.get ? "[getter]" : void 0);
        push(key, v);
      } catch {
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return out;
}
var INTROSPECT_VALUE_SOURCE = introspectValue.toString();

// editors/index.ts
function scopeCaptureEpilogue(source, captureVar) {
  const names = [
    ...new Set(
      collectScopeSymbols(source).filter((s) => s.kind !== "parameter").map((s) => s.name).filter((n) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n))
    )
  ];
  if (names.length === 0) return "";
  const pairs = names.map((n) => `${n}`).join(", ");
  return `
try { ${captureVar}({ ${pairs} }) } catch {}
`;
}
export {
  INTROSPECT_VALUE_SOURCE,
  collectScopeSymbols,
  introspectValue,
  scopeCaptureEpilogue
};
