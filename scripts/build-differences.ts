/**
 * Generate `docs/tjs-vs-typescript.md` from `src/lang/differences.ts`.
 *
 * The doc is a BUILD ARTIFACT — never hand-edit it. Its content is data that
 * `differences.test.ts` executes against `tsc` and TJS on every run, so a claim in the
 * generated page cannot drift from the language without a test going red. That is the
 * whole reason it is generated rather than written: a prose comparison table is the most
 * tempting place in a project for a false claim to live undisturbed, because it is
 * written once against a language that then moves.
 *
 * Run via `bun run docs:differences` (included in `bun run make`).
 *
 * ## Why `render()` is exported and the write is guarded
 *
 * `differences.test.ts` used to check freshness by SPAWNING this script and comparing the
 * file before and after — which meant that in the one case the test exists to catch, a
 * drifted doc, it failed *and rewrote the tracked file on its way out*. Re-running went
 * green, `git status` showed a modification nobody made deliberately, and the finding
 * evaporated. A freshness check that repairs what it is checking reports the state it just
 * created.
 *
 * So the rendering is a pure function of `DIFFERENCES`, the test imports it and compares
 * strings, and the write happens only when this file is the entry point.
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DIFFERENCES,
  type Difference,
  type Outcome,
} from '../src/lang/differences'

const REPO = resolve(import.meta.dir, '..')

function cell(o: Outcome | undefined): string {
  if (!o) return '—'
  if (!o.accepts) return '**rejected**'
  return o.value !== undefined ? `\`${o.value}\`` : 'accepted'
}

function section(d: Difference): string {
  const lang = d.snippet.startsWith('declare') ? 'ts' : 'js'
  const proposed = d.status === 'proposed'
  const parts = [
    `### ${d.topic}${proposed ? ' — PROPOSED' : ''}`,
    ...(proposed
      ? [
          '',
          '> **Not implemented.** This row states what the language SHOULD do. It is',
          '> asserted RED by the test suite, and turns green only when someone builds it.',
        ]
      : []),
    '',
    '```' + lang,
    d.snippet,
    '```',
    '',
    `| | TypeScript | TJS |`,
    `| --- | --- | --- |`,
    `| result | ${cell(d.ts)} | ${
      proposed ? cell(d.tjs) + ' *(intended)*' : cell(d.tjs)
    } |`,
    '',
    d.why,
  ]
  if (d.tjsSnippet) {
    parts.splice(
      5,
      0,
      '',
      'The same program in TJS (the snippet above is TypeScript-only syntax):',
      '',
      '```js',
      d.tjsSnippet,
      '```'
    )
  }
  return parts.join('\n')
}

export function render(): string {
  return `<!--{"section": "home", "order": 6, "navTitle": "TJS vs TypeScript"}-->

# TJS vs TypeScript vs JavaScript

<!-- GENERATED FILE — do not edit.
     Source: src/lang/differences.ts
     Regenerate: bun run docs:differences
     Every row below is executed against \`tsc --strict\` and TJS by
     src/lang/differences.test.ts, which fails if a documented result is not the
     observed one. -->

Every difference on this page is **executed**, not asserted. Each snippet is run through
\`tsc --strict\` and through TJS on every test run, and the table below reports what those
compilers actually did — not what someone believed when they wrote the page.

That matters more than it sounds. One review cycle of this project turned up six
documented behaviours that did not exist: an arrow return syntax that was never
implemented, a \`predicate =>\` form that parsed and validated nothing, \`.d.ts\` stubs that
were never emitted, annotations documented as checked that resolved to \`any\`, an editor
completion suggesting a form the compiler rejects, and a playground page teaching nine
abolished directives. Not one was caught by reading.

**"rejected" means the compiler refused it.** A value means it compiled and that is what
it printed.

${DIFFERENCES.map(section).join('\n\n---\n\n')}

---

## Adding a row

Edit \`src/lang/differences.ts\`, then run \`bun run docs:differences\`. If
\`differences.test.ts\` disagrees with your row, it is reporting the language as it is —
which is the point. A row that cannot be executed does not belong on this page.
`
}

/** Where the rendered page lives. Exported so the test does not restate the path. */
export const DIFFERENCES_DOC = join(REPO, 'docs/tjs-vs-typescript.md')

// Only when run as a script. Importing this module must not write to the repo.
if (import.meta.main) {
  writeFileSync(DIFFERENCES_DOC, render())
  console.log(
    `docs/tjs-vs-typescript.md — ${DIFFERENCES.length} rows ` +
      `(${
        DIFFERENCES.filter((d) => d.status !== 'proposed').length
      } shipped, ` +
      `${
        DIFFERENCES.filter((d) => d.status === 'proposed').length
      } proposed), ` +
      `${DIFFERENCES.filter((d) => d.ts).length} verified against tsc`
  )
}
