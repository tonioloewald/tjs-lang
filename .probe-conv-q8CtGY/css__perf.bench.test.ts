/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  isStyleObject,
  isColor,
  isColorValue,
  isDimension,
  isAnimation,
} from '/Users/tonioloewald/tjs-lang/src/css/index'

/* line 24 */
function makeTheme(components) {
  const palette = [
    '#0b5fff',
    'rgb(16, 185, 129)',
    'hsl(280 60% 55%)',
    'oklch(0.7 0.15 200)',
    'rebeccapurple',
    'var(--brand)',
  ]
  const lengths = ['0', '4px', '0.5rem', '1rem', '2rem', 'calc(100% - 1rem)']
  const theme = {
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
makeTheme.__tjs = {
  params: {
    components: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'object',
      shape: {},
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:24',
}

/* line 68 */
function bench(label, iters, fn) {
  for (let i = 0; i < Math.min(iters, 1000); i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn()
  const perOp = (performance.now() - t0) / iters
  console.log(`    ${label.padEnd(34)} ${(perOp * 1000).toFixed(2)} µs/op`)
  return perOp
}
bench.__tjs = {
  params: {
    label: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    iters: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
    fn: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:68',
}

describe.skipIf(!!process.env.SKIP_BENCHMARKS)(
  'CSS validation perf (safe is fast)',
  () => {
    it('validates a theme-sized style object well under a frame', () => {
      const theme = makeTheme(50)
      const leafCount = Object.keys(theme).length

      expect(isStyleObject(theme)).toBe(true)

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

      console.log(`    → ~${Math.round(1000 / themeMs)} themes/sec\n`)

      expect(themeMs).toBeLessThan(8)
    }, 60_000)
  }
)
