/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { join } from 'node:path'

import { scanLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

const REPO = join('/Users/tonioloewald/tjs-lang/src/lang', '..', '..')
export {}

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 54 */
function reject(src) {
  try {
    tjs(src, { runTests: false })
    return null
  } catch (e) {
    return String(e.message)
  }
}
reject.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
      nullable: true,
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:54',
}

const TAIL = '\nfunction f(x: 0) { return x }'

describe('the nine abolished mode directives are rejected, with a remedy', () => {
  const ABOLISHED = [
    ['TjsEquals', /always|unconditional|\.tjs/i],
    ['TjsClass', /always|unconditional|unsafe|\.tjs/i],
    ['TjsDate', /always|unconditional|unsafe|\.tjs/i],
    ['TjsNoeval', /always|unconditional|unsafe|\.tjs/i],
    ['TjsNoVar', /always|unconditional|unsafe|\.tjs/i],
    ['TjsStandard', /always|terminat|newline|\.tjs/i],
    ['TjsDictDefaults', /always|object-lit|dictionary|\.tjs/i],

    ['TjsSafeEval', /automatic|imported|nothing to opt/i],
    ['TjsSafeAssign', /always|bare assignment|const|\.tjs/i],
  ]
  for (const [directive, mustMention] of ABOLISHED) {
    it(`${directive} is rejected`, () => {
      expect(reject(directive + TAIL)).not.toBeNull()
    })
    it(`${directive}'s message names what replaced it`, () => {
      const msg = reject(directive + TAIL) ?? ''
      expect(msg).toContain(directive)
      expect(msg).toMatch(mustMention)
    })
  }
})

describe('forms that never existed, or stopped existing', () => {
  it('`unsafe { … }` as a block does not exempt anything', () => {
    const msg = reject('unsafe { var x = 1 }\nconsole.log(x)')
    expect(msg).not.toBeNull()
  })
  it('the `->` / `-!` / `-?` return syntax is not accepted', () => {
    expect(reject('function f(a: 2) -> 5 { return a }')).not.toBeNull()
    expect(reject('function f(a: 2) -! 5 { return a }')).not.toBeNull()
    expect(reject('function f(a: 2) -? 5 { return a }')).not.toBeNull()
    expect(reject('const f = (a: 2) -> 5 => a')).not.toBeNull()
  })
  it('the colon return forms that DO exist still work', () => {
    expect(reject('function f(a: 2, b: 3): 5 { return a + b }')).toBeNull()
    expect(reject('function f(a: 2, b: 3):! 0 { return a + b }')).toBeNull()
    expect(reject('function f(a: 2, b: 3):? 5 { return a + b }')).toBeNull()
  })
})

describe('every predicate form checks — and an unbuilt one still fails closed', () => {
  const EXAMPLE = 'Type Even {\n  example: 2\n'
  /** Compile a Type and ask it about 4 and 3. */
  const checks = (src) =>
    new Function(
      `${
        tjs(src, { runTests: false }).code
      }\nreturn [Even.check(4), Even.check(3)]`
    )()

  it('`predicate => …` checks', () => {
    expect(checks(`${EXAMPLE}  predicate => Even % 2 === 0\n}`)).toEqual([
      true,
      false,
    ])
  })
  it('`predicate { … }` checks', () => {
    expect(
      checks(`${EXAMPLE}  predicate { return Even % 2 === 0 }\n}`)
    ).toEqual([true, false])
  })
  it('all three spellings agree', () => {
    const fn = checks(`${EXAMPLE}  predicate(x) { return x % 2 === 0 }\n}`)
    expect(checks(`${EXAMPLE}  predicate => Even % 2 === 0\n}`)).toEqual(fn)
    expect(
      checks(`${EXAMPLE}  predicate { return Even % 2 === 0 }\n}`)
    ).toEqual(fn)
  })
  it('a form that is still unbuilt is still rejected', () => {
    expect(reject(`${EXAMPLE}  predicate: (x) => x % 2 === 0\n}`)).toContain(
      'predicate(x)'
    )
  })
  it('the implemented form still works, and still CHECKS', () => {
    const src = `${EXAMPLE}  predicate(x) { return x % 2 === 0 }\n}`
    expect(reject(src)).toBeNull()
    const code = tjs(src, { runTests: false }).code
    const [ok, bad] = new Function(
      `${code}\nreturn [Even.check(4), Even.check(3)]`
    )()
    expect([ok, bad]).toEqual([true, false])
  })
  it('a Type with no predicate at all is still fine', () => {
    expect(reject('Type Even {\n  example: 2\n}')).toBeNull()
  })
  it('does not fire on the word "predicate" inside a string', () => {
    expect(
      reject(`Type Even {\n  description: 'has a predicate'\n  example: 2\n}`)
    ).toBeNull()
  })
})

describe('nothing still detects abandoned syntax', () => {
  const ROOTS = ['src', 'demo', 'editors', 'scripts', 'bin']
  function sourceFiles() {
    const out = []
    const walk = (d) => {
      let entries
      try {
        entries = readdirSync(d)
      } catch {
        return
      }
      for (const e of entries) {
        if (e === 'node_modules' || e.startsWith('.')) continue
        const p = join(d, e)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else if (/\.(ts|js|mjs)$/.test(e) && !e.endsWith('.d.ts')) out.push(p)
      }
    }
    for (const r of ROOTS) walk(join(REPO, r))
    return out
  }
  it('the sweep actually reads files (apparatus check)', () => {
    expect(sourceFiles().length).toBeGreaterThan(100)
  })
  it('no regex hunts for the `) ->` return form', () => {
    const offenders = []
    for (const f of sourceFiles()) {
      const src = readFileSync(f, 'utf8')

      if (f.endsWith('abandoned-syntax.test.ts')) continue
      for (const r of scanLiterals(src)) {
        if (r.kind !== 'regex') continue
        const pattern = src.slice(r.innerStart, r.innerEnd)
        if (/\\\)\\s\*->/.test(pattern) || /\\\)\\s\*-[!?]/.test(pattern)) {
          const line = src.slice(0, r.start).split('\n').length
          offenders.push(`${f.replace(REPO + '/', '')}:${line}  /${pattern}/`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('abolished directives are caught anywhere in the preamble', () => {
  const FN = 'export function f(x: 1):! 0 { return x }\n'

  const PREAMBLES = [
    ['bare at the top', ''],
    ['after `safety none`', 'safety none\n'],
    ['after a line comment', '// a note\n'],
    ['after a one-line block comment', '/* a note */\n'],
    ['after a MULTI-LINE doc comment', '/*#\n# Title\n- a bullet\n*/\n\n'],
    ['after a doc comment AND safety', '/*#\n# Title\n*/\n\nsafety none\n'],
    ['after blank lines', '\n\n'],
  ]
  for (const [label, preamble] of PREAMBLES) {
    it(label, () => {
      expect(() =>
        tjs(`${preamble}TjsSafeEval\n${FN}`, { filename: 'x.tjs' })
      ).toThrow(/no longer a mode/)
    })
  }
  it('a preamble with NO abolished directive still transpiles (control)', () => {
    expect(() =>
      tjs(`/*#\n# Title\n*/\n\nsafety none\n${FN}`, { filename: 'x.tjs' })
    ).not.toThrow()
  })
  it('a `Tjs`-looking identifier in real CODE is not a directive', () => {
    expect(() =>
      tjs(
        `const TjsSafeEval = 1\nexport function g():! 0 { return TjsSafeEval }\n`,
        { filename: 'x.tjs' }
      )
    ).not.toThrow()
  })
})
