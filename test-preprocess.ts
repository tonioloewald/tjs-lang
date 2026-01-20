import { preprocess } from './src/lang/parser'

const source = `class Timestamp {
  #value

  constructor(initial: '' | 0 | null) {
    this.#value = initial ? new Date(initial) : new Date()
  }
}

test('Timestamp works') {
  const ts = Timestamp(0)
  assert(ts.#value instanceof Date)
}
`

const result = preprocess(source)
console.log('PREPROCESSED:')
console.log(result.source)
console.log('\nTESTS:', result.tests)
console.log('TEST ERRORS:', result.testErrors)
