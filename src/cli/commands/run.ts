/**
 * tjs run - Transpile and execute a TJS file
 *
 * Executes the entire file as a script, with full TJS runtime support.
 */

import { readFileSync } from 'fs'
import { resolve, basename } from 'path'
import { transpileToJS } from '../../lang/emitters/js'
import { dialectForFilename } from '../../lang/dialect'
import * as runtime from '../../lang/runtime'

export async function run(file: string): Promise<void> {
  const absolutePath = resolve(file)
  const source = readFileSync(absolutePath, 'utf-8')

  // `.js`/`.mjs` ⇒ plain-JS semantics preserved; `.tjs` ⇒ native modes.
  const dialect = dialectForFilename(file)

  try {
    // transpileToJS preprocesses internally. This used to call preprocess()
    // first and hand it the ALREADY-preprocessed source — so every source was
    // preprocessed twice. The first pass consumes the `wasm` blocks, so the
    // second pass saw none, emitted no wasm bootstrap, and the file ran with
    // `wasmBuffer` undefined while every wasm{} block silently fell back to JS.
    // It produced correct answers, which is exactly why nobody noticed.
    const result = transpileToJS(source, { dialect, filename: basename(file) })

    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`)
      }
    }

    // Install TJS runtime globally (emitted code expects globalThis.__tjs)
    runtime.installRuntime()

    // Create a module-like execution context with TJS runtime
    const AsyncFunction = Object.getPrototypeOf(
      async function () {}
    ).constructor

    // Emitted code is standalone: it reads globalThis.__tjs (installed above) and
    // inlines its own fallbacks for whichever of Type/Generic/Union/Enum/
    // FunctionPredicate it actually uses. A prelude destructuring those same names
    // off the runtime therefore collides with the inline definitions — `const Type`
    // plus the emitted `function Type` in one scope is a SyntaxError, which surfaced
    // as a bogus "syntax error" attributed to a line number the source file didn't
    // even have. Hand it the code and nothing else.
    const fn = new AsyncFunction(result.code)
    await fn()
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
    process.exit(1)
  }
}
