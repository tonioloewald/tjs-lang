/**
 * Spike A — dictionary-defaults semantics harness (docs/dictionary-defaults.md §10).
 *
 * A standalone, hand-written implementation of the merge-on-partial semantics
 * (spec §5/§7), with NO transpiler involvement: `buildDescriptor(template)`
 * stands in for what Stage 1 will derive at transpile time, and `merge(...)`
 * is the runtime check-then-fill that Stage 2 wires into validation. The
 * table-driven suite next to this file is the spec's executable form and is
 * intended to survive into the final implementation.
 *
 * Deliberate spike simplifications (called out in the spec):
 * - Type checks here are typeof-level + structural (integer/float narrowing
 *   and the full TypeDescriptor vocabulary belong to the existing validator,
 *   which Stage 2 delegates to — the spike is about MERGE semantics).
 * - Required members are declared via the `required(example)` wrapper — a
 *   stand-in for the OQ1 grammar decision, mechanically equivalent to what a
 *   transpiler-recognized marker would produce.
 */

/** Marker for required members (OQ1 stand-in). */
const REQUIRED = Symbol('dict-defaults.required')

export interface RequiredMarker {
  [REQUIRED]: true
  example: unknown
}

/** Declare a member as required-no-default in a template literal. */
export function required(example: unknown): RequiredMarker {
  return { [REQUIRED]: true, example }
}

function isRequiredMarker(v: unknown): v is RequiredMarker {
  return typeof v === 'object' && v !== null && (v as any)[REQUIRED] === true
}

/** Excess-key policies under evaluation (spec §5.4, OQ2). */
export type ExcessPolicy = 'strip' | 'error' | 'passthrough'

export interface MergeOptions {
  excess: ExcessPolicy
  /**
   * Observability hook for stripped keys (the flight-recorder seam from the
   * §5.4 recommendation). Called once per excess key under 'strip'.
   */
  onExcess?: (path: string) => void
}

/** One member's descriptor entry. */
export interface MemberDescriptor {
  state: 'defaulted' | 'required'
  /** 'null' means "example is null ⇒ any value, null admitted" (§5.2). */
  kind: 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object'
  /** For kind 'object': nested member descriptors. */
  members?: Record<string, MemberDescriptor>
  /** For kind 'array' with a typed example element: the element's kind. */
  elementKind?: MemberDescriptor['kind']
}

export interface ShapeDescriptor {
  members: Record<string, MemberDescriptor>
}

/**
 * The same guard the VM's expression evaluator uses — merge is exactly where
 * prototype pollution lives (§5.6). Kept as a literal copy here because the
 * spike must stay dependency-free; Stage 2 imports the real set.
 */
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype'])

export class MergeError extends Error {
  constructor(
    public path: string,
    public expected: string,
    public got: string
  ) {
    super(`Expected ${expected} at '${path}', got ${got}`)
    this.name = 'MergeError'
  }
}

const kindOf = (v: unknown): MemberDescriptor['kind'] => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return t
  if (t === 'object') return 'object'
  throw new Error(`spike: unsupported template value type '${t}'`)
}

/**
 * Derive the shape descriptor from a template literal — the spike stand-in
 * for Stage 1's transpile-time derivation. Walks own enumerable string keys.
 */
export function buildDescriptor(
  template: Record<string, unknown>
): ShapeDescriptor {
  const members: Record<string, MemberDescriptor> = {}
  for (const key of Object.keys(template)) {
    const value = template[key]
    if (isRequiredMarker(value)) {
      const kind = kindOf(value.example)
      members[key] = {
        state: 'required',
        kind,
        ...(kind === 'object'
          ? {
              members: buildDescriptor(value.example as Record<string, unknown>)
                .members,
            }
          : {}),
        ...(kind === 'array' && (value.example as unknown[]).length > 0
          ? { elementKind: kindOf((value.example as unknown[])[0]) }
          : {}),
      }
    } else {
      const kind = kindOf(value)
      members[key] = {
        state: 'defaulted',
        kind,
        ...(kind === 'object'
          ? {
              members: buildDescriptor(value as Record<string, unknown>)
                .members,
            }
          : {}),
        ...(kind === 'array' && (value as unknown[]).length > 0
          ? { elementKind: kindOf((value as unknown[])[0]) }
          : {}),
      }
    }
  }
  return { members }
}

/** Structural clone of pure-literal data (I2: outputs never alias templates). */
const cloneValue = (v: unknown): unknown => {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(cloneValue)
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(v)) out[k] = cloneValue((v as any)[k])
  return out
}

/** Type-check a present payload value against a member descriptor. */
function checkValue(
  desc: MemberDescriptor,
  value: unknown,
  path: string
): MergeError | null {
  if (value === null) {
    // §5.2: null is a real value, admitted iff the member's example is null.
    return desc.kind === 'null' ? null : new MergeError(path, desc.kind, 'null')
  }
  if (desc.kind === 'null') return null // example null ⇒ any (nullable any)
  const got = kindOf(value)
  if (got !== desc.kind) return new MergeError(path, desc.kind, got)
  if (desc.kind === 'array' && desc.elementKind) {
    const arr = value as unknown[]
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null || kindOf(arr[i]) !== desc.elementKind) {
        return new MergeError(
          `${path}[${i}]`,
          desc.elementKind,
          arr[i] === null ? 'null' : kindOf(arr[i])
        )
      }
    }
  }
  return null
}

