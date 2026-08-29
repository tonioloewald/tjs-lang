/**
 * Rewrite a C `switch` to `given` — but only where it provably means the same thing.
 *
 * Adding a better construct is not fixing the language: code that already exists keeps the
 * defect. So conversion upgrades what it safely can, and says why where it cannot.
 *
 * ## When it is safe
 *
 * When every non-empty arm LEAVES — `return`, `throw`, `break`, `continue`. Then no arm can
 * reach the next one, so implicit-versus-explicit break is unobservable and the two forms are
 * indistinguishable at runtime. That is the overwhelming majority of real switches, because
 * `no-fallthrough` has been in `eslint:recommended` for a decade.
 *
 * Stacked EMPTY arms are not fallthrough — they are how C spells "several values share this
 * block", and they become `'a', 'b' { … }`, which is what `given` spells directly.
 *
 * ## When it is not
 *
 * When an arm runs into the next with statements in it. That is a real cascade, `given` has
 * no way to express one, and rewriting it silently would change behaviour. Those are left
 * alone with a note at the site. **A converter that is occasionally wrong is worse than one
 * that is honest** — the whole value of an automated upgrade is that you do not have to
 * check it.
 *
 * ## Why a comment is emitted
 *
 * Measured: a model shown a `.tjs` file has no prior for the extension and reads whatever
 * shape it finds. A one-line note at the site is what moved comprehension from 0/5 to 5/5,
 * and it is the only thing that travels with a diff hunk or a snippet in chat. Prose ABOUT a
 * remedy repaired 50% where the remedy shown AS CODE repaired 80% (ASSUMPTIONS A1), so the
 * note is short and the code speaks.
 */
import * as acorn from 'acorn'
import { parse as looseParse } from 'acorn-loose'
import { commentRanges } from '../strip-comments'

export interface SwitchToGivenResult {
  code: string
  /** One per `switch` left alone, saying why. Empty when everything converted. */
  notes: string[]
  /** How many were rewritten — for a caller that wants to report progress. */
  rewritten: number
}

/**
 * Can control reach the arm AFTER this statement?
 *
 * Arm-level, and deliberately so: a `break` inside a loop inside an arm means "exit the
 * loop" and does NOT stop the arm running on — which is why loops are not recursed into at
 * all. Blocks and if/else are, because `if (a) return x; else return y` genuinely leaves.
 *
 * `breakLeaves` is what makes that distinction expressible: an unlabelled `break` exits the
 * NEAREST switch, so it terminates the arm we are analysing but not an arm containing it.
 */
function terminates(stmt: any, breakLeaves: boolean): boolean {
  if (!stmt || typeof stmt !== 'object') return false
  // `continue` is in here because it leaves for the enclosing loop, so the arm is done
  // either way. (A comment BETWEEN stacked labels reads as fallthrough to `no-fallthrough` —
  // which is a small live demonstration of why this file exists.)
  switch (stmt.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'ContinueStatement':
      return true
    // A LABELLED break exits something further out than this switch, so it leaves regardless.
    case 'BreakStatement':
      return stmt.label ? true : breakLeaves
    case 'BlockStatement':
      return terminates(stmt.body[stmt.body.length - 1], breakLeaves)
    case 'IfStatement':
      return (
        !!stmt.alternate &&
        terminates(stmt.consequent, breakLeaves) &&
        terminates(stmt.alternate, breakLeaves)
      )
    // A nested switch every path of which leaves — needed for nesting to compose, since
    // otherwise an outer arm holding one reads as a cascade. `breakLeaves` goes FALSE:
    // a `break` in here exits this switch and lands back in the outer arm.
    case 'SwitchStatement': {
      const cases: any[] = stmt.cases
      if (!cases.some((c) => c.test === null)) return false
      if (cases[cases.length - 1].consequent.length === 0) return false
      return cases.every(
        (c) =>
          c.consequent.length === 0 ||
          terminates(c.consequent[c.consequent.length - 1], false)
      )
    }
    default:
      return false
  }
}

/**
 * Shift every line but the first from one column to another, preserving relative structure.
 * Re-flattening to a single indent would mangle any nested block in the arm.
 */
function reindent(text: string, fromCol: number, toCol: number): string {
  const delta = toCol - fromCol
  if (delta === 0) return text
  return text
    .split('\n')
    .map((line, i) => {
      if (i === 0 || line.trim() === '') return line
      if (delta > 0) return ' '.repeat(delta) + line
      const ws = /^[ \t]*/.exec(line)![0]
      return line.slice(Math.min(ws.length, -delta))
    })
    .join('\n')
}

const NOTE =
  '// upgraded from `switch`: arms no longer fall through, so the `break`s are gone'

