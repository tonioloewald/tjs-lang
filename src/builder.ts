import { coreAtoms, type Atom, type OpCode } from './runtime'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AtomMap = typeof coreAtoms

// --- AST Types ---

export interface BaseNode {
  op: OpCode
  [key: string]: any
}

export interface SeqNode extends BaseNode {
  op: 'seq'
  steps: BaseNode[]
}

// --- Helpers ---

export interface ArgRef {
  $kind: 'arg'
  path: string
}

// --- Typed Builder ---

// Helper to extract input type from Atom definition
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AtomInput<T> = T extends Atom<infer I, any> ? I : never

// The Builder instance type with dynamic methods inferred from AtomMap
type BuilderMethods<M extends Record<string, Atom<any, any>>> = {
  [K in keyof M as M[K]['op']]: (input: AtomInput<M[K]>) => BuilderType<M>
}

// Control Flow Extensions (Custom signatures)
interface ControlFlow<M extends Record<string, Atom<any, any>>> {
  if(
    condition: string,
    vars: Record<string, any>,
    thenBranch: (b: BuilderType<M>) => BuilderType<M>,
    elseBranch?: (b: BuilderType<M>) => BuilderType<M>
  ): BuilderType<M>

  while(
    condition: string,
    vars: Record<string, any>,
    body: (b: BuilderType<M>) => BuilderType<M>
  ): BuilderType<M>

  scope(steps: (b: BuilderType<M>) => BuilderType<M>): BuilderType<M>

  map(
    items: any,
    as: string,
    steps: (b: BuilderType<M>) => BuilderType<M>
  ): BuilderType<M>

  memoize(
    steps: (b: BuilderType<M>) => BuilderType<M>,
    key?: string
  ): BuilderType<M>

  cache(
    steps: (b: BuilderType<M>) => BuilderType<M>,
    key?: string,
    ttlMs?: number
  ): BuilderType<M>

  try(branches: {
    try: (b: BuilderType<M>) => BuilderType<M>
    catch?: (b: BuilderType<M>) => BuilderType<M>
  }): BuilderType<M>
}

export class TypedBuilder<M extends Record<string, Atom<any, any>>> {
  public steps: BaseNode[] = []
  private atoms: M
  private proxy: any

  constructor(atoms: M) {
    this.atoms = atoms

    // Proxy to handle dynamic atom calls
    this.proxy = new Proxy(this, {
      get: (target, prop: string | symbol, receiver) => {
        // 1. Check for class methods (as, step, toJSON, etc.)
        if (prop in target) return (target as any)[prop]

        // 2. Dynamic atom methods
        if (typeof prop === 'string' && prop in target.atoms) {
          return (input: any) => {
            const atom = target.atoms[prop]
            target.add(atom.create(input))
            return receiver
          }
        }

        return undefined
      },
    })

    return this.proxy
  }

  private add(step: BaseNode): BuilderType<M> {
    this.steps.push(step)
    return this.proxy
  }

  // --- Core Fluent API ---

  as(variableName: string): BuilderType<M> {
    if (this.steps.length === 0) throw new Error('No step to capture')
    const last = this.steps[this.steps.length - 1]
    last.result = variableName
    return this.proxy
  }

  step(node: BaseNode): BuilderType<M> {
    return this.add(node)
  }

  return(schema: any): BuilderType<M> {
    const atom = this.atoms['return']
    if (!atom) throw new Error("Atom 'return' not found")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _schema = schema.schema ?? schema
    return this.add(atom.create({ schema: _schema }))
  }

  toJSON(): SeqNode {
    return {
      op: 'seq',
      steps: [...this.steps],
    }
  }

  // --- Control Flow Helpers ---

  if(
    condition: string,
    vars: Record<string, any>,
    thenBranch: (b: BuilderType<M>) => BuilderType<M>,
    elseBranch?: (b: BuilderType<M>) => BuilderType<M>
  ) {
    const thenB = new TypedBuilder(this.atoms)
    thenBranch(thenB as any)

    let elseSteps
    if (elseBranch) {
      const elseB = new TypedBuilder(this.atoms)
      elseBranch(elseB as any)
      elseSteps = elseB.steps
    }

    // Uses the 'if' atom from map
    const ifAtom = this.atoms['if']
    return this.add(
      ifAtom.create({
        condition,
        vars,
        then: thenB.steps,
        else: elseSteps,
      })
    )
  }

  while(
    condition: string,
    vars: Record<string, any>,
    body: (b: BuilderType<M>) => BuilderType<M>
  ) {
    const bodyB = new TypedBuilder(this.atoms)
    body(bodyB as any)
    const whileAtom = this.atoms['while']
    return this.add(
      whileAtom.create({
        condition,
        vars,
        body: bodyB.steps,
      })
    )
  }

  scope(steps: (b: BuilderType<M>) => BuilderType<M>) {
    const scopeB = new TypedBuilder(this.atoms)
    steps(scopeB as any)
    const scopeAtom = this.atoms['scope']
    return this.add(
      scopeAtom.create({
        steps: scopeB.steps,
      })
    )
  }

  map(items: any, as: string, steps: (b: BuilderType<M>) => BuilderType<M>) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB as any)
    const mapAtom = this.atoms['map']
    return this.add(
      mapAtom.create({
        items,
        as,
        steps: stepsB.steps,
      })
    )
  }

  memoize(steps: (b: BuilderType<M>) => BuilderType<M>, key?: string) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB as any)
    const memoAtom = this.atoms['memoize']
    return this.add(
      memoAtom.create({
        key,
        steps: stepsB.steps,
      })
    )
  }

  cache(
    steps: (b: BuilderType<M>) => BuilderType<M>,
    key?: string,
    ttlMs?: number
  ) {
    const stepsB = new TypedBuilder(this.atoms)
    steps(stepsB as any)
    const cacheAtom = this.atoms['cache']
    return this.add(
      cacheAtom.create({
        key,
        steps: stepsB.steps,
        ttlMs,
      })
    )
  }

  try(branches: {
    try: (b: BuilderType<M>) => BuilderType<M>
    catch?: (b: BuilderType<M>) => BuilderType<M>
  }) {
    const tryB = new TypedBuilder(this.atoms)
    branches.try(tryB as any)

    let catchSteps
    if (branches.catch) {
      const catchB = new TypedBuilder(this.atoms)
      branches.catch(catchB as any)
      catchSteps = catchB.steps
    }

    const tryAtom = this.atoms['try']
    return this.add(
      tryAtom.create({
        try: tryB.steps,
        catch: catchSteps,
      })
    )
  }
}

// Combine dynamic atom methods with class methods
export type BuilderType<M extends Record<string, Atom<any, any>>> =
  TypedBuilder<M> & BuilderMethods<M> & ControlFlow<M>

// --- API Surface ---

export const A99 = {
  // Create a builder with default core atoms
  take(_schema?: any): BuilderType<typeof coreAtoms> {
    return new TypedBuilder(coreAtoms) as any
  },

  // Create a customized builder
  custom<M extends Record<string, Atom<any, any>>>(atoms: M): BuilderType<M> {
    return new TypedBuilder(atoms) as any
  },

  args(path: string): ArgRef {
    return { $kind: 'arg', path }
  },

  val(path: string): string {
    return path
  },
}