/**
 * Check-then-fill (spec §7.4).
 *
 * Returns the payload BY REFERENCE when it is complete and valid (I3), a
 * fresh merged object when members were absent, or a MergeError. Never writes
 * into the template or the payload (I1); never aliases mutable template
 * substructure into a result (I2).
 */
export function merge(
  descriptor: ShapeDescriptor,
  template: Record<string, unknown>,
  payload: Record<string, unknown> | undefined,
  options: MergeOptions,
  path = 'args'
): Record<string, unknown> | MergeError {
  // §5.5: top-level absence (and §5.2: undefined ⇒ absent) — fresh full clone.
  if (payload === undefined) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(descriptor.members)) {
      const m = descriptor.members[key]
      if (m.state === 'required') {
        return new MergeError(`${path}.${key}`, `required ${m.kind}`, 'absent')
      }
      out[key] = cloneValue(template[key])
    }
    return out
  }

  // §5.6: prototype-pollution guard — reject outright, never merge around it.
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PROPERTIES.has(key)) {
      return new MergeError(`${path}.${key}`, 'safe key', 'forbidden key')
    }
  }

  // Phase 1: read-only scan (validate present, note absent, police excess).
  const absent: string[] = []
  for (const key of Object.keys(descriptor.members)) {
    const m = descriptor.members[key]
    const present =
      Object.prototype.hasOwnProperty.call(payload, key) &&
      payload[key] !== undefined // §5.2: present-undefined ⇒ absent
    if (!present) {
      if (m.state === 'required') {
        return new MergeError(`${path}.${key}`, `required ${m.kind}`, 'absent')
      }
      absent.push(key)
      continue
    }
    const value = payload[key]
    if (m.kind === 'object' && m.members) {
      if (value === null) {
        return new MergeError(`${path}.${key}`, 'object', 'null')
      }
      if (kindOf(value) !== 'object') {
        return new MergeError(`${path}.${key}`, 'object', kindOf(value))
      }
      // Recursion is handled in the fill phase (it may allocate); here we
      // only pre-validate by recursing in scan-only fashion via merge itself —
      // see fill below. Nothing to do in the scan.
    } else {
      const err = checkValue(m, value, `${path}.${key}`)
      if (err) return err
    }
  }

  const excessKeys = Object.keys(payload).filter(
    (k) => !(k in descriptor.members)
  )
  if (excessKeys.length > 0 && options.excess === 'error') {
    return new MergeError(
      `${path}.${excessKeys[0]}`,
      'declared key',
      'excess key'
    )
  }

  // Phase 2: nested dictionaries — recurse (each returns payload-by-reference
  // when complete, so this stays allocation-free for complete payloads).
  const nestedResults: Record<string, unknown> = {}
  let nestedChanged = false
  for (const key of Object.keys(descriptor.members)) {
    const m = descriptor.members[key]
    if (
      m.kind !== 'object' ||
      !m.members ||
      absent.includes(key) ||
      !Object.prototype.hasOwnProperty.call(payload, key) ||
      payload[key] === undefined
    ) {
      continue
    }
    const inner = merge(
      { members: m.members },
      (m.state === 'required'
        ? // required-object members have no template value to fill from;
          // their nested defaulted members still fill from the marker example
          ((): Record<string, unknown> => {
            const t = template[key]
            return isRequiredMarker(t)
              ? (t.example as Record<string, unknown>)
              : (t as Record<string, unknown>)
          })()
        : template[key]) as Record<string, unknown>,
      payload[key] as Record<string, unknown>,
      options,
      `${path}.${key}`
    )
    if (inner instanceof MergeError) return inner
    if (inner !== payload[key]) {
      nestedResults[key] = inner
      nestedChanged = true
    }
  }

  // I3: complete payload, nothing nested changed, no stripping needed ⇒
  // return the payload by reference. Zero allocation.
  const mustStrip = excessKeys.length > 0 && options.excess === 'strip'
  if (absent.length === 0 && !nestedChanged && !mustStrip) {
    return payload
  }

  // Phase 3: build ONE fresh output. Present members from the payload (or
  // their merged nested result), absent members cloned from the template.
  if (mustStrip && options.onExcess) {
    for (const k of excessKeys) options.onExcess(`${path}.${k}`)
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(descriptor.members)) {
    if (absent.includes(key)) {
      out[key] = cloneValue(template[key])
    } else if (key in nestedResults) {
      out[key] = nestedResults[key]
    } else if (Object.prototype.hasOwnProperty.call(payload, key)) {
      out[key] = payload[key]
    }
  }
  if (options.excess === 'passthrough') {
    for (const k of excessKeys) out[k] = payload[k]
  }
  return out
}
