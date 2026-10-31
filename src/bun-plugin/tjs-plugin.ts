/**
 * Bun plugin for native .tjs file support
 *
 * Enables `bun run file.tjs` to work directly.
 *
 * Register in bunfig.toml:
 *   preload = ["./src/bun-plugin/tjs-plugin.ts"]
 *
 * Or programmatically:
 *   import "./src/bun-plugin/tjs-plugin"
 */

import { plugin } from 'bun'
import { tjsPlugin } from './build-plugin'
import { installRuntime } from '../lang/runtime'

// Install TJS runtime before any modules evaluate.
// Emitted .js files capture globalThis.__tjs at the top level,
// so it must exist before they're imported.
//
// This stays EAGER (and is cheap — the runtime module only). The transpiler
// below does not.
installRuntime()

// The loader itself is the shared `tjsPlugin` (also what `Bun.build` uses, #3593).
// `TJS_RUN_TESTS=1` opts in to running each file's signature examples and `test` blocks as it
// is imported (#3599), so a wrong return example fails under `bun test` too; a preload takes
// no options, so it is an environment variable. Off by default.
await plugin(tjsPlugin({ runTests: process.env.TJS_RUN_TESTS === '1' }))

export {}
