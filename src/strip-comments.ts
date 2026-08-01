/**
 * Comment stripping that understands strings and regex literals.
 *
 * Lives in its own dependency-free module (same reason as `src/redos.ts` and
 * `src/forbidden-keys.ts`): `emitters/from-ts.ts` needs it, and importing it from
 * `lang/parser.ts` dragged the entire parser into the `tjs-browser-from-ts` bundle —
 * caught by `browser-bundle.test.ts` as a 23% size regression. Zero imports here, so any
 * consumer can use it without pulling a graph behind it.
 */

/**
 * Is a `/` at this point the start of a REGEX rather than a division operator?
 *
 * Decided by the last significant character emitted so far: after a value (identifier,
 * number, `)`, `]`) a slash is division; otherwise it opens a regex. This is the standard
 * heuristic and is sufficient here — we only need to know how far to skip, so the rare
 * ambiguous case costs us nothing worse than today's behavior.
 */
export function isRegexStart(emitted: string): boolean {
  let j = emitted.length - 1
  while (j >= 0 && /\s/.test(emitted[j])) j--
  if (j < 0) return true // start of input
  const c = emitted[j]
  // A closing quote means a string literal just ended — strings are consumed whole, so a
  // trailing quote is always a VALUE, and `'a' // b` is a comment, not a regex.
  if (/[)\]'"`]/.test(c)) return false // (expr) / x, arr[0] / x, 'str' // comment
  if (/[A-Za-z0-9_$]/.test(c)) {
    // An identifier or number ends a value — UNLESS it is a keyword that expects an operand.
    const word = (emitted
      .slice(0, j + 1)
      .match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [''])[0]
    return REGEX_PRECEDING_KEYWORDS.has(word)
  }
  return true // after ( , = : [ ! & | ? { } ; and friends
}

/** Keywords after which a `/` opens a regex rather than dividing. */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

/**
 * Index of the closing `/` of the regex literal starting at `start`, or -1.
 * Honours escapes and character classes, inside which `/` is a literal character.
 */
export function findRegexEnd(source: string, start: number): number {
  let k = start + 1
  let inClass = false
  while (k < source.length) {
    const c = source[k]
    if (c === '\\') {
      k += 2
      continue
    }
    if (c === '\n') return -1 // regex literals cannot span lines
    if (inClass) {
      if (c === ']') inClass = false
    } else if (c === '[') {
      inClass = true
    } else if (c === '/') {
      return k
    }
    k++
  }
  return -1
}

export function stripLineComments(source: string): string {
  let result = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    // String literals — skip to closing quote
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      result += ch
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          result += source[i++]
        }
        if (i < source.length) result += source[i++]
      }
      if (i < source.length) result += source[i++] // closing quote
      continue
    }
    // Block comment — pass through (may contain //)
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      const slice = end === -1 ? source.slice(i) : source.slice(i, end + 2)
      result += slice
      i += slice.length
      continue
    }
    // Line comment — replace with spaces to preserve offsets
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      const end = nl === -1 ? source.length : nl
      result += ' '.repeat(end - i)
      i = end // leave \n for next iteration
      continue
    }
    // Regex literal — skip it whole, exactly like a string.
    //
    // Without this, a regex whose BODY contains a close-comment marker or `//` gets read as a comment:
    // scanning `/\*\//` reaches the trailing `\/` + `/`, calls it a line comment, and
    // blanks the rest of the line, leaving an unterminated regex. That broke conversion of
    // our own parser.ts and docs.ts — any codebase that matches comment syntax hits it.
    //
    // `/` is only a regex start in operand position; after a value it is division. The
    // last significant character is enough to tell the two apart in practice.
    //
    // ORDER MATTERS: this runs AFTER the comment checks. `//` and `/*` are ALWAYS
    // comments in JavaScript — an empty regex must be written `/(?:)/` — so checking
    // regexes first would read `//` as an empty regex literal and stop stripping line
    // comments entirely.
    if (ch === '/' && isRegexStart(result)) {
      const end = findRegexEnd(source, i)
      if (end !== -1) {
        result += source.slice(i, end + 1)
        i = end + 1
        continue
      }
      // Unterminated — fall through and let the parser report it properly.
    }
    result += ch
    i++
  }
  return result
}

/**
 * Blank the CONTENTS of strings, templates, regexes and comments, preserving length.
 *
 * Delimiters are kept so the result still tokenizes; only the insides become spaces. Since
 * every offset is unchanged, a regex scan over the mask yields indices that index straight
 * back into the original source.
 *
 * This exists because scanners that look for declarations with a plain regex find them
 * inside string literals too — `src/cli/create-app.ts` holds project-scaffolding templates
 * containing `function greet(...)`, and the polymorphic-dispatch detector treated two
 * unrelated scaffold examples as ambiguous variants of one function.
 *
 * Template interpolations are blanked along with the rest: a `function` DECLARATION inside
 * `${...}` is vanishingly rare, and treating one as a dispatch variant would be wrong
 * anyway.
 */
export function maskLiterals(source: string): string {
  const out = source.split('')
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  let i = 0
  let sigTail = ''
  while (i < source.length) {
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) break
        j++
      }
      blank(i + 1, j)
      i = j + 1
      sigTail = (sigTail + ch).slice(-24)
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      blank(i, nl === -1 ? source.length : nl)
      i = nl === -1 ? source.length : nl
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      blank(i, end === -1 ? source.length : end + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    if (ch === '/' && isRegexStart(sigTail)) {
      const end = findRegexEnd(source, i)
      if (end !== -1) {
        blank(i + 1, end)
        i = end + 1
        sigTail = '/'
        continue
      }
    }
    if (!/\s/.test(ch)) sigTail = (sigTail + ch).slice(-24)
    i++
  }
  return out.join('')
}
