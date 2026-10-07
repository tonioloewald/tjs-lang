import { describe, it, expect } from 'bun:test'
import { stripExports } from './strip-exports'

/** Run stripped code as an async function body, the way tosijs-ui runs an example. */
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const run = (code: string, tail: string) =>
  new AsyncFunction(`${stripExports(code)}\n${tail}`)()

describe('stripExports: a module becomes a runnable script body', () => {
  it('the unstripped module is a syntax error there (apparatus)', () => {
    expect(() => new AsyncFunction('export const a = 1')).toThrow()
  })

  it('keeps every declaration a named export made', async () => {
    const code = `export const a = 1
export function f(x) { return x + a }
export class C { get v() { return 2 } }
export let b = 3, c = 4`
    expect(await run(code, 'return [f(1), new C().v, b, c]')).toEqual([
      2, 2, 3, 4,
    ])
  })

  it('drops export lists and re-exports, keeping the bindings they named', async () => {
    const code = `const a = 1, b = 2\nexport { a, b as bee }\nexport * from 'x'`
    expect(await run(code, 'return a + b')).toBe(3)
  })

  it('export default: a named declaration keeps its name, anything else gets a binding', async () => {
    expect(
      await run('export default function main() { return 7 }', 'return main()')
    ).toBe(7)
    expect(
      await run(
        'export default function () { return 8 }',
        'return __default_export()'
      )
    ).toBe(8)
    expect(await run('export default 6 * 7', 'return __default_export')).toBe(
      42
    )
  })

  it('top-level await survives (async-functions depends on it)', async () => {
    expect(
      await run('export const v = await Promise.resolve(5)', 'return v')
    ).toBe(5)
  })

  it('a template literal line that begins with "export " is data, byte-identical', async () => {
    const code = 'export const s = `line one\nexport default nonsense\n`'
    const out = stripExports(code)
    expect(out).toContain('`line one\nexport default nonsense\n`')
    expect(await run(code, 'return s')).toBe(
      'line one\nexport default nonsense\n'
    )
  })

  it('unparseable input comes back unchanged (the run reports the real error)', () => {
    expect(stripExports('export const = ')).toBe('export const = ')
  })
})
