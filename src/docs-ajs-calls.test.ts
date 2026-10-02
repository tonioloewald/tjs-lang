/**
 * The AsyncJS docs never teach a POSITIONAL call to an atom with named inputs.
 *
 * Since 0.14.0-rc.2 the VM refuses `storeSet('k', v)` with "takes named arguments: storeSet({ key,
 * value })" — before, it ran with every input undefined and reported success. `guides/patterns.md`
 * taught exactly that shape in blocks marked `fragment`, which nothing compiles, so the docs and the
 * VM disagreed silently (rc.2 nineteenth re-review). This scans the AJS-facing docs as TEXT, which
 * fragments cannot escape, against the atom list computed from `coreAtoms`, so a new atom with named
 * inputs is covered without editing this file.
 *
 * `filter(data, schema)` is a transpiler builtin, not an atom call, so it is exempt by name.
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

const NAMED = Object.entries(coreAtoms as Record<string, any>)
  .filter(([name, atom]) => {
    const props = (atom.inputSchema?.schema ?? atom.inputSchema)?.properties
    return (
      props &&
      typeof props === 'object' &&
      !('args' in props) &&
      !TRANSPILER_BUILTINS.has(name)
    )
  })
  .map(([name]) => name)

/** `name(` not preceded by an identifier character or `.`, and not followed by `{` or `)`. */
const POSITIONAL = new RegExp(
  `(?<![\\w.$])(${NAMED.sort((a, b) => b.length - a.length).join(
    '|'
  )})\\((?!\\s*[{)])`
)

describe('AsyncJS docs teach named atom calls', () => {
  it('apparatus: the atom list is real and the pattern catches the shape that shipped', () => {
    expect(NAMED).toContain('storeSet')
    expect(NAMED).toContain('llmPredict')
    expect(POSITIONAL.test("storeSet('data', parsed)")).toBe(true)
    expect(POSITIONAL.test("storeSet({ key: 'data', value })")).toBe(false)
    expect(POSITIONAL.test('random()')).toBe(false)
    expect(POSITIONAL.test('Schema.filter(data, s)')).toBe(false)
  })

  for (const doc of AJS_DOCS)
    it(`${doc}: no positional call to a named-input atom`, () => {
      const hits = readFileSync(join(REPO, doc), 'utf8')
        .split('\n')
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => POSITIONAL.test(line))
        .map(([n, line]) => `${doc}:${n}: ${line.trim()}`)
      expect(hits).toEqual([])
    })
})
