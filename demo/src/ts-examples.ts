/**
 * TypeScript Examples
 *
 * These examples demonstrate the TS -> TJS -> JS pipeline.
 * They are written in ACTUAL TypeScript syntax (not TJS).
 * The playground shows:
 * - TS input (editable)
 * - TJS intermediate (read-only)
 * - JS output with __tjs metadata
 *
 * The source of truth is `guides/examples/ts/*.md`, the same corpus the doc site builds
 * from, via `demo/docs.json`. This file used to hold a hand-maintained copy of all
 * fourteen, so the copy the live playground ran was one no test executed.
 */

import docs from '../docs.json'

export interface TSExample {
  name: string
  description: string
  code: string
  group: 'intro' | 'validation' | 'patterns' | 'advanced'
}

export const tsExamples: TSExample[] = (docs as any[])
  .filter((d) => d.type === 'example' && d.section === 'ts' && d.code)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((d) => ({
    name: d.title,
    description: d.description || d.title,
    code: d.code,
    group: d.group,
  }))
