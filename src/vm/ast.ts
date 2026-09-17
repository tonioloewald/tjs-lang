/**
 * TJS VM, AST-only — the same `AgentVM` with **no parser in the bundle**.
 *
 * ## What this is
 *
 * Identical to `tjs-lang/vm` in every respect except one line: it does not call
 * `setTranspiler`. So `run()` accepts an **AST**, and passing it source fails with an error
 * telling you to transpile on the caller's side.
 *
 * ```ts
 * import { transpile } from 'tjs-lang/lang'   // on the CALLER's side
 * import { AgentVM } from 'tjs-lang/vm-ast'   // wherever the guest code runs
 *
 * const { ast } = transpile(source)           // parse where the source is YOURS
 * await new AgentVM().run(ast, args)          // the AST is the wire format
 * ```
 *
 * ## Why it exists
 *
 * Two reasons, and the second is the real one.
 *
 * **Size.** ~56 KB against ~221 KB (minified, `tosijs-schema` external). The transpiler and
 * acorn were 75% of the VM bundle — a parser shipped to every embedder who only ever
 * executes ASTs.
 *
 * **Attack surface that does not need to exist.** A sandbox exists to run untrusted code
 * safely; a sandbox that also *parses* has its parser reachable from untrusted input,
 * upstream of fuel, timeouts, capabilities and the membrane. This repo has already paid for
 * one instance of that: a TJS transform leaked onto the AJS path and called
 * `new Function(body)()` on submitted source before any of those controls applied (0.13.10,
 * pinned by `eval-no-transpile-execution.test.ts`). The leak was closed. This removes the
 * shape that allowed it — not by adding a check, but by not shipping the code.
 *
 * It also makes good on what "code travels to data" already claimed. If the AST is the wire
 * format, the string never has to cross the boundary, and the component on the far side has
 * no reason to know how to read one.
 *
 * ## The guarantee, stated precisely
 *
 * **No parser is present in this bundle.** That is the claim, and it is the one that matters.
 *
 * It is NOT "this object refuses source even when a parser is loaded": the transpiler binding
 * is module-level, so an application importing BOTH `tjs-lang/vm` and `tjs-lang/vm-ast` into
 * one bundle shares the wiring, and this VM would then accept source. That is not a hole — a
 * consumer who imported `tjs-lang/vm` already has the parser in their bundle, so refusing
 * here would protect nothing. Take this entry *instead of* the other one, not alongside it.
 *
 * Kept honest by `src/vm/ast-entry.test.ts`, which parses this module's import graph with
 * acorn and asserts nothing under `lang/` is reachable — the same both-directions pin used
 * for the AJS parser split, because a guard that only checks what it expects to find cannot
 * see what it did not think of.
 */
export * from './runtime'
export * from './vm'
export * from './atoms'
