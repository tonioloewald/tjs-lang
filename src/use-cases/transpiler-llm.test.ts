/**
 * Test that an LLM can write valid AJS code
 *
 * This test verifies that an LLM can understand the AJS format
 * and generate code that successfully transpiles and executes.
 */

import { describe, it, expect } from 'bun:test'
import { LocalModels } from '../batteries/models'
import { getLLMCapability } from '../batteries/llm'
import { ajs, transpile, getToolDefinitions } from '../transpiler'
import { AgentVM } from '../vm'
import { defineAtom, resolveValue } from '../runtime'
import { s } from 'tosijs-schema'

/**
 * Retry a test function up to maxAttempts times.
 * Passes if it succeeds at least minSuccesses times out of maxAttempts.
 * This accounts for LLM variability in code generation.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    minSuccesses = 1,
  }: { maxAttempts?: number; minSuccesses?: number } = {}
): Promise<T> {
  let successes = 0
  let lastError: Error | undefined
  let lastResult: T | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastResult = await fn()
      successes++
      if (successes >= minSuccesses) {
        return lastResult
      }
    } catch (e) {
      lastError = e as Error
      console.log(
        `Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`
      )
    }
  }

  if (successes >= minSuccesses) {
    return lastResult!
  }

  throw new Error(
    `Test failed: only ${successes}/${maxAttempts} attempts succeeded (needed ${minSuccesses}). Last error: ${lastError?.message}`
  )
}

/**
 * Strip markdown code fences from LLM output
 */
function stripCodeFences(code: string): string {
  // Remove ```javascript or ```js or ``` fences
  return code
    .replace(/^```(?:javascript|js)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim()
}

import { readFileSync } from 'fs'
import { join } from 'path'

// Load the actual LLM prompt that users get - tests should match real usage
const AJS_LLM_PROMPT = readFileSync(
  join(import.meta.dir, '../../guides/ajs-llm-prompt.md'),
  'utf-8'
)

// Extract just the system prompt section (between the triple backticks after "## System Prompt")
function extractSystemPrompt(markdown: string): string {
  const match = markdown.match(/## System Prompt\s+````\s*([\s\S]*?)````/)
  return match ? match[1].trim() : markdown
}

const AJS_GUIDE = extractSystemPrompt(AJS_LLM_PROMPT)

describe.skipIf(process.env.SKIP_LLM_TESTS)('LLM AJS Code Generation', () => {
  it('should generate valid AJS that computes factorial', async () => {
    await withRetry(async () => {
      const localModels = new LocalModels()
      await localModels.audit()
      const { predict } = getLLMCapability(localModels)

      const prompt = `${AJS_GUIDE}

Write an AJS function called "factorial" that takes a required number parameter "n" and returns an object with property "result" containing the factorial.

Follow the factorial example exactly. Use a while loop with a simple condition like \`i > 1\`, and use native arithmetic for multiplication and decrement inside the loop.

The factorial of 5 is 120.

Respond with ONLY the function code, no markdown fences or explanation.`

      const response = await predict(
        'You are a code generator. Output only valid AJS code.',
        prompt
      )

      const code = stripCodeFences(response.content)
      console.log('LLM generated code:')
      console.log(code)

      // Transpile the generated code
      const ast = ajs(code)

      expect(ast).toBeDefined()
      expect(ast.op).toBe('seq')

      // Execute it
      const vm = new AgentVM()
      const execResult = await vm.run(ast, { n: 5 })

      console.log('Execution result:', execResult)
      // vm.run returns { result, fuelUsed, trace } - the actual return value is in result
      expect(execResult.result.result).toBe(120)
    })
  }, 90000) // Extended timeout for retries

  it('should generate valid AJS for string greeting', async () => {
    await withRetry(async () => {
      const localModels = new LocalModels()
      await localModels.audit()
      const { predict } = getLLMCapability(localModels)

      const prompt = `${AJS_GUIDE}

Write an AJS function called "greet" following the greeting example above exactly.

The function should:
- Take a required string parameter "name" (use example value like 'World')
- Take an optional string parameter "greeting" with default "Hello"
- Use template to format the message
- Return an object with property "message"

Follow the "Greeting with optional parameter" example pattern exactly.

Respond with ONLY the function code, no markdown fences or explanation.`

      const response = await predict(
        'You are a code generator. Output only valid AJS code.',
        prompt
      )

      const code = stripCodeFences(response.content)
      console.log('LLM generated code:')
      console.log(code)

      const ast = ajs(code)
      expect(ast.op).toBe('seq')

      const vm = new AgentVM()

      // Test with default greeting - vm.run returns { result, fuelUsed, trace }
      const execResult1 = await vm.run(ast, { name: 'World' })
      console.log('Result with default:', execResult1)
      expect(execResult1.result.message).toContain('World')

      // Test with custom greeting
      const execResult2 = await vm.run(ast, { name: 'Alice', greeting: 'Hi' })
      console.log('Result with custom:', execResult2)
      expect(execResult2.result.message).toContain('Alice')
    })
  }, 90000)

  it('should generate code using tool definitions', async () => {
    await withRetry(async () => {
      const localModels = new LocalModels()
      await localModels.audit()
      const { predict } = getLLMCapability(localModels)

      // First, create a sample function and get its tool definition
      const { signature } = transpile(`
        /**
         * Calculate the area of a rectangle
         * @param width - The width of the rectangle
         * @param height - The height of the rectangle
         */
        function calculateArea(width: 0, height: 0) {
          let area = width * height
          return { area }
        }
      `)

      // getToolDefinitions expects Record<string, { signature }>
      const tools = getToolDefinitions({ calculateArea: { signature } })
      console.log('Tool definition:', JSON.stringify(tools, null, 2))

      // Now ask LLM to write a function that uses similar patterns
      const prompt = `${AJS_GUIDE}

Here's an example tool definition:
${JSON.stringify(tools[0], null, 2)}

Write a similar AJS function called "calculateVolume" that:
- Takes required number parameters: width, height, depth
- Returns an object with property "volume" (width * height * depth)

Use native arithmetic for the calculation. Respond with ONLY the function code.`

      const response = await predict(
        'You are a code generator. Output only valid AJS code.',
        prompt
      )

      const code = stripCodeFences(response.content)
      console.log('LLM generated code:')
      console.log(code)

      const ast = ajs(code)
      const vm = new AgentVM()
      const execResult = await vm.run(ast, { width: 2, height: 3, depth: 4 })

      console.log('Volume result:', execResult)
      // vm.run returns { result, fuelUsed, trace }
      expect(execResult.result.volume).toBe(24)
    })
  }, 90000)
})

