/**
 * Predicate-aware JSON-Schema — "the missing computational half."
 *
 * A normal JSON-Schema node may carry a `$predicate` keyword whose value is the
 * *source* of a predicate cluster (a few pure functions; the last is the entry,
 * takes the value being validated, returns boolean). The source is trivially
 * serializable (it's a string), and the predicate verifier (`./predicate`) is
 * what makes it *safe to embed and run*: no IO, no async, fuel-bounded.
 *
 * Progressive enhancement falls out for free:
 *   - A *naive* JSON-Schema validator ignores the unknown `$predicate` keyword
 *     and validates only the structural part (`type`, `properties`, …).
 *   - A *predicate-aware* validator (this module — and, in production, an
 *     incoming `tosijs-schema`) ALSO runs the `$predicate`, validating the value
 *     grammar that JSON-Schema and TS can't express (var()/calc()/!important,
 *     order-flexible shorthands, recursive structure).
 *
 * This is the reference evaluator that lives with the predicate engine; the
 * structural subset is intentionally small (type/properties/required/items) —
 * full JSON-Schema structural validation is `tosijs-schema`'s job. The novel
 * part is `$predicate`.
 */
import { verifyPredicate, compilePredicate } from './predicate'
import type { CompilePredicateOptions } from './predicate'

/** A JSON-Schema node, optionally carrying a `$predicate` (predicate source). */
export interface PredicateSchema {
  type?:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'
  properties?: Record<string, PredicateSchema>
  required?: string[]
  items?: PredicateSchema
  /**
   * Predicate cluster source. The LAST top-level function is the entry; it
   * receives the value at this node and returns a boolean. Ignored by naive
   * validators (it's a custom keyword); run by predicate-aware ones.
   */
  $predicate?: string
  // description, title, examples, etc. are allowed and ignored.
  [k: string]: unknown
}

export interface SchemaError {
  /** JSON-pointer-ish path to the offending value, e.g. `/style/color`. */
  path: string
  message: string
}

export interface SchemaValidationResult {
  valid: boolean
  errors: SchemaError[]
}

export interface PredicateSchemaOptions extends CompilePredicateOptions {
  /**
   * Validate structure only — skip every `$predicate` (i.e. behave like a naive
   * JSON-Schema validator). Useful for demonstrating progressive enhancement.
   */
  ignorePredicates?: boolean
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

function typeMatches(value: unknown, type: string): boolean {
  if (type === 'integer')
    return typeof value === 'number' && Number.isInteger(value)
  return typeOf(value) === type
}

/**
 * Compile a predicate-aware JSON-Schema into a reusable validator. Every
 * `$predicate` cluster is verified + compiled once (fuel-bounded, IO-rejected);
 * an invalid/unsafe predicate throws here, at compile time.
 */
export function compilePredicateSchema(
  schema: PredicateSchema,
  opts: PredicateSchemaOptions = {}
): (value: unknown) => SchemaValidationResult {
  const { ignorePredicates, ...compileOpts } = opts
  // Compile every distinct $predicate once.
  const compiled = new Map<string, (value: unknown) => boolean>()
  const prepare = (node: PredicateSchema) => {
    if (
      node.$predicate &&
      !ignorePredicates &&
      !compiled.has(node.$predicate)
    ) {
      const src = node.$predicate
      const names = verifyPredicate(src, compileOpts).predicates
      const entry = names[names.length - 1]
      if (!entry)
        throw new Error('$predicate must declare at least one function')
      const mod = compilePredicate(src, [entry], compileOpts)
      compiled.set(src, mod[entry] as (value: unknown) => boolean)
    }
    if (node.properties)
      for (const child of Object.values(node.properties)) prepare(child)
    if (node.items) prepare(node.items)
  }
  prepare(schema)

  const check = (
    node: PredicateSchema,
    value: unknown,
    path: string,
    errors: SchemaError[]
  ) => {
    if (node.type && !typeMatches(value, node.type)) {
      errors.push({
        path: path || '/',
        message: `expected ${node.type}, got ${typeOf(value)}`,
      })
      return // structural mismatch — don't run value-grammar checks on it
    }
    if (
      node.type === 'object' &&
      node.properties &&
      value &&
      typeof value === 'object'
    ) {
      const obj = value as Record<string, unknown>
      for (const key of node.required ?? []) {
        if (!(key in obj))
          errors.push({
            path: `${path}/${key}`,
            message: `missing required '${key}'`,
          })
      }
      for (const [key, child] of Object.entries(node.properties)) {
        if (key in obj) check(child, obj[key], `${path}/${key}`, errors)
      }
    }
    if (node.type === 'array' && node.items && Array.isArray(value)) {
      value.forEach((el, i) => check(node.items!, el, `${path}/${i}`, errors))
    }
    // The computational half — only the aware validator runs it.
    if (node.$predicate && !ignorePredicates) {
      const fn = compiled.get(node.$predicate)!
      if (!fn(value))
        errors.push({
          path: path || '/',
          message: `failed predicate at ${path || '/'}`,
        })
    }
  }

  return (value: unknown) => {
    const errors: SchemaError[] = []
    check(schema, value, '', errors)
    return { valid: errors.length === 0, errors }
  }
}

/** One-shot convenience: compile + validate. */
export function validatePredicateSchema(
  schema: PredicateSchema,
  value: unknown,
  opts?: PredicateSchemaOptions
): SchemaValidationResult {
  return compilePredicateSchema(schema, opts)(value)
}
