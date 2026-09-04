/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  readFileSync,
  cpSync,
} from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

const SCRIPT = join(
  '/Users/tonioloewald/tjs-lang/src/cli',
  '..',
  '..',
  'bin',
  'install-editor-extension.sh'
)
export {}

const SOURCE = join(
  '/Users/tonioloewald/tjs-lang/src/cli',
  '..',
  '..',
  'editors',
  'vscode'
)
export {}

const manifest = JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8'))

const TARGET = `${manifest.name}-${manifest.version}`

const dirs = []

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/* line 52 */
function extDir() {
  const d = mkdtempSync(join(tmpdir(), 'tjs-ext-'))
  dirs.push(d)
  return d
}
extDir.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:52',
}

/* line 70 */
function sourceCopy() {
  const d = mkdtempSync(join(tmpdir(), 'tjs-ext-src-'))
  dirs.push(d)
  const inner = join(d, 'vscode')
  cpSync(SOURCE, inner, { recursive: true })
  return inner
}
sourceCopy.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:70',
}

/* line 78 */
async function run(ext, ...flags) {
  const proc = Bun.spawn(['bash', SCRIPT, 'TestEditor', ext, ...flags], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code: await proc.exited, text: out + err }
}
run.__tjs = {
  params: {
    ext: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    flags: {
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
  source: 'input.ts:78',
}

describe('installing', () => {
  it('installs into a directory named from the manifest', async () => {
    const ext = extDir()
    const r = await run(ext)
    expect(r.code).toBe(0)
    expect(existsSync(join(ext, TARGET, 'package.json'))).toBe(true)
  })
  it('replaces a previous real install', async () => {
    const ext = extDir()
    await run(ext)
    writeFileSync(join(ext, TARGET, 'stale.txt'), 'old')
    const r = await run(ext)
    expect(r.code).toBe(0)
    expect(existsSync(join(ext, TARGET, 'stale.txt'))).toBe(false)
  })
  it('REFUSES to replace a symlink without --force', async () => {
    const ext = extDir()
    const src = sourceCopy()
    symlinkSync(src, join(ext, TARGET))
    const r = await run(ext)
    expect(r.code).toBe(1)
    expect(r.text).toContain('Refusing to replace a SYMLINK')
    expect(lstatSync(join(ext, TARGET)).isSymbolicLink()).toBe(true)
  })
  it('--force replaces it, and the link TARGET survives', async () => {
    const ext = extDir()
    const src = sourceCopy()
    symlinkSync(src, join(ext, TARGET))
    const r = await run(ext, '--force')
    expect(r.code).toBe(0)
    expect(lstatSync(join(ext, TARGET)).isSymbolicLink()).toBe(false)

    expect(existsSync(join(src, 'package.json'))).toBe(true)
  })
  it('reports an older install rather than deleting it', async () => {
    const ext = extDir()
    const legacy = join(ext, 'tosijs-ajs-0.1.0')
    mkdirSync(legacy, { recursive: true })
    const r = await run(ext)
    expect(r.text).toContain('older install is still present')
    expect(existsSync(legacy)).toBe(true)
  })
})

describe('uninstalling', () => {
  it('removes a real install', async () => {
    const ext = extDir()
    await run(ext)
    const r = await run(ext, '--uninstall')
    expect(r.code).toBe(0)
    expect(existsSync(join(ext, TARGET))).toBe(false)
  })
  it('removes only the LINK, never its target', async () => {
    const ext = extDir()
    const src = sourceCopy()
    symlinkSync(src, join(ext, TARGET))
    const r = await run(ext, '--uninstall')
    expect(r.code).toBe(0)
    expect(existsSync(join(ext, TARGET))).toBe(false)

    expect(existsSync(join(src, 'package.json'))).toBe(true)
  })
  it('says so when there is nothing installed', async () => {
    const r = await run(extDir(), '--uninstall')
    expect(r.code).toBe(0)
    expect(r.text).toContain('Nothing installed')
  })
})

describe('refusing bad input', () => {
  it('an empty extensions directory is a usage error, not an rm -rf', async () => {
    const proc = Bun.spawn(['bash', SCRIPT, 'TestEditor', ''], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const text = await new Response(proc.stderr).text()
    expect(await proc.exited).toBe(2)
    expect(text).toContain('Usage:')
  })
  it('an unknown flag is rejected', async () => {
    const r = await run(extDir(), '--wipe-everything')
    expect(r.code).toBe(2)
    expect(r.text).toContain('Unknown option')
  })
})
