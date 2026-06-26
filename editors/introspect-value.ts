/**
 * Serializable runtime introspection — the in-sandbox half of the introspection
 * bridge. Given a live value, produce a flat list of member descriptors that
 * survive `postMessage` (plain strings, no functions). The introspection bridge
 * injects this function's SOURCE into the sandbox iframe (via `.toString()`), so
 * it must be **self-contained** — no imports, no outer references.
 *
 * It mirrors the editor's own `introspectObject` (own keys first — important for
 * proxies that cache accesses, like tosijs `elements` — then the prototype
 * chain), but returns data instead of CodeMirror completions. The provider maps
 * these descriptors back into completions on the parent side.
 */

export interface IntrospectMember {
  label: string
  /** 'method' for callables, else 'property'. */
  type: 'method' | 'property'
  /** typeof for properties, an arg hint for methods. */
  detail: string
}

export function introspectValue(value: unknown): IntrospectMember[] {
  if (
    value == null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return []
  }

  const out: IntrospectMember[] = []
  const seen = new Set<string>()

  const push = (key: string, v: unknown) => {
    if (key === 'constructor' || key.startsWith('_') || seen.has(key)) return
    seen.add(key)
    if (typeof v === 'function') {
      const arity = (v as { length?: number }).length ?? 0
      const params =
        arity > 0
          ? Array.from({ length: arity }, (_, i) => `arg${i + 1}`).join(', ')
          : ''
      out.push({ label: key, type: 'method', detail: `(${params})` })
    } else {
      out.push({ label: key, type: 'property', detail: typeof v })
    }
  }

  // Own enumerable keys first — handles Proxies that materialise on access.
  try {
    for (const key of Object.keys(value as object)) {
      try {
        push(key, (value as Record<string, unknown>)[key])
      } catch {
        /* getter threw — skip */
      }
    }
  } catch {
    /* Object.keys failed — continue with the prototype walk */
  }

  // Own properties + prototype chain (inherited methods like Array#push).
  let current: any = value
  while (
    current &&
    current !== Object.prototype &&
    current !== Function.prototype
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key.startsWith('_') || seen.has(key))
        continue
      try {
        const d = Object.getOwnPropertyDescriptor(current, key)
        const v = d?.value ?? (d?.get ? '[getter]' : undefined)
        push(key, v)
      } catch {
        /* property threw on access — skip */
      }
    }
    current = Object.getPrototypeOf(current)
  }

  return out
}

/** The function source, for injection into the sandbox iframe. */
export const INTROSPECT_VALUE_SOURCE = introspectValue.toString()
