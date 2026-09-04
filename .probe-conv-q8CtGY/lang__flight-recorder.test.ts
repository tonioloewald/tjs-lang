/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  clearRecords,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const g = globalThis

describe('flight recorder: emitted code', () => {
  let saved
  beforeEach(() => {
    saved = g.__tjs
  })
  afterEach(() => {
    g.__tjs = saved
  })

  const SRC = `function greet(name: 'World'): 'Hello, World!' { return \`Hello, \${name}!\` }`
  it('records type errors from emitted code running on the SHARED runtime', () => {
    const rt = createRuntime()
    g.__tjs = { ...rt, createRuntime, record: rt.record, records: rt.records }
    clearRecords()
    const mod = new Function(tjs(SRC).code + '\nreturn greet')()
    mod(42)
    const found = rt.records({ source: 'type' })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].error?.path).toContain('greet.name')
  })
  it('records type errors from STANDALONE emitted code once a runtime exists', () => {
    delete g.__tjs
    const mod = new Function(tjs(SRC).code + '\nreturn greet')()

    expect(typeof mod(42)).toBe('object')

    const rt = createRuntime()
    g.__tjs = { record: rt.record, records: rt.records }
    mod(43)
    const found = rt.records({ source: 'type' })
    expect(found).toHaveLength(1)
    expect(found[0].error?.path).toContain('greet.name')
  })
  it('a broken global __tjs cannot break the program it is recording', () => {
    delete g.__tjs
    const mod = new Function(tjs(SRC).code + '\nreturn greet')()
    g.__tjs = {
      record() {
        throw new Error('the recorder is on fire')
      },
    }

    const result = mod(42)
    expect(result?.path).toContain('greet.name')
    expect(mod('Alice')).toBe('Hello, Alice!')
  })
  it('emits the runtime core exactly once even when several helpers need it', () => {
    const src = `
      function apply(! cb: (x: 0) => 0, obj) { return obj!.a }
      function greet(name: 'World'): 'Hi World' { return \`Hi \${name}\` }
    `
    const code = tjs(src).code
    expect(code.match(/class MonadicError/g) ?? []).toHaveLength(1)
    expect(() => new Function(code)).not.toThrow()
  })
})
