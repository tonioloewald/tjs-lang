import { describe, it, expect } from 'bun:test'
import { introspectValue, INTROSPECT_VALUE_SOURCE } from './introspect-value'

const labels = (v: unknown) => introspectValue(v).map((m) => m.label)
const member = (v: unknown, name: string) =>
  introspectValue(v).find((m) => m.label === name)

describe('introspectValue — serializable runtime introspection', () => {
  it('object → own properties and methods, typed', () => {
    const todoApp = { items: [], newItem: '', addItem() {} }
    const ls = labels(todoApp)
    expect(ls).toContain('items')
    expect(ls).toContain('newItem')
    expect(ls).toContain('addItem')
    expect(member(todoApp, 'addItem')?.type).toBe('method')
    expect(member(todoApp, 'newItem')?.type).toBe('property')
    expect(member(todoApp, 'newItem')?.detail).toBe('string')
  })

  it('array → inherited methods from the prototype (push, map)', () => {
    const ls = labels([1, 2, 3])
    expect(ls).toContain('push')
    expect(ls).toContain('map')
    expect(ls).toContain('filter')
    expect(member([1], 'push')?.type).toBe('method')
  })

  it('method arity becomes an arg hint', () => {
    const o = { f(a: unknown, b: unknown) {} }
    void o.f
    expect(member(o, 'f')?.detail).toBe('(arg1, arg2)')
  })

  it('skips constructor and underscore-prefixed members', () => {
    const ls = labels({ _private: 1, visible: 2 })
    expect(ls).toContain('visible')
    expect(ls).not.toContain('_private')
    expect(ls).not.toContain('constructor')
  })

  it('introspects a Proxy via own keys (tosijs `elements` shape)', () => {
    // a proxy that materialises keys on access but DOES report own keys
    const backing: Record<string, unknown> = { h1: () => {}, div: () => {} }
    const proxy = new Proxy(backing, {})
    const ls = labels(proxy)
    expect(ls).toContain('h1')
    expect(ls).toContain('div')
  })

  it('non-objects → nothing; never throws', () => {
    expect(introspectValue(null)).toEqual([])
    expect(introspectValue(42)).toEqual([])
    expect(introspectValue(undefined)).toEqual([])
  })

  it('is self-contained source (injectable into the sandbox iframe)', () => {
    // no outer references that would break when eval-ed in another realm
    expect(INTROSPECT_VALUE_SOURCE).toContain('function introspectValue')
    expect(INTROSPECT_VALUE_SOURCE).not.toMatch(/\bimport\b/)
  })
})
