/**
 * A value with a `schema` KEY is not a schema builder (tjs-lang#58, tosijs-schema 1.12.0).
 *
 * tjs-lang unwrapped with the old duck-type — `x?.schema ?? x`, or `'schema' in x` — in five
 * places. tosijs-schema 1.12 closed that fail-open upstream by BRANDING builders
 * (`isBuilder`), but our local copies kept it alive, and in TJS it is worse than a validator
 * bug: a Type's argument is an EXAMPLE, so `{ label: '', schema: { version: 0 } }` is an
 * example object that happens to have a field called `schema` — and it was being read as a
 * builder and its field used as the type.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { Type } from './Type'
import { AgentVM } from '../vm/vm'
import { ajs } from '../lang/index'

describe('a `schema` key does not make a value a schema builder', () => {
  it('a Type EXAMPLE with a field named `schema` is an example, not a builder', () => {
    const Doc = Type('Doc', { label: '', schema: { version: 0 } })
    expect(Doc.check({ label: 'a', schema: { version: 2 } })).toBe(true)
    // Read as a builder, `{ version: 0 }` became the JSON Schema and this passed.
    expect(Doc.check({ label: 'a' })).not.toBe(true)
    expect(Doc.check('not a doc')).not.toBe(true)
  })

  it('a JSON Schema with a stray `schema` key is not unwrapped to accept-all', () => {
    // `schema: true` unwrapped to the schema `true`, which accepts every value.
    const Obj = Type('Obj', {
      type: 'object',
      required: ['a'],
      schema: true,
    } as any)
    expect(Obj.check(42)).not.toBe(true)
    expect(Obj.check({})).not.toBe(true)
  })

  it('a real builder still works, and its wrapper still validates', () => {
    const Name = Type('Name', s.string)
    expect(Name.check('hi')).toBe(true)
    expect(Name.check(42)).not.toBe(true)
    const Person = Type('Person', { name: '', age: 0 })
    expect(Person.check({ name: 'a', age: 1 })).toBe(true)
  })

  it("the VM's guest-facing Schema.isValid treats an example with a `schema` field as an example", async () => {
    // `Schema.isValid(data, example)` duck-typed its second argument (`?.schema != null`), so
    // this example was either read as a builder (≤1.11: its field became the type, accepting
    // anything) or refused as ambiguous (1.12: rejecting everything). Guest code reaches it.
    const ast = ajs(`
      function f(d: any) {
        let ok = Schema.isValid(d, { label: '', schema: { version: 0 } })
        return { ok }
      }`)
    const vm = new AgentVM()
    const good = await vm.run(ast, {
      d: { label: 'a', schema: { version: 1 } },
    })
    expect(good.error).toBeUndefined()
    expect(good.result).toEqual({ ok: true })
    const bad = await vm.run(ast, { d: { label: 'a', schema: 'nope' } })
    expect(bad.result).toEqual({ ok: false })
  })
})
