/**
 * Conversion that survives GRADUATION (#1992, #2022, #2040).
 *
 * `fromTS` writes a file that carries a `tjs <- source` annotation, which means JAVASCRIPT
 * semantics. Graduating removes the annotation, and every native-TJS rule switches on at once:
 * `'5' == 5` stops being true, `typeof null` becomes `'null'`, `n = 5` narrows to an integer,
 * an object-literal default becomes a dictionary, and `var` and `new Date()` are refused. A
 * converted file that relied on any of those either changed meaning silently or stopped
 * compiling.
 *
 * So the converter writes each such site in a spelling that means the SAME thing under both
 * semantics, and states the reliance at the site, where the upgrade is a one-word deletion:
 *
 *   a == b                  →  DangerousLegacyEquals(a, b)    (kept as `==` against null/undefined)
 *   a != b                  →  DangerousLegacyNot(a, b)
 *   typeof x                →  LegacyTypeOf(x)                 (kept where the answer cannot be 'object')
 *   new Date(…)             →  LegacyDate(…)
 *   new String(x)           →  Object(`${x}`)   (and Number/Boolean: Object(Number(x)) …)
 *   f(n = 5)                →  f(n = 5.0)                      (a float example: `number`, as TS meant)
 *   f(o = { x: 0 })         →  f(o = LegacyDefault({ x: 0 }))  (atomic, as JavaScript meant)
 *   var x = 1 (anywhere)    →  let x  at the top of its function, and  x = 1  where it was
 *
 * The hoisted `let` is exactly `var`'s scoping (function-wide, `undefined` until assigned, one
 * binding shared by every loop iteration), so closures over a loop variable behave as before.
 *
 * Not rewritten, because nothing can be: `eval` and `new Function`, which native TJS refuses
 * outright. `graduate()` reports them by name instead of emitting a file that does not compile.
 * And one change is ACCEPTED rather than preserved: native truthiness unwraps boxed primitives
 * (`new Boolean(false)` is false). Nobody relies on a boxed false being true on purpose.
 *
 * This runs on the TypeScript source, before the rest of `fromTS`, using TypeScript's own AST.
 * Each node is re-emitted as its source text with its rewritten children spliced in, so nested
 * rewrites compose (`a == b == c`) and every comment and line break is kept.
 */
import ts from 'typescript'

const isNullish = (n: ts.Expression): boolean =>
  n.kind === ts.SyntaxKind.NullKeyword ||
  (ts.isIdentifier(n) && n.text === 'undefined') ||
  (ts.isVoidExpression(n) && ts.isNumericLiteral(n.expression))

/** `typeof x === 'string'` (and friends): the answer can never be 'object' or 'null' here. */
function typeofComparedToNonObject(node: ts.TypeOfExpression): boolean {
  const p = node.parent
  if (!p || !ts.isBinaryExpression(p)) return false
  const op = p.operatorToken.kind
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    op !== ts.SyntaxKind.EqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsToken
  )
    return false
  const other = p.left === node ? p.right : p.left
  return ts.isStringLiteralLike(other) && other.text !== 'object'
}

/** Function-like nodes own a `var` scope. */
const isVarScope = (
  n: ts.Node
): n is ts.FunctionLikeDeclaration | ts.SourceFile =>
  ts.isSourceFile(n) ||
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n)

const isVarList = (n: ts.Node | undefined): n is ts.VariableDeclarationList =>
  !!n &&
  ts.isVariableDeclarationList(n) &&
  !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using))

/** The names bound by a binding pattern or identifier. */
function bound(name: ts.BindingName, out: string[] = []): string[] {
  if (ts.isIdentifier(name)) out.push(name.text)
  else
    for (const el of name.elements)
      if (!ts.isOmittedExpression(el)) bound(el.name, out)
  return out
}

