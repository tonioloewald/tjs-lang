/**
 * The AST carries a format version, and the VM acts on it.
 *
 * An AST is a **persisted artifact** — `procedureStore` holds them, and consumers serialise
 * agents — so data written today is read by code written later. That is the property that
 * makes a version field urgent rather than tidy, and it is why this landed before anything
 * needed it (`docs/ajs-native-vm.md`, "Constraints on 1.0").
 *
 * Three things have to hold, and the third is the one that makes the field real:
 *
 *   1. New ASTs carry the version.
 *   2. Old ones without it still run — they are a finite, shrinking set, and breaking them
 *      would be breaking data already on disk.
 *   3. **A version this build does not understand is REFUSED.** A field nobody acts on is
 *      decoration; running an AST whose format we cannot read means guessing at the meaning
 *      of untrusted code, which is the one thing a sandbox must not do.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './index'
import { transpile } from '../lang/core'
import {
  AST_VERSION,
  AST_VERSION_KEY,
  astVersionOf,
  astVersionProblem,
} from './ast-version'

const SOURCE = `function f() { return { answer: 42 } }`

describe('emitted ASTs carry the format version', () => {
  it('the root declares it', () => {
    const { ast } = transpile(SOURCE) as any
    expect(ast[AST_VERSION_KEY]).toBe(AST_VERSION)
  })

  it('it is the FIRST key, so a truncated dump still shows it', () => {
    // Not cosmetic: the first thing you want from a half-logged AST, or from a diff of two
    // of them, is which format it is.
    const { ast } = transpile(SOURCE) as any
    expect(Object.keys(ast)[0]).toBe(AST_VERSION_KEY)
  })
})

describe('reading a version', () => {
  it('absent means legacy, not invalid', () => {
    expect(astVersionOf({ op: 'seq', steps: [] })).toBe(1)
  })

  it('a non-numeric field is treated as legacy rather than trusted', () => {
    expect(astVersionOf({ [AST_VERSION_KEY]: 'two', op: 'seq' })).toBe(1)
  })
})

describe('the VM acts on it', () => {
  it('runs a current AST', async () => {
    const { ast } = transpile(SOURCE) as any
    const result = await new AgentVM().run(ast, {})
    expect(result.error).toBeFalsy()
    expect(result.result).toEqual({ answer: 42 })
  })

  it('still runs an UNVERSIONED AST — already-persisted data keeps working', async () => {
    // The compatibility floor. Versioning does not eliminate unversioned ASTs; it stops the
    // population growing. Breaking them would break `proc_…` tokens already stored.
    const { ast } = transpile(SOURCE) as any
    const legacy = { ...ast }
    delete legacy[AST_VERSION_KEY]
    const result = await new AgentVM().run(legacy, {})
    expect(result.error).toBeFalsy()
    expect(result.result).toEqual({ answer: 42 })
  })

  it('REFUSES a future version rather than guessing', async () => {
    const { ast } = transpile(SOURCE) as any
    const future = { ...ast, [AST_VERSION_KEY]: AST_VERSION + 1 }
    let message = ''
    try {
      await new AgentVM().run(future, {})
    } catch (e: any) {
      message = String(e?.message ?? e)
    }
    expect(message).toContain(`version ${AST_VERSION + 1}`)
    // Errors-as-curriculum: say what to do, not just what went wrong.
    expect(message).toContain('Upgrade tjs-lang')
  })

  it('the version is checked BEFORE the root shape', async () => {
    // A future AST may legitimately have a different root. Judging it by today's rules would
    // report "Root AST must be 'seq'" for something that is merely newer — a diagnosis that
    // sends the reader to the wrong problem entirely.
    let message = ''
    try {
      await new AgentVM().run(
        { [AST_VERSION_KEY]: AST_VERSION + 1, op: 'somethingNewer' } as any,
        {}
      )
    } catch (e: any) {
      message = String(e?.message ?? e)
    }
    expect(message).toContain('version')
    expect(message).not.toContain("must be 'seq'")
  })
})

describe('the helper reports problems without throwing', () => {
  it('returns null for a readable AST and a message for an unreadable one', () => {
    expect(astVersionProblem({ [AST_VERSION_KEY]: AST_VERSION })).toBeNull()
    expect(astVersionProblem({})).toBeNull()
    expect(astVersionProblem({ [AST_VERSION_KEY]: AST_VERSION + 5 })).toContain(
      'Refusing to run'
    )
  })
})
