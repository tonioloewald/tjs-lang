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
import { dirname, resolve } from 'path'
import { transpileToJS } from '../lang/emitters/js'
import { preprocess } from '../lang/parser'

// Get the path to the runtime module
const runtimePath = resolve(dirname(import.meta.path), '../lang/runtime.ts')

await plugin({
  name: 'tjs-loader',
  async setup(build) {
    // Handle .tjs files
    build.onLoad({ filter: /\.tjs$/ }, async (args) => {
      const source = await Bun.file(args.path).text()

      // Preprocess: transforms Type, Generic, Union declarations, runs tests
      const preprocessed = preprocess(source)

      // Transpile to JS with __tjs metadata
      const result = transpileToJS(preprocessed.source)

      // Inject runtime imports at the top using the resolved path
      const runtimeImports = `import { Type, Generic, Union, Enum, isRuntimeType, wrap, error, isError } from '${runtimePath}';\n`

      const code = runtimeImports + result.code

      return {
        contents: code,
        loader: 'js',
      }
    })
  },
})

export {}
