/**
 * The `tjs` binary must RUN for a consumer who has no TypeScript compiler.
 *
 * `src/index-tsfree.test.ts` guards this for the LIBRARY entry, after snowfox hit it in
 * production. The CLI entry — a published `bin`, shipped as raw `src` — had no equivalent
 * guard and had exactly the same defect: `src/cli/tjs.ts` statically imported
 * `./commands/convert`, which reaches `emitters/from-ts`, which statically imports
 * `typescript`. That is a **devDependency**.
 *
 * So every command died at entry:
 *
 *     $ tjs check t.tjs
 *     error: Cannot find package 'typescript' from '…/src/lang/emitters/from-ts.ts'
 *     $ tjs --help
 *     error: Cannot find package 'typescript' from '…'
 *
 * `--help` and `--version` touch no TypeScript whatsoever.
 *
 * ## Why this runs the CLI instead of inspecting a bundle
 *
 * The library guard bundles its entry and asserts `typescript` never appears. That works
 * there because the main entry genuinely never reaches `from-ts`. It does NOT work here:
 * `convert` is still reachable, just lazily, and `esbuild --bundle` inlines dynamic
 * imports into the same file — so the specifier appears either way and the assertion
 * cannot tell eager from lazy. A first version of this test did exactly that and failed
 * against the fixed code.
 *
 * So it does the only thing that distinguishes them: it EXECUTES the CLI with `typescript`
 * unreachable. Runtime is the property under test.
 *
 * (And a first attempt at the fixture SYMLINKED `src` into the clean directory, so Bun
 * resolved `typescript` from the real repo's `node_modules` and everything passed. The
 * copy below is deliberate — resolution has to happen from the consumer's tree or the
 * fixture proves nothing.)
 */
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

const REPO = join(import.meta.dir, '..', '..')
/** The four packages a real consumer actually installs. */
const RUNTIME_DEPS = ['acorn', 'acorn-loose', 'acorn-walk', 'tosijs-schema']

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/**
 * A consumer tree: our `src` copied in, and a `node_modules` containing ONLY the runtime
 * dependencies — symlinked from the repo so this costs no install.
 */
function consumerTree(): string {
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

async function cli(root: string, ...args: string[]) {
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

describe('the tjs CLI runs without the TypeScript compiler', () => {
  const root = consumerTree()

  it('the fixture really lacks typescript (apparatus check)', () => {
    // If `typescript` were resolvable here, every assertion below would pass for the
    // wrong reason — which is exactly how the first version of this fixture failed.
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
    // The other direction. Making the CLI ts-free by DELETING `convert` would satisfy
    // every assertion above while removing a documented command. `convert` genuinely
    // needs TypeScript, so it must fail here — but only when actually invoked, and with
    // a message naming the missing package.
    const r = await cli(root, 'convert', 't.tjs')
    expect(r.code).not.toBe(0)
    expect(r.text).toContain('typescript')
  })
})
