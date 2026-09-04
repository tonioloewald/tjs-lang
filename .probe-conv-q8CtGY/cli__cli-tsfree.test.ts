/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

const REPO = join('/Users/tonioloewald/tjs-lang/src/cli', '..', '..')
export {}

const RUNTIME_DEPS = ['acorn', 'acorn-loose', 'acorn-walk', 'tosijs-schema']

const roots = []

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/* line 62 */
function consumerTree() {
  const root = mkdtempSync(join(tmpdir(), 'tjs-consumer-'))
  roots.push(root)
  cpSync(join(REPO, 'src'), join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  for (const dep of RUNTIME_DEPS) {
    symlinkSync(
      join(REPO, 'node_modules', dep),
      join(root, 'node_modules', dep)
    )
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module' })
  )
  writeFileSync(
    join(root, 't.tjs'),
    `function add(a: 1, b: 2): 3 { return a + b }\n`
  )
  return root
}
consumerTree.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:62',
}

/* line 84 */
async function cli(root, ...args) {
  const proc = Bun.spawn(['bun', join(root, 'src', 'cli', 'tjs.ts'), ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code: await proc.exited, text: out + err }
}
cli.__tjs = {
  params: {
    root: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:84',
}

describe('the tjs CLI runs without the TypeScript compiler', () => {
  const root = consumerTree()
  it('the fixture really lacks typescript (apparatus check)', () => {
    expect(existsSync(join(root, 'node_modules', 'typescript'))).toBe(false)
    expect(existsSync(join(root, 'node_modules', 'acorn'))).toBe(true)
  })
  for (const args of [['--help'], ['--version'], ['check', 't.tjs']]) {
    it(`\`tjs ${args.join(' ')}\` works`, async () => {
      const r = await cli(root, ...args)
      expect(r.text).not.toContain("Cannot find package 'typescript'")
      expect(r.code).toBe(0)
    })
  }
  it('`convert` still reaches the compiler — and says so clearly', async () => {
    const r = await cli(root, 'convert', 't.tjs')
    expect(r.code).not.toBe(0)
    expect(r.text).toContain('typescript')
  })
})
