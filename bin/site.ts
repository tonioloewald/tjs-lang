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
import { extractDocs, saveDocsJSON } from 'tosijs-ui/site'
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

const docs = extractDocs({ paths: config.docPaths as string[] })

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