export function switchToGiven(source: string): SwitchToGivenResult {
  const notes: string[] = []
  // TOLERANT parse, because the input is TJS and TJS is not JavaScript: `f(x: any):! 0.0`
  // stops strict acorn at the first annotation, and the whole file would silently no-op —
  // which reads exactly like "there was nothing to convert". `acorn-loose` finds the switch
  // structure regardless, and every slice below comes from the real source, so an annotation
  // it misparses cannot corrupt what we emit.
  let ast: acorn.Program
  try {
    ast = looseParse(source, {
      ecmaVersion: 'latest',
      locations: true,
    }) as acorn.Program
  } catch {
    return { code: source, notes, rewritten: 0 }
  }

  const edits: Array<{ start: number; end: number; text: string }> = []
  const allComments = commentRanges(source)
  let nested = 0

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object' || !node.type) return
    // A CONVERTED switch is not descended into: its arms were rendered recursively, so
    // descending would emit a second edit inside a span already being replaced — which is
    // exactly how an earlier version corrupted every nested switch it touched.
    if (node.type === 'SwitchStatement' && consider(node)) return
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') {
        continue
      }
      const child = node[key]
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object' && child.type) visit(child)
    }
  }

  function consider(sw: any): boolean {
    const cases: any[] = sw.cases
    if (cases.length === 0) return false

    // Group stacked EMPTY arms with the arm that follows — that is multi-value, not cascade.
    const groups: Array<{
      tests: any[]
      body: any[]
      isDefault: boolean
      /** Where this group's text ends — the gap to the next one holds comments. */
      to: number
    }> = []
    let pending: any[] = []
    for (const c of cases) {
      if (c.consequent.length === 0) {
        pending.push(c.test)
        continue
      }
      const tests = [...pending, c.test]
      groups.push({
        tests: tests.filter(Boolean),
        body: c.consequent,
        isDefault: tests.every((t) => t === null),
        to: c.end,
      })
      pending = []
    }
    if (pending.length > 0) {
      // A trailing empty arm has no body to attach to; rare, and not worth guessing about.
      notes.push(
        `line ${sw.loc.start.line}: a trailing empty \`case\` has no body — left as \`switch\`.`
      )
      return false
    }

    const line = sw.loc.start.line
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const isLast = i === groups.length - 1
      if (!terminates(g.body[g.body.length - 1], true) && !isLast) {
        notes.push(
          `line ${line}: an arm runs into the next one, which is a real cascade — ` +
            `\`given\` cannot express that, so this is left as \`switch\`. If the ` +
            `fallthrough was unintended, adding \`break\` makes it convertible.`
        )
        return false
      }
    }

    const slice = (a: number, b: number) => source.slice(a, b)

    /**
     * Comments in `[from, to)`, re-indented to `col`.
     *
     * Without this the rewrite DELETED every comment in the switch — arm text is sliced from
     * the first statement to the last, so anything sitting between arms simply vanished. On
     * our own source that silently destroyed a twenty-line rationale block. A converter that
     * drops the comments is worse than one that declines: the comments are usually the part
     * of the file you cannot reconstruct.
     */
    const commentsIn = (from: number, to: number, col: number): string =>
      allComments
        .filter(([a, b]) => a >= from && b <= to)
        .map(([a, b]) => {
          const lineStart = source.lastIndexOf('\n', a) + 1
          return (
            ' '.repeat(col) + reindent(slice(a, b), a - lineStart, col) + '\n'
          )
        })
        .join('')
    const indent = ' '.repeat(sw.loc.start.column)
    // Arms sit one level in, so their bodies sit two. The `else` block sits at the outer
    // level, so its body sits one.
    const colFor = (isDefault: boolean) =>
      sw.loc.start.column + (isDefault ? 2 : 4)

    const rendered = groups.map((g, i) => {
      // Everything between the previous arm and this one is whitespace, `case` labels and
      // comments; only the comments survive the rewrite, so they are carried over here.
      // The gap runs to the arm's first STATEMENT, not to its `case` keyword — a comment
      // written after `default:` and before the body belongs to the arm, and stopping at the
      // keyword dropped exactly those. `case` labels inside the span are harmless: only
      // comment ranges are extracted from it.
      const gapFrom = i === 0 ? sw.discriminant.end : groups[i - 1].to
      const lead = commentsIn(gapFrom, g.body[0].start, sw.loc.start.column + 2)
      let body = g.body
      // A trailing `break` is what `given` makes implicit — keeping it would be dead code.
      const last = body[body.length - 1]
      if (last.type === 'BreakStatement' && !last.label)
        body = body.slice(0, -1)
      const head = g.isDefault
        ? null
        : g.tests.map((t) => slice(t.start, t.end)).join(', ')
      if (body.length === 0) return { head, body: '', lead }

      const fromCol = body[0].loc.start.column
      // Recurse on a LINE-ALIGNED slice — padded out to the statement's real column — so
      // every line inside carries its true source column and one uniform shift re-indents
      // the lot. The padding is whitespace before any token, so no edit can disturb it.
      const raw = slice(body[0].start, body[body.length - 1].end)
      const sub = switchToGiven(' '.repeat(fromCol) + raw)
      // The recursion keeps its own tally and its own notes; dropping them would report a
      // nested conversion as if it never happened, and silently swallow a nested refusal.
      nested += sub.rewritten
      notes.push(...sub.notes)
      const col = colFor(g.isDefault)
      // Comments trailing the LAST arm sit between its body and the switch's `}`, so they
      // belong to no gap and would otherwise be the one group the mining above misses.
      const tail =
        i === groups.length - 1
          ? commentsIn(body[body.length - 1].end, sw.end, col)
          : ''
      const text = reindent(sub.code.slice(fromCol), fromCol, col)
      return {
        head,
        body: tail ? `${text}\n${tail.replace(/\n$/, '')}` : text,
        lead,
      }
    })

    const arms = rendered.filter((r) => r.head !== null)
    const fallback = rendered.find((r) => r.head === null)

    let out = `${NOTE}\n${indent}given ${slice(
      sw.discriminant.start,
      sw.discriminant.end
    )} {\n`
    for (const a of arms) {
      out += `${a.lead}${indent}  ${a.head} {\n${indent}    ${a.body}\n${indent}  }\n`
    }
    out += fallback
      ? `${indent}} else {\n${fallback.lead}${indent}  ${fallback.body}\n${indent}}`
      : `${indent}}`

    edits.push({ start: sw.start, end: sw.end, text: out })
    return true
  }

  visit(ast)

  // Apply outermost-last so a nested rewrite is not clobbered by its parent's span.
  edits.sort((a, b) => b.start - a.start)
  let code = source
  for (const e of edits) {
    code = code.slice(0, e.start) + e.text + code.slice(e.end)
  }
  return { code, notes, rewritten: edits.length + nested }
}
