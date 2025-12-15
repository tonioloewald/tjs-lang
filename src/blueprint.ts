/*!
# Agent99 Blueprint

This blueprint exports the Agent99 Runtime and Builder, along with a demo component
that visualizes an agent execution in the browser.
*/

import type { XinBlueprint } from 'tosijs'
import { A99 } from './builder'
import { VM } from './runtime'
import { s } from 'tosijs-schema'
import { createBrowserCapabilities } from './atoms/browser'

export const blueprint: XinBlueprint = async (tag, factory) => {
  const { Component, elements, vars } = factory
  const { div, h3, button, pre, input, span } = elements

  class Agent99Demo extends Component {
    // State
    logs: string[] = []
    result: any = null
    fuel = 100

    // Demo Agent Logic
    // Reads a number from the input, adds tax, and returns it.
    private agentLogic = A99.take(s.object({ inputVal: s.number }))
      // 1. Calculate Tax
      .calc('inputVal * 0.2', { inputVal: A99.args('inputVal') })
      .as('tax')
      // 2. Calculate Total
      .calc('inputVal + tax', {
        inputVal: A99.args('inputVal'),
        tax: A99.val('tax'),
      })
      .as('total')
      // 3. Return
      .return(s.object({ total: s.number, tax: s.number }))

    constructor() {
      super()
      this.initAttributes('fuel')
    }

    async runAgent() {
      this.logs = ['Starting Agent...']
      this.result = null
      this.queueRender()

      try {
        // 1. Get Input Value from DOM manually to simulate "World State"
        // In a real app, the agent might use 'dom.value' atom, but here we just pass it as args.
        const inputEl = this.parts.input as HTMLInputElement
        const val = parseFloat(inputEl.value) || 0

        this.logs.push(`Input: ${val}`)

        // 2. Run VM
        const start = performance.now()
        const res = await VM.run(
          this.agentLogic.toJSON(),
          { inputVal: val },
          {
            fuel: this.fuel,
            capabilities: createBrowserCapabilities(),
          }
        )
        const duration = (performance.now() - start).toFixed(2)

        // 3. Update State
        this.result = res
        this.logs.push(`Success (${duration}ms)`)
        this.logs.push(`Fuel Remaining: ${this.fuel} (approx)`) // Fuel isn't returned yet by VM run, checking options
      } catch (e: any) {
        this.logs.push(`Error: ${e.message}`)
        console.error(e)
      }
      this.queueRender()
    }

    content = () =>
      div(
        {
          style: {
            padding: '1rem',
            border: '1px solid #ccc',
            borderRadius: '8px',
            maxWidth: '400px',
          },
        },
        h3('Agent99 Runtime Demo'),

        div(
          { style: { marginBottom: '1rem' } },
          span('Enter Amount: '),
          input({
            part: 'input',
            type: 'number',
            value: '100',
            style: { marginLeft: '0.5rem', padding: '4px' },
          })
        ),

        div(
          { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' } },
          button(
            {
              onClick: this.runAgent,
              style: {
                padding: '8px 16px',
                cursor: 'pointer',
                background: vars.primaryColor || '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
              },
            },
            'Run Calculation Agent'
          )
        ),

        // Logs Area
        div(
          {
            style: {
              background: '#f5f5f5',
              padding: '0.5rem',
              borderRadius: '4px',
              fontSize: '0.85rem',
            },
          },
          div(
            { style: { fontWeight: 'bold', marginBottom: '4px' } },
            'Execution Logs:'
          ),
          div(...this.logs.map((l) => div(l)))
        ),

        // Result Area
        this.result
          ? div(
              {
                style: {
                  marginTop: '1rem',
                  padding: '0.5rem',
                  borderLeft: '4px solid #28a745',
                  background: '#e6fffa',
                },
              },
              pre(JSON.stringify(this.result, null, 2))
            )
          : null
      )
  }

  return {
    type: Agent99Demo,
    styleSpec: {
      ':host': {
        display: 'block',
        fontFamily: 'system-ui, sans-serif',
      },
    },
  }
}

// Re-export Core Logic for Consumers
export * from './builder'
export * from './runtime'
export * from './atoms/browser'

export default blueprint
