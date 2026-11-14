/**
 * `Union`, `Enum` and a literal-union parameter agree about a boxed value (2026-11-14).
 *
 * A parameter `d: 'n' | 's'` accepted `Object('s')` (it compares with `==`, which unwraps), but a
 * declared `Union` or `Enum` checked with `includes`/`Set.has` and refused it. Boxed values still
 * arrive from JavaScript libraries and converted code, so one value got two answers. All three now
 * use one membership rule (the emitted `__oneOf`; `unwrapBoxed` in the shared runtime). Checked
 * in both runtime modes, since the inline stub is what emitted code calls (docs/type-identity.md).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'
import { Union, Enum } from '../types/Type'

const SRC = `Union Dir 'a direction' 'n' | 's'
Enum Kind 'kinds' { A = 'a', B = 'b' }
function f(d: 'n' | 's') { return d }`

for (const withRuntime of [false, true])
  describe(`emitted code (${
    withRuntime ? 'full runtime installed' : 'inline stub'
  })`, () => {
    const load = () => {
      const saved = (globalThis as any).__tjs
      if (withRuntime) (globalThis as any).__tjs = createRuntime()
      else delete (globalThis as any).__tjs
      try {
        return new Function(tjs(SRC).code + '\nreturn [Dir, Kind, f]')()
      } finally {
        ;(globalThis as any).__tjs = saved
      }
    }
    it('a boxed member is accepted by Union, Enum and the parameter alike', () => {
      const [Dir, Kind, f] = load()
      expect(Dir.check(Object('n'))).toBe(true)
      expect(Kind.check(Object('a'))).toBe(true)
      expect(f(Object('s')) == 's').toBe(true)
    })
    it('a non-member, boxed or not, is still refused', () => {
      const [Dir, Kind] = load()
      expect(Dir.check('x')).toBe(false)
      expect(Kind.check(Object('z'))).toBe(false)
    })
  })

describe('the shared runtime agrees', () => {
  it('Union and Enum unwrap a boxed member', () => {
    expect(Union('d', ['n', 's']).check(Object('n'))).toBe(true)
    expect(Enum('k', { A: 'a' }).check(Object('a'))).toBe(true)
    expect(Union('d', ['n', 's']).check('x')).toBe(false)
  })
})
