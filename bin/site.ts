#!/usr/bin/env bun
/**
 * The doc/site entry point — `tosijs-ui/site` plus the three fields it does not derive.
 *
 * Replaces `bin/docs.js` (280 lines). Their `extractDocs` reads the same `<!--{ … }-->`
 * metadata blocks our markdown already uses and produces `filename group navTitle order path
 * pin requiresApi section text title type` — everything our corpus carries EXCEPT three
 * derived fields the playground needs:
 *
 *   - `code` / `language` — the first fenced block, which `demo/src/index.ts` feeds straight
 *     to the editor (`element.setCode(example.code)`).
 *   - `description` — the first paragraph, used as the example's blurb.
 *
 * Those are ours because they are a PLAYGROUND concern rather than a documentation one: a doc
 * site renders the fence in place, while our playground lifts it into a live editor. Issue #53
 * (first-class `example` blocks) would remove this step entirely — the code would come from
 * the language rather than from re-parsing markdown.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { extractDocs, saveDocsJSON } from 'tosijs-ui/site'
import { extractDocComments } from '../src/strip-comments'
import config from '../tjs-site.config'

/**
 * The first fenced code block, FENCE-LENGTH AWARE.
 *
 * CommonMark closes a fence only with a run of at least as many backticks as opened it, so an
 * example whose code contains a triple-backtick opens with four. The naive
 * ``/```(\w+)?\n([\s\S]*?)```/`` stops at the inner triple and cuts the example mid-expression
 * — two shipped AJS examples were served truncated in the live playground and in the npm
 * package that way, and they opened with four backticks PRECISELY BECAUSE their code contains
 * three. The authors did the right thing and the extractor punished them for it.
 */
function firstCodeBlock(
  text: string
): { language: string; code: string } | null {
  const m = text.match(/^(`{3,})(\w+)?\n([\s\S]*?)^\1\s*$/m)
  return m ? { language: m[2] || 'javascript', code: m[3].trim() } : null
}

/**
 * Everything between the H1 and the first fence, joined.
 *
 * Collects across blank lines rather than stopping at the first paragraph — matching
 * `bin/docs.js`, which several WASM examples depend on: their blurb opens with a blockquote
 * callout and the useful sentence is after it.
 */
function firstParagraph(text: string): string {
  const out: string[] = []
  let started = false
  for (const line of text.split('\n')) {
    if (line.startsWith('<!--')) continue
    if (line.startsWith('# ')) {
      started = true
      continue
    }
    if (line.startsWith('```')) break
    if (started && line.trim()) out.push(line.trim())
  }
  return out.join(' ').trim()
}

/**
 * Frontmatter is only frontmatter on the FIRST non-blank line.
 *
 * `extractDocs` matches the `<!--{ … }-->` block anywhere in the file, so a document that
 * DOCUMENTS the format gets classified by its own example. `CLAUDE.md` explains how to write
 * a playground example and shows
 * `<!--{"section":"tjs","type":"example","group":"basics","order":16}-->` on line 815 — and
 * was duly filed into the playground's TJS examples nav, in "basics", at order 16, with a
 * `bash` block as its code.
 *
 * This is the literal-blindness class this project already knows well: a pass that misreads a
 * document for mentioning the syntax it scans for. `bin/docs.js` fixed it with the same rule
 * and a comment naming CLAUDE.md specifically. Reported upstream; until it lands, strip the
 * metadata a document did not actually declare.
 */
function stripMisreadFrontmatter(doc: any): void {
  const first = String(doc.text ?? '')
    .split('\n')
    .find((l: string) => l.trim())
  if (first && /^\s*<!--\{/.test(first)) return // genuinely declared
  for (const key of ['section', 'type', 'group', 'order', 'pin'])
    delete doc[key]
}

/**
 * `.tjs` files contribute their own doc comments.
 *
 * `extractDocs` reads `/*# … *\/` from `.ts`/`.js` — tosijs-ui's convention, and it stays
 * that
 * (note the escape: this file is `.ts`, so it cannot use `/# … #/` and must escape the
 * terminator it is quoting — which is the whole argument for the new syntax, demonstrated
 * accidentally while writing this comment)
 * for TypeScript sources. But `.tjs` files use TJS's own doc
 * comment, which no external tool knows about, and that is the point: the documentation is in
 * the LANGUAGE, so publishing it does not depend on anyone's build system.
 *
 * Mirrors the shape `extractDocs` produces for inline source docs — blocks joined with a
 * rule, titled by filename — so the two corpora merge without a consumer noticing which
 * extractor produced an entry.
 */
function tjsDocs(paths: string[]): any[] {
  const out: any[] = []
  const walk = (dir: string): void => {
    // SORTED. `readdirSync` returns filesystem order, which differs by filesystem: APFS
    // locally, ext4 in CI. `demo/docs.json` is a COMMITTED artifact checked with
    // `git diff --exit-code`, so an unsorted walk made that gate fail on a diff with no
    // content change at all — `src/rbac/rules.tjs` and `src/linalg/index.tjs` simply
    // traded places. A generated artifact has to be a pure function of its inputs, or the
    // check that it is current cannot tell "stale" from "built on a different machine".
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.tjs')) {
        const blocks = extractDocComments(readFileSync(full, 'utf8'))
        if (!blocks.length) continue
        out.push({
          text: blocks.join('\n\n---\n\n'),
          title: `${basename(full, '.tjs')} (inline docs)`,
          filename: basename(full),
          path: full,
        })
      }
    }
  }
  for (const p of paths) {
    if (!existsSync(p)) continue
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tjs')) {
      const blocks = extractDocComments(readFileSync(p, 'utf8'))
      if (blocks.length)
        out.push({
          text: blocks.join('\n\n---\n\n'),
          title: `${basename(p, '.tjs')} (inline docs)`,
          filename: basename(p),
          path: p,
        })
    }
  }
  // Sorted by path as well as by walk order: `paths` may mix files and directories, so the
  // walk alone does not fix the interleaving between them. Belt and braces, because the
  // failure this prevents is invisible on the machine that generates the file.
  return out.sort((a, b) => String(a.path).localeCompare(String(b.path)))
}

const docs = [
  ...extractDocs({ paths: config.docPaths as string[] }),
  ...tjsDocs(config.docPaths as string[]),
]

for (const doc of docs as any[]) {
  stripMisreadFrontmatter(doc)
  // ONLY for `type: 'example'`, matching `bin/docs.js`. A doc page renders its fences in
  // place; only a playground example is lifted into a live editor, and deriving `code` for
  // every page would put a second copy of every snippet into a 1.2 MB corpus the demo loads
  // at runtime.
  if (doc.type !== 'example') continue
  const block = firstCodeBlock(doc.text)
  if (block) {
    doc.code = block.code
    doc.language = block.language
  }
  const description = firstParagraph(doc.text)
  if (description) doc.description = description
}

saveDocsJSON(docs as any, config.docsJson ?? 'demo/docs.json')
console.log(
  `docs: ${docs.length} entries -> ${config.docsJson ?? 'demo/docs.json'} ` +
    `(${docs.filter((d: any) => d.code).length} with code)`
)
