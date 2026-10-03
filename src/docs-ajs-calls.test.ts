/**
 * The AsyncJS docs never teach a POSITIONAL atom call. Every atom takes named arguments.
 *
 * Since 0.14.0-rc.2 the transpiler refuses `storeSet('k', v)` ("takes named arguments"); before,
 * it ran with every input undefined and reported success. `guides/patterns.md`
 * taught exactly that shape in blocks marked `fragment`, which nothing compiles, so the docs and the
 * VM disagreed silently (rc.2 nineteenth re-review). This scans the AJS-facing docs as TEXT, which
 * fragments cannot escape, against the atom list computed from `coreAtoms`, so a new atom with named
 * inputs is covered without editing this file.
 *
 * `filter(data, schema)` is a transpiler builtin, not an atom call, so it is exempt by name. A line
 * that shows the refused form ON PURPOSE says `(refused)` on the same line.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { coreAtoms } from './vm/runtime'

const REPO = resolve(import.meta.dir, '..')

/** Lowered by the transpiler before any atom sees it: positional is the documented form. */
const TRANSPILER_BUILTINS = new Set(['filter'])

const AJS_DOCS = [
  'DOCS-AJS.md',
  'guides/ajs.md',
  'guides/ajs-llm-prompt.md',
  'guides/patterns.md',
  ...readdirSync(join(REPO, 'guides/examples/ajs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `guides/examples/ajs/${f}`),
]

/** Every atom takes named arguments, except the positional builtins the transpiler allows. */
const POSITIONAL = new Set(['Error', 'callLocal'])
const NAMED = Object.keys(coreAtoms).filter(
  (name) => !POSITIONAL.has(name) && !TRANSPILER_BUILTINS.has(name)
)

/** `name(` not preceded by an identifier character or `.`, and not followed by `{` or `)`. */
const POSITIONAL_CALL = new RegExp(
  `(?<![\\w.$])(${NAMED.sort((a, b) => b.length - a.length).join(
    '|'
  )})\\((?!\\s*[{)])`
)

describe('AsyncJS docs teach named atom calls (every atom)', () => {
  it('apparatus: the atom list is real and the pattern catches the shape that shipped', () => {
    expect(NAMED).toContain('storeSet')
    expect(NAMED).toContain('llmPredict')
    expect(POSITIONAL_CALL.test("storeSet('data', parsed)")).toBe(true)
    expect(POSITIONAL_CALL.test("storeSet({ key: 'data', value })")).toBe(false)
    expect(POSITIONAL_CALL.test('random()')).toBe(false)
    expect(POSITIONAL_CALL.test('Schema.filter(data, s)')).toBe(false)
  })

  for (const doc of AJS_DOCS)
    it(`${doc}: no positional atom call`, () => {
      const hits = readFileSync(join(REPO, doc), 'utf8')
        .split('\n')
        .map((line, i) => [i + 1, line] as const)
        .filter(
          ([, line]) =>
            POSITIONAL_CALL.test(line) && !line.includes('(refused)')
        )
        .map(([n, line]) => `${doc}:${n}: ${line.trim()}`)
      expect(hits).toEqual([])
    })
})
