/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import { join, resolve } from 'node:path'

import { tmpdir } from 'node:os'

import { DIFFERENCES } from '/Users/tonioloewald/tjs-lang/src/lang/differences'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

const REPO = resolve('/Users/tonioloewald/tjs-lang/src/lang', '../..')
export {}

/* line 26 */
function runTjs(snippet) {
  let code
  try {
    code = tjs(snippet, { filename: 'diff.tjs' }).code
  } catch {
    return { accepts: false, output: '' }
  }
  const lines = []
  const real = console.log
  console.log = (...a) => lines.push(a.map(String).join(' '))
  try {
    new Function(code)()
  } catch {
  } finally {
    console.log = real
  }
  return { accepts: true, output: lines.join('\n') }
}
runTjs.__tjs = {
  params: {
    snippet: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'object',
      shape: {
        accepts: {
          kind: 'boolean',
        },
        output: {
          kind: 'string',
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:26',
}

/* line 50 */
function typecheckAll() {
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
    const failed = new Set()
    for (const m of out.matchAll(/^([\w-]+)\.ts\(/gm)) failed.add(m[1])
    return failed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
typecheckAll.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:50',
}

describe('every documented difference is real', () => {
  it('has a corpus worth checking', () => {
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
        expect(!tsFailures.has(d.id)).toBe(d.ts.accepts)
      })
    }
    it(`TJS: ${d.topic}${d.status === 'proposed' ? ' (proposed)' : ''}`, () => {
      const r = runTjs(d.tjsSnippet ?? d.snippet)

      const matches =
        r.accepts === d.tjs.accepts &&
        (!d.tjs.accepts ||
          d.tjs.value === undefined ||
          r.output.includes(d.tjs.value))
      if (d.status === 'proposed') {
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
    for (const d of DIFFERENCES) {
      if (d.status === 'proposed') continue
      if (d.ts?.accepts && d.tjs.accepts) {
        expect(d.ts.value !== undefined && d.tjs.value !== undefined).toBe(true)
        expect(d.ts.value).not.toBe(d.tjs.value)
      }
    }
  })
})

describe('docs/tjs-vs-typescript.md is generated and current', () => {
  it('contains a section for every difference', () => {
    const doc = readFileSync(
      resolve(
        '/Users/tonioloewald/tjs-lang/src/lang',
        '../../docs/tjs-vs-typescript.md'
      ),
      'utf8'
    )
    const missing = DIFFERENCES.filter((d) => !doc.includes(`### ${d.topic}`))

    expect(missing.map((d) => d.id)).toEqual([])
  })
  it('contains no section that is not a difference', () => {
    const doc = readFileSync(
      resolve(
        '/Users/tonioloewald/tjs-lang/src/lang',
        '../../docs/tjs-vs-typescript.md'
      ),
      'utf8'
    )

    const topics = new Set(DIFFERENCES.map((d) => d.topic))
    const orphans = [...doc.matchAll(/^### (.+)$/gm)]
      .map((m) => m[1])
      .map((h) => h.replace(/ — PROPOSED$/, ''))
      .filter((t) => !topics.has(t))
    expect(orphans).toEqual([])
  })
  it('is regenerable — the rendered page matches the committed one', async () => {
    const { render, DIFFERENCES_DOC } = await import(
      '/Users/tonioloewald/tjs-lang/scripts/build-differences'
    )
    expect(readFileSync(DIFFERENCES_DOC, 'utf8')).toBe(render())
  })
})
export {}
