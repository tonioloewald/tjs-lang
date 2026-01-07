import { coreAtoms, type Atom, type OpCode, type ExprNode } from './runtime'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AtomMap = typeof coreAtoms

// --- Condition String Parser ---

/**
 * Parse a simple condition string into an ExprNode.
 * Supports: identifiers, member access, binary/logical ops, literals
 * Uses the vars map to know which identifiers are state references.
 */
function parseCondition(
  condition: string,
  vars: Record<string, any>
): ExprNode {
  const tokens = tokenize(condition)
  const result = parseExpression(tokens, 0, vars)
  return result.node
}

function tokenize(expr: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    // Skip whitespace
    while (i < expr.length && /\s/.test(expr[i])) i++
    if (i >= expr.length) break

    // String literals (single or double quotes)
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i++]
      let str = ''
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          i++ // skip backslash
          str += expr[i++]
        } else {
          str += expr[i++]
        }
      }
      i++ // skip closing quote
      tokens.push(JSON.stringify(str)) // Store as JSON string for later parsing
      continue
    }

    // Multi-char operators
    if (expr.slice(i, i + 2).match(/^(&&|\|\||==|!=|>=|<=)$/)) {
      tokens.push(expr.slice(i, i + 2))
      i += 2
      continue
    }

    // Single-char operators
    if ('+-*/%><!().'.includes(expr[i])) {
      tokens.push(expr[i])
      i++
      continue
    }

    // Numbers
    if (/\d/.test(expr[i])) {
      let num = ''
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i++]
      }
      tokens.push(num)
      continue
    }

    // Identifiers
    if (/[a-zA-Z_]/.test(expr[i])) {
      let id = ''
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        id += expr[i++]
      }
      tokens.push(id)
      continue
    }

    i++
  }
  return tokens
}

function parseExpression(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  return parseLogicalOr(tokens, pos, vars)
}

function parseLogicalOr(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  let { node: left, pos: newPos } = parseLogicalAnd(tokens, pos, vars)

  while (tokens[newPos] === '||') {
    newPos++
    const { node: right, pos: rightPos } = parseLogicalAnd(tokens, newPos, vars)
    left = { $expr: 'logical', op: '||', left, right }
    newPos = rightPos
  }

  return { node: left, pos: newPos }
}

function parseLogicalAnd(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  let { node: left, pos: newPos } = parseComparison(tokens, pos, vars)

  while (tokens[newPos] === '&&') {
    newPos++
    const { node: right, pos: rightPos } = parseComparison(tokens, newPos, vars)
    left = { $expr: 'logical', op: '&&', left, right }
    newPos = rightPos
  }

  return { node: left, pos: newPos }
}

function parseComparison(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  let { node: left, pos: newPos } = parseAdditive(tokens, pos, vars)

  const compOps = ['==', '!=', '>', '<', '>=', '<=']
  while (compOps.includes(tokens[newPos])) {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseAdditive(tokens, newPos, vars)
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }

  return { node: left, pos: newPos }
}

function parseAdditive(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  let { node: left, pos: newPos } = parseMultiplicative(tokens, pos, vars)

  while (tokens[newPos] === '+' || tokens[newPos] === '-') {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseMultiplicative(
      tokens,
      newPos,
      vars
    )
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }

  return { node: left, pos: newPos }
}

function parseMultiplicative(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  let { node: left, pos: newPos } = parseUnary(tokens, pos, vars)

  while (
    tokens[newPos] === '*' ||
    tokens[newPos] === '/' ||
    tokens[newPos] === '%'
  ) {
    const op = tokens[newPos++]
    const { node: right, pos: rightPos } = parseUnary(tokens, newPos, vars)
    left = { $expr: 'binary', op, left, right }
    newPos = rightPos
  }

  return { node: left, pos: newPos }
}

function parseUnary(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  if (tokens[pos] === '!' || tokens[pos] === '-') {
    const op = tokens[pos++]
    const { node: argument, pos: newPos } = parseUnary(tokens, pos, vars)
    return { node: { $expr: 'unary', op, argument }, pos: newPos }
  }
  return parsePrimary(tokens, pos, vars)
}

function parsePrimary(
  tokens: string[],
  pos: number,
  vars: Record<string, any>
): { node: ExprNode; pos: number } {
  const token = tokens[pos]

  // Parenthesized expression
  if (token === '(') {
    const { node, pos: newPos } = parseExpression(tokens, pos + 1, vars)
    // Skip closing paren
    return { node, pos: newPos + 1 }
  }

  // String literal (stored as JSON)
  if (token && token.startsWith('"')) {
    return {
      node: { $expr: 'literal', value: JSON.parse(token) },
      pos: pos + 1,
    }
  }

  // Number literal
  if (token && /^\d/.test(token)) {
    return {
      node: { $expr: 'literal', value: parseFloat(token) },
      pos: pos + 1,
    }
  }

  // Boolean/null literals
  if (token === 'true')
    return { node: { $expr: 'literal', value: true }, pos: pos + 1 }
  if (token === 'false')
    return { node: { $expr: 'literal', value: false }, pos: pos + 1 }
  if (token === 'null')
    return { node: { $expr: 'literal', value: null }, pos: pos + 1 }

  // Identifier (possibly with member access via dots in vars)
  if (token && /^[a-zA-Z_]/.test(token)) {
    // Check if this identifier is in vars - if so, it's a state reference
    let node: ExprNode = { $expr: 'ident', name: token }
    let newPos = pos + 1

    // Handle member access (token.prop.subprop)
    while (tokens[newPos] === '.') {
      newPos++ // skip dot
      const prop = tokens[newPos++]
      node = { $expr: 'member', object: node, property: prop }
    }

    return { node, pos: newPos }
  }

  // Fallback - shouldn't happen
  return { node: { $expr: 'literal', value: null }, pos: pos + 1 }
}

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
  varsImport(keys: string[] | Record<string, string>): BuilderType<M>
  varsExport(keys: string[] | Record<string, string>): BuilderType<M>

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

  // --- Custom Overloads ---

  varsImport(keys: string[] | Record<string, string>) {
    return this.add(this.atoms['varsImport'].create({ keys }))
  }

  varsExport(keys: string[] | Record<string, string>) {
    return this.add(this.atoms['varsExport'].create({ keys }))
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

    // Parse condition string into ExprNode
    const conditionExpr = parseCondition(condition, vars)

    const ifAtom = this.atoms['if']
    return this.add(
      ifAtom.create({
        condition: conditionExpr,
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

    // Parse condition string into ExprNode
    const conditionExpr = parseCondition(condition, vars)

    const whileAtom = this.atoms['while']
    return this.add(
      whileAtom.create({
        condition: conditionExpr,
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
