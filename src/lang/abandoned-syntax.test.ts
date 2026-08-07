/**
 * Abandoned syntax stays abandoned — and says so.
 *
 * Two hazards, and they are not the same size.
 *
 * **1. Silent acceptance can force us to UN-ABANDON something — permanently.** If a
 * removed form still parses, even into a no-op, someone writes it, ships it, and their
 * codebase now depends on it. At that point removing it is a breaking change, so the
 * cheapest path becomes keeping it: we end up maintaining a feature we had decided
 * against, that was never documented, that constrains every future change to the parser,
 * forever.
 *
 * That is a **one-way ratchet in the wrong direction**. Everything else on this project
 * that ratchets — the self-hosting gap, the audit exemptions — ratchets toward a target
 * and can be lowered as it improves. This one only tightens, and there is no equivalent
 * of "lower the baseline". An abandonment is only free if it is enforced immediately;
 * every release it goes unenforced, the chance of it becoming permanent goes up and never
 * comes back down.
 *
 * **And the transmission vector is the docs.** A form that still parses does not merely
 * get used — it gets TAUGHT. It lands in an example, the example ships in the playground
 * and the npm package, and a *documented* feature is far harder to un-abandon than a
 * merely-used one. This is observed, not theoretical: the CodeMirror completion actively
 * SUGGESTED `unsafe { … }` until 2026-08-06, and `PLAN.md` taught `TjsStandard` in the
 * live playground after it had become an error.
 *
 * Which is what makes enforcing rejection self-maintaining. `docs-tombstones.test.ts`
 * stops the docs from naming an abandoned form; this file stops the compiler from
 * accepting one — and because `demo/src/examples.test.ts` transpiles every shipped
 * example, a rejected form means any example using it fails automatically. Enforce the
 * rejection and the docs guard stops needing to be remembered.
 *
 * **2. A rejection test is also a dead-code detector.** If a form must be rejected and
 * the codebase still contains machinery for it, that machinery is unreachable. Real but
 * strictly smaller: this one finds code we get to DELETE, where the first prevents code
 * we could never delete. `parser-types.ts` described an arrow return syntax (`) -> type`)
 * in detail for months, implemented nowhere — cheap to clean up once found, and it cost
 * real time deciding which of two syntaxes to teach when only one existed.
 *
 * So each case asserts TWO things: the form is rejected, and the message NAMES THE
 * REPLACEMENT. A bare "Unexpected token" closes the door without putting up a sign, and
 * this project has measured what that costs — a diagnostic with no remedy repairs 0% of
 * the time, identical to saying nothing (ASSUMPTIONS.md A1).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Transpile and return the error message, or `null` if it was accepted. */
function reject(src: string): string | null {
  try {
    tjs(src, { runTests: false })
    return null
  } catch (e: any) {
    return String(e.message)
  }
}

const TAIL = '\nfunction f(x: 0) { return x }'

describe('the nine abolished mode directives are rejected, with a remedy', () => {
  // Each maps to what replaced it. The message must mention the replacement, because a
  // reader hitting this is mid-migration and the whole point of the tombstone is to end
  // the migration rather than merely block it.
  const ABOLISHED: Array<[directive: string, mustMention: RegExp]> = [
    ['TjsEquals', /always|unconditional|\.tjs/i],
    ['TjsClass', /always|unconditional|unsafe|\.tjs/i],
    ['TjsDate', /always|unconditional|unsafe|\.tjs/i],
    ['TjsNoeval', /always|unconditional|unsafe|\.tjs/i],
    ['TjsNoVar', /always|unconditional|unsafe|\.tjs/i],
    ['TjsStandard', /always|terminat|newline|\.tjs/i],
    ['TjsDictDefaults', /always|object-lit|dictionary|\.tjs/i],
    // Not "always on" like its siblings — the replacement is that the import is
    // injected only when the code actually calls it, so there is nothing to opt into.
    ['TjsSafeEval', /automatic|imported|nothing to opt/i],
    ['TjsSafeAssign', /always|bare assignment|const|\.tjs/i],
  ]

  for (const [directive, mustMention] of ABOLISHED) {
    it(`${directive} is rejected`, () => {
      expect(reject(directive + TAIL)).not.toBeNull()
    })

    it(`${directive}'s message names what replaced it`, () => {
      const msg = reject(directive + TAIL) ?? ''
      expect(msg).toContain(directive)
      expect(msg).toMatch(mustMention)
    })
  }
})

