#!/usr/bin/env bun
/**
 * tjsx - Execute TJS files instantly
 *
 * Like `bun run` but for TJS files. Transpiles and executes in one step.
 *
 * Usage:
 *   tjsx script.tjs [args...]
 *   tjsx --help
 *
 * Examples:
 *   tjsx hello.tjs
 *   tjsx server.tjs --port 3000
 *   echo '{"name": "World"}' | tjsx greet.tjs
 */

import { readFileSync } from 'fs'
import { tjs } from '../lang'

const HELP = `
tjsx - Execute TJS files instantly

Usage:
  tjsx <file.tjs> [args...]

Options:
  -h, --help      Show this help message
  -e, --eval      Evaluate TJS code from string
  --json          Parse stdin as JSON and pass as first argument

Examples:
  tjsx hello.tjs
  tjsx greet.tjs --json < input.json
  tjsx -e "function f() { return 42 }"
`

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }

  let source: string
  let fnArgs: Record<string, any> = {}

  // Handle --eval flag
  const evalIndex = args.findIndex((a) => a === '-e' || a === '--eval')
  if (evalIndex !== -1) {
    source = args[evalIndex + 1]
    if (!source) {
      console.error('Error: --eval requires a code string')
      process.exit(1)
    }
  } else {
    // Read from file
    const file = args[0]
    if (!file) {
      console.error('Error: No file specified')
      process.exit(1)
    }

    try {
      source = readFileSync(file, 'utf-8')
    } catch (err: any) {
      console.error(`Error reading file: ${err.message}`)
      process.exit(1)
    }

    // Parse remaining args as key=value pairs or JSON
    const restArgs = args.slice(1)

    if (restArgs.includes('--json')) {
      // Read JSON from stdin
      try {
        const stdin = readFileSync(0, 'utf-8')
        fnArgs = JSON.parse(stdin)
      } catch {
        console.error('Error: Could not parse JSON from stdin')
        process.exit(1)
      }
    } else {
      // Parse key=value args
      for (const arg of restArgs) {
        if (arg.startsWith('--')) {
          const [key, value] = arg.slice(2).split('=')
          if (value !== undefined) {
            // Try to parse as JSON, fall back to string
            try {
              fnArgs[key] = JSON.parse(value)
            } catch {
              fnArgs[key] = value
            }
          } else {
            fnArgs[key] = true
          }
        }
      }
    }
  }

  // Transpile
  let result
  try {
    result = tjs(source)
  } catch (err: any) {
    console.error(`Transpile error: ${err.message}`)
    process.exit(1)
  }

  const fnName = result.types?.name
  if (!fnName) {
    console.error('Error: No function found in source')
    process.exit(1)
  }

  // Execute
  try {
    const moduleCode = `
      ${result.code}
      return ${fnName};
    `
    const fn = new Function(moduleCode)()

    // Use __tjs metadata to determine how to pass args
    const hasArgs = Object.keys(fnArgs).length > 0
    let output

    if (hasArgs && fn.__tjs?.params) {
      // Get param names in order from metadata
      const paramNames = Object.keys(fn.__tjs.params)

      // Build positional args array from named args
      const positionalArgs = paramNames.map((name) => fnArgs[name])
      output = await Promise.resolve(fn(...positionalArgs))
    } else {
      output = await Promise.resolve(fn())
    }

    if (output !== undefined) {
      if (typeof output === 'object') {
        console.log(JSON.stringify(output, null, 2))
      } else {
        console.log(output)
      }
    }
  } catch (err: any) {
    console.error(`Runtime error: ${err.message}`)
    process.exit(1)
  }
}

main()
