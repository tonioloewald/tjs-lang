import { fromTS } from './src/lang/index.ts'

const result = fromTS(`
  function identity<T>(value: T): T {
    return value
  }
`)

console.log('Result keys:', Object.keys(result))
console.log('Full result:', JSON.stringify(result, null, 2))
