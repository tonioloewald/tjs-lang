/**
 * Test that an LLM can write valid AsyncJS code
 *
 * This test verifies that an LLM can understand the AsyncJS format
 * and generate code that successfully transpiles and executes.
 */

import { describe, it, expect } from 'bun:test'
import { LocalModels } from '../batteries/models'
import { getLLMCapability } from '../batteries/llm'
import { js, transpile, getToolDefinitions } from '../transpiler'
import { AgentVM } from '../vm'
import { defineAtom, resolveValue } from '../runtime'
import { s } from 'tosijs-schema'

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

const ASYNCJS_GUIDE = `
# AsyncJS Quick Reference

AsyncJS is a JavaScript subset for AI agents. Key differences:

1. **Types through values**: Use \`param: 'string'\` for required string, \`param = 10\` for optional with default
2. **Implicit async**: All atom calls are automatically awaited
3. **Available atoms**: mathCalc (for math), template (for string formatting), varSet, if, while, return

## Example: Adding two numbers

\`\`\`javascript
function add(a: 0, b: 0) {
  let sum = mathCalc({ expr: 'a + b', vars: { a, b } })
  return { sum }
}
\`\`\`

## Example: Factorial with while loop

\`\`\`javascript
function factorial(n: 0) {
  let result = 1
  let i = n
  while (i > 1) {
    result = mathCalc({ expr: 'result * i', vars: { result, i } })
    i = mathCalc({ expr: 'i - 1', vars: { i } })
  }
  return { result }
}
\`\`\`

## Rules
- Use \`let\` for variables, not \`const\` or \`var\`
- Use \`mathCalc({ expr: '...', vars: {...} })\` for ALL arithmetic operations
- The while condition is a simple comparison like \`i > 0\`, NOT a mathCalc call
- Return an object with named properties
- Parameter types: \`name: 'string'\` (required string), \`count: 0\` (required number), \`flag: true\` (required boolean)
- Optional params: \`limit = 10\` (optional number with default)
`

