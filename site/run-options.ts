/**
 * The run options a live ```ajs example may set, and their caps on a doc page (2026-11-14).
 *
 * An example could set only `fuel` (uncapped) and `args`, so a chapter about limits could not
 * show a timeout, a quota or the heap ceiling running out. Readers' browsers run these examples,
 * some as the page loads, so every budget is capped: a generous `maxHeapBytes` or a long
 * `timeoutMs` in one example must not freeze a reader's tab. Anything else in the options is
 * ignored. Pure, so it is tested without a browser (run-options.test.ts).
 */

export const PAGE_CAPS = {
  fuel: 100_000,
  timeoutMs: 10_000,
  maxHeapBytes: 64 * 1024 * 1024,
  membraneMaxBytes: 4 * 1024 * 1024,
} as const

export interface PageRunOptions {
  fuel: number
  timeoutMs: number
  maxHeapBytes?: number
  membraneMaxBytes?: number
  quotas?: Record<string, number>
}

const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

export function pageRunOptions(
  options: Record<string, unknown>
): PageRunOptions {
  const capped = (v: unknown, cap: number, fallback: number) =>
    positive(v) ? Math.min(v, cap) : fallback
  const out: PageRunOptions = {
    fuel: capped(options.fuel, PAGE_CAPS.fuel, 10_000),
    timeoutMs: capped(
      options.timeoutMs,
      PAGE_CAPS.timeoutMs,
      PAGE_CAPS.timeoutMs
    ),
  }
  if (positive(options.maxHeapBytes))
    out.maxHeapBytes = Math.min(options.maxHeapBytes, PAGE_CAPS.maxHeapBytes)
  if (positive(options.membraneMaxBytes))
    out.membraneMaxBytes = Math.min(
      options.membraneMaxBytes,
      PAGE_CAPS.membraneMaxBytes
    )
  const q = options.quotas
  if (q && typeof q === 'object' && !Array.isArray(q)) {
    const quotas: Record<string, number> = {}
    for (const [op, n] of Object.entries(q))
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0) quotas[op] = n
    if (Object.keys(quotas).length) out.quotas = quotas
  }
  return out
}