describe.skipIf(process.env.SKIP_LLM_TESTS)('LLM Agent Tool Use', () => {
  it('should write and execute code to solve a problem using provided tools', async () => {
    await withRetry(async () => {
      const localModels = new LocalModels()
      await localModels.audit()
      const { predict } = getLLMCapability(localModels)

      // Define custom atoms that the LLM can use as "tools"
      // Note: atoms must call resolveValue on their parameters to handle state references
      const getWeather = defineAtom(
        'getWeather',
        s.object({ city: s.string }),
        s.object({ temp: s.number, condition: s.string }),
        async ({ city }, ctx) => {
          const resolvedCity = resolveValue(city, ctx)
          // Simulated weather data
          const weatherData: Record<
            string,
            { temp: number; condition: string }
          > = {
            'New York': { temp: 72, condition: 'sunny' },
            London: { temp: 58, condition: 'cloudy' },
            Tokyo: { temp: 80, condition: 'humid' },
            Paris: { temp: 65, condition: 'rainy' },
          }
          return weatherData[resolvedCity] || { temp: 0, condition: 'unknown' }
        },
        {
          docs: 'Get current weather for a city. Returns temp (Fahrenheit) and condition.',
        }
      )

      const convertTemp = defineAtom(
        'convertTemp',
        s.object({ fahrenheit: s.number }),
        s.number,
        async ({ fahrenheit }, ctx) => {
          const resolvedFahrenheit = resolveValue(fahrenheit, ctx)
          return Math.round(((resolvedFahrenheit - 32) * 5) / 9)
        },
        { docs: 'Convert temperature from Fahrenheit to Celsius.' }
      )

      // Create VM with custom atoms
      const vm = new AgentVM({ getWeather, convertTemp })

      // Tool descriptions for the LLM
      const toolDocs = `
## Available Tools (atoms)

1. **getWeather({ city: 'string' })** -> { temp: number, condition: string }
   Get current weather for a city. Returns temp in Fahrenheit and condition.
   Example: let weather = getWeather({ city: 'Tokyo' })

2. **convertTemp({ fahrenheit: number })** -> number
   Convert temperature from Fahrenheit to Celsius.
   Example: let celsius = convertTemp({ fahrenheit: 72 })

Note: Use native arithmetic for math operations.
Example: let diff = a - b
`

      const prompt = `${AJS_GUIDE}

${toolDocs}

## Task

Write an AJS function called "weatherReport" that:
1. Takes a required string parameter "city"
2. Gets the weather for that city using getWeather
3. Converts the temperature to Celsius using convertTemp
4. Returns an object with: { city, tempC, condition }

Remember:
- Store each result in a variable using let
- Access object properties with dot notation in the return
- The result of getWeather has .temp and .condition properties

Respond with ONLY the function code, no explanation.`

      const response = await predict(
        'You are a code generator. Output only valid AJS code.',
        prompt
      )

      const code = stripCodeFences(response.content)
      console.log('LLM generated code:')
      console.log(code)

      // Transpile and execute
      const ast = ajs(code)
      const execResult = await vm.run(ast, { city: 'Tokyo' })

      console.log('Weather report result:', execResult)

      // Verify the result
      expect(execResult.result.city).toBe('Tokyo')
      expect(execResult.result.tempC).toBe(27) // 80°F = 27°C
      expect(execResult.result.condition).toBe('humid')
    })
  }, 120000)

  it('should solve a multi-step problem with conditionals', async () => {
    await withRetry(async () => {
      const localModels = new LocalModels()
      await localModels.audit()
      const { predict } = getLLMCapability(localModels)

      // Define a simple inventory lookup tool
      const getInventory = defineAtom(
        'getInventory',
        s.object({ item: s.string }),
        s.object({ inStock: s.boolean, quantity: s.number, price: s.number }),
        async ({ item }, ctx) => {
          const resolvedItem = resolveValue(item, ctx)
          const inventory: Record<
            string,
            { inStock: boolean; quantity: number; price: number }
          > = {
            apple: { inStock: true, quantity: 50, price: 1.5 },
            banana: { inStock: true, quantity: 30, price: 0.75 },
            orange: { inStock: false, quantity: 0, price: 2.0 },
          }
          return (
            inventory[resolvedItem] || { inStock: false, quantity: 0, price: 0 }
          )
        },
        {
          docs: 'Check inventory for an item. Returns inStock, quantity, and price.',
        }
      )

      const vm = new AgentVM({ getInventory })

      const toolDocs = `
## Available Tools

1. **getInventory({ item: 'string' })** -> { inStock: boolean, quantity: number, price: number }
   Check inventory for an item.
   Example: let inv = getInventory({ item: 'apple' })

Note: Arithmetic works directly in AJS, no special function needed.
Example: let total = price * quantity
`

      const prompt = `${AJS_GUIDE}

${toolDocs}

## Task

Write an AJS function called "calculateOrder" that:
1. Takes required parameters: item (string), quantity (number)
2. Gets inventory info using getInventory
3. If the item is in stock AND has enough quantity:
   - Calculate total = inv.price * quantity
   - Return { success: true, total, message: 'Order placed' }
4. Otherwise:
   - Return { success: false, total: 0, message: 'Item unavailable' }

Follow this pattern:

\`\`\`
let inv = getInventory({ item })
if (inv.inStock && inv.quantity >= quantity) {
  let total = inv.price * quantity
  return { success: true, total, message: 'Order placed' }
} else {
  return { success: false, total: 0, message: 'Item unavailable' }
}
\`\`\`

Respond with ONLY the function code.`

      const response = await predict(
        'You are a code generator. Output only valid AJS code.',
        prompt
      )

      const code = stripCodeFences(response.content)
      console.log('LLM generated code:')
      console.log(code)

      const ast = ajs(code)

      // Test successful order
      const result1 = await vm.run(ast, { item: 'apple', quantity: 10 })
      console.log('Order result (success):', result1)
      expect(result1.result.success).toBe(true)
      expect(result1.result.total).toBe(15) // 10 * 1.50

      // Test out of stock
      const result2 = await vm.run(ast, { item: 'orange', quantity: 5 })
      console.log('Order result (out of stock):', result2)
      expect(result2.result.success).toBe(false)

      // Test insufficient quantity
      const result3 = await vm.run(ast, { item: 'banana', quantity: 100 })
      console.log('Order result (insufficient):', result3)
      expect(result3.result.success).toBe(false)
    })
  }, 120000)
})
