/**
 * tjs run - Transpile and execute a TJS file
 *
 * Executes the entire file as a script, with full TJS runtime support.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { resolve, basename, dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { transpileToJS } from '../../lang/emitters/js'
import { dialectForFilename } from '../../lang/dialect'
import * as runtime from '../../lang/runtime'

export async function run(file: string): Promise<void> {
  const absolutePath = resolve(file)
  const source = readFileSync(absolutePath, 'utf-8')

  // `.js`/`.mjs` ⇒ plain-JS semantics preserved; `.tjs` ⇒ native modes.
  const dialect = dialectForFilename(file)

  let tempModule: string | undefined

  try {
    // transpileToJS preprocesses internally. This used to call preprocess()
    // first and hand it the ALREADY-preprocessed source — so every source was
    // preprocessed twice. The first pass consumes the `wasm` blocks, so the
    // second pass saw none, emitted no wasm bootstrap, and the file ran with
    // `wasmBuffer` undefined while every wasm{} block silently fell back to JS.
    // It produced correct answers, which is exactly why nobody noticed.
    // runTests: false — `run` executes your program, it does not test it.
    //
    // The transpile-time test harness EXECUTES the module to run signature tests.
    // So `tjs run` on any file with a passing signature test evaluated the module
    // twice and fired every top-level side effect twice: `console.log('hi')` printed
    // "hi\nhi". (It went unnoticed because a file whose signature test *failed*
    // aborted before the second run.) Tests belong to `tjs test` / `tjs check`;
    // the bun plugin already takes this same position for the same reason.
    const result = transpileToJS(source, {
      dialect,
      filename: basename(file),
      runTests: false,
    })

    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`)
      }
    }

    // Install TJS runtime globally (emitted code expects globalThis.__tjs)
    runtime.installRuntime()

    // Run the emitted code as a real ES MODULE, not as a function body.
    //
    // This used to be `new AsyncFunction(result.code)`, which cannot work for any
    // source that imports or exports: `import`/`export` are module-only syntax and
    // are a SyntaxError inside a function body. So `tjs run` rejected every file
    // with an import (examples/json-schema.tjs) or an export (examples/datetime.tjs)
    // — and reported it as a syntax error in the *source*, pointing at a line the
    // user never wrote.
    //
    // The module is written beside the source rather than in a temp dir so that
    // relative imports and node_modules resolution both work exactly as they would
    // for the original file. Emitted code is standalone (it reads globalThis.__tjs,
    // installed above, and inlines its own Type/Generic/… fallbacks), so it needs
    // nothing injected around it.
    tempModule = join(
      dirname(absolutePath),
      `.${basename(absolutePath)}.${process.pid}.tjsrun.mjs`
    )
    writeFileSync(tempModule, result.code, 'utf-8')
    await import(pathToFileURL(tempModule).href)
  } catch (error: any) {
    if (error.name === 'SyntaxError' && error.formatWithContext) {
      // Use enhanced error formatting with source context
      console.error(`Syntax error in ${file}:\n`)
      console.error(error.formatWithContext(2))
      console.error()
    } else if (error.name === 'SyntaxError') {
      console.error(`Syntax error in ${file}:`)
      console.error(`  ${error.message}`)
      if (error.line) {
        console.error(`  at line ${error.line}, column ${error.column}`)
      }
    } else {
      console.error(`Runtime error: ${error.message}`)
    }
    // Clean up BEFORE exiting: process.exit() terminates immediately and does NOT
    // run `finally` blocks. Relying on the one below meant every FAILING run left
    // its temp module behind in the user's source directory — the success path
    // cleaned up, so it looked fine right up until something broke.
    cleanup()
    process.exit(1)
  } finally {
    cleanup()
  }

  function cleanup() {
    if (!tempModule) return
    try {
      unlinkSync(tempModule)
    } catch {
      // Best effort — never let cleanup mask the program's own outcome.
    }
    tempModule = undefined
  }
}
