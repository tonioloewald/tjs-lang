/**
 * `given` — the fixed dispatch construct, and the reason `switch` is left alone.
 *
 *     given x {
 *       'a', 'b' { … }      // multiple values, no fallthrough needed
 *       'c' { … }
 *     } else { … }          // the remaining case
 *
 * No `case`. No colons. No implicit blocks. Arms never fall through.
 *
 * ## Why a new construct rather than a fixed `switch`
 *
 * We shipped a fixed `switch` first (#43) and then measured it. Shown the identical program
 * as `.js` a model traced it correctly 5/5; shown it as `.tjs` — where `break` was now
 * implicit — it applied C fallthrough **5 times out of 5, confidently**. Not uncertainty:
 * both controls were 100%. The file extension carries nothing, so the only signal a reader
 * has is the shape, and the shape was still C's.
 *
 * Changing the shape removed every confident wrong answer. Keeping the NAME while changing
 * the shape was worse than either — the model stalled rather than concluding, unable to
 * reconcile "this is `switch`" with "this does not look like `switch`". So the name and the
 * shape have to move together, which is what this is. See `docs/case-study-switch.md`.
 *
 * `switch` therefore keeps C semantics exactly, and gets a warning pointing here.
 *
 * ## Lowering
 *
 * To a C `switch` with EXPLICIT breaks — so it needs nothing from the switch machinery and
 * survives `switch` being left alone:
 *
 *     switch (__tjs.swKey(x)) { case 'a': case 'b': { … break } default: { … } }
 *
 * `swKey` is what makes arms compare the way `==` does rather than `===`; it is the half of
 * the fix that is invisible and therefore the half most likely to be dropped.
 *
 * ## Detection
 *
 * `given` is NOT a reserved word, so every other use must be excluded: `obj.given`,
 * `given(x)`, `const given = 1`. Taking NO parentheses is what makes this tractable —
 * `given (x) { }` would already be valid JavaScript (a call followed by a block), whereas
 * `given x {` cannot be anything else. A first prototype still mangled
 * `const match = 1; if (y) { … }` into `switch (= 1; if (y))`, which is why the discriminant
 * must look like an expression: no `;`, no leading operator.
 *
 * Detection runs over the MASKED view, so a `given` inside a string or comment is invisible
 * to it — the repo's dominant defect class, headed off rather than discovered later.
 */
import { maskLiterals, matchingBrace } from '../strip-comments'

export interface GivenWarning {
  message: string
}

export interface GivenResult {
  source: string
  warnings: GivenWarning[]
}

/** Preceded by a declarator or a dot — not a `given` statement. */
const NOT_A_STATEMENT =
  /(?:^|[\s;{}()])(?:const|let|var|function|class|new|return)\s*$/

/** A discriminant is one expression; anything else means we scanned past a statement end. */
function plausibleDiscriminant(text: string): boolean {
  const t = text.trim()
  return !!t && !/[;]/.test(t) && !/^[=<>!+\-*/%&|^?:,]/.test(t)
}

/**
 * Lower every `given` in `source`. Returns the source unchanged when there are none, so the
 * cost on a file that does not use it is one regex scan.
 */
export function transformGiven(source: string): GivenResult {
  const warnings: GivenWarning[] = []
  // To a FIXPOINT, because a `given` nested in another one's arm is copied through as raw
  // text by the pass that lowers its parent — the arm body is sliced, not re-scanned. One
  // pass therefore lowers only the outermost, and the inner one reaches the parser as
  // `given b {`, which is not JavaScript. A pass that produces no change ends the loop, so a
  // `given` correctly rejected as a false positive cannot spin.
  let out = source
  for (let i = 0; i < 16; i++) {
    const pass = lowerOnce(out, warnings)
    if (pass === out) break
    out = pass
  }
  return { source: out, warnings }
}

