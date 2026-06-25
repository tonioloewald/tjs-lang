import { describe, it, expect } from 'bun:test'
import {
  verifyPredicate,
  compilePredicate,
  effectfulFromAtoms,
  PredicateFuelExhausted,
} from './predicate'
import { coreAtoms } from '../vm/runtime'

const ok = (src: string, opts?: any) => verifyPredicate(src, opts).safe
const why = (src: string, opts?: any) =>
  verifyPredicate(src, opts).diagnostics.map((d) => d.message)

describe('verifyPredicate — accepts the pure substrate', () => {
  it('pure expression + composition + recursion', () => {
    expect(
      ok(`
      function isShort(s) { return typeof s == 'string' && s.length < 10 }
      function isTag(s) { return isShort(s) && s.startsWith('#') }
      function depth(o) {
        if (typeof o != 'object' || o == null) { return 0 }
        return Object.keys(o).every(isTag) ? 1 : depth(o)  // self-ref ok
      }
    `)
    ).toBe(true)
  })

  it('pure builtins: regex .test, string/array methods, pure namespaces', () => {
    expect(ok(`function f(v){ return /^#[0-9a-f]{3}$/i.test(v) }`)).toBe(true)
    expect(
      ok(
        `function f(xs){ return xs.every(isThing) } function isThing(x){ return x.length > 0 }`
      )
    ).toBe(true)
    expect(ok(`function f(o){ return Object.entries(o).length > 0 }`)).toBe(
      true
    )
    expect(ok(`function f(a,b){ return Math.max(a,b) }`)).toBe(true)
    expect(ok(`function f(s){ return JSON.parse(s) }`)).toBe(true)
  })
})

describe('verifyPredicate — rejects impurity (the tightened checks)', () => {
  it('async / await', () => {
    expect(ok(`async function f(v){ return await g(v) }`)).toBe(false)
  })
  it('new', () => {
    expect(ok(`function f(v){ return new RegExp(v).test(v) }`)).toBe(false)
  })
  it('IO globals (fetch / console)', () => {
    expect(why(`function f(v){ return fetch(v) }`)[0]).toMatch(
      /fetch.*effectful/
    )
    expect(why(`function f(v){ console.log(v); return true }`)[0]).toMatch(
      /console\.log.*effectful/
    )
  })
  it('nondeterministic statics (Date.now / Math.random) — caught by the whitelist', () => {
    expect(why(`function f(){ return Date.now() }`)[0]).toMatch(
      /Date.*effectful|nondeterministic/
    )
    expect(why(`function f(){ return Math.random() }`)[0]).toMatch(
      /Math\.random.*nondeterministic/
    )
  })
  it('non-pure instance methods (.then / .push)', () => {
    // .then would let a Promise in; .push mutates — neither is a known pure method
    expect(why(`function f(p){ return p.then(g) }`)[0]).toMatch(
      /\.then\(\).*not a known pure method/
    )
    expect(why(`function f(a){ a.push(1); return a }`)[0]).toMatch(
      /\.push\(\).*not a known pure method/
    )
  })
  it('unknown reference (typo / undeclared)', () => {
    expect(why(`function f(v){ return notDefinedAnywhere(v) }`)[0]).toMatch(
      /unknown reference/
    )
  })
})

describe('verifyPredicate — driven by the real atom `effects` tag', () => {
  const effectful = effectfulFromAtoms(coreAtoms as any)

  it('rejects a predicate calling a real io-tagged atom, with a clear message', () => {
    const r = verifyPredicate(`function isUp(u){ return httpFetch(u) }`, {
      effectful,
    })
    expect(r.safe).toBe(false)
    expect(r.diagnostics[0].message).toMatch(/httpFetch.*effectful/)
    expect(r.diagnostics[0].line).toBeGreaterThan(0)
  })

  it('still allows pure atoms / composition', () => {
    expect(
      verifyPredicate(`function f(s){ return s.length < 5 }`, { effectful })
        .safe
    ).toBe(true)
  })
})

describe('verifyPredicate — cross-source composition (knownPredicates)', () => {
  it('accepts a reference to an externally-verified predicate', () => {
    expect(
      ok(`function isUser(u){ return isEmail(u.email) }`, {
        knownPredicates: new Set(['isEmail']),
      })
    ).toBe(true)
    // …but not an unknown one
    expect(ok(`function isUser(u){ return isEmail(u.email) }`)).toBe(false)
  })
})

describe('verifyPredicate — rejects loops (#3: keeps work fuel-bounded)', () => {
  it('while / for / for-of are rejected; recursion + array methods are not', () => {
    expect(why(`function f(n){ while(n>0){ n=n-1 } return n }`)[0]).toMatch(
      /loops are not allowed/
    )
    expect(ok(`function f(n){ for(let i=0;i<n;i++){} return n }`)).toBe(false)
    expect(ok(`function f(a){ for(const x of a){} return a }`)).toBe(false)
    // the sanctioned forms still pass:
    expect(
      ok(
        `function f(a){ return a.every(isShort) } function isShort(s){ return s.length<5 }`
      )
    ).toBe(true)
  })
})

describe('compilePredicate — fuel-bounded + global-shadowed (#3)', () => {
  it('verified predicates compile and run; IO ones throw at definition time', () => {
    const m = compilePredicate(
      `function isHex(v){ return typeof v == 'string' && /^#[0-9a-f]{3,8}$/i.test(v) }
       function isVar(v){ return typeof v == 'string' && v.startsWith('var(--') && v.endsWith(')') }
       function isColor(v){ return isHex(v) || isVar(v) }`,
      ['isColor']
    )
    expect(m.isColor('#3a3')).toBe(true)
    expect(m.isColor('var(--brand)')).toBe(true)
    expect(m.isColor('nope')).toBe(false)

    expect(() =>
      compilePredicate(`function f(v){ return fetch(v) }`, ['f'])
    ).toThrow(/Not predicate-safe/)
  })

  it('runaway recursion exhausts fuel instead of hanging', () => {
    // verifier allows recursion (call-bounded); the runtime fuel stops it.
    const m = compilePredicate(`function loop(n){ return loop(n) }`, ['loop'], {
      fuel: 5000,
    })
    expect(() => m.loop(1)).toThrow(PredicateFuelExhausted)
  })

  it('a huge array exhausts fuel via the per-element callback', () => {
    const m = compilePredicate(
      `function isPos(x){ return x > 0 }
       function allPos(a){ return a.every(isPos) }`,
      ['allPos'],
      { fuel: 1000 }
    )
    expect(m.allPos([1, 2, 3])).toBe(true) // small input fine
    const big = Array.from({ length: 100000 }, () => 1)
    expect(() => m.allPos(big)).toThrow(PredicateFuelExhausted)
  })

  it('each top-level call gets a fresh budget (no cross-call starvation)', () => {
    const m = compilePredicate(
      `function rec(n){ if (n <= 0) { return true } return rec(n - 1) }`,
      ['rec'],
      { fuel: 10000 }
    )
    // 500 deep, well under budget — and repeatable because budget resets
    for (let i = 0; i < 5; i++) expect(m.rec(500)).toBe(true)
  })

  it('shadows effectful globals to undefined (defense-in-depth)', () => {
    // even if a global slipped past the verifier, it is undefined at runtime
    const m = compilePredicate(`function usesGlobal(){ return typeof fetch }`, [
      'usesGlobal',
    ])
    expect(m.usesGlobal()).toBe('undefined')
  })
})
