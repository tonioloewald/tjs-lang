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
 * Is the character at `index` escaped by a preceding backslash?
 *
 * **Count the run; do not look at one character.** `source[i - 1] !== '\\'` is the naive
 * form, and it is wrong for exactly the input that matters: in `'\\'` the character before
 * the closing quote IS a backslash, but that backslash is itself escaped, so the quote
 * closes the string. The naive check reads it as escaped, the scanner runs on past the end
 * of the literal, and everything downstream desynchronises — usually surfacing as a
 * baffling "Unexpected token" tens of characters later, and sometimes as a SILENT
 * mis-transpile with no error at all.
 *
 * This idiom was hand-rolled in fifteen scanners across five files. It was fixed in one of
 * them (bdfb847), whose own commit message noted the pattern recurs "in several scanners" —
 * so the remaining fourteen kept the bug. It lives here now, once.
 */
export function isEscapedAt(source: string, index: number): boolean {
  let backslashes = 0
  let k = index - 1
  while (k >= 0 && source[k] === '\\') {
    backslashes++
    k--
  }
  return backslashes % 2 === 1
}

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
  // LENGTH-PRESERVING: a line comment is blanked to spaces, not removed.
  //
  // That is load-bearing and was nearly lost. `preprocess` runs this early and then works
  // in OFFSETS — doc-comment adjacency, brace matching, marker positions — so deleting the
  // text shifts everything after it. A first rewrite of this function removed the comments
  // instead, and the output looked right in isolation while a doc block stopped attaching
  // to the function below it, 200 lines away. The failing probe for that was itself wrong:
  // a hand-written "old implementation" that deleted rather than blanked, so it reported
  // agreement.
  //
  // Built on `blankRegions`, like the other views, because this was a fourth hand-rolled
  // literal walker living INSIDE the module written to end them — with no regex branch, so
  // a `//` inside `/[/]/` would have blanked the rest of the line.
  return blankRegions(source, (r) =>
    r.kind === 'line-comment' ? [r.start, r.end] : null
  )
}

/** A [start, end) range in the source, and what kind of region it is. */
export interface LiteralRegion {
  kind: 'string' | 'template' | 'regex' | 'line-comment' | 'block-comment'
  /** Offset of the opening delimiter. */
  start: number
  /** Offset just past the closing delimiter. */
  end: number
  /** Offset of the first character INSIDE the delimiters. */
  innerStart: number
  /** Offset just past the last character inside the delimiters. */
  innerEnd: number
}

/**
 * THE scanner. Every source-rewriting pass in this codebase should consume this rather
 * than hand-rolling its own literal tracking.
 *
 * One left-to-right pass classifying strings, templates, regex literals and comments. It
 * has to be one pass, not four, because the states are mutually exclusive and mutually
 * disambiguating: whether `/*` opens a comment depends on not being in a string, and
 * whether `'` opens a string depends on not being in a comment. Every scanner that tracked
 * only SOME of these got the others wrong.
 *
 * The bug class this exists to end, all of it shipped and all of it found in one release:
 *   - a `'/*'` in a string silently disabled every `test { }` block in the file — no error,
 *     no warning, no recorder entry, just zero tests where there were three
 *   - `'**\/*.ts'`, an ordinary glob, did the same
 *   - `const q = /['"]/` above a doc comment dropped an embedded test, and a `/'/` above a
 *     JSDoc promoted a documentation example into a real emitted test
 *   - `sep == '\\'` failed to transpile with "Unexpected token" 40 characters later
 *
 * None of these are exotic. They are what ordinary code looks like when it happens to
 * mention the syntax the scanner is scanning for — which source-processing code does
 * constantly, because it is code about code.
 */
/**
 * Bounded memo, keyed by the exact source string.
 *
 * Consolidating fifteen hand-rolled literal scanners onto this one was the right
 * correctness call and nothing memoized the result: one transpile calls it 175 times over
 * ~35 distinct strings — 91% redundant, ~745KB rescanned, 17% of total transpile time.
 * Callers legitimately ask repeatedly (each transform masks the source it was handed), and
 * telling every caller to hoist is the coordination problem this module exists to remove.
 *
 * There is NO staleness surface: the function is pure, so the same string always has the
 * same regions. The only cost is memory, which is why the cache is bounded and evicts in
 * insertion order rather than growing with every string a long-lived process ever sees.
 */
const SCAN_CACHE_MAX = 24
const scanCache = new Map<string, LiteralRegion[]>()

