/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { ajs } from '/Users/tonioloewald/tjs-lang/src/transpiler/index'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { CONSTRUCT_REMEDIES } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/ast'

const TRIGGERS = {
  ForStatement: `function f(n: 0) {
    let t = 0
    for (let i = 0; i < n; i++) { t = t + i }
    return { t }
  }`,
  SwitchStatement: `function f(k: '') {
    switch (k) { case 'a': return { v: 1 } }
    return { v: 0 }
  }`,
  ForInStatement: `function f(o: {}) {
    let n = 0
    for (const k in o) { n = n + 1 }
    return { n }
  }`,
  DoWhileStatement: `function f(n: 0) {
    let i = 0
    do { i = i + 1 } while (i < n)
    return { i }
  }`,
}

describe('unsupported-construct diagnostics carry a worked remedy', () => {
  it('every declared remedy contains actual code, not just prose', () => {
    for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
      const hasCode = /\n\s{2,}\S/.test(remedy) && /[={(]/.test(remedy)
      expect(hasCode, `${construct} remedy must show code:\n${remedy}`).toBe(
        true
      )
    }
  })
  it('mentions what to use INSTEAD, not only what is missing', () => {
    for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
      expect(
        /while|if|map|filter|reduce|return|function|keys/.test(remedy),
        `${construct} remedy must name a supported alternative`
      ).toBe(true)
    }
  })
  it('every remedy names a construct the transpiler ACTUALLY rejects', () => {
    for (const construct of Object.keys(CONSTRUCT_REMEDIES)) {
      expect(
        TRIGGERS[construct],
        `${construct} has a remedy but no trigger proving AJS rejects it. ` +
          `Either add a trigger, or delete the remedy — it may document a limit that isn't real.`
      ).toBeDefined()
    }
  })
  for (const [construct, src] of Object.entries(TRIGGERS)) {
    it(`${construct}: the thrown error actually carries the remedy`, () => {
      let message
      try {
        ajs(src)
        throw new Error(`expected ${construct} to be rejected`)
      } catch (e) {
        message = String(e.message)
      }
      expect(message).toContain(`Unsupported statement type: ${construct}`)
      const remedy = CONSTRUCT_REMEDIES[construct]

      expect(message).toContain(remedy.split('\n')[0])
    })
  }
})

describe('remedies are spec, not strings', () => {
  const WRAPPER_PARAMS = `items: [], data: {}, kind: '', n: 0`
  for (const [construct, remedy] of Object.entries(CONSTRUCT_REMEDIES)) {
    it(`${construct}: the suggested repair actually compiles`, () => {
      const code = remedy.split('\n').slice(1).join('\n')
      const src = `function demo(${WRAPPER_PARAMS}) {\n${code}\n  return 0\n}`
      expect(
        () => ajs(src),
        `the remedy shown for ${construct} does not compile — we would be handing a ` +
          `model broken code with our authority behind it:\n${src}`
      ).not.toThrow()
    })
  }
})

describe('banned constructs report a location, and every occurrence', () => {
  const cases = [
    ['var', 'function a() {\n  var x = 1\n  return x\n}', /var/],
    ['new Date', 'function a() {\n  return new Date()\n}', /new Date/],
    ['eval', "function a(s: '') {\n  return eval(s)\n}", /eval/],
  ]
  for (const [label, src, match] of cases) {
    it(`${label} reports a line and column`, () => {
      let caught
      try {
        tjs(src, { runTests: false })
      } catch (e) {
        caught = e
      }
      expect(caught, `${label} must be rejected`).toBeDefined()
      expect(caught.message).toMatch(match)

      expect(caught.line, `${label} must carry a line`).toBeGreaterThan(0)
      expect(caught.column).toBeGreaterThanOrEqual(0)
    })
  }
  it('lists EVERY occurrence, not just the first', () => {
    let caught
    try {
      tjs(
        'function a() {\n  var x = 1\n  var y = 2\n  var z = 3\n  return x\n}',
        {
          runTests: false,
        }
      )
    } catch (e) {
      caught = e
    }
    expect(caught.line, 'the caret lands on the FIRST one').toBe(2)
    expect(caught.message).toMatch(/3 occurrences in total/)
    expect(caught.message).toMatch(/line 3/)
    expect(caught.message).toMatch(/line 4/)
  })
  it('says nothing when there is nothing to say', () => {
    expect(() =>
      tjs('function a() {\n  const x = 1\n  return x\n}', { runTests: false })
    ).not.toThrow()
  })
})