function lowerOnce(source: string, warnings: GivenWarning[]): string {
  if (!/\bgiven\s/.test(source)) return source

  const masked = maskLiterals(source)
  const RX = /(^|[\s;{}()])given\s+(?!\()/g
  let out = ''
  let cursor = 0
  let m: RegExpExecArray | null

  while ((m = RX.exec(masked))) {
    const kw = m.index + m[1].length
    if (kw < cursor) continue
    if (masked[kw - 1] === '.') continue
    if (NOT_A_STATEMENT.test(masked.slice(Math.max(0, kw - 12), kw))) continue

    // Discriminant runs to the `{` that opens the body, at bracket depth 0.
    let depth = 0
    let j = kw + 'given'.length
    while (j < masked.length) {
      const c = masked[j]
      if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      else if (c === '{' && depth === 0) break
      j++
    }
    if (j >= masked.length) continue

    const disc = source.slice(kw + 'given'.length, j).trim()
    if (!plausibleDiscriminant(disc)) continue

    const bodyEnd = matchingBrace(masked, j)
    if (bodyEnd === -1) continue

    const body = source.slice(j + 1, bodyEnd)
    const bodyMasked = masked.slice(j + 1, bodyEnd)
    const arms: string[] = []
    let k = 0
    let armCount = 0

    while (k < body.length) {
      let d = 0
      let b = k
      while (b < body.length) {
        const c = bodyMasked[b]
        if (c === '(' || c === '[') d++
        else if (c === ')' || c === ']') d--
        else if (c === '{' && d === 0) break
        b++
      }
      if (b >= body.length) break
      const values = body.slice(k, b).trim()
      const armEnd = matchingBrace(bodyMasked, b)
      if (armEnd === -1) break
      const armBody = body.slice(b + 1, armEnd)
      if (values) {
        // Each value becomes a stacked `case`; the arm's own `break` is what makes
        // fallthrough impossible without relying on any switch-level rewrite.
        // A value that is already its own comparison key stays literal, so the engine can
        // still build a jump table. `undefined` and `NaN` are not: `Eq` treats `undefined`
        // as `null` and `NaN` as equal to itself, and the `===` a `switch` uses underneath
        // agrees with neither — so those go through `swKey`, exactly as the discriminant does.
        const cases = splitTopLevelCommas(values, maskLiterals(values))
          .map((v) => {
            const t = v.trim()
            return selfKeying(t) ? `case ${t}:` : `case __tjs.swKey(${t}):`
          })
          .join(' ')
        arms.push(`${cases} { ${armBody}\nbreak }`)
        armCount++
      }
      k = armEnd + 1
    }

    if (armCount === 0) {
      warnings.push({
        message:
          `\`given ${disc}\` has no arms, so it can never do anything. An arm is ` +
          `\`value { … }\` — or \`value, other { … }\` for several values.`,
      })
    }

    // `else { … }` immediately after the body is the remaining case.
    let end = bodyEnd + 1
    let dflt = ''
    const after = masked.slice(end)
    const om = /^\s*else\s*\{/.exec(after)
    if (om) {
      const ob = end + om[0].length - 1
      const oe = matchingBrace(masked, ob)
      if (oe !== -1) {
        dflt = `default: { ${source.slice(ob + 1, oe)} }`
        end = oe + 1
      }
    }

    out +=
      source.slice(cursor, kw) +
      `switch (__tjs.swKey(${disc})) {\n${arms.join('\n')}${
        dflt ? '\n' + dflt : ''
      }\n}`
    cursor = end
  }

  out += source.slice(cursor)
  return out
}

/**
 * A literal that is already its own comparison key.
 *
 * Deliberately excludes `undefined` and `NaN` even though they look literal — see the call
 * site. Anything non-literal (an identifier, a call) is keyed too, since it may evaluate to
 * a value-like object that must compare the way `==` does.
 */
function selfKeying(text: string): boolean {
  if (/^-?\d+(\.\d+)?$/.test(text)) return true
  if (/^(['"`]).*\1$/.test(text)) return true
  if (text === 'true' || text === 'false' || text === 'null') return true
  return false
}

/** Split `a, b, c` at top level — a value may itself contain commas inside brackets. */
function splitTopLevelCommas(text: string, masked: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.filter((p) => p.trim())
}
