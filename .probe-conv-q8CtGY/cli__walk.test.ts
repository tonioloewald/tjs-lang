/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readFileSync,
  lstatSync,
} from 'node:fs'

import { tmpdir } from 'node:os'

import { join, basename } from 'node:path'

import {
  findFiles,
  shouldDescend,
  writeEmitted,
} from '/Users/tonioloewald/tjs-lang/src/cli/walk'

const roots = []

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/* line 35 */
function tree() {
  const root = mkdtempSync(join(tmpdir(), 'tjs-walk-'))
  roots.push(root)
  return root
}
tree.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:35',
}

/* line 41 */
function isTjs(n) {
  return n.endsWith('.tjs')
}
isTjs.__tjs = {
  params: {
    n: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:41',
}

/* line 45 */
function names(fs) {
  return fs.map((f) => basename(f)).sort()
}
names.__tjs = {
  params: {
    fs: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:45',
}

describe('findFiles', () => {
  it('finds files recursively', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'b.tjs'), '')
    writeFileSync(join(root, 'sub', 'c.txt'), '')
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs', 'b.tjs'])
  })
  it('skips node_modules and dot-directories', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    for (const d of ['node_modules', '.git', '.hidden']) {
      mkdirSync(join(root, d))
      writeFileSync(join(root, d, 'skip.tjs'), '')
    }
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })
  it('a DANGLING symlink does not abort the walk', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    symlinkSync(join(root, 'gone.tjs'), join(root, 'dangling.tjs'))

    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })
  it('does not follow a symlinked DIRECTORY out of the tree', () => {
    const root = tree()
    const outside = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    writeFileSync(join(outside, 'elsewhere.tjs'), '')
    symlinkSync(outside, join(root, 'link'))

    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })
  it('a symlink CYCLE terminates', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    symlinkSync(root, join(root, 'cycle'))

    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })
  it('DOES collect a symlink to a real file', () => {
    const root = tree()
    const outside = tree()
    writeFileSync(join(outside, 'target.tjs'), '')
    symlinkSync(join(outside, 'target.tjs'), join(root, 'linked.tjs'))
    expect(names(findFiles(root, isTjs))).toEqual(['linked.tjs'])
  })
  it('matches on the BASENAME, not the path', () => {
    const root = tree()
    mkdirSync(join(root, 'stuff.tjs'))
    writeFileSync(join(root, 'stuff.tjs', 'inner.js'), '')
    expect(findFiles(root, isTjs)).toEqual([])
  })
})

describe('shouldDescend', () => {
  it('is the one policy the three walks share', () => {
    expect(shouldDescend('src')).toBe(true)
    expect(shouldDescend('node_modules')).toBe(false)
    expect(shouldDescend('.git')).toBe(false)
    expect(shouldDescend('.')).toBe(false)
  })
})

describe('emit and convert survive symlinks', () => {
  const CLI = join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts')
  async function run(cmd, ...args) {
    const proc = Bun.spawn(['bun', CLI, cmd, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { code: await proc.exited, text: out + err }
  }
  const SRC = `function ok(x: 1):! 0 { return x }\n`
  it('a dangling link does not abort emit, and siblings still emit', async () => {
    const root = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    symlinkSync(join(root, 'gone.tjs'), join(root, 'dangling.tjs'))
    const out = join(tree(), 'out')
    const r = await run('emit', root, '-o', out, '-r')
    expect(r.text).not.toContain('ENOENT')
    expect(existsSync(join(out, 'good.js'))).toBe(true)
  })
  it('emit does not descend a symlinked directory out of the tree', async () => {
    const root = tree()
    const outside = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    mkdirSync(join(outside, 'secret'))
    writeFileSync(join(outside, 'secret', 'secret.tjs'), SRC)
    symlinkSync(join(outside, 'secret'), join(root, 'link'))
    const out = join(tree(), 'out')
    await run('emit', root, '-o', out, '-r')
    expect(existsSync(join(out, 'good.js'))).toBe(true)
    expect(existsSync(join(out, 'link', 'secret.js'))).toBe(false)
  })
  it('a symlink cycle terminates instead of writing 33 nested copies', async () => {
    const root = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    symlinkSync(root, join(root, 'cycle'))
    const out = join(tree(), 'out')
    const r = await run('emit', root, '-o', out, '-r')
    expect(r.text).not.toContain('ELOOP')
    expect(existsSync(join(out, 'cycle', 'cycle', 'good.js'))).toBe(false)
  })
  it('convert skips node_modules and dot-directories', async () => {
    const root = tree()
    writeFileSync(join(root, 'a.ts'), `export const x: number = 1\n`)
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(
      join(root, 'node_modules', 'dep', 'b.ts'),
      `export const y = 2\n`
    )
    const out = join(tree(), 'out')
    await run('convert', root, '-o', out, '-r')
    expect(existsSync(join(out, 'node_modules'))).toBe(false)
  })
})
export {}

describe('writeEmitted', () => {
  it('re-attaches the hashbang, and only when there is one', () => {
    const root = tree()
    const withBang = join(root, 'a.js')
    writeEmitted(withBang, 'console.log(1)\n', '#!/usr/bin/env node')
    expect(readFileSync(withBang, 'utf8')).toBe(
      '#!/usr/bin/env node\nconsole.log(1)\n'
    )
    const without = join(root, 'b.js')
    writeEmitted(without, 'console.log(1)\n')
    expect(readFileSync(without, 'utf8')).toBe('console.log(1)\n')
  })
  it('does NOT write through a symlink — the target survives', () => {
    const root = tree()
    const target = join(root, 'precious.txt')
    writeFileSync(target, 'DO NOT LOSE ME')
    const link = join(root, 'out.js')
    symlinkSync(target, link)
    writeEmitted(link, 'console.log(1)\n')
    expect(readFileSync(target, 'utf8')).toBe('DO NOT LOSE ME')
    expect(readFileSync(link, 'utf8')).toBe('console.log(1)\n')
    expect(lstatSync(link).isSymbolicLink()).toBe(false)
  })
  it('refuses to write outside the named root through a symlinked DIRECTORY', () => {
    const root = tree()
    const outside = tree()
    const victim = join(outside, 'b.js')
    writeFileSync(victim, 'DO NOT LOSE ME')
    mkdirSync(join(root, 'out'))
    symlinkSync(outside, join(root, 'out', 'sub'))
    expect(() =>
      writeEmitted(
        join(root, 'out', 'sub', 'b.js'),
        'transpiled\n',
        undefined,
        join(root, 'out')
      )
    ).toThrow(/refusing to write outside/)
    expect(readFileSync(victim, 'utf8')).toBe('DO NOT LOSE ME')
  })
  it('ALLOWS a symlinked output root — that is a legitimate setup', () => {
    const real = tree()
    const root = tree()
    const link = join(root, 'dist')
    symlinkSync(real, link)
    writeEmitted(join(link, 'a.js'), 'x\n', undefined, link)
    expect(readFileSync(join(real, 'a.js'), 'utf8')).toBe('x\n')
  })
  it('creates the output directory', () => {
    const root = tree()
    const deep = join(root, 'a', 'b', 'c.js')
    writeEmitted(deep, 'x\n')
    expect(readFileSync(deep, 'utf8')).toBe('x\n')
  })
})