describe('forms that never existed, or stopped existing', () => {
  it('`unsafe { … }` as a block does not exempt anything', () => {
    // The block form was replaced by the per-construct `unsafe <expression>`. It is
    // rejected today only INCIDENTALLY: the block is ignored, and the construct inside
    // then trips its own rule. So the door is shut and the sign is wrong — a reader is
    // told about `var` when the real problem is that their `unsafe { }` did nothing.
    //
    // The CodeMirror completion shipped this exact form as a suggestion until 2026-08-06,
    // so it is not a hypothetical thing for someone to have written.
    const msg = reject('unsafe { var x = 1 }\nconsole.log(x)')
    expect(msg).not.toBeNull()
    // TODO: should name the block form and point at `unsafe <expr>`. Pinned as
    // rejected-but-unsigned so the behaviour cannot regress to silent acceptance while
    // the message is improved.
  })

  it('the `->` / `-!` / `-?` return syntax is not accepted', () => {
    // Described in detail by parser-types.ts comments for months and implemented nowhere
    // — on declarations, arrow functions or methods. TJS uses TypeScript's `:` spelling
    // and has no second syntax for return types. If this ever starts parsing, either
    // someone implemented a parallel syntax or a scanner drifted.
    expect(reject('function f(a: 2) -> 5 { return a }')).not.toBeNull()
    expect(reject('function f(a: 2) -! 5 { return a }')).not.toBeNull()
    expect(reject('function f(a: 2) -? 5 { return a }')).not.toBeNull()
    expect(reject('const f = (a: 2) -> 5 => a')).not.toBeNull()
  })

  it('the colon return forms that DO exist still work', () => {
    // The control. Without it the assertions above pass just as well against a compiler
    // that rejects everything, which is the failure mode a rejection suite has.
    expect(reject('function f(a: 2, b: 3): 5 { return a + b }')).toBeNull()
    expect(reject('function f(a: 2, b: 3):! 0 { return a + b }')).toBeNull()
    expect(reject('function f(a: 2, b: 3):? 5 { return a + b }')).toBeNull()
  })
})

/**
 * Decided-but-unbuilt syntax must fail LOUDLY, not silently accept everything.
 *
 * The same hazard as the abandoned forms above, pointed forwards instead of backwards —
 * and with a shorter fuse, because the person writing it has been told it is the
 * recommended spelling.
 *
 * `predicate => expr` and `predicate { return expr }` were decided as the terse forms
 * (mirroring arrow-function bodies: `=>` implies the return, `{ }` requires it). Neither
 * is implemented. Both parsed cleanly and fell through to a Type with NO predicate —
 * measured: `predicate => Even % 2 === 0` returned `true` for 3, so the type accepted
 * every value while looking like it checked one.
 *
 * Left alone, that form works "fine", lands in an example, ships in the playground, and
 * becomes something we must either implement or break.
 */
describe('unbuilt predicate forms are rejected, not ignored', () => {
  const EXAMPLE = 'Type Even {\n  example: 2\n'

  it('rejects `predicate => …`', () => {
    const msg = reject(`${EXAMPLE}  predicate => Even % 2 === 0\n}`)
    expect(msg).toContain('predicate(x)')
  })

  it('rejects `predicate { … }`', () => {
    const msg = reject(`${EXAMPLE}  predicate { return Even % 2 === 0 }\n}`)
    expect(msg).toContain('predicate(x)')
  })

  it('rejects an unbuilt form on a parameterized type too', () => {
    expect(reject('Type Box<T> {\n  predicate => T(Box.value)\n}')).toContain(
      'predicate(x)'
    )
  })

  it('the implemented form still works, and still CHECKS', () => {
    // The control. A guard that rejected every predicate would satisfy the three
    // assertions above just as well.
    const src = `${EXAMPLE}  predicate(x) { return x % 2 === 0 }\n}`
    expect(reject(src)).toBeNull()
    const code = tjs(src, { runTests: false }).code
    const [ok, bad] = new Function(
      `${code}\nreturn [Even.check(4), Even.check(3)]`
    )() as boolean[]
    expect([ok, bad]).toEqual([true, false])
  })

  it('a Type with no predicate at all is still fine', () => {
    // Not every type needs one — the example alone is a real check.
    expect(reject('Type Even {\n  example: 2\n}')).toBeNull()
  })

  it('does not fire on the word "predicate" inside a string', () => {
    // Scanned through maskLiterals; this file has produced enough literal-blindness
    // bugs to warrant the control.
    expect(
      reject(`Type Even {\n  description: 'has a predicate'\n  example: 2\n}`)
    ).toBeNull()
  })
})
