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
import { tjs } from '../lang'

await plugin({
  name: 'tjs-loader',
  async setup(build) {
    // Handle .tjs files
    build.onLoad({ filter: /\.tjs$/ }, async (args) => {
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