describe('LLM AsyncJS Code Generation', () => {
  it('should generate valid AsyncJS that computes factorial', async () => {
    const localModels = new LocalModels()
    await localModels.audit()
    const { predict } = getLLMCapability(localModels)

    const prompt = `${ASYNCJS_GUIDE}

Write an AsyncJS function called "factorial" that takes a required number parameter "n" and returns an object with property "result" containing the factorial.

Follow the factorial example exactly. Use a while loop with a simple condition like \`i > 1\`, and use mathCalc for the multiplication and decrement inside the loop.

The factorial of 5 is 120.

Respond with ONLY the function code, no markdown fences or explanation.`

    const response = await predict(
      'You are a code generator. Output only valid AsyncJS code.',
      prompt
    )

    const code = stripCodeFences(response.content)
    console.log('LLM generated code:')
    console.log(code)

    // Transpile the generated code
    const ast = js(code)

    expect(ast).toBeDefined()
    expect(ast.op).toBe('seq')

    // Execute it
    const vm = new AgentVM()
    const execResult = await vm.run(ast, { n: 5 })

    console.log('Execution result:', execResult)
    // vm.run returns { result, fuelUsed, trace } - the actual return value is in result
    expect(execResult.result.result).toBe(120)
  }, 30000)

  it('should generate valid AsyncJS for string greeting', async () => {
    const localModels = new LocalModels()
    await localModels.audit()
    const { predict } = getLLMCapability(localModels)

    const prompt = `${ASYNCJS_GUIDE}

Write an AsyncJS function called "greet" that:
- Takes a required string parameter "name"  
- Takes an optional string parameter "greeting" with default "Hello"
- Returns an object with property "message" containing the greeting

Use the template atom: template({ tmpl: '{{greeting}}, {{name}}!', vars: { greeting, name } })

IMPORTANT: Do NOT use TypeScript return type annotations like ": { message: string }". 
Just write plain AsyncJS without TypeScript syntax.

Respond with ONLY the function code, no markdown fences or explanation.`

    const response = await predict(
      'You are a code generator. Output only valid AsyncJS code.',
      prompt
    )

    const code = stripCodeFences(response.content)
    console.log('LLM generated code:')
    console.log(code)

    const ast = js(code)
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
  }, 30000)

  it('should generate code using tool definitions', async () => {
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
        let area = mathCalc({ expr: 'width * height', vars: { width, height } })
        return { area }
      }
    `)

    // getToolDefinitions expects Record<string, { signature }>
    const tools = getToolDefinitions({ calculateArea: { signature } })
    console.log('Tool definition:', JSON.stringify(tools, null, 2))

    // Now ask LLM to write a function that uses similar patterns
    const prompt = `${ASYNCJS_GUIDE}

Here's an example tool definition:
${JSON.stringify(tools[0], null, 2)}

Write a similar AsyncJS function called "calculateVolume" that:
- Takes required number parameters: width, height, depth
- Returns an object with property "volume" (width * height * depth)

Use mathCalc for the calculation. Respond with ONLY the function code.`

    const response = await predict(
      'You are a code generator. Output only valid AsyncJS code.',
      prompt
    )

    const code = stripCodeFences(response.content)
    console.log('LLM generated code:')
    console.log(code)

    const ast = js(code)
    const vm = new AgentVM()
    const execResult = await vm.run(ast, { width: 2, height: 3, depth: 4 })

    console.log('Volume result:', execResult)
    // vm.run returns { result, fuelUsed, trace }
    expect(execResult.result.volume).toBe(24)
  }, 30000)
})

describe('LLM Agent Tool Use', () => {
  it('should write and execute code to solve a problem using provided tools', async () => {
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
        const weatherData: Record<string, { temp: number; condition: string }> =
          {
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

3. **mathCalc({ expr: string, vars: object })** -> number
   Evaluate a math expression.
   Example: let diff = mathCalc({ expr: 'a - b', vars: { a: 10, b: 5 } })
`

    const prompt = `${ASYNCJS_GUIDE}

${toolDocs}

## Task

Write an AsyncJS function called "weatherReport" that:
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
      'You are a code generator. Output only valid AsyncJS code.',
      prompt
    )

    const code = stripCodeFences(response.content)
    console.log('LLM generated code:')
    console.log(code)

    // Transpile and execute
    const ast = js(code)
    const execResult = await vm.run(ast, { city: 'Tokyo' })

    console.log('Weather report result:', execResult)

    // Verify the result
    expect(execResult.result.city).toBe('Tokyo')
    expect(execResult.result.tempC).toBe(27) // 80°F = 27°C
    expect(execResult.result.condition).toBe('humid')
  }, 45000)

  it('should solve a multi-step problem with conditionals', async () => {
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

2. **mathCalc({ expr: string, vars: object })** -> number
   Evaluate a math expression. To use object properties, first extract them to variables:
   
   WRONG: mathCalc({ expr: 'inv.price * quantity', vars: { inv, quantity } })
   RIGHT: 
     let price = inv.price
     let total = mathCalc({ expr: 'price * quantity', vars: { price, quantity } })
`

    const prompt = `${ASYNCJS_GUIDE}

${toolDocs}

## Task

Write an AsyncJS function called "calculateOrder" that:
1. Takes required parameters: item (string), quantity (number)
2. Gets inventory info using getInventory
3. Extract the price: let price = inv.price
4. If the item is in stock AND has enough quantity:
   - Calculate total = price * quantity using mathCalc
   - Return { success: true, total, message: 'Order placed' }
5. Otherwise:
   - Return { success: false, total: 0, message: 'Item unavailable' }

IMPORTANT: 
- Extract inv.price to a variable BEFORE the if statement
- Use if/else blocks with simple return statements in each branch
- Do NOT use ternary operators or template literals in mathCalc
- Follow this exact pattern:

\`\`\`
let inv = getInventory({ item })
let price = inv.price
if (inv.inStock && inv.quantity >= quantity) {
  let total = mathCalc({ expr: 'price * quantity', vars: { price, quantity } })
  return { success: true, total, message: 'Order placed' }
} else {
  return { success: false, total: 0, message: 'Item unavailable' }
}
\`\`\`

Respond with ONLY the function code.`

    const response = await predict(
      'You are a code generator. Output only valid AsyncJS code.',
      prompt
    )

    const code = stripCodeFences(response.content)
    console.log('LLM generated code:')
    console.log(code)

    const ast = js(code)

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
  }, 45000)
})
