/**
 * `tjs-lang/css` phase 5 — the "safe is fast" data point.
 *
 * Validates a theme-sized style object (à la a real design-system theme: a
 * `:root` variable block plus dozens of component rules with hover/focus states
 * and a media query) with the COMPLETE predicate set, and times it. Confirms the
 * PoC ballpark (~0.1ms/theme) now that colors + dimensions + shorthands +
 * recursive structure are all real.
 *
 * Gated by SKIP_BENCHMARKS (so `test:fast` skips it). Timing assertions are a
 * loose catastrophic-regression ceiling only — the printed numbers are the point;
 * hard thresholds are flaky under load (see vector-search.bench).
 */
import { describe, it, expect } from 'bun:test'
import {
  isStyleObject,
  isColor,
  isColorValue,
  isDimension,
  isAnimation,
} from './index'

/** A deterministic, realistic theme-sized style object. */
function makeTheme(components: number): Record<string, any> {
  const palette = [
    '#0b5fff',
    'rgb(16, 185, 129)',
    'hsl(280 60% 55%)',
    'oklch(0.7 0.15 200)',
    'rebeccapurple',
    'var(--brand)',
  ]
  const lengths = ['0', '4px', '0.5rem', '1rem', '2rem', 'calc(100% - 1rem)']
  const theme: Record<string, any> = {
    ':root': {
      '--brand': '#0b5fff',
      '--surface': 'hsl(220 20% 98%)',
      '--text': 'rgb(17, 24, 39)',
      '--radius': '8px',
      '--gap': '1rem',
      '--shadow': '0 1px 3px rgba(0,0,0,0.2)',
      '--font': 'system-ui, sans-serif',
    },
  }
  for (let i = 0; i < components; i++) {
    theme[`.c${i}`] = {
      color: palette[i % palette.length],
      backgroundColor: palette[(i + 1) % palette.length],
      padding: lengths[i % lengths.length],
      margin: lengths[(i + 2) % lengths.length],
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      transition: 'color 200ms ease, background 0.3s ease-in-out',
      animation: 'spin 1s cubic-bezier(0.1, 0.7, 1, 0.1) infinite',
      fontSize: '1rem',
      lineHeight: '1.5',
      '&:hover': {
        color: palette[(i + 3) % palette.length],
        transform: 'scale(1.02)',
      },
      '&:focus-visible': { outline: '2px solid var(--brand)' },
      '@media (min-width: 640px)': { padding: '2rem' },
    }
  }
  return theme
}

const bench = (label: string, iters: number, fn: () => void): number => {
  for (let i = 0; i < Math.min(iters, 1000); i++) fn() // warm up / JIT
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  const perOp = (performance.now() - t0) / iters
  console.log(`    ${label.padEnd(34)} ${(perOp * 1000).toFixed(2)} µs/op`)
  return perOp
}

describe.skipIf(!!process.env.SKIP_BENCHMARKS)(
  'CSS validation perf (safe is fast)',
  () => {
    it('validates a theme-sized style object well under a frame', () => {
      const theme = makeTheme(50) // ~50 rules × ~12 leaves ≈ 600 values
      const leafCount = Object.keys(theme).length

      // Correctness first — the validator must actually accept the theme…
      expect(isStyleObject(theme)).toBe(true)
      // …and reject a corrupted one (a selector whose value isn't a nested rule).
      expect(isStyleObject({ ...theme, '.bad': 'not-an-object' })).toBe(false)

      console.log(`\n  CSS validation (${leafCount} top-level rules):`)
      const themeMs = bench('validate whole theme', 2000, () =>
        isStyleObject(theme)
      )
      bench('isColor (per value)', 200_000, () => isColor('rgb(16, 185, 129)'))
      bench('isColorValue (+!important)', 200_000, () =>
        isColorValue('#3a3 !important')
      )
      bench('isDimension (per value)', 200_000, () => isDimension('1.5rem'))
      bench('isAnimation (tokenize+classify)', 100_000, () =>
        isAnimation('spin 1s cubic-bezier(0.1, 0.7, 1, 0.1) infinite')
      )
      // themeMs is milliseconds per theme → themes/sec = 1000 / themeMs.
      console.log(`    → ~${Math.round(1000 / themeMs)} themes/sec\n`)

      // Loose ceiling: a whole theme must validate far under one 16ms frame.
      // (Generous 8ms tolerates CI/load; observed is a fraction of a ms.)
      expect(themeMs).toBeLessThan(8)
    })
  }
)
