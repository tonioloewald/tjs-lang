/**
 * TJS's doc-comment scanner is reachable from the public entries (#3604). tosijs-ui
 * feature-detects `findDocCommentSpans` on `tjs-lang/lang`, then `tjs-lang`, so a `.tjs` file
 * documented the TJS way (`/# … #/`) gets a page; until then it read only `/*# … *\/`. A second
 * scanner there would repeat this repo's dominant defect: a raw scan reads a `/#/` regex and
 * a later "#/" string as one comment.
 */
import { describe, it, expect } from 'bun:test'

const SRC =
  'const a = /#/\nconst s = "#/"\n/# Title\nbody /# nested #/ more #/\nfunction f() {}'

describe('findDocCommentSpans and extractDocComments are public', () => {
  for (const entry of ['tjs-lang/lang', 'tjs-lang', 'tjs-lang/browser']) {
    it(entry, async () => {
      const m: any = await import(entry)
      expect(typeof m.findDocCommentSpans).toBe('function')
      expect(typeof m.extractDocComments).toBe('function')
      // The regex and the string are NOT a comment; the nested one is quoted inside its parent.
      const spans = m.findDocCommentSpans(SRC)
      expect(spans.length).toBe(1)
      expect(SRC.slice(spans[0][0], spans[0][1])).toMatch(/^\/# Title[^]*#\/$/)
      expect(m.extractDocComments(SRC)).toEqual([
        'Title\nbody /# nested #/ more',
      ])
    })
  }
})
