/**
 * EVERY boundary where an AST enters the system applies the version gate.
 *
 * ## The general defect, not the two instances
 *
 * The 0.14.0 pre-release review found the gate consulted only in `AgentVM.run()`, while two
 * other paths accepted an AST from outside and never reached it — `agentRun` (via
 * `resolveProcedureToken`) and `storeProcedure`. Both are fixed.
 *
 * Fixing two call sites would leave the actual problem in place: **nothing made the set of
 * boundaries enumerable**, so the next one added would be missed the same way, and the gate
 * would erode one entry point at a time while every existing test stayed green. That is the
 * shape of defect this repo keeps writing postmortems about — a control applied where someone
 * remembered rather than where it is needed.
 *
 * So this file does two things a per-site test cannot:
 *
 *   1. **Behavioural** — drives a future-version AST through each boundary and asserts a
 *      refusal. This is what a consumer experiences.
 *   2. **Structural** — locates each boundary function by signature, BRACE-MATCHES its body,
 *      and asserts the gate appears inside it. Not an acorn parse: `acorn-loose` mangles a
 *      TypeScript class method badly enough that the walk could not find `run`, and a
 *      structural test that silently fails to find its subject is worse than a textual one
 *      that does. Each lookup therefore carries an apparatus check — a signature that no
 *      longer matches fails loudly rather than passing vacuously.
 *
 * Adding a new boundary therefore fails HERE, by name, rather than silently widening the hole.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgentVM } from './index'
import {
  procedureStore,
  resolveProcedureToken,
  PROCEDURE_TOKEN_PREFIX,
} from './runtime'
import { AST_VERSION, AST_VERSION_KEY } from './ast-version'

const VM_DIR = import.meta.dir
const FUTURE = { [AST_VERSION_KEY]: AST_VERSION + 1, op: 'seq', steps: [] }

describe('behaviour: every boundary refuses a format it cannot read', () => {
  it('AgentVM.run() refuses', async () => {
    let message = ''
    try {
      await new AgentVM().run(FUTURE as any, {})
    } catch (e: any) {
      message = String(e?.message ?? e)
    }
    expect(message).toContain(`version ${AST_VERSION + 1}`)
  })

  it('resolveProcedureToken() refuses — this is how `agentRun` receives an AST', () => {
    // Planted directly in the store, which is what a stale or hostile token looks like:
    // `agentRun` resolves a token and hands the result to `seq`, never touching
    // `AgentVM.run()`, so a gate only there is a gate this path walks around.
    const token = `${PROCEDURE_TOKEN_PREFIX}boundary-test-resolve`
    procedureStore.set(token, {
      ast: FUTURE,
      expiresAt: Date.now() + 60_000,
    } as any)
    try {
      expect(() => resolveProcedureToken(token)).toThrow(
        /version 2|format version/
      )
    } finally {
      procedureStore.delete(token)
    }
  })

  it('storeProcedure refuses at STORAGE, not at some later execution', async () => {
    // The worse of the two, and the reason to gate on the way in: storing an AST this build
    // cannot run defers the failure to whoever resolves the token later — a different person,
    // a different stack, no context for the error.
    const vm = new AgentVM()
    const result = await vm.run(
      {
        op: 'seq',
        steps: [{ op: 'storeProcedure', ast: FUTURE, as: 'tok' }],
      } as any,
      {}
    )
    const reported = JSON.stringify(result.error ?? result.result ?? '')
    expect(reported).toMatch(/format version|version 2/)
  })

  // The 0.14.0 RE-review's M-1. The first fix gated the token route into `agentRun` and
  // missed the INLINE route — the original review's own repro — because the structural sweep
  // below enumerated `procedureStore` readers, which is the wrong set. The door is any place
  // an AST that arrived from outside is EXECUTED, whatever route it took. Hence these, and the
  // widened sweep further down.
  for (const [label, version] of [
    ['a future version', AST_VERSION + 98],
    ['a codec-stringified version', '2'],
  ] as const) {
    it(`agentRun refuses an INLINE AST with ${label}`, async () => {
      const inline = {
        [AST_VERSION_KEY]: version,
        op: 'seq',
        steps: [{ op: 'return', value: { ran: 'yes' } }],
      }
      const result = await new AgentVM().run(
        {
          op: 'seq',
          steps: [
            { op: 'agentRun', agentId: inline, input: {}, result: 'sub' },
            { op: 'return', value: { sub: 'sub' } },
          ],
        } as any,
        {}
      )
      // It must not have RUN — the repro returned {ran:'yes'}.
      expect(JSON.stringify(result.result ?? null)).not.toContain('yes')
      expect(JSON.stringify(result.error ?? '')).toMatch(
        /format version|unreadable/
      )
    })
  }

  it('runCode refuses a future-version AST from the host transpiler', async () => {
    // The capability's transpiler may be a DIFFERENT tjs-lang than this VM — a version
    // mismatch between producer and interpreter is exactly the case the field exists for.
    const result = await new AgentVM().run(
      {
        op: 'seq',
        steps: [
          { op: 'runCode', code: 'whatever', result: 'r' },
          { op: 'return', value: { r: 'r' } },
        ],
      } as any,
      {},
      {
        capabilities: {
          code: {
            transpile: () => ({
              [AST_VERSION_KEY]: AST_VERSION + 1,
              op: 'seq',
              steps: [{ op: 'return', value: { ran: 'yes' } }],
            }),
          },
        } as any,
      }
    )
    expect(JSON.stringify(result.result ?? null)).not.toContain('yes')
    expect(JSON.stringify(result.error ?? '')).toMatch(/format version/)
  })

  it('and all three still accept a CURRENT AST — apparatus check', async () => {
    // Every assertion above is satisfied by a VM that refuses everything.
    const ok = await new AgentVM().run(
      { op: 'seq', steps: [{ op: 'return', value: { a: 1 } }] } as any,
      {}
    )
    expect(ok.error).toBeFalsy()
    expect(ok.result).toEqual({ a: 1 })
  })
})

describe('structure: the boundary set is enumerable, so a new one cannot be missed', () => {
  /** Functions that accept an AST from outside. Each MUST call `checkAstVersion`. */
  const BOUNDARIES: Array<{ file: string; signature: string; why: string }> = [
    {
      file: 'vm.ts',
      // Anchored on the BODY opening, not `async run(` — that signature's parameter type is
      // itself an object literal, so brace-matching from it terminates inside the params.
      signature: '): Promise<RunResult> {',
      why: 'the public entry — a caller hands it an AST or a token',
    },
    {
      file: 'runtime.ts',
      signature: 'export function resolveProcedureToken(',
      why: 'a stored AST re-enters here; this is how agentRun receives one',
    },
  ]

  /** The source of a function body, by brace-matching from its signature. */
  function bodyOf(src: string, signature: string): string | null {
    const i = src.indexOf(signature)
    if (i < 0) return null
    const k = src.indexOf('{', i)
    if (k < 0) return null
    let depth = 0
    for (let n = k; n < src.length; n++) {
      if (src[n] === '{') depth++
      else if (src[n] === '}') {
        depth--
        if (depth === 0) return src.slice(i, n + 1)
      }
    }
    return null
  }

  for (const { file, signature, why } of BOUNDARIES) {
    it(`${file} — ${why}`, () => {
      const src = readFileSync(join(VM_DIR, file), 'utf8')
      const body = bodyOf(src, signature)
      // Apparatus check: a signature that no longer exists would make the gate assertion
      // pass vacuously, which is the failure mode a structural test exists to avoid.
      expect({ [`${file} found ${signature}`]: body !== null }).toEqual({
        [`${file} found ${signature}`]: true,
      })
      expect({
        [`${file} ${signature} gated`]: /checkAstVersion\s*\(/.test(body!),
      }).toEqual({ [`${file} ${signature} gated`]: true })
    })
  }

  it('storeProcedure is gated — found by atom name, since it is a defineAtom call', () => {
    // Not a named function declaration, so located by its atom registration instead.
    const src = readFileSync(join(VM_DIR, 'runtime.ts'), 'utf8')
    const i = src.indexOf("defineAtom(\n  'storeProcedure'")
    expect(i).toBeGreaterThan(-1)
    // The atom body runs to the next top-level `export const`.
    const next = src.indexOf('\nexport const ', i + 10)
    const body = src.slice(i, next > 0 ? next : undefined)
    expect(/checkAstVersion\s*\(/.test(body)).toBe(true)
  })

  it('EVERY execution of a non-literal AST is immediately preceded by the gate on it', () => {
    // The generalisation the first M3 fix lacked. It swept `procedureStore` readers — the
    // wrong set — so `agentRun`'s INLINE route and `runCode` executed future-version ASTs while
    // every test here stayed green (0.14.0 re-review, M-1). The door is not "where ASTs are
    // stored", it is "where an AST that arrived from outside is EXECUTED". So: find every
    // `seq.exec(x)` / `seqAtom.exec(x)` whose argument is not an object literal — a literal
    // `{ op: 'seq', steps }` is a nested body of a document already gated at its entry — and
    // require `checkAstVersion(x, …)` on the SAME identifier earlier in the enclosing atom/function.
    // Deliberately textual and local: it cannot see through calls, which is why the token
    // route repeats the gate rather than relying on `resolveProcedureToken`.
    const offenders: string[] = []
    let sites = 0
    for (const file of ['runtime.ts', 'vm.ts']) {
      const lines = readFileSync(join(VM_DIR, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        const m = /\b(?:seq|seqAtom)\.exec\(\s*([A-Za-z_$][\w$]*)/.exec(line)
        if (!m) return
        sites++
        const ident = m[1]
        // Search back to the start of the ENCLOSING atom or function, not a fixed window:
        // `runCode` gates version BEFORE shape (as AgentVM.run does), which puts its gate
        // further up than any small window — a line count is the wrong measure of "before".
        let start = i
        while (
          start > 0 &&
          !/^(?:export const \w+ = defineAtom\(|export (?:async )?function |\s+async run\()/.test(
            lines[start]
          )
        )
          start--
        const before = lines.slice(start, i).join('\n')
        const gate = new RegExp(`checkAstVersion\\(\\s*${ident}\\b`)
        if (!gate.test(before))
          offenders.push(`${file}:${i + 1} exec(${ident})`)
      })
    }
    // Apparatus check: the three known sites must be FOUND, or the sweep proves nothing.
    expect(sites).toBeGreaterThanOrEqual(3)
    expect(offenders).toEqual([])
  })

  it('no OTHER function reads `procedureStore` without gating', () => {
    // The generalisation. Anything that pulls an AST out of the store is a boundary by
    // definition, so this catches a fourth entry point nobody thought to list above.
    const src = readFileSync(join(VM_DIR, 'runtime.ts'), 'utf8')
    const ungated: string[] = []
    const re = /procedureStore\.get\s*\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      // Look at the enclosing ~40 lines for the gate.
      const from = src.lastIndexOf('\n', Math.max(0, m.index - 1200))
      const to = src.indexOf('\n}', m.index)
      const window = src.slice(from, to > 0 ? to : m.index + 1200)
      if (!/checkAstVersion\s*\(/.test(window))
        ungated.push(
          src
            .slice(from, from + 90)
            .trim()
            .split('\n')[0]
        )
    }
    expect(ungated).toEqual([])
  })
})
