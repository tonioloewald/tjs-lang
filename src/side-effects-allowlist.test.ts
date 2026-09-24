/**
 * `package.json` `sideEffects` is DERIVED from the source, not reviewed by eye.
 *
 * ## Why this is a guard and not a list someone keeps up to date
 *
 * `sideEffects` is an explicit allowlist, so everything it does NOT name is asserted pure. A
 * bundler honouring it may skip evaluating a module whose exports go unused — which is
 * precisely a module imported only for its wiring. The failure then appears only in a
 * consumer's production bundle, which no test in this repo runs.
 *
 * The 0.14.0 review found the list naming one module (`schema/index.ts`) while that release
 * added module-scope `setTranspiler(…)` to three more — `src/index.ts`, `src/vm/index.ts`,
 * `src/lang/eval.ts` — so a consumer could get a `tjs-lang/vm` that throws "This VM accepts
 * an AST, not source". Deriving the list (rather than adding three paths) found a FOURTH the
 * review had missed: `tjs-lang/bun-plugin`, whose entire purpose is the effect and whose
 * documented usage — `import 'tjs-lang/bun-plugin'`, no bindings — is exactly the import an
 * allowlist lets a bundler drop.
 *
 * ## The rule
 *
 * A module-scope CALL STATEMENT (a call at column 0, after literals are masked) is a side
 * effect, and its file must be listed — plus, when that file is a package entry, the `dist`
 * bundle built from it. The scan runs over `maskLiterals` output because several files hold
 * code INSIDE template literals (`lang/differences.ts` is a table of programs); matching raw
 * text would report those as effects. That is the literal-blindness class this repo keeps
 * writing postmortems about.
 *
 * Files that do have a module-scope call and are deliberately NOT listed sit in EXEMPT, each
 * with its reason. An exemption with no reason is a silent hole.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { maskLiterals } from './strip-comments'

const ROOT = join(import.meta.dir, '..')
const SRC = join(ROOT, 'src')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const listed = new Set<string>(pkg.sideEffects)

const EXEMPT: Record<string, string> = {
  'src/types/predicate-brand.ts':
    '`setPrototypeOf` on its OWN class, plus a global-slot claim — both exist only to serve ' +
    "the module's exports, so dropping the module when nothing imports them loses nothing",
  'src/vm/atoms/browser.ts':
    'six `defineAtom` calls whose results are DISCARDED — `defineAtom` registers nothing, ' +
    'so these atoms are unreachable dead code (tracked in TODO.md). Dropping it is harmless',
  'src/import-resolver/worker.ts':
    'a service-worker SCRIPT shipped as a raw asset (`dist/import-resolver-worker.js`), ' +
    'loaded by `navigator.serviceWorker.register`, never through a consumer bundler',
}
// Two more were exempted on the first draft — `rbac/index.ts` and `inference.types.ts` — from
// a raw `grep`. Both "effects" sit inside comments or literals; the masked scan correctly
// ignores them, and the stale-exemption test below caught the draft. Kept as a note because
// it is the literal-blindness class catching its own author.

/** CLI binaries run as programs, not imported as modules, so tree-shaking never sees them. */
const PROGRAM_DIRS = ['src/cli/']

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) tsFiles(full, out)
    else if (
      name.endsWith('.ts') &&
      !name.includes('.test.') &&
      !name.includes('.bench.') &&
      !name.endsWith('.d.ts')
    )
      out.push(full)
  }
  return out
}

/** Column-0 call statements in the MASKED source — code inside a literal cannot match. */
function moduleScopeCalls(src: string): string[] {
  const masked = maskLiterals(src)
  return masked
    .split('\n')
    .filter((line) => /^(?:await\s+|void\s+)?[A-Za-z_$][\w$.]*\s*\(/.test(line))
    .filter(
      (line) =>
        !/^(?:if|for|while|switch|function|return|export|import|describe|it|test)\b/.test(
          line
        )
    )
}

describe('sideEffects is derived, not remembered', () => {
  const effectful = new Map<string, string[]>()
  for (const file of tsFiles(SRC)) {
    const rel = relative(ROOT, file)
    if (PROGRAM_DIRS.some((d) => rel.startsWith(d))) continue
    const calls = moduleScopeCalls(readFileSync(file, 'utf8'))
    if (calls.length) effectful.set(rel, calls)
  }

  it('apparatus check: the scan finds the effects it must, and is blind to literals', () => {
    // A scan that finds nothing passes every assertion below vacuously.
    expect(effectful.has('src/vm/index.ts')).toBe(true)
    expect(effectful.has('src/schema/index.ts')).toBe(true)
    // `differences.ts` holds programs inside template literals. Raw-text matching reported
    // `console.log(…)` lines from them as module-scope effects; masking must hide them.
    expect(effectful.has('src/lang/differences.ts')).toBe(false)
  })

  it('every module with a module-scope call is listed, or exempt WITH a reason', () => {
    const unlisted = [...effectful.keys()].filter(
      (rel) => !listed.has(`./${rel}`) && !EXEMPT[rel]
    )
    // A new wiring module lands here by name. List it (and its dist bundle), or exempt it
    // with the reason dropping it is harmless.
    expect(unlisted).toEqual([])
  })

  it('every listed source entry also lists the dist bundle consumers actually import', () => {
    // Consumers outside Bun resolve the `default` condition, i.e. the bundle. Listing only
    // the source protects Bun users and nobody else.
    const missing: string[] = []
    for (const [sub, target] of Object.entries<any>(pkg.exports)) {
      if (typeof target !== 'object' || !target?.bun || !target?.default)
        continue
      if (listed.has(target.bun) && !listed.has(target.default))
        missing.push(`${sub}: ${target.default}`)
    }
    expect(missing).toEqual([])
  })

  it('no listed path is stale — every entry names a file that exists or will be built', () => {
    // An allowlist entry for a moved file is a silent no-op, and the module it meant to
    // protect is back to "asserted pure".
    const stale = [...listed].filter((p) => {
      if (p.startsWith('./dist/')) {
        // Built output: it must at least be what some export's `default` points at.
        return !Object.values<any>(pkg.exports).some(
          (t) => typeof t === 'object' && t?.default === p
        )
      }
      try {
        statSync(join(ROOT, p))
        return false
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })

  it('no exemption is stale — an exempt file must still have the effect it excuses', () => {
    const dead = Object.keys(EXEMPT).filter((rel) => !effectful.has(rel))
    expect(dead).toEqual([])
  })
})
