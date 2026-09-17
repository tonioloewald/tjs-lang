// Wire the VM's transpiler EXPLICITLY, before anything else.
//
// `AgentVM.run()` accepts AJS source as well as an AST, and the transpiler that resolves it
// is injected rather than imported (see `setTranspiler` in `./vm/vm`) so that
// `tjs-lang/vm-ast` can ship without a parser. Every entry point that promises the
// source-accepting behaviour has to supply it.
//
// Explicitly here rather than relying on `export * from './vm'` further down to run
// `src/vm/index.ts` for its side effect: that made the wiring depend on module EVALUATION
// ORDER, and this file exports `./vm/vm` (line below) before `./vm`, with a cycle through
// `lang/`. The result was a VM that rejected source when reached through `tjs-lang` — caught
// by `stored-procedures.test.ts`, which is exactly the kind of ordering bug that is invisible
// until it isn't. An import for a side effect is a dependency you cannot see at the use site.
import { setTranspiler } from './vm/vm'
import { transpile as __transpile } from './lang/core'
setTranspiler(__transpile as (source: string) => { ast: unknown })

// Primary exports from new structure
export * from './lang'
export * from './vm/runtime'
export * from './vm/vm'
export * from './vm/atoms'
export * from './builder'
export * from './batteries'
export * from './types'

// Legacy re-exports for backwards compatibility
// These will be removed in a future version
export * from './transpiler' // Re-exports from ./lang
export * from './runtime' // Re-exports from ./vm/runtime
export * from './vm' // Re-exports from ./vm/vm (note: this shadows above, but both point to same place)
export * from './atoms' // Re-exports from ./vm/atoms
