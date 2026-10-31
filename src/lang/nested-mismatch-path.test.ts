/**
 * A declared Type's failure says WHERE (#3597, from tosijs-native). A config type whose only
 * bad field was deep inside reported `Expected Config for '…config', got object`; for a
 * config, the failing path is the whole message. The explanation runs on the failure path
 * only, and never throws.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const load = (src: string, name: string) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${tjs(src, { runTests: false }).code}\nreturn ${name}`
    )()
  } finally {
    g.__tjs = prev
  }
}

const SRC = `Type Product { example: { name: '', kind: '' } }
Type Config { example: { title: '', products: [Product], limits: { max: 0 }, run: (x) => x } }
function checkConfig(config: Config):! 0 { return 1 }`
const ok = {
  title: 't',
  products: [{ name: 'a', kind: 'x' }],
  limits: { max: 3 },
  run: (x: unknown) => x,
}

describe('a declared Type names the failing path', () => {
  const f = load(SRC, 'checkConfig')

  it('accepts a good value', () => {
    expect(f(ok)).toBe(1)
  })

  for (const [label, value, path] of [
    [
      'a list element member',
      {
        ...ok,
        products: [
          { name: 'a', kind: 'x' },
          { name: 'b', kind: 5 },
        ],
      },
      'products[1].kind: expected string, got number',
    ],
    [
      'a missing member',
      { title: 't', products: [], run: ok.run },
      'limits: missing',
    ],
    [
      'a nested shape',
      { ...ok, limits: { max: 'lots' } },
      'limits.max: expected number, got string',
    ],
    [
      'an integer rule',
      { ...ok, limits: { max: 1.5 } },
      'limits.max: expected integer, got 1.5',
    ],
    [
      'a function member',
      { ...ok, run: 5 },
      'run: expected function, got number',
    ],
  ] as const) {
    it(label, () => {
      const err = f(value)
      expect(err instanceof Error).toBe(true)
      expect(err.message).toContain(`checkConfig.config': ${path}`)
    })
  }

  it('a value that is not an object at all keeps the plain message', () => {
    expect(f(7).message).toMatch(/checkConfig\.config', got number$/)
  })
})

describe('the explanation is safe', () => {
  it('a recursive Type explains a deep failure, within the depth cap', () => {
    const walk = load(
      `Type Node { example: { v: 0, next: Node | null } }
function walk(n: Node):! 0 { return 1 }`,
      'walk'
    )
    let chain: any = { v: 'bad', next: null }
    for (let i = 0; i < 200; i++) chain = { v: i, next: chain }
    const err = walk(chain)
    expect(err instanceof Error).toBe(true) // explained or not, refused and not thrown
    const shallow = walk({ v: 1, next: { v: 'x', next: null } })
    expect(shallow.message).toContain('next')
  })
})
