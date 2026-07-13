/**
 * The flight recorder, end to end.
 *
 * runtime.test.ts covers the ring itself. This file covers the part that is
 * easy to get wrong and impossible to notice: whether records from *emitted
 * code* actually reach the black box. Emitted modules take one of two paths —
 * `globalThis.__tjs.createRuntime()` (shared runtime installed) or an inlined
 * fallback runtime (standalone) — and a recorder that only works on one of them
 * is a plane with a black box in some of the seats.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { tjs } from './index'
import { createRuntime, records, clearRecords } from './runtime'

const g = globalThis as any

describe('flight recorder: emitted code', () => {
  let saved: any

  beforeEach(() => {
    saved = g.__tjs
  })
  afterEach(() => {
    g.__tjs = saved
  })

  // Signature-consistent: the return example IS the result for the example input,
  // so the transpile-time signature test passes.
  const SRC = `function greet(name: 'World'): 'Hello, World!' { return \`Hello, \${name}!\` }`

  it('records type errors from emitted code running on the SHARED runtime', () => {
    const rt = createRuntime()
    g.__tjs = { ...rt, createRuntime, record: rt.record, records: rt.records }
    clearRecords()

    const mod = new Function(tjs(SRC).code + '\nreturn greet')()
    mod(42) // wrong type — returns a MonadicError nobody checks

    const found = rt.records({ source: 'type' })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].error?.path).toContain('greet.name')
  })

  it('records type errors from STANDALONE emitted code once a runtime exists', () => {
    // The module loads with NO shared runtime, so it inlines its own fallback
    // runtime and keeps it for the life of the module.
    delete g.__tjs
    const mod = new Function(tjs(SRC).code + '\nreturn greet')()

    // It still works standalone — no runtime, no recording, no crash.
    expect(typeof mod(42)).toBe('object')

    // Now a runtime shows up (a later import, a devtools hook, another module).
    // The fallback reads globalThis.__tjs at CALL time, so it starts reporting.
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

    // Still returns its MonadicError. The recorder failed; the program did not.
    const result: any = mod(42)
    expect(result?.path).toContain('greet.name')
    expect(mod('Alice')).toBe('Hello, Alice!')
  })

  it('emits the runtime core exactly once even when several helpers need it', () => {
    // checkFnShape and bang each used to inline their own copy of
    // `class MonadicError`. Two copies in one scope is a SyntaxError.
    const src = `
      function apply(! cb: (x: 0) => 0, obj) { return obj!.a }
      function greet(name: 'World'): 'Hi World' { return \`Hi \${name}\` }
    `
    const code = tjs(src).code
    expect(code.match(/class MonadicError/g) ?? []).toHaveLength(1)
    expect(() => new Function(code)).not.toThrow()
  })
})
