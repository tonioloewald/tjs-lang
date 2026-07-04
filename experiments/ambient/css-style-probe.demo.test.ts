/**
 * Ambient-contract spike — probing a REAL host object.
 *
 * Uses happy-dom (a stand-in DOM, and exactly the kind of thing the conformance
 * harness would target) to show two findings from "trying it out":
 *   1. Host objects hide their surface on the PROTOTYPE — `Object.keys` misses
 *      it; a prototype-aware / usage-scoped probe finds it.
 *   2. A usage-scoped contract derived from the real object verifies as a safe
 *      predicate and validates conforming vs non-conforming stand-ins.
 *
 * Leaf CSS values ride the real `tjs-lang/css` predicates — the convergence point.
 * See docs/ambient-contracts.md.
 */
import { describe, it, expect } from 'bun:test'
import { Window } from 'happy-dom'
import { verifyPredicate, compilePredicate } from '../../src/lang/predicate'
import { probeShape, deriveShapeContract } from './probe'
import { isColorValue } from '../../src/css'

const win = new Window()
const doc = win.document

describe('probing a real CSSStyleDeclaration (host object)', () => {
  it('Object.keys misses the host surface; typeof finds it', () => {
    const style = doc.createElement('div').style
    // The naive probe sees almost nothing — the props are on the prototype.
    expect(Object.keys(style).length).toBeLessThan(3)
    // ...but they're really there:
    expect(typeof style.color).toBe('string')
    expect(typeof style.setProperty).toBe('function')
  })

  it('a usage-scoped probe finds the used surface', () => {
    const style = doc.createElement('div').style
    const checks = probeShape(style as any, {
      keys: ['color', 'backgroundColor', 'setProperty', 'getPropertyValue'],
    })
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c]))
    expect(byKey.color.type).toBe('string')
    expect(byKey.setProperty.kind).toBe('method')
    expect(byKey.getPropertyValue.kind).toBe('method')
  })
})

describe('derive a contract from the real object, then certify a stand-in', () => {
  it('the derived contract verifies safe and validates conformance', () => {
    const realStyle = doc.createElement('div').style
    const source = deriveShapeContract(realStyle as any, 'StyleDecl', {
      keys: ['color', 'backgroundColor', 'setProperty', 'getPropertyValue'],
    })
    // The auto-derived contract is itself a certified-safe predicate.
    expect(verifyPredicate(source).safe).toBe(true)

    const { isStyleDecl } = compilePredicate(source, ['isStyleDecl'])
    // A real happy-dom style conforms…
    expect(isStyleDecl(doc.createElement('span').style)).toBe(true)
    // …a plain object stub missing the methods does not.
    expect(isStyleDecl({ color: '', backgroundColor: '' })).toBe(false)
    // …and a hand stub that implements the used surface DOES conform.
    const stub = {
      color: '',
      backgroundColor: '',
      setProperty() {},
      getPropertyValue() {
        return ''
      },
    }
    expect(isStyleDecl(stub)).toBe(true)
  })

  it('leaf values ride the tjs-lang/css predicates (the convergence)', () => {
    const style = doc.createElement('div').style
    style.color = '#3a3'
    // shape-gate (contract) + value-grammar (css predicate) compose:
    expect(typeof style.color).toBe('string') // shape
    expect(isColorValue(style.color)).toBe(true) // value grammar
    expect(isColorValue('definitely-not-a-color')).toBe(false)
  })
})
