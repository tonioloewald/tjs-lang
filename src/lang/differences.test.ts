/**
 * Every documented difference is EXECUTED against the language it describes.
 *
 * `differences.ts` is the source of truth for `docs/tjs-vs-typescript.md`. This runs each
 * row's snippet through TJS — and, where the row claims a TypeScript outcome, through
 * `tsc --strict` — and fails if the documented result is not the observed one.
 *
 * Written this way because prose comparisons rot invisibly. One review cycle of this
 * project produced six documented behaviours that did not exist, and not one was caught
 * by reading. A comparison table is the single most tempting place for that to happen:
 * it is written once, against a language that then moves.
 *
 * The TypeScript half runs ONE `tsc` invocation over all snippets and attributes errors
 * back by filename, so adding rows costs milliseconds rather than a compiler start.
 */
import { describe, it, expect } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { DIFFERENCES } from './differences'
import { tjs } from './index'

const REPO = resolve(import.meta.dir, '../..')

/** Run a TJS snippet: does it compile, and what does it print? */
function runTjs(snippet: string): { accepts: boolean; output: string } {
  let code: string
  try {
    // NOT `runTests: 'report'`. The default THROWS on a failed signature test, and
    // that throw is precisely what the `signature-test-fails` row documents — reporting
    // instead would have made the row silently untrue while the test passed.
    code = tjs(snippet, { filename: 'diff.tjs' }).code
  } catch {
    return { accepts: false, output: '' }
  }
  const lines: string[] = []
  const real = console.log
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(' '))
  try {
    new Function(code)()
  } catch {
    // A runtime throw is still "the language accepted it"; the row's `value` decides.
  } finally {
    console.log = real
  }
  return { accepts: true, output: lines.join('\n') }
}

/** Typecheck every TS-bearing snippet in ONE tsc run; returns the set that errored. */
function typecheckAll(): Set<string> {
  const dir = mkdtempSync(join(tmpdir(), 'tjs-diff-ts-'))
  const withTs = DIFFERENCES.filter((d) => d.ts)
  try {
    for (const d of withTs) {
      writeFileSync(join(dir, `${d.id}.ts`), `${d.snippet}\nexport {}\n`)
    }
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'es2022',
          lib: ['es2022', 'dom'],
          types: [],
          noEmit: true,
        },
      })
    )
    const proc = Bun.spawnSync(
      [join(REPO, 'node_modules/.bin/tsc'), '-p', 'tsconfig.json'],
      { cwd: dir }
    )
    const out =
      new TextDecoder().decode(proc.stdout) +
      new TextDecoder().decode(proc.stderr)
    const failed = new Set<string>()
    for (const m of out.matchAll(/^([\w-]+)\.ts\(/gm)) failed.add(m[1])
    return failed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('every documented difference is real', () => {
  it('has a corpus worth checking', () => {
    // A table that emptied itself would make every assertion below vacuous.
    expect(DIFFERENCES.length).toBeGreaterThan(5)
    expect(DIFFERENCES.filter((d) => d.ts).length).toBeGreaterThan(3)
  })

  it('every row has a unique id', () => {
    const ids = DIFFERENCES.map((d) => d.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  const tsFailures = typecheckAll()

  for (const d of DIFFERENCES) {
    if (d.ts) {
      it(`TypeScript: ${d.topic}`, () => {
        expect(!tsFailures.has(d.id)).toBe(d.ts!.accepts)
      })
    }

    it(`TJS: ${d.topic}${d.status === 'proposed' ? ' (proposed)' : ''}`, () => {
      const r = runTjs(d.tjsSnippet ?? d.snippet)
      // `toContain`, not equality: several rows assert on the front of a MonadicError
      // whose tail carries a file path and a stack.
      const matches =
        r.accepts === d.tjs.accepts &&
        (!d.tjs.accepts ||
          d.tjs.value === undefined ||
          r.output.includes(d.tjs.value))

      if (d.status === 'proposed') {
        // INVERTED. A proposed row states what the language SHOULD do, so it must not
        // hold yet — and the moment it does, this fails and asks for promotion. Without
        // that second direction a shipped feature sits in the "planned" list forever,
        // which is the same rot as a stale exemption.
        expect(
          matches
            ? `'${d.id}' now behaves as proposed — set status: 'shipped' in differences.ts`
            : 'not yet implemented'
        ).toBe('not yet implemented')
      } else {
        expect(matches).toBe(true)
      }
    })
  }

  it('a TS-accepting row that TJS also accepts must differ in VALUE', () => {
    // Otherwise it is not a difference and does not belong in the table — the file
    // filling up with agreements is how a comparison stops being informative.
    for (const d of DIFFERENCES) {
      if (d.status === 'proposed') continue
      if (d.ts?.accepts && d.tjs.accepts) {
        expect(d.ts.value !== undefined && d.tjs.value !== undefined).toBe(true)
        expect(d.ts.value).not.toBe(d.tjs.value)
      }
    }
  })
})

/**
 * The generated page matches its source.
 *
 * `docs/tjs-vs-typescript.md` is a build artifact. Committed artifacts drift silently —
 * `demo/docs.json` taught nine abolished directives in the live playground for days
 * after its sources were rewritten — so the only thing that keeps one honest is a test
 * that regenerates it and compares.
 *
 * This is the same guard `editors-build.test.ts` applies to the bundled editor files,
 * for the same reason: the artifact ships, and nobody rebuilds it by remembering.
 */
describe('docs/tjs-vs-typescript.md is generated and current', () => {
  it('contains a section for every difference', () => {
    const doc = readFileSync(
      resolve(import.meta.dir, '../../docs/tjs-vs-typescript.md'),
      'utf8'
    )
    const missing = DIFFERENCES.filter((d) => !doc.includes(`### ${d.topic}`))
    // (the heading of a proposed row carries a ' — PROPOSED' suffix, so the topic is a
    // prefix of it either way)
    expect(missing.map((d) => d.id)).toEqual([])
  })

  it('contains no section that is not a difference', () => {
    // The direction that catches a DELETED row leaving its prose behind — which is how
    // a page ends up documenting a feature that no longer exists.
    const doc = readFileSync(
      resolve(import.meta.dir, '../../docs/tjs-vs-typescript.md'),
      'utf8'
    )
    // A proposed row's heading is `<topic> — PROPOSED`, so compare on the topic prefix.
    const topics = new Set(DIFFERENCES.map((d) => d.topic))
    const orphans = [...doc.matchAll(/^### (.+)$/gm)]
      .map((m) => m[1])
      .map((h) => h.replace(/ — PROPOSED$/, ''))
      .filter((t) => !topics.has(t))
    expect(orphans).toEqual([])
  })

  it('is regenerable — the rendered page matches the committed one', async () => {
    // COMPARES, and does not write. This used to spawn the builder and diff the file
    // before and after, which meant that in the one case it exists to catch — a drifted
    // doc — it failed AND repaired the tracked file on the way out. Re-running went
    // green, `git status` showed a modification nobody made on purpose, and the finding
    // evaporated. A freshness check that repairs what it checks reports the state it just
    // created.
    const { render, DIFFERENCES_DOC } = await import(
      '../../scripts/build-differences'
    )
    expect(readFileSync(DIFFERENCES_DOC, 'utf8')).toBe(render())
  })
})
