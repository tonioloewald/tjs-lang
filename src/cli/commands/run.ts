/**
 * tjs run - Transpile and execute a TJS file
 *
 * Executes the entire file as a script, with full TJS runtime support.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { preprocess } from '../../lang/parser'
import { transpileToJS } from '../../lang/emitters/js'
import * as runtime from '../../lang/runtime'

export async function run(file: string): Promise<void> {
  const absolutePath = resolve(file)
  const source = readFileSync(absolutePath, 'utf-8')

  try {
    // Preprocess: transforms Type, Generic, Union declarations, runs tests
    const preprocessed = preprocess(source)

    if (preprocessed.testErrors.length > 0) {
      console.error('Test failures:')
      for (const err of preprocessed.testErrors) {
        console.error(`  ${err}`)
      }
      process.exit(1)
    }

    // Transpile to JS
    const result = transpileToJS(preprocessed.source)

    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(`Warning: ${warning}`)
      }
    }

    // Create a module-like execution context with TJS runtime
    const AsyncFunction = Object.getPrototypeOf(
      async function () {}
    ).constructor

    // Wrap code in an async IIFE to support top-level await
    const wrappedCode = `
      const { Type, Generic, Union, Enum, isRuntimeType, wrap, error, isError } = __runtime__;
      ${result.code}
    `

    const fn = new AsyncFunction('__runtime__', wrappedCode)
    await fn(runtime)
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
