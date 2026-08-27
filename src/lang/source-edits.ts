/**
 * ONE way to apply a set of source edits — with no offset arithmetic to get wrong.
 *
 * The emitter used to apply its patches in two phases: delete every span, then insert every
 * fragment, adjusting each insertion's position by the total length of the deletions
 * starting before it. That adjustment cannot express the boundary case, and the failure is
 * silent:
 *
 *     replacement over [S, E)      (e.g. bool-coercion rewriting a whole ternary)
 *     insertion at position E      (e.g. a `}` closing the statement the ternary ends)
 *
 * The insertion's position `E` satisfies `del.start < position`, so the full span length is
 * subtracted and the `}` lands at `S` — **before** the text it was meant to follow. Nothing
 * errors; the emitted file is simply wrong. That shipped as `return { } __tjs.toBool(…)`
 * while implementing #43, and the same shape would bite any future transform that inserts at
 * an expression boundary. It is not a bug in either patch — it is the model.
 *
 * ## The model that replaces it
 *
 * Every edit is a REPLACEMENT of `[start, end)` with `text`; an insertion is the degenerate
 * case where `start === end`. The result is built left to right in one pass:
 *
 *     out += source.slice(cursor, e.start) + e.text ;  cursor = e.end
 *
 * Nothing is ever re-indexed, so there are no offsets to adjust and the boundary case is
 * decided by the sort rather than by arithmetic. An insertion at `E` sorts after a
 * replacement ending at `E`, so its text lands after the replacement's — which is what
 * "insert at the end of that expression" plainly means.
 *
 * ## Overlaps fail loudly
 *
 * An edit starting before the cursor genuinely conflicts with one already applied — an
 * insertion *inside* a replaced span has no defined meaning, since the text it addressed no
 * longer exists. The old model silently produced something; this throws. That is the right
 * trade for a compiler-internal invariant: an overlap is our bug, and the failure mode it
 * replaces is a corrupted output file that still parses.
 */

export interface SourceEdit {
  /** Inclusive start offset in the source being edited. */
  start: number
  /** Exclusive end offset. Equal to `start` for a pure insertion. */
  end: number
  /** Replacement text. Empty for a pure deletion. */
  text: string
}

/**
 * Apply `edits` to `source`, left to right.
 *
 * Order is by `start`, then by `end` — so at a shared position a zero-width insertion is
 * emitted before a replacement that begins there, which is the existing
 * delete-span-plus-insert-at-start idiom for "replace this span".
 *
 * @throws if two edits overlap, naming both. Touching at endpoints is not an overlap.
 */
export function applyEdits(
  source: string,
  edits: readonly SourceEdit[]
): string {
  if (edits.length === 0) return source

  // Order: by start, then by end, then by ORIGINAL INDEX DESCENDING.
  //
  // The first two are the interesting ones — end-ascending is what puts a zero-width
  // insertion before a replacement beginning at the same offset, which is how the emitter's
  // long-standing "delete a span, insert at its start" idiom keeps meaning "replace".
  //
  // The third preserves an existing contract rather than expressing a preference. The old
  // two-phase code applied insertions in DESCENDING position order, so when several landed
  // on the same offset the one pushed LAST ended up leftmost — each later insertion pushed
  // its predecessors right. Twenty call sites are written against that, and arrow-parameter
  // validation emits several fragments at one offset, so building them first-pushed-first
  // silently reordered a validation prologue. Preserved deliberately: this refactor is about
  // removing an arithmetic hazard, not about relitigating emission order.
  const sorted = edits
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.start - b.e.start || a.e.end - b.e.end || b.i - a.i)
    .map(({ e }) => e)

  let out = ''
  let cursor = 0
  let previous: SourceEdit | null = null

  for (const e of sorted) {
    if (e.start < cursor) {
      // Identical duplicates are a no-op rather than a conflict: two passes independently
      // deciding to delete the same span agree, and agreement is not corruption.
      if (
        previous &&
        e.start === previous.start &&
        e.end === previous.end &&
        e.text === previous.text
      ) {
        continue
      }
      throw new Error(
        `Overlapping source edits: [${e.start},${e.end}) "${e.text.slice(
          0,
          24
        )}" ` +
          `starts inside a region already rewritten (cursor at ${cursor}). ` +
          `This is an emitter bug — two passes claimed the same span. Anchor one of them ` +
          `in gap text (after a '(' or ':', before the next clause) so the spans are disjoint.`
      )
    }
    out += source.slice(cursor, e.start)
    out += e.text
    cursor = e.end
    previous = e
  }

  return out + source.slice(cursor)
}
