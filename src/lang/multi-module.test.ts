/**
 * Consuming SEVERAL TJS-derived libraries at once — the shape every real consumer has.
 *
 * Everything here was previously untested. `emitted-module-scope.test.ts` covers one emitted
 * file (its inline helpers must not collide with each other); nothing covered two files
 * loaded together, which is what happens the moment somebody imports two packages built with
 * this toolchain. The invariants below are load-bearing and several are non-obvious:
 *
 *   - each module carries its OWN `MonadicError` class, so anything crossing a module
 *     boundary must be duck-typed. `isMonadicError` is; `instanceof` would silently be false.
 *   - each module declares its own inline helpers at module top level, which is only safe
 *     because ES module scope is per-module.
 *   - two libraries may declare the same `Type` name with different shapes. There is no
 *     global registry, and there must not be one.
 *   - the flight recorder aggregates across modules regardless of install order, because
 *     the emitted `typeError` reads `globalThis.__tjs` at CALL time rather than capture time.
 *
 * Run in a real `node` subprocess, not in-process. Bun tolerates module-scope violations Node
 * rejects, and consumers are on Node — the same reason `emitted-module-scope.test.ts` shells
 * out for the two shapes that actually shipped broken.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { tjs } from './index'

let dir: string

/** A library with a named Type and a function validated against it. */
const lib = (suffix: string, shape: string) =>
  tjs(
    `
Type Shape${suffix} { example: ${shape} }
export function check${suffix}(u: Shape${suffix}) { return u }
export function num${suffix}(v: 0): 0 { return v }`,
    { runTests: false }
  ).code

/**
 * Run a script in real Node and return stdout AND stderr.
 *
 * Both streams, deliberately: the #23 warning is a `console.warn`, so a helper that returned
 * only stdout reported it missing — and reported it missing in the direction that makes the
 * guard look unnecessary rather than broken.
 */
