/**
 * The mutator list `accountMutation` relies on is checked against BEHAVIOUR.
 *
 * In-place mutation is charged to the heap budget at the two doors that perform it
 * (`methodCall`, the `push` atom), and `methodCall` recognises a mutator by name. A name list
 * maintained by hand is the failure this replaces: the heap code carried "`push` is the only
 * atom that mutates in place (verified by scan)" while `methodCall` reached every Array mutator
 * and the guest Set's `add` (rc.2 second re-review B2). So: call EVERY method guest code may
 * call, on a fresh receiver of every kind, and fail on any that changes its receiver without
 * being listed — and on any listed name that mutates nothing (a stale entry).
 */
import { describe, it, expect } from 'bun:test'
import { builtins, isGuestCallableMethod, isMutatingMethod } from './runtime'

const RECEIVERS: Record<
  string,
  { make: () => any; snapshot: (r: any) => string; names: (r: any) => string[] }
> = {
  array: {
    make: () => [3, 1, 2],
    snapshot: (r) => JSON.stringify(r),
    names: () => Object.getOwnPropertyNames(Array.prototype),
  },
  object: {
    make: () => ({ a: 1, b: 2 }),
    snapshot: (r) => JSON.stringify(Object.getOwnPropertyDescriptors(r)),
    names: () => Object.getOwnPropertyNames(Object.prototype),
  },
  string: {
    make: () => 'abc',
    snapshot: (r) => r,
    names: () => Object.getOwnPropertyNames(String.prototype),
  },
  set: {
    make: () => builtins.Set([3, 1, 2]),
    snapshot: (r) => JSON.stringify(r.toArray()),
    // a wrapper's methods are non-enumerable (round 11): list its own names, not its keys
    names: (r) => Object.getOwnPropertyNames(r),
  },
  date: {
    make: () => builtins.Date('2020-01-02T03:04:05Z'),
    snapshot: (r) => String(r.timestamp),
    // a wrapper's methods are non-enumerable (round 11): list its own names, not its keys
    names: (r) => Object.getOwnPropertyNames(r),
  },
}

const ARG_SETS: unknown[][] = [
  [],
  [1],
  [0, 1],
  [0, 0, 9],
  ['k', 1],
  [{ days: 1 }],
]

function mutates(kind: string, name: string): boolean {
  const { make, snapshot } = RECEIVERS[kind]
  for (const args of ARG_SETS) {
    const r = make()
    if (typeof r[name] !== 'function') return false
    const before = snapshot(r)
    try {
      r[name](...args)
    } catch {
      // wrong arity/type for this method — try the next argument set
    }
    if (snapshot(r) !== before) return true
  }
  return false
}

describe('in-place mutators are known to the heap accounting', () => {
  const found = new Set<string>()
  for (const kind of Object.keys(RECEIVERS)) {
    const names = RECEIVERS[kind].names(RECEIVERS[kind].make())
    for (const name of names)
      if (isGuestCallableMethod(name) && mutates(kind, name)) found.add(name)
  }

  it('the probe sees mutation (apparatus check)', () => {
    expect(found).toContain('push')
    expect(found).toContain('sort')
    expect(found).toContain('add')
  })

  it('every guest-callable method that mutates its receiver is listed', () => {
    expect([...found].filter((n) => !isMutatingMethod(n))).toEqual([])
  })

  it('no listed method is guest-callable yet mutation-free (stale entry)', () => {
    const listed = [
      'copyWithin',
      'fill',
      'pop',
      'push',
      'reverse',
      'shift',
      'sort',
      'splice',
      'unshift',
      'add',
      'remove',
      'clear',
    ]
    expect(listed.filter((n) => isMutatingMethod(n) && !found.has(n))).toEqual(
      []
    )
    expect(isMutatingMethod('map')).toBe(false)
  })

  it("Object.prototype's legacy accessor methods are not guest-callable", () => {
    for (const name of [
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ])
      expect(isGuestCallableMethod(name)).toBe(false)
  })
})
