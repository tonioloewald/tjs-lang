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
import { basename } from 'path'
import { installRuntime } from '../lang/runtime'

// Install TJS runtime before any modules evaluate.
// Emitted .js files capture globalThis.__tjs at the top level,
// so it must exist before they're imported.
//
// This stays EAGER (and is cheap — the runtime module only). The transpiler
// below does not.
installRuntime()

await plugin({
  name: 'tjs-loader',
  async setup(build) {
    // Handle .tjs files
    build.onLoad({ filter: /\.tjs$/ }, async (args) => {
      // Imported lazily, INSIDE onLoad. This used to be a top-level
      // `import { tjs } from '../lang'`, which loaded the whole transpiler
      // (parser, emitters, linter, wasm, acorn) on every `bun` invocation in
      // this repo — because bunfig.toml preloads this file — merely to register
      // a hook that most invocations never fire. It cost ~22ms per launch and
      // turned bun's biggest structural advantage into a deficit: bun starts in
      // ~11ms cold but took ~34ms here, i.e. slower than node. Now it is ~18ms,
      // and a run that never touches a .tjs file never pays for the transpiler.
      // (A run that DOES import one pays the same total, just later.)
      const { tjs } = await import('../lang')

      const source = await Bun.file(args.path).text()
      const filename = basename(args.path)

      // Use tjs() which handles everything: preprocess, transpile, classes, etc.
      const result = tjs(source, {
        filename,
        runTests: false, // Don't run tests during import
      })

      return {
        contents: result.code,
        loader: 'js',
      }
    })
  },
})

export {}
