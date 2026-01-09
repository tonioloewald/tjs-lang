/**
 * tjs run - Transpile and execute a TJS file
 */

import { readFileSync } from 'fs'
import { tjs } from '../../lang'

export async function run(file: string): Promise<void> {
  const source = readFileSync(file, 'utf-8')

  const result = tjs(source)
  const fnName = result.types?.name

  if (!fnName) {
    console.error('No function found in file')
    process.exit(1)
  }

  // Create a module from the transpiled code that returns the function
  const moduleCode = `
    ${result.code}
    return ${fnName};
  `

  try {
    // Execute the transpiled code to get the function
    const fn = new Function(moduleCode)()

    // Run the function (with no arguments for now)
    const output = await Promise.resolve(fn())
    if (output !== undefined) {
      console.log(JSON.stringify(output, null, 2))
    }
  } catch (error: any) {
    console.error(`Runtime error: ${error.message}`)
    process.exit(1)
  }
}
