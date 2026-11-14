/**
 * A Bun plugin that loads `.tjs` files, for `Bun.build` and for `plugin()` alike (#3593).
 *
 *   import { tjsPlugin } from 'tjs-lang/bun-build-plugin'
 *   await Bun.build({ entrypoints: ['src/index.tjs'], outdir: 'dist', plugins: [tjsPlugin()] })
 *
 * `tjs-lang/bun-plugin` is a RUNTIME registration (Bun's `plugin()`, for `bun run` and
 * `bun test`), which `Bun.build` ignores; tosijs-native, the first project written natively
 * in `.tjs`, had to write its own build plugin. This is the one plugin both use.
 *
 * No module-scope side effects: it installs no runtime (bundled output carries its own inline
 * runtime) and registers nothing until a host passes it to `Bun.build` or `plugin()`.
 *
 * `runTests` (#3599, opt-in): run each file's signature examples and inline `test` blocks as
 * it loads, so a wrong return example fails the build or import instead of passing silently
 * until `tjs check` runs. Off by default; it costs a test run per loaded file.
 *
 * `sharedPrelude` (#3594, opt-in): every module imports one prelude from `tjs-lang/prelude`
 * instead of carrying its own. See docs/runtime-fusion.md §8.
 *
 * `convertTs` (opt-in): `.ts` files load through `fromTS`; see the option below.
 */
import type { BunPlugin } from 'bun'
import { basename, join } from 'path'

export interface TjsPluginOptions {
  /** Run signature examples and `test` blocks on load; a failure fails the load. */
  runTests?: boolean
  /**
   * Import the inline runtime from `tjs-lang/prelude` instead of inlining it per file (#3594),
   * so a bundle carries one copy rather than one per module. Off by default.
   */
  sharedPrelude?: boolean
  /**
   * Load `.ts` files through `fromTS` (TypeScript -> TJS -> JavaScript) instead of letting Bun
   * strip their types unchecked (decided 2026-11-14: an OPT-IN). Off by default: it loads the
   * TypeScript compiler (a peer you must install), and converted TypeScript keeps JavaScript's
   * semantics, so it checks inputs only where a file opts in with `/* @tjs TjsStrict *\/`.
   * `.d.ts` files and anything under `node_modules` are left to Bun.
   */
  convertTs?: boolean
}

export function tjsPlugin(options: TjsPluginOptions = {}): BunPlugin {
  const runTests = options.runTests ?? false
  const prelude = options.sharedPrelude ? ('import' as const) : undefined
  return {
    name: 'tjs-loader',
    setup(build) {
      // The prelude is resolved to THIS copy of tjs-lang, the one whose emitter compiled the
      // module, so the content hash it asks for is the one it finds whatever the host's
      // dependency tree looks like.
      if (prelude)
        build.onResolve({ filter: /^tjs-lang\/prelude$/ }, () => ({
          path: join(import.meta.dir, '../lang/prelude.generated.js'),
        }))
      build.onLoad({ filter: /\.tjs$/ }, async (args) => {
        // Imported lazily, INSIDE onLoad: a run that never loads a .tjs file never pays for
        // the transpiler (it cost ~22ms per `bun` launch when it was a top-level import).
        const { tjs } = await import('../lang')
        const source = await Bun.file(args.path).text()
        // A loader only for a file that mentions `wasm`, so cross-file `wasm function`
        // composition works here as it does in the API (#4125).
        const { moduleLoaderFor } = await import('../lang/module-loader')
        const result = tjs(source, {
          filename: basename(args.path),
          moduleLoader: moduleLoaderFor(args.path, source, basename(args.path)),
          runTests,
          ...(prelude ? { prelude } : {}),
        })
        return { contents: result.code, loader: 'js' }
      })
      if (options.convertTs)
        build.onLoad({ filter: /\.[mc]?ts$/ }, async (args) => {
          if (
            /\.d\.[mc]?ts$/.test(args.path) ||
            /[\\/]node_modules[\\/]/.test(args.path)
          )
            return undefined
          // Lazy, and only when opted in: this is the one route that loads the TypeScript
          // compiler (src/index-tsfree.test.ts keeps it out of every other path).
          const { fromTS } = await import('../lang/emitters/from-ts')
          const { tjs } = await import('../lang')
          const source = await Bun.file(args.path).text()
          const converted = fromTS(source, {
            emitTJS: true,
            filename: basename(args.path),
          })
          const result = tjs(converted.code, {
            filename: basename(args.path),
            runTests,
            ...(prelude ? { prelude } : {}),
          })
          return { contents: result.code, loader: 'js' }
        })
    },
  }
}

export default tjsPlugin
