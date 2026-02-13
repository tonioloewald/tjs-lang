#!/usr/bin/env bun
/**
 * TJS CLI - Command line interface for Typed JavaScript
 *
 * Commands:
 *   tjs check <file>   - Parse and type check, report errors
 *   tjs run <file>     - Transpile to JS and execute
 *   tjs types <file>   - Output type metadata as JSON
 *   tjs emit <file>    - Output transpiled JavaScript
 *
 * Options:
 *   --help, -h         - Show help
 *   --version, -v      - Show version
 */

import { check } from './commands/check'
import { run } from './commands/run'
import { types } from './commands/types'
import { emit } from './commands/emit'
import { convert } from './commands/convert'
import { test } from './commands/test'

const VERSION = '0.1.0'

const HELP = `
tjs - Typed JavaScript CLI

Usage:
  tjs <command> [options] <file>

Commands:
  check <file>    Parse and type check a TJS file
  run <file>      Transpile and execute a TJS file
  types <file>    Output type metadata as JSON
  emit <file>     Output transpiled JavaScript (+ docs)
  test [file]     Run .test.tjs test files
  convert <src>   Convert TypeScript to JS (with runtime checks)

Options:
  -h, --help      Show this help message
  -v, --version   Show version
  --debug         Include source locations in __tjs metadata (emit command)
  --unsafe        Strip __tjs metadata for production builds (emit command)
  --no-docs       Suppress documentation generation (emit command)
  --docs-dir <d>  Output docs to separate directory (emit command)
  --jfdi          Emit even if tests fail (just fucking do it)
  --emit-tjs      Output intermediate TJS instead of JS (convert command)
  -o <path>       Output path (for emit, convert commands)
  -t <pattern>    Test name pattern (for test command)
  --verbose, -V   Verbose output

Examples:
  tjs check src/utils.tjs
  tjs run examples/hello.tjs
  tjs types lib/api.tjs > api-types.json
  tjs emit src/utils.tjs > dist/utils.js
  tjs emit --debug src/utils.tjs > dist/utils.debug.js
  tjs emit src/ -o dist/              # Emit all .tjs files in directory
  tjs emit --unsafe src/ -o dist/     # Emit without validation (production)
  tjs test                            # Run all .test.tjs files
  tjs test src/lib/                   # Run tests in directory
  tjs test -t "validation"            # Run tests matching pattern
  tjs convert src/ -o dist/            # Convert TS files to JS
  tjs convert --emit-tjs src/ -o tjs/ # Convert TS files to intermediate TJS
`

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`tjs v${VERSION}`)
    process.exit(0)
  }

  // Parse flags
  const debug = args.includes('--debug')
  const verbose = args.includes('--verbose') || args.includes('-V')
  const unsafe = args.includes('--unsafe')
  const noDocs = args.includes('--no-docs')
  const jfdi = args.includes('--jfdi')
  const emitTJS = args.includes('--emit-tjs')

  // Parse -o <output> option
  const outputIdx = args.findIndex((a) => a === '-o' || a === '--output')
  const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined

  // Parse --docs-dir <dir> option
  const docsDirIdx = args.findIndex((a) => a === '--docs-dir')
  const docsDir = docsDirIdx !== -1 ? args[docsDirIdx + 1] : undefined

  // Parse -t <pattern> option for test command
  const patternIdx = args.findIndex(
    (a) => a === '-t' || a === '--test-name-pattern'
  )
  const testPattern = patternIdx !== -1 ? args[patternIdx + 1] : undefined

  // Filter out flag arguments
  const filteredArgs = args.filter((a, i) => {
    if (a.startsWith('--') || a.startsWith('-')) return false
    // Skip values that follow -o, -t, or --docs-dir
    if (
      i > 0 &&
      (args[i - 1] === '-o' ||
        args[i - 1] === '--output' ||
        args[i - 1] === '-t' ||
        args[i - 1] === '--test-name-pattern' ||
        args[i - 1] === '--docs-dir')
    )
      return false
    return true
  })

  const command = filteredArgs[0]
  const file = filteredArgs[1]

  // Some commands don't require a file argument
  const noFileRequired = ['test']

  if (!file && !noFileRequired.includes(command)) {
    console.error(`Error: No file specified for command '${command}'`)
    console.error(`Usage: tjs ${command} <file>`)
    process.exit(1)
  }

  try {
    switch (command) {
      case 'check':
        await check(file)
        break
      case 'run':
        await run(file)
        break
      case 'types':
        await types(file)
        break
      case 'emit':
        await emit(file, {
          debug,
          unsafe,
          output,
          verbose,
          noDocs,
          docsDir,
          jfdi,
        })
        break
      case 'test':
        await test(file, { pattern: testPattern })
        break
      case 'convert':
        await convert(file, { output, verbose, emitTJS })
        break
      default:
        console.error(`Error: Unknown command '${command}'`)
        console.error(`Run 'tjs --help' for usage`)
        process.exit(1)
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

main()
