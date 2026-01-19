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

const VERSION = '0.1.0'

const HELP = `
tjs - Typed JavaScript CLI

Usage:
  tjs <command> [options] <file>

Commands:
  check <file>    Parse and type check a TJS file
  run <file>      Transpile and execute a TJS file
  types <file>    Output type metadata as JSON
  emit <file>     Output transpiled JavaScript

Options:
  -h, --help      Show this help message
  -v, --version   Show version
  --debug         Include source locations in __tjs metadata (emit command)

Examples:
  tjs check src/utils.tjs
  tjs run examples/hello.tjs
  tjs types lib/api.tjs > api-types.json
  tjs emit src/utils.tjs > dist/utils.js
  tjs emit --debug src/utils.tjs > dist/utils.debug.js
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
  const filteredArgs = args.filter(
    (a) =>
      !a.startsWith('--') ||
      a === '--help' ||
      a === '-h' ||
      a === '--version' ||
      a === '-v'
  )

  const command = filteredArgs[0]
  const file = filteredArgs[1]

  if (!file) {
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
        await emit(file, { debug })
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