const node = (name: string, src: string): string => {
  writeFileSync(join(dir, name), src)
  const r = spawnSync('node', [join(dir, name)], { encoding: 'utf8' })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-multimod-'))
  writeFileSync(join(dir, 'libA.mjs'), lib('A', "{ id: 0, label: '' }"))
  writeFileSync(join(dir, 'libB.mjs'), lib('B', "{ id: 0, label: '' }"))
  // Same Type NAME, incompatible shapes — the collision case.
  writeFileSync(join(dir, 'libC.mjs'), lib('', '{ id: 0 }'))
  writeFileSync(join(dir, 'libD.mjs'), lib('', "{ name: '' }"))
  // The runtime, bundled the way a consumer would get it.
  execFileSync(
    'bun',
    [
      'build',
      join(import.meta.dir, 'runtime.ts'),
      '--target=node',
      '--format=esm',
      '--outfile=' + join(dir, 'rt.mjs'),
    ],
    { stdio: 'ignore' }
  )
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('two emitted modules loaded together', () => {
  it('both load in Node and each validates independently', () => {
    const out = node(
      'both.mjs',
      `import { checkA, numA } from './libA.mjs'
import { checkB, numB } from './libB.mjs'
const eA = numA('nope'), eB = numB('nope')
console.log('loaded')
console.log('A errors:', eA?.name === 'MonadicError')
console.log('B errors:', eB?.name === 'MonadicError')
console.log('A ok:', checkA({ id: 1, label: 'x' })?.name !== 'MonadicError')
console.log('B ok:', checkB({ id: 1, label: 'x' })?.name !== 'MonadicError')
`
    )
    expect(out).toContain('loaded')
    expect(out).toContain('A errors: true')
    expect(out).toContain('B errors: true')
    expect(out).toContain('A ok: true')
    expect(out).toContain('B ok: true')
  })

  it('each module has its OWN MonadicError class, so identity must be duck-typed', () => {
    // Not a defect — separate module scopes are the whole reason the emitted output is safe
    // to load N times. It is recorded because it is exactly why `isMonadicError` checks
    // `name` and `'path' in v` instead of `instanceof`: an `instanceof` check would be
    // silently false for an error that crossed a module boundary, and the failure would look
    // like "the error vanished" rather than like a type-identity problem.
    const out = node(
      'ident.mjs',
      `import { numA } from './libA.mjs'
import { numB } from './libB.mjs'
const a = numA('x'), b = numB('x')
console.log('same class:', Object.getPrototypeOf(a) === Object.getPrototypeOf(b))
console.log('both named MonadicError:', a.name === 'MonadicError' && b.name === 'MonadicError')
`
    )
    expect(out).toContain('same class: false')
    expect(out).toContain('both named MonadicError: true')
  })

  it('the shared runtime recognises errors from every module', () => {
    const out = node(
      'cross.mjs',
      `import { installRuntime, isMonadicError } from './rt.mjs'
import { numA } from './libA.mjs'
import { numB } from './libB.mjs'
installRuntime()
console.log('A:', isMonadicError(numA('x')))
console.log('B:', isMonadicError(numB('x')))
`
    )
    expect(out).toContain('A: true')
    expect(out).toContain('B: true')
  })

  it('two libraries may declare the same Type name with different shapes', () => {
    // There is no global type registry and there must not be one: `const Shape = Type(...)`
    // is module-local. Two packages that happen to name a type the same thing are not each
    // other's problem, and a registry keyed by name would make them so.
    const out = node(
      'clash.mjs',
      `import { check as checkC } from './libC.mjs'
import { check as checkD } from './libD.mjs'
const err = (r) => r?.name === 'MonadicError'
console.log('C takes its own:', !err(checkC({ id: 1 })))
console.log('D takes its own:', !err(checkD({ name: 'x' })))
console.log('C rejects D-shaped:', err(checkC({ name: 'x' })))
console.log('D rejects C-shaped:', err(checkD({ id: 1 })))
`
    )
    expect(out).toContain('C takes its own: true')
    expect(out).toContain('D takes its own: true')
    expect(out).toContain('C rejects D-shaped: true')
    expect(out).toContain('D rejects C-shaped: true')
  })
})

describe('the flight recorder aggregates across modules', () => {
  // The emitted `typeError` reads `globalThis.__tjs` at CALL time, not at capture time, which
  // is what makes this work in BOTH orders. It matters because ES module imports are hoisted:
  // an app whose body calls `installRuntime()` runs it AFTER every imported library has
  // already evaluated, so a capture-time read would make the late case unreachable in
  // practice — which is the idiomatic shape, not an edge case.
  for (const [name, script] of [
    [
      'installed AFTER the libraries evaluate (idiomatic)',
      `import { installRuntime } from './rt.mjs'
import { numA } from './libA.mjs'
import { numB } from './libB.mjs'
installRuntime()
globalThis.__tjs.clearRecords()
numA('x'); numB('x')
console.log('records:', globalThis.__tjs.getRecordCount())
console.log('errors:', globalThis.__tjs.errors().length)`,
    ],
    [
      'installed BEFORE, via an import-order-first side effect',
      `import './install-first.mjs'
import { numA } from './libA.mjs'
import { numB } from './libB.mjs'
globalThis.__tjs.clearRecords()
numA('x'); numB('x')
console.log('records:', globalThis.__tjs.getRecordCount())
console.log('errors:', globalThis.__tjs.errors().length)`,
    ],
  ] as const) {
    it(`sees both modules' errors when ${name}`, () => {
      writeFileSync(
        join(dir, 'install-first.mjs'),
        `import { installRuntime } from './rt.mjs'\ninstallRuntime()\n`
      )
      const out = node(`rec-${name.slice(0, 8).replace(/\W/g, '')}.mjs`, script)
      expect(out).toContain('records: 2')
      expect(out).toContain('errors: 2')
    })
  }
})

describe('the late-configure warning (#23) fires for EVERY install form', () => {
  // It did not. `installRuntime()` installs the `runtime` singleton, which carried the BARE
  // `createRuntime`; only the object returned by `createRuntime()` had the capture-recording
  // wrapper. So `globalThis.__tjs = createRuntime()` warned and `installRuntime()` — the
  // primary documented form — was silent, on the exact path the warning exists for.
  //
  // A guard reachable through one of two documented routes is worse than no guard, because
  // the silence reads as "nothing to report". Both routes now share one function.
  for (const [form, install] of [
    ['installRuntime()', `installRuntime()`],
    [
      'globalThis.__tjs = createRuntime()',
      `globalThis.__tjs = createRuntime()`,
    ],
  ] as const) {
    it(`warns when the runtime is installed with ${form}`, () => {
      const out = node(
        `late-${form.slice(0, 6).replace(/\W/g, '')}.mjs`,
        `import { installRuntime, createRuntime, configure } from './rt.mjs'
${install}
await import('./libA.mjs')
configure({ throwTypeErrors: true })
console.log('done')
`
      )
      expect(out).toContain('done')
      expect(out).toContain('configure() was called after a converted module')
    })
  }

  it('does NOT warn when configure() precedes every module capture', () => {
    // The other direction: a warning that fires unconditionally is noise, and would train
    // people to ignore the one case that matters.
    const out = node(
      'early-cfg.mjs',
      `import { installRuntime, configure } from './rt.mjs'
installRuntime()
configure({ throwTypeErrors: true })
await import('./libA.mjs')
console.log('done')
`
    )
    expect(out).toContain('done')
    expect(out).not.toContain('configure() was called after')
  })
})
