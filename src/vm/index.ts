/**
 * TJS VM — sandboxed execution runtime, batteries included.
 *
 * Executes AJS with fuel metering, capability-based security, monadic errors and timeout
 * enforcement — and accepts **source as well as AST**, because this entry wires the
 * transpiler in (see `setTranspiler` in `./vm`).
 *
 * That convenience is what makes this bundle large: the transpiler and acorn are ~75% of it.
 * If you only ever hand the VM an AST — which is the shape "code travels to data" actually
 * implies — import **`tjs-lang/vm-ast`** instead: same `AgentVM`, no parser, ~56 KB against
 * ~221 KB, and no parser defect reachable from guest input.
 */
import { setTranspiler } from './vm'
import { transpile } from '../lang/core'

// The one line that separates this entry from `tjs-lang/vm-ast`. Everything else about the
// two builds is identical; this is what pulls the transpiler into the bundle.
setTranspiler(transpile as (source: string) => { ast: unknown })

export * from './runtime'
export * from './vm'
export * from './atoms'
