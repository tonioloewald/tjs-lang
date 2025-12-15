import { calc, iff, fetch, storeGet, storeSet, ret } from './runtime'

// --- AST Node Definitions ---

export type OpCode = string

export interface BaseNode {
  op: OpCode
  [key: string]: any
}

export interface SeqNode extends BaseNode {
  op: 'seq'
  steps: BaseNode[]
}

// --- Helpers ---

// Marker for Argument References
export interface ArgRef {
  $kind: 'arg'
  path: string
}

// --- Builder ---

export class Builder {
  // Public for internal access by if() callbacks
  public steps: BaseNode[] = []
  private _inputSchema?: any
  private _outputSchema?: any

  constructor(inputSchema?: any) {
    this._inputSchema = inputSchema
  }

  /**
   * Adds a step to the sequence
   */
  private add(step: BaseNode) {
    this.steps.push(step)
    return this
  }

  /**
   * Generic Extension: Add any raw atom node.
   */
  step(node: BaseNode) {
    return this.add(node)
  }

  /**
   * Math Atom: Safe arithmetic parsing.
   * @param expr Math expression string (e.g. "a + b * c")
   * @param vars Variable bindings
   */
  calc(expr: string, vars: Record<string, any>) {
    return this.add(
      calc.create({
        expr,
        vars,
      })
    )
  }

  /**
   * Control Flow: If / Else
   * @param condition Expression to evaluate (e.g. "price > 100")
   * @param vars Variable bindings for the condition
   * @param thenBranch Callback to build the 'then' sequence
   * @param elseBranch Optional callback to build the 'else' sequence
   */
  if(
    condition: string,
    vars: Record<string, any>,
    thenBranch: (b: Builder) => Builder,
    elseBranch?: (b: Builder) => Builder
  ) {
    const thenBuilder = new Builder()
    thenBranch(thenBuilder)

    let elseSteps: BaseNode[] | undefined
    if (elseBranch) {
      const elseBuilder = new Builder()
      elseBranch(elseBuilder)
      elseSteps = elseBuilder.steps
    }

    return this.add(
      iff.create({
        condition,
        vars,
        then: thenBuilder.steps as any, // Cast to match atom schema type if needed
        else: elseSteps as any,
      })
    )
  }

  /**
   * IO: HTTP Fetch
   */
  fetch(
    url: string,
    options: {
      method?: string
      body?: any
      headers?: Record<string, string>
    } = {}
  ) {
    return this.add(
      fetch.create({
        url,
        ...options,
      })
    )
  }

  /**
   * Store: Get a value from the KV store
   */
  storeGet(key: string) {
    return this.add(
      storeGet.create({
        key,
      })
    )
  }

  /**
   * Store: Set a value in the KV store
   */
  storeSet(key: string, value: any) {
    return this.add(
      storeSet.create({
        key,
        value,
      })
    )
  }

  /**
   * Captures the result of the *last* operation into a named variable in the state.
   * @param variableName Name of the variable to set
   */
  as(variableName: string) {
    if (this.steps.length === 0) {
      throw new Error(
        'A99 Builder Error: .as() called without a preceding operation.'
      )
    }
    const lastStep = this.steps[this.steps.length - 1]

    // Mutate the last step to add the result register
    // This assumes the last step supports 'result'.
    lastStep.result = variableName

    return this
  }

  /**
   * Ends the chain and defines the output contract.
   * @param schema Output schema definition
   */
  return(schema: any) {
    this._outputSchema = schema

    return this.add(
      ret.create({
        schema: schema.schema,
      })
    )
  }

  /**
   * Serializes the logic chain to the JSON AST.
   */
  toJSON(): SeqNode {
    return {
      op: 'seq',
      steps: [...this.steps],
    }
  }
}

// --- API Surface ---

export const A99 = {
  /**
   * Begin a logic chain by defining the input schema.
   */
  take(schema: any) {
    return new Builder(schema)
  },

  /**
   * Create a reference to an input argument.
   * Usage: A99.args('user.id')
   */
  args(path: string): ArgRef {
    return { $kind: 'arg', path }
  },

  /**
   * Create a reference to a variable in the current state scope.
   * Usage: A99.val('myVar')
   */
  val(path: string): string {
    // For now, simple strings in 'vars' mappings are treated as state keys by the runtime
    return path
  },

  // run() placeholder for future VM implementation
  async run(_ast: Builder | SeqNode, _input: any): Promise<any> {
    throw new Error('Runtime not yet implemented.')
  },
}
