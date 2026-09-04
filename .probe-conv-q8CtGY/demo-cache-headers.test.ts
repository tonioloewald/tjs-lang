/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const config = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf-8'))

const headers = config.hosting?.headers ?? []

/* line 35 */
function isHashed(f) {
  return /-[a-z0-9]{6,}\.(js|map)$/.test(f)
}
isHashed.__tjs = {
  params: {
    f: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:35',
}

/* line 52 */
function cacheControlFor(path) {
  let match
  for (const rule of headers) {
    const rx = new RegExp(
      '^' +
        rule.source
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')

          .replace(/\*\*/g, 'GLOBSTAR_TOKEN')
          .replace(/\*/g, '[^/]*')
          .replace(/GLOBSTAR_TOKEN/g, '.*')

          .replace(/@\\\((.*?)\\\)/g, '($1)')
          .replace(/@\((.*?)\)/g, '($1)') +
        '$'
    )
    const p = path.startsWith('/') ? path : `/${path}`
    if (rx.test(p) || rx.test(path)) {
      const cc = rule.headers.find((h) => h.key === 'Cache-Control')?.value
      if (cc) match = cc
    }
  }
  return match
}
cacheControlFor.__tjs = {
  params: {
    path: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'union',
      members: [
        {
          kind: 'string',
        },
        {
          kind: 'undefined',
        },
      ],
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:52',
}

describe('cache headers cannot pin a stale entry point', () => {
  it('the rules parse, and something IS immutable (apparatus check)', () => {
    expect(headers.length).toBeGreaterThan(0)
    expect(
      headers.some((h) => h.headers.some((x) => /immutable/.test(x.value)))
    ).toBe(true)
  })
  it('a content-hashed chunk IS cached immutably', () => {
    const rule = headers.find((h) => h.source.includes('chunk-'))
    expect(rule?.headers.some((x) => /immutable/.test(x.value))).toBe(true)
  })
  it('the DOCUMENT revalidates — under the path a browser requests', () => {
    expect(cacheControlFor('/')).toMatch(/no-cache|must-revalidate|max-age=0/)
  })
  it('scripts are readable from the sandboxed iframe (CORS)', () => {
    const cors = () => {
      let v
      for (const rule of headers) {
        if (
          rule.source.includes('js') &&
          rule.headers.some((h) => h.key === 'Access-Control-Allow-Origin')
        ) {
          v = rule.headers.find(
            (h) => h.key === 'Access-Control-Allow-Origin'
          )?.value
        }
      }
      return v
    }
    expect(cors()).toBe('*')
  })
  it('the entry URL is version-stamped, so a PINNED browser recovers', () => {
    const build = readFileSync(join(ROOT, 'scripts', 'build-demo.ts'), 'utf-8')
    expect(build).toContain('index.js?v=')
  })
  for (const f of ['index.js', 'tfs-worker.js', 'tjs-runtime.js']) {
    it(`${f} is NOT cached immutably`, () => {
      const cc = cacheControlFor(f) ?? ''
      expect(
        cc,
        `${f} is not content-hashed, so it must revalidate`
      ).not.toContain('immutable')
      expect(cc).toMatch(/no-cache|must-revalidate|max-age=0/)
    })
  }
  it('every UNHASHED script in the built demo revalidates', () => {
    const demo = join(ROOT, '.demo')
    if (!existsSync(demo)) {
      expect(
        process.env.CI,
        '.demo missing — run `bun run build:demo`'
      ).toBeFalsy()
      return
    }
    const offenders = readdirSync(demo)
      .filter((f) => f.endsWith('.js') && !isHashed(f))
      .filter((f) => /immutable/.test(cacheControlFor(f) ?? ''))
    expect(offenders).toEqual([])
  })
})
