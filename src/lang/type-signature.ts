/**
 * The ONE rule for "what type signature does this example text imply?"
 *
 * A leaf on purpose. Two callers need it and they must not disagree:
 *
 *   - `parser-transforms.ts` uses it to reject an ambiguous polymorphic group;
 *   - `emitters/from-ts.ts` uses it to detect that a TypeScript overload group is not
 *     runtime-distinguishable BEFORE emitting one the parser would reject.
 *
 * Importing it from `parser-transforms` was the obvious move and the wrong one: it pulls the
 * whole parser into `tjs-browser-from-ts`, which exists to be a small CDN drop-in, and
 * `browser-bundle.test.ts` caught it. Dependency-free so it stays inlinable.
 */
export function typeSignatureFor(dv: string): string {
  if (/^['"`]/.test(dv)) return 'string'
  if (dv === 'true' || dv === 'false') return 'boolean'
  if (dv === 'null') return 'null'
  if (dv === 'undefined') return 'undefined'
  if (dv.startsWith('[')) return 'array'
  if (dv.startsWith('{')) return 'object'
  if (/^\+\d+/.test(dv)) return 'non-negative-integer'
  if (/^-?\d+\.\d+/.test(dv)) return 'number'
  if (/^-?\d+$/.test(dv)) return 'integer'
  // Sound TS type names carry the same signature their example spelling did, so a
  // conversion cannot turn a legal overload pair into an ambiguous one.
  if (dv === 'string') return 'string'
  if (dv === 'number') return 'number'
  if (dv === 'boolean') return 'boolean'
  // A declared type name is its OWN signature. Two different names are two different types,
  // which is precisely what makes `f(s: Circle)` / `f(s: Rect)` a legal pair rather than an
  // ambiguous one — and what `typeCheckForDefault` can now discriminate at runtime.
  if (/^[A-Z][A-Za-z0-9_$]*$/.test(dv)) return `declared:${dv}`
  return 'any'
}
