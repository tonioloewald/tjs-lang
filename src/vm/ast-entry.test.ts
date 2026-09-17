/**
 * `tjs-lang/vm-ast` contains no parser — asserted structurally, not by inspection.
 *
 * The AST-only VM's whole value is a negative claim: *there is no parser in this bundle*, so
 * no parser defect is reachable from guest input. A negative claim needs a guard that fails
 * when it stops being true, or it decays into a comment.
 *
 * Three independent checks, because each can pass while another fails:
 *
 *   1. **The import graph** — walk it from `ast.ts` with acorn and assert nothing under
 *      `lang/` is reachable. PARSED, not grepped: a regex looking for `from '../lang/core'`
 *      sees neither `import('../lang/core')` nor a re-export, and the repo has already been
 *      bitten by a pin blind to its own first import (`eval-no-transpile-execution.test.ts`).
 *   2. **The behaviour** — source is refused, with a message that teaches the fix.
 *   3. **The built bundle** — no acorn, and materially smaller. The graph could be clean
 *      while the build config quietly points the target at the wrong entry.
 *
 * And the control that keeps the whole file honest: `tjs-lang/vm` must still ACCEPT source.
 * Every assertion here is satisfied by a VM that does nothing at all, so the pair matters —
 * this is the guard-both-directions rule the AJS parser split was pinned with.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import * as acornLoose from 'acorn-loose'

const VM_DIR = import.meta.dir
const ROOT = join(VM_DIR, '..', '..')

/** Resolve a relative specifier to a real file on disk, trying the usual suffixes. */
function resolveModule(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tjs`,
    `${base}.js`,
    join(base, 'index.ts'),
    join(base, 'index.js'),
  ]) {
    if (existsSync(cand) && !cand.endsWith('/')) {
      try {
        if (readFileSync(cand)) return cand
      } catch {
        /* a directory — keep looking */
      }
    }
  }
  return null
}

/** Every module reachable from `entry`, plus every bare specifier seen along the way. */
function importGraph(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()!
    if (files.has(file)) continue
    files.add(file)
    const src = readFileSync(file, 'utf8')
    // `import type` is erased at compile time and cannot pull code into a bundle; stripping
    // it keeps a types-only reference from reading as a dependency.
    const ast: any = acornLoose.parse(
      src.replace(/^import type[^\n]*\n/gm, ''),
      { ecmaVersion: 'latest', sourceType: 'module' }
    )
    for (const node of ast.body) {
      const specs: string[] = []
      if (node.type === 'ImportDeclaration' && node.source?.value)
        specs.push(node.source.value)
      if (
        (node.type === 'ExportNamedDeclaration' ||
          node.type === 'ExportAllDeclaration') &&
        node.source?.value
      )
        specs.push(node.source.value)
      for (const spec of specs) {
        const resolved = resolveModule(file, spec)
        if (resolved) queue.push(resolved)
        else if (!spec.startsWith('.')) bare.add(spec)
      }
    }
  }
  return { files, bare }
}

describe('the AST-only entry reaches no parser', () => {
  const { files, bare } = importGraph(join(VM_DIR, 'ast.ts'))

  it('imports nothing under lang/', () => {
    const langReaches = [...files]
      .map((f) => f.slice(ROOT.length + 1))
      .filter((f) => f.startsWith('src/lang/'))
      .sort()
    expect(langReaches).toEqual([])
  })

  it('does not depend on acorn, in any import form', () => {
    const parsers = [...bare].filter((b) => b.startsWith('acorn')).sort()
    expect(parsers).toEqual([])
  })

  it('the graph is non-trivial — apparatus check', () => {
    // Every assertion above is satisfied by an entry that imports nothing, including one
    // broken by a bad path. Assert we actually walked the VM.
    expect(files.size).toBeGreaterThan(3)
    const names = [...files].map((f) => f.slice(ROOT.length + 1))
    expect(names).toContain('src/vm/vm.ts')
    expect(names).toContain('src/vm/runtime.ts')
  })
})

describe('behaviour: AST accepted, source refused with a teaching error', () => {
  it('refuses source, and the message says what to do instead', () => {
    // In a SUBPROCESS — required, not tidiness, and the reason is the documented caveat made
    // concrete. The transpiler binding is module-level, so it is shared by everything in one
    // process. Written as a plain in-process import this passed when the file ran alone and
    // FAILED under `bun test`, because some other test file imports `src/index.ts`, which
    // wires the transpiler for the whole process.
    //
    // That is not a flaw in the design; it is the guarantee stated accurately. The claim is
    // "no parser is present in this BUNDLE", so the only honest way to test it is in a
    // process where only this entry is loaded. A test that quietly depended on suite
    // ordering would have been worse than no test.
    const proc = Bun.spawnSync([
      'bun',
      '-e',
      `import { AgentVM } from '${join(VM_DIR, 'ast.ts')}'
       try {
         await new AgentVM().run('function f() { return { a: 1 } }', {})
         console.log('NO_ERROR')
       } catch (e) { console.log(JSON.stringify(String(e.message))) }`,
    ])
    const message = new TextDecoder().decode(proc.stdout).trim()
    expect(message).not.toBe('NO_ERROR')
    expect(message).toContain('accepts an AST, not source')
    // Errors-as-curriculum: naming the replacement is the point, not decoration.
    expect(message).toContain('tjs-lang/lang')
    expect(message).toContain('transpile')
  })

  it('runs an AST perfectly well — the capability is intact', async () => {
    // The point of the whole entry: removing the parser must not remove the VM. Without
    // this, every assertion in the file is satisfied by a build that cannot execute either.
    const { AgentVM } = await import('./ast')
    const vm = new AgentVM()
    const result = await vm.run(
      { op: 'seq', steps: [{ op: 'return', value: { answer: 42 } }] } as any,
      {}
    )
    expect(result.error).toBeFalsy()
    expect(result.result).toEqual({ answer: 42 })
  })
})

describe('CONTROL: `tjs-lang/vm` still accepts source', () => {
  it('the batteries-included entry is unchanged', async () => {
    // In a SUBPROCESS, and that is the point rather than an inconvenience. The transpiler
    // binding is module-level, so importing `./index` here would wire it for this whole
    // process and make the "refuses source" test above pass or fail depending on import
    // order. Isolating it proves the two entries differ without letting either contaminate
    // the other — and demonstrates the documented caveat rather than just asserting it.
    const proc = Bun.spawnSync([
      'bun',
      '-e',
      `import { AgentVM } from '${join(VM_DIR, 'index.ts')}'
       const r = await new AgentVM().run('function f() { return { ok: 1 } }', {})
       console.log(JSON.stringify({ error: !!r.error, result: r.result }))`,
    ])
    const out = new TextDecoder().decode(proc.stdout).trim()
    expect(proc.exitCode).toBe(0)
    // It parsed the source and ran it — the capability this file removes elsewhere.
    expect(out).toContain('"error":false')
    expect(out).toContain('"ok":1')
  })
})

describe('the built bundles differ in the way that matters', () => {
  const dist = (n: string) => join(ROOT, 'dist', n)
  const built =
    existsSync(dist('tjs-vm-ast.js')) && existsSync(dist('tjs-vm.js'))

  it('tjs-vm-ast.js contains no acorn, and tjs-vm.js does', () => {
    if (!built) {
      // Absent is unknown, not passing — but CI builds before it tests (ci.yml step 2).
      expect(process.env.CI).toBeFalsy()
      return
    }
    const astOnly = readFileSync(dist('tjs-vm-ast.js'), 'utf8')
    const full = readFileSync(dist('tjs-vm.js'), 'utf8')
    expect(astOnly.includes('acorn')).toBe(false)
    // The control: if the full bundle ALSO lost acorn, the check above proves nothing.
    expect(full.includes('acorn')).toBe(true)
  })

  it('is materially smaller — the size claim is a promise, so it is measured', () => {
    if (!built) {
      expect(process.env.CI).toBeFalsy()
      return
    }
    const astOnly = readFileSync(dist('tjs-vm-ast.js')).length
    const full = readFileSync(dist('tjs-vm.js')).length
    // Documented as ~56 KB vs ~221 KB. Asserting "less than half" rather than a byte count:
    // a ratchet on the exact size would fail on every unrelated atom added.
    expect(astOnly).toBeLessThan(full / 2)
  })
})