/** Drop the memo. Exposed for benchmarks and for hosts that want the memory back. */
export function clearLiteralCache(): void {
  scanCache.clear()
}

export function scanLiterals(source: string): LiteralRegion[] {
  const hit = scanCache.get(source)
  if (hit) {
    // Refresh recency so a string used throughout a transpile is not evicted by a burst
    // of one-off scans.
    scanCache.delete(source)
    scanCache.set(source, hit)
    return hit
  }
  // FROZEN, because the array is now shared between every caller for a given string.
  // Two exported wrappers hand it straight back, so a caller that sorted or spliced it
  // would silently corrupt the answer every later caller receives — a cache-poisoning
  // bug with no symptom at the mutation site. Frozen, that becomes an immediate throw.
  const computed = Object.freeze(
    scanLiteralsUncached(source)
  ) as LiteralRegion[]
  if (scanCache.size >= SCAN_CACHE_MAX) {
    const oldest = scanCache.keys().next().value
    if (oldest !== undefined) scanCache.delete(oldest)
  }
  scanCache.set(source, computed)
  return computed
}

function scanLiteralsUncached(source: string): LiteralRegion[] {
  const regions: LiteralRegion[] = []
  let i = 0
  let sigTail = ''
  while (i < source.length) {
    const ch = source[i]!
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
      regions.push({
        kind: ch === '`' ? 'template' : 'string',
        start: i,
        end: Math.min(j + 1, source.length),
        innerStart: i + 1,
        innerEnd: j,
      })
      i = j + 1
      sigTail = (sigTail + ch).slice(-24)
      continue
    }
    // ORDER MATTERS: `//` and `/*` are ALWAYS comments in JavaScript — an empty regex has
    // to be written `/(?:)/` — so the comment checks must precede the regex check.
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      const end = nl === -1 ? source.length : nl
      regions.push({
        kind: 'line-comment',
        start: i,
        end,
        innerStart: i + 2,
        innerEnd: end,
      })
      i = end
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2)
      const end = close === -1 ? source.length : close + 2
      regions.push({
        kind: 'block-comment',
        start: i,
        end,
        innerStart: i + 2,
        innerEnd: close === -1 ? source.length : close,
      })
      i = end
      continue
    }
    if (ch === '/' && isRegexStart(sigTail)) {
      const close = findRegexEnd(source, i)
      if (close !== -1) {
        regions.push({
          kind: 'regex',
          start: i,
          end: close + 1,
          innerStart: i + 1,
          innerEnd: close,
        })
        i = close + 1
        sigTail = '/'
        continue
      }
    }
    if (!/\s/.test(ch)) sigTail = (sigTail + ch).slice(-24)
    i++
  }
  return regions
}

/**
 * Split on top-level `,` — over the masked view, so a comma inside a literal is data.
 *
 * THE parameter splitter. There were three: `parser-params.ts` `splitParameters`,
 * `js-tests.ts` `splitParams`, and `dts.ts` `splitParams`. The first two were migrated onto
 * `maskLiterals` earlier in the 0.13.0 cycle, and the comment on the second names the first
 * as *the* sibling — so the third was never counted, and stayed literal-blind.
 *
 * What that cost is worse than the usual garbled output, because it reaches consumers as
 * BROKEN SYNTAX. `constructor(sep: ',', pad: 0)` emitted
 *
 *     constructor(sep: string, ': any, pad: number);
 *
 * — an unterminated string literal in the `.d.ts`. `tsc --noEmit` on it gives TS1002 twice
 * plus TS1003/TS1005/TS1138: a hard failure for every TypeScript consumer of the package,
 * from a single comma in an example value. Methods were corrupted the same way, not only
 * constructors.
 *
 * Returns raw slices, UNTRIMMED — callers that want trimmed elements say so, which is what
 * the three copies already disagreed about. A whitespace-only tail (from a trailing comma)
 * is dropped, since that is not a parameter.
 */
export function splitTopLevel(source: string, sep = ','): string[] {
  const masked = maskLiterals(source)
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === sep && depth === 0) {
      out.push(source.slice(start, i))
      start = i + 1
    }
  }
  const tail = source.slice(start)
  if (tail.trim()) out.push(tail)
  return out
}

