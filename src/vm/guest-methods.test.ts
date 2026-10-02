/**
 * The transpiler and the VM route method calls by ONE list: `GUEST_METHODS` (what compiles to a
 * method call) is exactly the method table's keys (what the VM allows and bounds). They are two
 * literals, so this holds them equal — the docstring of guest-methods.ts cited this test before
 * it existed (rc.2 sixth re-review).
 */
import { describe, it, expect } from 'bun:test'
import { GUEST_METHODS } from './guest-methods'
import { methodBudgets } from './runtime'

describe('GUEST_METHODS is the method table', () => {
  it('same names, both directions', () => {
    const table = new Set(methodBudgets.names())
    expect([...GUEST_METHODS].filter((n) => !table.has(n))).toEqual([])
    expect([...table].filter((n) => !GUEST_METHODS.has(n))).toEqual([])
  })
})
