#!/usr/bin/env bun
/**
 * create-tjs-app - Scaffold a new TJS project
 *
 * Usage:
 *   bun create tjs-app my-app
 *   bunx create-tjs-app my-app
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const HELP = `
create-tjs-app - Scaffold a new TJS project

Usage:
  bun create tjs-app <project-name>
  bunx create-tjs-app <project-name>

Options:
  -h, --help      Show this help message
  --minimal       Create minimal project (no examples)

Examples:
  bun create tjs-app my-app
  bun create tjs-app ./projects/new-app
  bun create tjs-app my-app --minimal
`

const PACKAGE_JSON = (name: string) => `{
  "name": "${name}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tjs-playground",
    "check": "tjs check src/",
    "build": "tjs emit src/ -o dist/",
    "test": "tjs test"
  },
  "dependencies": {
    "tjs-lang": "^0.1.0"
  }
}
`

const MAIN_TJS = `/**
 * Main entry point
 */

// A simple function with type validation
function greet(name: 'World') -> '' {
  return \`Hello, \${name}!\`
}

// Run it
console.log(greet())
console.log(greet('TJS'))
`

const UTILS_TJS = `/**
 * Utility functions with runtime type checking
 */

// Math utilities
function add(a: 0, b: 0) -> 0 {
  return a + b
}

function multiply(a: 0, b: 0) -> 0 {
  return a * b
}

// String utilities
function capitalize(str: '') -> '' {
  if (str.length === 0) return ''
  return str[0].toUpperCase() + str.slice(1)
}

// Array utilities
function sum(numbers: [0]) -> 0 {
  return numbers.reduce((acc, n) => acc + n, 0)
}

export { add, multiply, capitalize, sum }
`

const UTILS_TEST_TJS = `/**
 * Tests for utility functions
 */

import { add, multiply, capitalize, sum } from './utils.tjs'

test('add works with numbers', () => {
  expect(add(1, 2)).toBe(3)
  expect(add(-1, 1)).toBe(0)
  expect(add(0.1, 0.2)).toBeCloseTo(0.3)
})

test('multiply works with numbers', () => {
  expect(multiply(2, 3)).toBe(6)
  expect(multiply(-2, 3)).toBe(-6)
})

test('capitalize handles strings', () => {
  expect(capitalize('hello')).toBe('Hello')
  expect(capitalize('')).toBe('')
  expect(capitalize('a')).toBe('A')
})

test('sum adds array elements', () => {
  expect(sum([1, 2, 3])).toBe(6)
  expect(sum([])).toBe(0)
  expect(sum([5])).toBe(5)
})

test('type validation rejects bad inputs', () => {
  // These should return monadic errors, not throw
  const result = add('not', 'numbers')
  expect(result.error).toBeDefined()
})
`

const README = (name: string) => `# ${name}

A TJS (Typed JavaScript) project.

## Getting Started

\`\`\`bash
# Install dependencies
bun install

# Run the playground
bun run dev

# Type check all files
bun run check

# Run tests
bun run test

# Build for production
bun run build
\`\`\`

## Project Structure

\`\`\`
${name}/
├── src/
│   ├── main.tjs       # Entry point
│   ├── utils.tjs      # Utility functions
│   └── utils.test.tjs # Tests
├── dist/              # Built output (after build)
└── package.json
\`\`\`

## TJS Features

TJS adds runtime type validation to JavaScript:

\`\`\`javascript
// Required parameter with type inference from example
function greet(name: 'Alice') -> '' {
  return \`Hello, \${name}!\`
}

greet('Bob')      // Returns "Hello, Bob!"
greet(123)        // Returns { error: 'type mismatch', ... }
\`\`\`

Learn more at the [TJS documentation](https://github.com/tonioloewald/tjs-lang).
`

const GITIGNORE = `node_modules/
dist/
.DS_Store
*.log
`

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }

  const minimal = args.includes('--minimal')
  const projectArg = args.find((a) => !a.startsWith('-'))

  if (!projectArg) {
    console.error('Error: Please specify a project name')
    console.error('Usage: bun create tjs-app <project-name>')
    process.exit(1)
  }

  const projectDir = resolve(projectArg)
  const projectName = projectArg.split('/').pop() || 'tjs-app'

  // Check if directory exists
  if (existsSync(projectDir)) {
    console.error(`Error: Directory '${projectDir}' already exists`)
    process.exit(1)
  }

  console.log(`Creating TJS project in ${projectDir}...`)

  // Create directories
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(join(projectDir, 'src'), { recursive: true })

  // Write files
  writeFileSync(join(projectDir, 'package.json'), PACKAGE_JSON(projectName))
  writeFileSync(join(projectDir, 'README.md'), README(projectName))
  writeFileSync(join(projectDir, '.gitignore'), GITIGNORE)
  writeFileSync(join(projectDir, 'src', 'main.tjs'), MAIN_TJS)

  if (!minimal) {
    writeFileSync(join(projectDir, 'src', 'utils.tjs'), UTILS_TJS)
    writeFileSync(join(projectDir, 'src', 'utils.test.tjs'), UTILS_TEST_TJS)
  }

  console.log(`
Created ${projectName}!

Next steps:
  cd ${projectArg}
  bun install
  bun run dev

Happy coding!
`)
}

main()
