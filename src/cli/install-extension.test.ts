/**
 * The editor installer is destructive, public, and now tested.
 *
 * `bin/install-editor-extension.sh` runs `rm -rf` under `$HOME`, ships as two public bins
 * (`ajs-install-vscode`, `ajs-install-cursor`), and had no automated coverage at all — its
 * eight paths were exercised by hand once, in the session that wrote it. Hand-verification
 * does not survive the next edit, and the next edit to a script that deletes directories in
 * a user's home is exactly the one you want a gate on.
 *
 * Every case runs against a `mkdtempSync` directory standing in for the extensions folder,
 * so nothing here can touch a real editor install.
 *
 * The symlink cases are the point. `[ -d ]` is true for a symlink-to-directory, so the
 * original script silently replaced a developer's linked checkout with a frozen copy — the
 * source survived, live edits stopped appearing, and there was no error to explain it.
 */
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
  import.meta.dir,
  '..',
  '..',
  'bin',
  'install-editor-extension.sh'
)
const SOURCE = join(import.meta.dir, '..', '..', 'editors', 'vscode')

/** The installed directory name is derived from the manifest, so read it the same way. */
const manifest = JSON.parse(
  readFileSync(join(SOURCE, 'package.json'), 'utf8')
) as { name: string; version: string }
const TARGET = `${manifest.name}-${manifest.version}`

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function extDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tjs-ext-'))
  dirs.push(d)
  return d
}

/**
 * A THROWAWAY copy of `editors/vscode` to aim the symlink tests at.
 *
 * Those tests link a directory in and then make the installer delete the link — and the
 * property under test is precisely that it deletes the LINK and not what the link points
 * at. Pointing them at the live working tree meant the one bug they exist to catch would
 * destroy `editors/vscode` on the way to reporting itself, and the assertion that says
 * "the thing that must never be deleted" runs after the deletion, not instead of it.
 *
 * A copy proves the same property and cannot cost anything. Read-only uses of `SOURCE`
 * (reading the manifest) stay as they are.
 */
function sourceCopy(): string {
  const d = mkdtempSync(join(tmpdir(), 'tjs-ext-src-'))
  dirs.push(d)
  const inner = join(d, 'vscode')
  cpSync(SOURCE, inner, { recursive: true })
  return inner
}

async function run(ext: string, ...flags: string[]) {
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
    // The case that motivated the rewrite: `[ -d ]` is true for a symlink-to-dir, so a
    // dev install was silently swapped for a frozen copy.
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
    // The thing that must never be deleted. It is a COPY, so a regression here reports
    // itself instead of taking `editors/vscode` with it.
    expect(existsSync(join(src, 'package.json'))).toBe(true)
  })

  it('reports an older install rather than deleting it', async () => {
    // It cannot prove it created that directory, so it must not remove it.
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
    // The link target — a COPY, so a regression reports itself rather than taking
    // `editors/vscode` with it.
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
    // The wrong-directory scenario. With an empty second argument the script must stop
    // before it computes any path to delete.
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
