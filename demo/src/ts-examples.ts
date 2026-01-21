/**
 * TypeScript Examples
 *
 * These examples demonstrate the TS -> TJS -> JS pipeline.
 * They are written in ACTUAL TypeScript syntax (not TJS).
 * The playground shows:
 * - TS input (editable)
 * - TJS intermediate (read-only)
 * - JS output with __tjs metadata
 */

export interface TSExample {
  name: string
  description: string
  code: string
  group: 'intro' | 'validation' | 'patterns' | 'advanced'
}

export const tsExamples: TSExample[] = [
  // ═══════════════════════════════════════════════════════════════
  // INTRO: Basic TypeScript to TJS examples
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Hello TypeScript',
    description: 'See how TypeScript types become TJS example-based types',
    group: 'intro',
    code: `// TypeScript: Types are compile-time only
// TJS: Types become runtime validation!

function greet(name: string): string {
  return \`Hello, \${name}!\`
}

// This works - correct type
console.log(greet('World'))

// In pure TS, this would crash at runtime
// In TJS, you get a clean error object
console.log('Bad call result:', greet(42 as any))
`,
  },
  {
    name: 'Multiple Functions',
    description: 'Multiple functions transpile correctly',
    group: 'intro',
    code: `// Multiple functions in one file

function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

function greet(name: string, excited?: boolean): string {
  return excited ? \`Hello, \${name}!\` : \`Hello, \${name}\`
}

// Test them all
console.log('add(2, 3) =', add(2, 3))
console.log('multiply(4, 5) =', multiply(4, 5))
console.log('greet("World") =', greet('World'))
console.log('greet("World", true) =', greet('World', true))
`,
  },
  {
    name: 'Type Transformation',
    description: 'See how TypeScript types become TJS examples',
    group: 'intro',
    code: `// TypeScript type syntax -> TJS example syntax
//
// TypeScript:          TJS:
// name: string    ->   name: ''
// count: number   ->   count: 0
// flag: boolean   ->   flag: true
// items: string[] ->   items: ['']
// ): string       ->   -> ''

function processData(
  name: string,
  count: number,
  active: boolean,
  tags: string[]
): string {
  return \`\${name}: \${count} items, active=\${active}, tags=[\${tags.join(', ')}]\`
}

console.log(processData('Test', 42, true, ['a', 'b', 'c']))
`,
  },

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION: Runtime type checking from TS types
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Runtime Validation',
    description: 'TypeScript types work at RUNTIME, not just compile time',
    group: 'validation',
    code: `// The key insight: TS types become runtime checks

function divide(a: number, b: number): number {
  if (b === 0) return NaN
  return a / b
}

// Valid calls work normally
console.log('10 / 2 =', divide(10, 2))
console.log('10 / 0 =', divide(10, 0))

// Invalid calls return error objects (not crashes!)
const badResult = divide('ten' as any, 2)
console.log('divide("ten", 2) =', badResult)

if (badResult && badResult.$error) {
  console.log('  ^ This is a validation error, not a crash!')
}
`,
  },
  {
    name: 'Object Validation',
    description: 'Object types are validated at runtime',
    group: 'validation',
    code: `// Object types become runtime checks

interface User {
  name: string
  age: number
}

function greetUser(user: User): string {
  return \`Hello, \${user.name}! You are \${user.age} years old.\`
}

// Valid object works
const alice = { name: 'Alice', age: 30 }
console.log(greetUser(alice))

// Non-object fails validation
const badInput = greetUser('not an object' as any)
console.log('String input:', badInput)

// Note: Current validation checks type (object vs primitive)
// Deep property validation is a future enhancement
`,
  },
  {
    name: 'Optional Parameters',
    description: 'Optional params work in TS and TJS',
    group: 'validation',
    code: `// Optional parameters: TS ? syntax or default values

function createGreeting(
  name: string,
  greeting?: string,
  punctuation: string = '!'
): string {
  const g = greeting ?? 'Hello'
  return \`\${g}, \${name}\${punctuation}\`
}

// All these work
console.log(createGreeting('World'))
console.log(createGreeting('World', 'Hi'))
console.log(createGreeting('World', 'Hey', '...'))

// Check the metadata
console.log('\\nFunction metadata:')
console.log('  name: required')
console.log('  greeting: optional')
console.log('  punctuation: optional with default "!"')
`,
  },

  // ═══════════════════════════════════════════════════════════════
  // PATTERNS: Common TypeScript patterns
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Array Operations',
    description: 'Array types flow through the pipeline',
    group: 'patterns',
    code: `// Array types are preserved

function sum(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0)
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return sum(numbers) / numbers.length
}

function filterPositive(numbers: number[]): number[] {
  return numbers.filter(n => n > 0)
}

const data = [-1, 2, -3, 4, 5, -6, 7]
console.log('Data:', data)
console.log('Sum:', sum(data))
console.log('Average:', average(data))
console.log('Positive only:', filterPositive(data))
`,
  },
  {
    name: 'Nested Objects',
    description: 'Nested object types work correctly',
    group: 'patterns',
    code: `// Nested object types

interface Address {
  street: string
  city: string
  zip: string
}

interface Person {
  name: string
  address: Address
}

function formatAddress(person: Person): string {
  const { name, address } = person
  return \`\${name}\\n\${address.street}\\n\${address.city}, \${address.zip}\`
}

const john: Person = {
  name: 'John Doe',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    zip: '12345'
  }
}

console.log(formatAddress(john))
`,
  },
  {
    name: 'Union Types',
    description: 'Union types and nullable values',
    group: 'patterns',
    code: `// Union types: T | null, T | undefined

function findUser(id: number): string | null {
  // Simulated lookup
  if (id === 1) return 'Alice'
  if (id === 2) return 'Bob'
  return null
}

function greetOrWarn(name: string | null): string {
  if (name === null) {
    return 'User not found!'
  }
  return \`Hello, \${name}!\`
}

console.log('Find user 1:', findUser(1))
console.log('Find user 2:', findUser(2))
console.log('Find user 99:', findUser(99))

console.log('\\nGreet user 1:', greetOrWarn(findUser(1)))
console.log('Greet user 99:', greetOrWarn(findUser(99)))
`,
  },

  // ═══════════════════════════════════════════════════════════════
  // ADVANCED: More complex TypeScript patterns
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'Generic Functions',
    description: 'Generics transpile with warnings (best-effort)',
    group: 'advanced',
    code: `// Generic functions: TJS handles them best-effort
// Generic type params become 'any' with a warning

function identity<T>(value: T): T {
  return value
}

function first<T>(items: T[]): T | undefined {
  return items[0]
}

function wrap<T>(value: T): { value: T } {
  return { value }
}

// These work at runtime
console.log('identity(42):', identity(42))
console.log('identity("hello"):', identity('hello'))
console.log('first([1,2,3]):', first([1, 2, 3]))
console.log('wrap({ x: 1 }):', wrap({ x: 1 }))

// Check the TJS output - you'll see warnings about generic params
`,
  },
  {
    name: 'Async Functions',
    description: 'Async/await works naturally',
    group: 'advanced',
    code: `// Async functions work naturally
// Promise<T> is unwrapped to T in return type

async function fetchData(url: string): Promise<string> {
  // Simulated fetch
  await new Promise(r => setTimeout(r, 100))
  return \`Data from \${url}\`
}

async function fetchMultiple(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(fetchData))
}

// Run the async functions
async function main() {
  console.log('Fetching single...')
  const single = await fetchData('/api/users')
  console.log('Result:', single)

  console.log('\\nFetching multiple...')
  const multiple = await fetchMultiple(['/api/a', '/api/b', '/api/c'])
  console.log('Results:', multiple)
}

main()
`,
  },
  {
    name: 'Classes',
    description: 'Classes are supported with metadata',
    group: 'advanced',
    code: `// Classes with typed methods

class Calculator {
  private value: number = 0

  add(n: number): Calculator {
    this.value += n
    return this
  }

  multiply(n: number): Calculator {
    this.value *= n
    return this
  }

  getResult(): number {
    return this.value
  }

  reset(): void {
    this.value = 0
  }
}

// Use the class
const calc = new Calculator()
const result = calc.add(5).multiply(3).add(10).getResult()
console.log('5 * 3 + 10 =', result)

// Chain of operations
calc.reset()
console.log('After reset:', calc.getResult())
console.log('(2 + 3) * 4 =', calc.add(2).add(3).multiply(4).getResult())
`,
  },
  {
    name: 'The Full Picture',
    description: 'Complete example showing the TS -> TJS -> JS value proposition',
    group: 'advanced',
    code: `/**
 * THE FULL PICTURE
 *
 * TypeScript promises type safety.
 * TJS delivers it at RUNTIME.
 *
 * This is what "TS keeps its promise" means.
 */

// Define your types with standard TypeScript syntax
interface Product {
  id: number
  name: string
  price: number
}

interface Order {
  products: Product[]
  customer: string
}

// Write your business logic
function calculateTotal(order: Order): number {
  return order.products.reduce((sum, p) => sum + p.price, 0)
}

function validateOrder(order: Order): string | null {
  if (order.products.length === 0) {
    return 'Order must have at least one product'
  }
  if (!order.customer) {
    return 'Customer name is required'
  }
  return null
}

function processOrder(order: Order): { success: boolean; total?: number; error?: string } {
  const error = validateOrder(order)
  if (error) {
    return { success: false, error }
  }
  return { success: true, total: calculateTotal(order) }
}

// Test with valid data
const validOrder: Order = {
  customer: 'Alice',
  products: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 19.99 }
  ]
}
console.log('Valid order:', processOrder(validOrder))

// Test with invalid data - TypeScript would let this through!
// But TJS catches it at runtime.
const badOrder = { customer: 'Bob' } as any // Missing products
console.log('Bad order:', processOrder(badOrder))

// The value proposition:
// 1. Write normal TypeScript
// 2. TJS transpiles it with runtime checks
// 3. Bad data gets caught, not crashed on
`,
  },
]