/**
 * Index of the `}` matching the `{` at `open`, or -1.
 *
 * THE balanced-brace matcher. There were three, in `tests.ts`, `docs.ts` and
 * `parser-transforms.ts`, and they had already drifted in the two ways copies always do:
 *
 *   - **Return convention.** Two returned the index OF the closing brace; the third
 *     returned the index PAST it. Reading one and calling the other is an off-by-one that
 *     lands in the middle of the next construct.
 *   - **Who masks.** Two took a hoisted masked view as an argument, with docstrings citing
 *     the measurements that forced it (31% of transpile time for a 13KB file with 35
 *     tests; `generateDocs` on a 133KB file going 37.6ms → 538ms at 4× input, scaling as
 *     the square). The third re-masked internally at all six of its call sites, two of
 *     them inside loops — the exact quadratic the other two had already been fixed for.
 *
 * The masked view is a REQUIRED argument here, deliberately. Making it optional is what
 * let the third copy keep re-masking while looking like it had been migrated: a default
 * that silently does the expensive thing reads as convenience and behaves as a trap.
 * Masking preserves offsets, so the caller slices the ORIGINAL source with what this
 * returns.
 */
export function matchingBrace(masked: string, open: number): number {
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    const c = masked[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * The [start, end) ranges of every comment, string/regex-aware.
 *
 * `tests.ts` used to answer this by counting `/*` and `*\/` from the top of the file with
 * no notion of string literals, so a single `const OPEN = '/*'` convinced it that the rest
 * of the file was one enormous comment — and every `test { }` block after it vanished
 * silently. For a language whose thesis is that tests live in the source, reporting zero
 * tests instead of failing is the worst mode available.
 */
export function commentRanges(source: string): Array<[number, number]> {
  return scanLiterals(source)
    .filter((r) => r.kind === 'line-comment' || r.kind === 'block-comment')
    .map((r) => [r.start, r.end] as [number, number])
}

/**
 * Bounded memo per mask FLAVOUR, keyed by the source string.
 *
 * The scanner memo (`scanCache`) removed the re-SCANNING, but every caller still paid the
 * split -> blank -> join, which is the larger half for a big file: 200 masks of the same
 * 13KB source cost 21ms with the scan already cached. Transforms legitimately ask
 * repeatedly — each one masks the source it was handed — so the coordination problem is
 * the same one `scanLiterals` was memoized to remove, one layer up.
 *
 * Strings are immutable, so unlike the region arrays there is nothing a caller can corrupt
 * and no need to freeze. Pure function of the input; the only cost is memory, hence the
 * bound.
 */
const MASK_CACHE_MAX = 16
const maskCaches = new Map<string, Map<string, string>>()

function memoizedMask(flavour: string, source: string, compute: () => string) {
  let cache = maskCaches.get(flavour)
  if (!cache) {
    cache = new Map()
    maskCaches.set(flavour, cache)
  }
  const hit = cache.get(source)
  if (hit !== undefined) {
    cache.delete(source)
    cache.set(source, hit)
    return hit
  }
  const computed = compute()
  if (cache.size >= MASK_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(source, computed)
  return computed
}

/** Drop every mask memo. Exposed alongside `clearLiteralCache` for benchmarks/hosts. */
export function clearMaskCache(): void {
  maskCaches.clear()
}

function blankRegions(
  source: string,
  pick: (r: LiteralRegion) => [number, number] | null
): string {
  const out = source.split('')
  for (const r of scanLiterals(source)) {
    const range = pick(r)
    if (!range) continue
    for (let k = range[0]; k < range[1] && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  return out.join('')
}

/**
 * Remove COMMENTS, keeping literal contents exactly as written.
 *
 * The third view, and the one that was missing. `maskLiterals` blanks literals AND
 * comments; `maskLiteralsKeepComments` blanks literals and keeps comments. Neither serves
 * a caller that wants comments GONE and literals INTACT — and one exists: the inline-test
 * harness matches `expect(...)` patterns outside comments, where the strings are the test
 * DESCRIPTIONS and blanking them erases the thing being extracted.
 *
 * Lacking the primitive, that caller hand-rolled it with two raw regexes, and carried a
 * comment saying so. Hand-rolled comment scanning is what cost 90 seconds of a 116-second
 * transpile — the module-directive detectors matched a leading comment run with an
 * alternation whose block-comment arm used a LAZY `[\s\S]*?`, which could stretch a
 * "comment" to any later close-marker in the file.
 *
 * (This doc comment originally quoted that pattern verbatim and terminated itself early,
 * which is the joke writing itself: a comment about comment-parsing, broken by
 * comment-parsing.)
 * A regex cannot decide whether `//` opens a comment — that depends on not being inside a
 * string, template or regex, which is exactly the state `scanLiterals` already tracks.
 *
 * Block comments become the same number of NEWLINES so line numbers survive; line comments
 * become nothing (their newline is not part of the region). Offsets therefore shift, unlike
 * the masking views — this returns a shorter string on purpose, for callers that only need
 * to pattern-match, not to index back.
 */
export function stripComments(source: string): string {
  const regions = scanLiterals(source).filter(
    (r) => r.kind === 'line-comment' || r.kind === 'block-comment'
  )
  if (regions.length === 0) return source
  let out = ''
  let at = 0
  for (const r of regions) {
    out += source.slice(at, r.start)
    if (r.kind === 'block-comment') {
      const text = source.slice(r.start, r.end)
      out += '\n'.repeat(text.split('\n').length - 1)
    }
    at = r.end
  }
  return out + source.slice(at)
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
  return memoizedMask('literals', source, () =>
    blankRegions(source, (r) =>
      r.kind === 'line-comment' || r.kind === 'block-comment'
        ? [r.start, r.end] // comments vanish entirely, delimiters included
        : [r.innerStart, r.innerEnd]
    )
  )
}

/**
 * Blank string, template and regex contents but LEAVE COMMENTS INTACT.
 *
 * The view for anything that extracts FROM comments — embedded `/*test … *\/` blocks, doc
 * comments, `@tjs` annotations. Those passes cannot use `maskLiterals` (it erases the very
 * thing they are reading) and so each hand-rolled its own partial scanner and got regex
 * literals wrong: `const q = /['"]/` above a test comment dropped the test, and `const q =
 * /'/` above a JSDoc promoted a documentation example into a real emitted test — a false
 * negative and a false positive from the same blind spot.
 */
export function maskLiteralsKeepComments(source: string): string {
  return memoizedMask('keep-comments', source, () =>
    blankRegions(source, (r) =>
      r.kind === 'line-comment' || r.kind === 'block-comment'
        ? null
        : [r.innerStart, r.innerEnd]
    )
  )
}

/**
 * Find `unsafe <expression>` spans.
 *
 * `unsafe` is the language's per-construct escape: it says "this construct, deliberately"
 * at the site where the exception lives, so the rules themselves stay unconditional and the
 * file extension remains the only gate. It replaces per-file mode dialing, which had to
 * disable a rule for a whole file and therefore also silenced the NEXT, accidental use.
 *
 * Recognised only as `unsafe` + whitespace + the start of an identifier, so a variable
 * named `unsafe`, a call `unsafe(x)`, and `unsafe.foo` are all left alone.
 *
 * Returns [start, end) spans covering the keyword AND its expression.
 */
export function findUnsafeSpans(source: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const masked = maskLiterals(source)
  // SAME LINE only — `[ \t]`, not `\s`. `unsafe foo()` on one line is not valid
  // JavaScript (two juxtaposed expressions), so it can only be the marker. Across a
  // newline it IS valid — ASI makes `let r = unsafe` / `foo()` two statements — so a
  // variable named `unsafe` at end of line must not be swallowed. Same ASI hazard every
  // JS developer already knows from `return`.
  //
  // The negative lookahead is the other half of that argument, and it is load-bearing:
  // `unsafe` followed by a WORD-SHAPED INFIX OPERATOR is an ordinary variable being
  // operated on, not a marker. `unsafe instanceof Function` and `unsafe in obj` are both
  // legal JavaScript, and without this they were swallowed as `unsafe <expr>` and the file
  // failed to parse — legal JS made uncompilable, which is a TJS ⊇ JS violation
  // (PRINCIPLES.md), and it fired in `dialect: 'js'` too, where there is no escape hatch.
  const re = /\bunsafe[ \t]+(?!(?:instanceof|in|of)\b)(?=[A-Za-z_$])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    // Member position is never a marker: `obj.unsafe`, `obj?.unsafe`. `isRegexStart` alone
    // does NOT cover this — after a `.` it falls through to its permissive default and
    // returns true, so `o.unsafe instanceof Function` was read as a marker.
    if (lastSignificantChar(masked, m.index) === '.') continue
    // Expression-prefix position only. Reserving the word outright would be simpler but
    // would make legal JavaScript illegal, breaking TJS ⊇ JS (PRINCIPLES.md).
    if (!isRegexStart(masked.slice(0, m.index))) continue
    const exprStart = m.index + m[0].length
    spans.push([m.index, unsafeExpressionEnd(masked, exprStart)])
  }
  return spans
}

/**
 * The last non-whitespace character before `index`, or `''` at the start of input.
 *
 * Safe to run on a literal-masked source only: `maskLiterals` blanks comments entirely
 * (delimiters included), so skipping whitespace also skips comments.
 */
function lastSignificantChar(masked: string, index: number): string {
  let j = index - 1
  while (j >= 0 && /\s/.test(masked[j]!)) j--
  return j >= 0 ? masked[j]! : ''
}

/**
 * End of the expression guarded by `unsafe`, starting at `at`.
 *
 * Consumes a normal expression — identifiers, member access, calls, `new` — tracking
 * bracket depth, and stops at the first top-level `,` `;` or closing bracket, or at a
 * newline that is not inside brackets. That covers both `const d = unsafe new Date(ts)` and
 * `f(unsafe Date.now(), x)`.
 */
function unsafeExpressionEnd(masked: string, at: number): number {
  let i = at
  let depth = 0
  while (i < masked.length) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break
      depth--
    } else if (depth === 0 && (c === ',' || c === ';')) break
    else if (depth === 0 && c === '\n') break
    i++
  }
  return i
}

/**
 * Blank `unsafe <expression>` spans, preserving offsets — the view the rule checks see.
 * A construct the author has explicitly taken responsibility for is not a violation.
 *
 * **The mask stops at a nested function body.** `unsafe` exempts ONE CONSTRUCT, not a
 * region — that is the whole reason it replaced per-file mode dialing, which silenced the
 * next, accidental use as well. But a bracketed expression can contain an arbitrary amount
 * of unrelated authored code:
 *
 *     unsafe makeHandler({ onClick: () => { eval(src); var leaked = 1; new Date() } })
 *
 * Masking that whole span exempts three violations the author never took responsibility
 * for, and the marker on the OUTER call is not a statement about the inside of a callback.
 * So the mask covers the construct up to the point where a new function body begins, and
 * everything inside that body is checked normally. Code that genuinely needs an exemption
 * in there can carry its own `unsafe`, which is exactly the intended ergonomics.
 */
export function maskUnsafe(source: string): string {
  const out = source.split('')
  for (const [a, b] of unsafeRuleSpans(source)) {
    for (let k = a; k < b && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' '
    }
  }
  return out.join('')
}

/**
 * The [start, end) ranges a rule check should treat as exempt — `findUnsafeSpans` narrowed
 * to stop at any nested function body.
 *
 * Exported because the LINTER needs the same answer as the compiler and previously did not
 * have it: `lint('const d = unsafe new Date(0)')` reported `no-explicit-new` on source that
 * `tjs()` compiled without complaint. The linter drives playground and editor diagnostics,
 * so that disagreement is what a user sees FIRST — the compiler's own documented remedy,
 * underlined as a mistake. One function, two consumers, no chance to drift.
 */
export function unsafeRuleSpans(source: string): Array<[number, number]> {
  const masked = maskLiterals(source)
  return findUnsafeSpans(source).map(([a, b]) => [
    a,
    Math.min(b, nestedFunctionBodyStart(masked, a, b)),
  ])
}

/**
 * Offset of the `{` opening the first nested function body within [a, b), else `b`.
 *
 * Recognises the two ways a body can open: after `=>`, and after the parameter list of a
 * `function` expression. Anything else (an object literal, a block) is part of the guarded
 * construct itself and stays masked.
 */
function nestedFunctionBodyStart(masked: string, a: number, b: number): number {
  for (let i = a; i < b; i++) {
    if (masked[i] !== '{') continue
    const before = masked.slice(a, i)
    // Arrow body: `… => {`
    if (/=>\s*$/.test(before)) return i
    // Function expression body: `function [name] (params) {`, allowing for the params
    // spanning lines. The `[\s\S]` is deliberate — a formatted parameter list wraps.
    if (/\bfunction\b[\s\S]*\)\s*$/.test(before)) return i
  }
  return b
}

/**
 * Remove the `unsafe` keyword, leaving the expression. Zero runtime cost: the marker is
 * a compile-time assertion of intent, not a wrapper.
 */
export function stripUnsafeMarkers(source: string): string {
  const spans = findUnsafeSpans(source)
  if (!spans.length) return source
  const out = source.split('')
  for (const [a] of spans) {
    // Blank just the keyword and its trailing whitespace; offsets are preserved so every
    // position reported by later stages still lines up with the author's source.
    const kw = /^unsafe\s+/.exec(source.slice(a))
    if (kw) for (let k = a; k < a + kw[0].length; k++) out[k] = ' '
  }
  return out.join('')
}
