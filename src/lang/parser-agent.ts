/**
 * The AJS parse core — deliberately NOT `parse()` with a flag.
 *
 * AJS is a JavaScript subset plus colon-shorthand signatures. That is the whole language
 * (`DOCS-AJS.md` § Syntax), and this file is the whole parse path for it: blank a hashbang,
 * strip line comments, transform parameter/return annotations, hand the result to acorn.
 * Four steps, all of them things AJS actually has.
 *
 * **One shared surface, named rather than glossed.** `transformParenExpressions` and
 * `extractParamMarkers` live in `parser-params.ts` and are shared with TJS's parser. The
 * 0.13.10 review (m-1) found the consequence: TJS safety markers (`!`/`?` on params, `:!`/`:?`
 * on returns) are still *accepted* here and silently discarded, so an author writing
 * `function main(!apiKey: '')` gets the opposite of what the marker documents. Nothing
 * executes and no capability leaks, but the list below is a list of TRANSFORMS, not a
 * guarantee about every byte of behaviour reachable through them — and the fix is to make the
 * shared function reject markers when the caller supplies no unsafe/safe sets, which is
 * tracked in TODO.md rather than done in passing.
 *
 * ## Why this is a separate function rather than a `vmTarget` gate
 *
 * `parse()` applies ~30 source transforms. Exactly TWO consulted `options.vmTarget`, so the
 * other ~28 ran for AJS whether or not AJS had the construct — not a policy, the absence of
 * one. Seven TJS-only constructs were accepted on the AJS path that way (bang access, `Is`,
 * inline `wasm function`, `Type`, `Generic`, `extend`, `FunctionPredicate`), and an eighth —
 * `test '…' { … }` — called `new Function(body)()` on submitted source at transpile time,
 * upstream of fuel, timeout, capabilities and the membrane. It was reachable from two public
 * Cloud Functions endpoints. See `eval-no-transpile-execution.test.ts`.
 *
 * **A gate fails OPEN.** Seventeen transforms, one missing guard, months unnoticed, found by a
 * security review rather than by any test — because the property was maintained by remembering
 * to write `!options.vmTarget`, and remembering is not a mechanism.
 *
 * **Layering fails CLOSED.** A new TJS transform cannot leak onto the AJS path because it does
 * not live here. Adding one means editing `parser.ts`; this file is not on that path and does
 * not need to be touched, so there is nothing to forget. That is the entire point of the split,
 * and it is why the shared steps below are named individually instead of being factored into a
 * "common preprocess" helper that both sides call — a shared helper is a gate again, one edit
 * away from carrying a TJS transform across.
 *
 * ## The bar for adding a step here
 *
 * Does AJS *have* this construct? Not "is it harmless", not "it's already written" — inertness
 * is what the seven leaks had, right up until one of them wasn't. If the answer is no, it
 * belongs in `parser.ts`.
 */

import * as acorn from 'acorn'
import type { Program } from 'acorn'
import { hashbangOf, stripLineComments } from '../strip-comments'
import { SyntaxError } from './types'
import { transformParenExpressions, extractParamMarkers } from './parser-params'

export interface AgentParseOptions {
  filename?: string
}

export interface AgentPreprocessResult {
  /** The source acorn parses. Every AST position indexes into THIS. */
  source: string
  /** The author's source, before any transform. Docs and signatures are read from it. */
  originalSource: string
  /** Parameters marked required (`name!: example`). */
  requiredParams: Set<string>
  /** Offsets IN `source` where a required parameter's value begins. */
  requiredValueOffsets: Set<number>
  returnType?: string
}

/**
 * Apply the AJS-legal source transforms. Everything TJS adds on top of JavaScript —
 * modes, directives, `Type`/`Generic`/`Union`/`Enum`/`extend`/`FunctionPredicate`, `given`,
 * `const!`, bang access, `Is`, wasm, inline tests, `unsafe` statements — is absent by
 * construction, not disabled by a flag.
 *
 * EXCEPT param/return SAFETY MARKERS, which this listed as absent and which are not: they ride
 * in on the shared `transformParenExpressions` and are stripped-and-dropped (review m-1, see
 * the header). Corrected here rather than left to read as a guarantee — a doc comment claiming
 * a property the code does not have is the failure mode this whole file was written to end.
 */
export function preprocessAgentSource(
  source: string,
  _options: AgentParseOptions = {}
): AgentPreprocessResult {
  // A `#!` line is standard ECMAScript (ES2023) and therefore inside the JS subset AJS is.
  // BLANKED rather than sliced so every later offset still points at the right line/column.
  const shebang = hashbangOf(source)
  if (shebang)
    source = ' '.repeat(shebang.length) + source.slice(shebang.length)

  const originalSource = source

  // Line comments go early: the annotation transform below is textual, and an apostrophe
  // in a comment is otherwise indistinguishable from an opening quote. Newlines are kept,
  // so line numbers in diagnostics survive.
  source = stripLineComments(source)

  const requiredParams = new Set<string>()
  const typeNameOptionals = new Set<string>()

  // Colon shorthand: `function f(n: 0, s = 'x'): 0`. This is the one piece of syntax AJS
  // has that JavaScript does not, and it is load-bearing — the entry function's parameter
  // examples become the agent's input contract.
  //
  // `declaredTypes` and `hoistedTypeArgs` are deliberately not passed: applied types
  // (`b: Box<int>`) require a `Type`/`Generic` declaration, and AJS has neither. An
  // annotation of that shape is left alone here and fails at acorn or in the AST emitter,
  // which is the honest outcome for syntax the language does not have.
  const { source: transformed, returnType } = transformParenExpressions(
    source,
    {
      originalSource,
      requiredParams,
      typeNameOptionals,
      unsafeFunctions: new Set<string>(),
      safeFunctions: new Set<string>(),
    }
  )
  source = transformed

  // Markers out, offsets in — see `extractParamMarkers`. Acorn and the AST emitter see
  // source that never contained a marker.
  const marked = extractParamMarkers(source)

  return {
    source: marked.source,
    originalSource,
    requiredParams,
    requiredValueOffsets: marked.required,
    returnType,
  }
}

/**
 * Parse AJS source into an acorn AST. The AJS counterpart of `parse()`.
 */
export function parseAgentSource(
  source: string,
  options: AgentParseOptions = {}
): AgentPreprocessResult & { ast: Program; processedSource: string } {
  const { filename = '<source>' } = options
  const pre = preprocessAgentSource(source, options)

  try {
    const ast = acorn.parse(pre.source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })
    return { ...pre, ast, processedSource: pre.source }
  } catch (e: any) {
    const loc = e.loc || { line: 1, column: 0 }
    throw new SyntaxError(
      e.message.replace(/\s*\(\d+:\d+\)$/, ''),
      loc,
      pre.originalSource,
      filename
    )
  }
}