/** The `var` names a scope hoists (not entering nested scopes), each with its type text. */
function hoistedVars(
  scope: ts.Node,
  source: ts.SourceFile
): Map<string, string | undefined> {
  const names = new Map<string, string | undefined>()
  const visit = (n: ts.Node) => {
    if (n !== scope && isVarScope(n)) return
    if (isVarList(n))
      for (const d of n.declarations)
        for (const name of bound(d.name))
          if (!names.has(name))
            names.set(
              name,
              ts.isIdentifier(d.name) && d.type
                ? d.type.getText(source)
                : undefined
            )
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(scope, visit)
  return names
}

function paramNames(scope: ts.Node): Set<string> {
  const out = new Set<string>()
  if (!ts.isSourceFile(scope))
    for (const p of (scope as ts.FunctionLikeDeclaration).parameters)
      bound(p.name).forEach((n) => out.add(n))
  return out
}

export interface FaithfulResult {
  code: string
  /** How many sites were rewritten, by kind, for reporting. */
  rewrites: Record<string, number>
}

/** Refused in native TJS (#4012), rewritten to `Object(…)` by conversion. */
const BOXED_CONSTRUCTORS = new Set(['String', 'Number', 'Boolean'])

export function faithfulForGraduation(
  source: string,
  filename = 'input.ts'
): FaithfulResult {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
  const rewrites: Record<string, number> = {}
  const count = (k: string) => (rewrites[k] = (rewrites[k] ?? 0) + 1)

  /** The text of `node` from its first token, with rewritten children spliced in. */
  const emit = (node: ts.Node): string => {
    const own = rewrite(node)
    if (own !== null) return own
    return splice(node)
  }

  const splice = (node: ts.Node): string => {
    const start = node.getStart(sf)
    let out = ''
    let at = start
    node.forEachChild((child) => {
      const cs = child.getStart(sf)
      if (cs < at) return // a child inside trivia already copied (JSDoc)
      out += source.slice(at, cs) + emit(child)
      at = child.end
    })
    return out + source.slice(at, node.end)
  }

  /** Text for a node this pass rewrites, or null to splice it unchanged. */
  const rewrite = (node: ts.Node): string | null => {
    // == / != (but not against null/undefined, where TJS means the same thing)
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind
      if (
        (op === ts.SyntaxKind.EqualsEqualsToken ||
          op === ts.SyntaxKind.ExclamationEqualsToken) &&
        !isNullish(node.left) &&
        !isNullish(node.right)
      ) {
        count(op === ts.SyntaxKind.EqualsEqualsToken ? '==' : '!=')
        const fn =
          op === ts.SyntaxKind.EqualsEqualsToken
            ? 'DangerousLegacyEquals'
            : 'DangerousLegacyNot'
        return `${fn}(${emit(node.left)}, ${emit(node.right)})`
      }
    }
    if (ts.isTypeOfExpression(node) && !typeofComparedToNonObject(node)) {
      count('typeof')
      return `LegacyTypeOf(${emit(node.expression)})`
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      // An explicit `/* @tjs-unsafe */ new Date(…)` is the author's own exception: leave it
      // to the annotation bridge. (The text before the first token, not
      // `getLeadingCommentRanges`, which skips a comment on the previous token's line.)
      !source.slice(node.pos, node.getStart(sf)).includes('@tjs-unsafe')
    ) {
      count('new Date')
      const args = node.arguments?.map(emit).join(', ') ?? ''
      return `LegacyDate(${args})`
    }
    // The boxed-primitive constructors are refused in native TJS (#4012); `Object(…)` builds
    // the same wrapper and means the same under both semantics. EXACT, not close: `new
    // String(sym)` throws where `String(sym)` does not, and a template literal throws as the
    // constructor does. With more than one argument the extras are still evaluated, so no
    // one-argument rewrite preserves it; that rare form is left for graduation to refuse.
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      BOXED_CONSTRUCTORS.has(node.expression.text) &&
      (node.arguments?.length ?? 0) <= 1
    ) {
      const ctor = node.expression.text
      count(`new ${ctor}`)
      const arg = node.arguments?.[0]
      if (!arg)
        return ctor === 'String'
          ? "Object('')"
          : ctor === 'Number'
          ? 'Object(0)'
          : 'Object(false)'
      const a = emit(arg)
      return ctor === 'String'
        ? `Object(\`\${${a}}\`)`
        : `Object(${ctor}(${a}))`
    }
    // Parameter defaults: an integer literal narrows in TJS; an object literal merges.
    if (ts.isParameter(node) && node.initializer) {
      const init = node.initializer
      const head = source.slice(node.getStart(sf), init.getStart(sf))
      if (!node.type && isIntegerLiteral(init)) {
        count('integer default')
        return head + init.getText(sf) + '.0'
      }
      if (ts.isObjectLiteralExpression(init)) {
        count('object default')
        return `${head}LegacyDefault(${emit(init)})`
      }
    }
    // var: hoisted to the top of its scope as `let`, assigned where it was declared.
    if (ts.isVariableStatement(node) && isVarList(node.declarationList)) {
      count('var')
      const assigns = assignments(node.declarationList)
      const exported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      )
      if (exported) return assigns ? `${assigns};` : ''
      return assigns ? `${assigns};` : ''
    }
    if (
      (ts.isForStatement(node) && isVarList(node.initializer)) ||
      ((ts.isForInStatement(node) || ts.isForOfStatement(node)) &&
        isVarList(node.initializer))
    ) {
      count('var')
      const list = node.initializer as ts.VariableDeclarationList
      const replacement = ts.isForStatement(node)
        ? assignments(list)
        : bound(list.declarations[0]!.name).length === 1 &&
          ts.isIdentifier(list.declarations[0]!.name)
        ? list.declarations[0]!.name.text
        : list.declarations[0]!.name.getText(sf)
      const text = splice(node)
      const ls = list.getStart(sf) - node.getStart(sf)
      const le = list.end - node.getStart(sf)
      return text.slice(0, ls) + replacement + text.slice(le)
    }
    // A scope with vars gets `let a, b` (and `export let` at module level) at its top.
    if (isVarScope(node)) {
      const names = hoistedVars(node, sf)
      const params = paramNames(node)
      for (const p of params) names.delete(p)
      if (!names.size) return null
      const exportedNames = ts.isSourceFile(node)
        ? exportedVarNames(node)
        : new Set()
      const decl = (list: [string, string | undefined][]) =>
        list.map(([n, t]) => (t ? `${n}: ${t}` : n)).join(', ')
      const plain = [...names].filter(([n]) => !exportedNames.has(n))
      const exported = [...names].filter(([n]) => exportedNames.has(n))
      const hoist =
        (plain.length ? `let ${decl(plain)};` : '') +
        (exported.length ? `export let ${decl(exported)};` : '')
      if (ts.isSourceFile(node)) return hoist + '\n' + splice(node)
      const body = (node as ts.FunctionLikeDeclaration).body
      if (!body || !ts.isBlock(body)) return null
      const text = splice(node)
      const brace = body.getStart(sf) - node.getStart(sf) + 1
      return text.slice(0, brace) + ' ' + hoist + text.slice(brace)
    }
    return null
  }

  /** `var a = 1, b, {c} = o` → `a = 1, ({c} = o)`; declarations without initializers vanish. */
  const assignments = (list: ts.VariableDeclarationList): string =>
    list.declarations
      .filter((d) => d.initializer)
      .map((d) => {
        const target = d.name.getText(sf)
        const value = emit(d.initializer!)
        return ts.isIdentifier(d.name)
          ? `${target} = ${value}`
          : `(${target} = ${value})`
      })
      .join(', ')

  const exportedVarNames = (file: ts.SourceFile): Set<string> => {
    const out = new Set<string>()
    for (const st of file.statements)
      if (
        ts.isVariableStatement(st) &&
        isVarList(st.declarationList) &&
        st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      )
        for (const d of st.declarationList.declarations)
          bound(d.name).forEach((n) => out.add(n))
    return out
  }

  const body = emit(sf)
  // `emit(sf)` starts at the first token: keep any leading comments and the shebang.
  const code = source.slice(0, sf.getStart(sf)) + body
  return { code, rewrites }
}

function isIntegerLiteral(n: ts.Expression): boolean {
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken)
    return isIntegerLiteral(n.operand)
  return (
    ts.isNumericLiteral(n) && /^\d+$/.test(n.text) // `5`, not `5.5`, `1e3`, `0x10` (those are not integer examples)
  )
}
