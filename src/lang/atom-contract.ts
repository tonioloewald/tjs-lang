/**
 * An atom's input CONTRACT, read from the input schema it declares: the ONE reading, used by the
 * transpiler's atom-call check and by the test that generates `CORE_ATOM_INPUTS`.
 *
 * - `keys` is null for an OPEN schema (no `additionalProperties: false`). It declares no limit on
 *   input names, so an undeclared input is not an error.
 * - `required` applies whenever the schema lists it, open or closed: an open schema that
 *   requires `url` still requires `url` (rc.2 twenty-third re-review).
 * - A tosijs builder is unwrapped only when it IS one (`isBuilder`, tjs-lang#58), never because a
 *   value happens to have a `schema` key.
 *
 * Returns undefined for a schema that is not an object with declared properties (`s.any`, a record,
 * no schema): there is no contract to check.
 */
import { isBuilder } from 'tosijs-schema'

export interface AtomContract {
  readonly keys: readonly string[] | null
  readonly required: readonly string[]
}

export function contractOf(inputSchema: unknown): AtomContract | undefined {
  const sc: any = isBuilder(inputSchema)
    ? (inputSchema as any).schema
    : inputSchema
  const props = sc?.properties
  if (!props || typeof props !== 'object') return undefined
  return {
    keys: sc.additionalProperties === false ? Object.keys(props) : null,
    required: Array.isArray(sc.required) ? sc.required : [],
  }
}
