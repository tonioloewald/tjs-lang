/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { execFileSync, spawnSync } from 'node:child_process'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

let dir

/* line 33 */
function lib(suffix, shape) {
  return tjs(
    `
Type Shape${suffix} { example: ${shape} }
export function check${suffix}(u: Shape${suffix}) { return u }
export function num${suffix}(v: 0): 0 { return v }`,
    { runTests: false }
  ).code
}
lib.__tjs = {
  params: {
    suffix: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    shape: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:33',
}

/* line 49 */
function node(name, src) {
  writeFileSync(join(dir, name), src)
  const r = spawnSync('node', [join(dir, name)], { encoding: 'utf8' })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`
}
node.__tjs = {
  params: {
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:49',
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-multimod-'))
  writeFileSync(join(dir, 'libA.mjs'), lib('A', "{ id: 0, label: '' }"))
  writeFileSync(join(dir, 'libB.mjs'), lib('B', "{ id: 0, label: '' }"))

  writeFileSync(join(dir, 'libC.mjs'), lib('', '{ id: 0 }'))
  writeFileSync(join(dir, 'libD.mjs'), lib('', "{ name: '' }"))

  execFileSync(
    'bun',
    [
      'build',
      join('/Users/tonioloewald/tjs-lang/src/lang', 'runtime.ts'),
      '--target=node',
      '--format=esm',
      '--outfile=' + join(dir, 'rt.mjs'),
    ],
    { stdio: 'ignore' }
  )
})
export {}

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('two emitted modules loaded together', () => {
  it('both load in Node and each validates independently', () => {
    const out = node(
      'both.mjs',
      `import { checkA, numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'
import { checkB, numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'
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
  it('every module resolves the SAME MonadicError, so instanceof works too', () => {
    const out = node(
      'ident.mjs',
      `import { numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'
import { numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'
const a = numA('x'), b = numB('x')
console.log('same class:', Object.getPrototypeOf(a) === Object.getPrototypeOf(b))
console.log('cross instanceof:', a instanceof b.constructor)
console.log('duck-typing still holds:', a.name === 'MonadicError' && 'path' in a)
`
    )
    expect(out).toContain('same class: true')
    expect(out).toContain('cross instanceof: true')
    expect(out).toContain('duck-typing still holds: true')
  })
  it('fusion survives bundling, where the duplication was worst', () => {
    writeFileSync(
      join(dir, 'entry.mjs'),
      `import { numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'\nimport { numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'\nexport const run = () => [numA('x'), numB('x')]\n`
    )
    spawnSync(
      'bunx',
      [
        'esbuild',
        join(dir, 'entry.mjs'),
        '--bundle',
        '--format=esm',
        '--outfile=' + join(dir, 'bundled.mjs'),
        '--log-level=error',
      ],
      { encoding: 'utf8' }
    )
    const out = node(
      'runbundle.mjs',
      `import { run } from '/Users/tonioloewald/tjs-lang/src/lang/bundled.mjs'
const [a, b] = run()
console.log('bundled same class:', Object.getPrototypeOf(a) === Object.getPrototypeOf(b))
`
    )
    expect(out).toContain('bundled same class: true')
  })
  it('the shared runtime recognises errors from every module', () => {
    const out = node(
      'cross.mjs',
      `import { installRuntime, isMonadicError } from '/Users/tonioloewald/tjs-lang/src/lang/rt.mjs'
import { numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'
import { numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'
installRuntime()
console.log('A:', isMonadicError(numA('x')))
console.log('B:', isMonadicError(numB('x')))
`
    )
    expect(out).toContain('A: true')
    expect(out).toContain('B: true')
  })
  it('two libraries may declare the same Type name with different shapes', () => {
    const out = node(
      'clash.mjs',
      `import { check as checkC } from '/Users/tonioloewald/tjs-lang/src/lang/libC.mjs'
import { check as checkD } from '/Users/tonioloewald/tjs-lang/src/lang/libD.mjs'
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
  for (const [name, script] of [
    [
      'installed AFTER the libraries evaluate (idiomatic)',
      `import { installRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/rt.mjs'
import { numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'
import { numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'
installRuntime()
globalThis.__tjs.clearRecords()
numA('x'); numB('x')
console.log('records:', globalThis.__tjs.getRecordCount())
console.log('errors:', globalThis.__tjs.errors().length)`,
    ],
    [
      'installed BEFORE, via an import-order-first side effect',
      `import './install-first.mjs'
import { numA } from '/Users/tonioloewald/tjs-lang/src/lang/libA.mjs'
import { numB } from '/Users/tonioloewald/tjs-lang/src/lang/libB.mjs'
globalThis.__tjs.clearRecords()
numA('x'); numB('x')
console.log('records:', globalThis.__tjs.getRecordCount())
console.log('errors:', globalThis.__tjs.errors().length)`,
    ],
  ]) {
    it(`sees both modules' errors when ${name}`, () => {
      writeFileSync(
        join(dir, 'install-first.mjs'),
        `import { installRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/rt.mjs'\ninstallRuntime()\n`
      )
      const out = node(`rec-${name.slice(0, 8).replace(/\W/g, '')}.mjs`, script)
      expect(out).toContain('records: 2')
      expect(out).toContain('errors: 2')
    })
  }
})

describe('the late-configure warning (#23) fires for EVERY install form', () => {
  for (const [form, install] of [
    ['installRuntime()', `installRuntime()`],
    [
      'globalThis.__tjs = createRuntime()',
      `globalThis.__tjs = createRuntime()`,
    ],
  ]) {
    it(`warns when the runtime is installed with ${form}`, () => {
      const out = node(
        `late-${form.slice(0, 6).replace(/\W/g, '')}.mjs`,
        `import { installRuntime, createRuntime, configure } from '/Users/tonioloewald/tjs-lang/src/lang/rt.mjs'
${install}
await import('/Users/tonioloewald/tjs-lang/src/lang/libA.mjs')
configure({ throwTypeErrors: true })
console.log('done')
`
      )
      expect(out).toContain('done')
      expect(out).toContain('configure() was called after a converted module')
    })
  }
  it('does NOT warn when configure() precedes every module capture', () => {
    const out = node(
      'early-cfg.mjs',
      `import { installRuntime, configure } from '/Users/tonioloewald/tjs-lang/src/lang/rt.mjs'
installRuntime()
configure({ throwTypeErrors: true })
await import('/Users/tonioloewald/tjs-lang/src/lang/libA.mjs')
console.log('done')
`
    )
    expect(out).toContain('done')
    expect(out).not.toContain('configure() was called after')
  })
})
