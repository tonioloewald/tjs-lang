/**
 * Bootstrap Canary Test - TJS builds and tests itself
 *
 * This is the ultimate dogfooding test:
 * 1. Transpile TJS source files with TJS
 * 2. Execute the transpiled code
 * 3. Run functionality tests against it
 * 4. Use transpiled TJS to transpile TJS (true self-hosting)
 * 5. Report timing as a benchmark
 *
 * If this test fails, something fundamental is broken.
 */

import { describe, it, expect } from 'bun:test'
// The canary evaluates transpiled parser modules standalone, so every helper the parser
// imports has to be injected into the `new Function` scope.
//
// This used to be a hand-written list, with a note telling the next person to remember to
// update it. They did not — adding `isEscapedAt` to strip-comments.ts broke the canary with
// "isEscapedAt is not defined", a message that points at the symptom and not the cause. So
// the list is now DERIVED from the module's exports: a new export is injected automatically
// and there is nothing left to forget. Same defect class this whole release is about — a
// second copy of a fact, kept in sync by remembering.
import * as stripComments from '../strip-comments'
const STRIP_COMMENTS_EXPORTS = Object.keys(stripComments).filter(
  (k) => typeof (stripComments as Record<string, unknown>)[k] === 'function'
)
const STRIP_COMMENTS_VALUES = STRIP_COMMENTS_EXPORTS.map(
  (k) => (stripComments as Record<string, unknown>)[k]
)
import { fromTS as fromTSToTJS } from '../lang/emitters/from-ts'
import { tjs } from '../lang'
import { emitVerifiedPredicate } from '../lang/predicate'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Flatten several emitted modules into ONE scope, the way this canary needs them.
 *
 * Every emitted file carries an inline runtime preamble — `const Type`, `const __match`,
 * `const __tjs` — because emitted JS is required to stand alone. In ESM, a bundler, or a
 * `<script type=module>`, each module has its own scope and that is exactly right. This test
 * strips the imports and concatenates the text so the modules can call each other, which
 * collapses seven scopes into one and declares `const __tjs` seven times.
 *
 * So the preamble is emitted ONCE, which is what a bundler does with shared helpers. Wrapping
 * each module in an IIFE would be the other obvious fix and does not work here: the canary
 * concatenates precisely so `parser.ts` can see `parser-transforms.ts`.
 *
 * This is a harness concern, not an emission one — nothing that ships concatenates raw module
 * text into a single scope. It only became visible when the canary stopped transpiling with
 * `ts.transpileModule`, whose output had no inline runtime to duplicate.
 */
const ANNOTATION = /\/\* tjs <- [^*]*\*\//

function flattenModules(files: string[], langDir: string): string {
  let combined = ''
  files.forEach((file, i) => {
    const src = fs.readFileSync(path.join(langDir, file), 'utf-8')
    // fromTSToTJS, NOT the composing `fromTS` shim below — that one already runs `tjs()`,
    // so going through it here transpiled twice and emitted a second runtime preamble.
    let code = tjs(fromTSToTJS(src, { filename: file }).code, {
      runTests: false,
    }).code
    if (i > 0) {
      // Drop this module's copy of the shared runtime preamble.
      const m = ANNOTATION.exec(code)
      if (m) code = code.slice(m.index + m[0].length)
    }
    combined +=
      code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+\{[^}]*\}\s+from\s+.*$/gm, '')
        .replace(/^export\s+/gm, '') + '\n'
  })
  return combined
}

/**
 * The composed path: TS -> TJS -> JS.
 *
 * `fromTS` emits TJS and stops; `tjs` takes it the rest of the way. These tests assert on
 * JavaScript, so they compose the two — which is now the ONLY route to JS. It used to be one
 * call, because `fromTS` also emitted JS via `ts.transpileModule`; that meant these
 * assertions were checking the TypeScript compiler's output, not ours. See
 * `src/no-ts-emitter.test.ts`.
 */
const fromTS = (source: string, options: any = {}) => {
  const t = fromTSToTJS(source, options)
  if (options.emitTJS) return t
  return { ...t, code: tjs(t.code, { runTests: false }).code }
}

describe('Bootstrap Canary', () => {
  describe('TJS transpiles and executes its own modules', () => {
    it('should bootstrap inference.ts', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/inference.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()
      expect(result.code.length).toBeGreaterThan(100)

      // Execute the transpiled code
      // Strip imports/exports for standalone execution
      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      const module = new Function(`
        ${strippedCode}
        return { inferTypeFromValue, extractLiteralValue, checkType, typeToString };
      `)()
      const execTime = performance.now() - execStart

      // Test the bootstrapped functions
      const testStart = performance.now()

      // Test inferTypeFromValue via checkType
      expect(module.checkType('hello', { kind: 'string' })).toBe(true)
      expect(module.checkType(42, { kind: 'number' })).toBe(true)
      expect(
        module.checkType([1, 2, 3], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(true)
      expect(
        module.checkType(
          { name: 'test' },
          { kind: 'object', shape: { name: { kind: 'string' } } }
        )
      ).toBe(true)
      expect(module.checkType(null, { kind: 'string', nullable: true })).toBe(
        true
      )
      expect(module.checkType(null, { kind: 'string' })).toBe(false)

      // Test typeToString
      expect(module.typeToString({ kind: 'string' })).toBe('string')
      expect(module.typeToString({ kind: 'number' })).toBe('number')
      expect(
        module.typeToString({ kind: 'array', items: { kind: 'string' } })
      ).toBe('string[]')
      expect(module.typeToString({ kind: 'string', nullable: true })).toBe(
        'string | null'
      )

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap inference.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })

    it('should bootstrap parser.ts core functions', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/parser.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()

      // The parser has dependencies, so we test that it transpiles correctly
      // and the output looks sane
      expect(result.code).toContain('function')
      expect(result.code).toContain('preprocess')

      const totalTime = performance.now() - start
      console.log(`\n  Bootstrap parser.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
      console.log(`    Output:    ${(result.code.length / 1024).toFixed(1)}KB`)
    })

    it('should bootstrap docs.ts and execute it', () => {
      const start = performance.now()

      // Read the source
      const sourcePath = path.join(import.meta.dir, '../lang/docs.ts')
      const source = fs.readFileSync(sourcePath, 'utf-8')

      // Transpile with TJS
      const transpileStart = performance.now()
      const result = fromTS(source)
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()

      // Execute - docs.ts has self-contained functions
      // Strip imports/exports for standalone execution
      const execStart = performance.now()
      const strippedCode = result.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')
      // Same derived injection as the parser sites: docs.ts consumes the shared
      // literal-aware scanner, and its imports are stripped for standalone execution.
      const module = new Function(
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${strippedCode}
        return { generateDocs };
      `
      )(...STRIP_COMMENTS_VALUES)
      const execTime = performance.now() - execStart

      // Test the bootstrapped docs functions
      const testStart = performance.now()

      // Test generateDocs
      const docs = module.generateDocs(`
        /*#
        # Math Functions
        Basic arithmetic operations.
        */

        function add(a: 0, b: 0): 0 {
          return a + b
        }

        function multiply(x: 1, y: 1): 1 {
          return x * y
        }
      `)
      expect(docs).toBeDefined()
      expect(docs.items).toBeDefined()
      expect(docs.items.length).toBeGreaterThan(0)
      expect(docs.markdown).toContain('Math Functions')
      expect(docs.markdown).toContain('function add')

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap docs.ts:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Execute:   ${execTime.toFixed(2)}ms`)
      console.log(`    Test:      ${testTime.toFixed(2)}ms`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)
    })
  })

  describe('TJS transpiles and runs its own test code', () => {
    it('should transpile and execute a TJS test file', () => {
      const start = performance.now()

      // A self-contained TJS test
      const tjsSource = `
        function add(a: 0, b: 0): 0 {
          return a + b
        }
        /* @test add(1, 2) is 3 */
        /* @test add(-1, 1) is 0 */
        /* @test add(0, 0) is 0 */

        function greet(name: 'World'): 'Hello, World!' {
          return 'Hello, ' + name + '!'
        }
        /* @test greet('TJS') is 'Hello, TJS!' */
        /* @test greet('Bootstrap') is 'Hello, Bootstrap!' */
      `

      // Transpile with tests
      const transpileStart = performance.now()
      const result = tjs(tjsSource, { runTests: 'report' })
      const transpileTime = performance.now() - transpileStart

      expect(result.code).toBeTruthy()
      expect(result.testResults).toBeDefined()

      // Count results
      const passed = result.testResults!.filter((r) => r.passed).length
      const failed = result.testResults!.filter((r) => !r.passed).length

      const totalTime = performance.now() - start

      console.log(`\n  Bootstrap TJS test execution:`)
      console.log(`    Transpile: ${transpileTime.toFixed(2)}ms`)
      console.log(`    Tests:     ${passed} passed, ${failed} failed`)
      console.log(`    Total:     ${totalTime.toFixed(2)}ms`)

      // All tests should pass
      expect(failed).toBe(0)
      expect(passed).toBeGreaterThan(0)
    })
  })

  describe('Full bootstrap benchmark', () => {
    it('should transpile all TJS lang modules', () => {
      const langDir = path.join(import.meta.dir, '../lang')
      const files = fs
        .readdirSync(langDir)
        .filter(
          (f) =>
            f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')
        )

      const results: {
        file: string
        time: number
        size: number
        success: boolean
        error?: string
      }[] = []

      const totalStart = performance.now()

      for (const file of files) {
        const filePath = path.join(langDir, file)
        const source = fs.readFileSync(filePath, 'utf-8')

        const start = performance.now()
        try {
          const result = fromTS(source)
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: result.code.length,
            success: true,
          })
        } catch (e: any) {
          const time = performance.now() - start
          results.push({
            file,
            time,
            size: 0,
            success: false,
            error: e.message,
          })
        }
      }

      const totalTime = performance.now() - totalStart

      // Report
      console.log(`\n  Full bootstrap - ${files.length} files:`)
      console.log(
        `  ${'File'.padEnd(25)} ${'Time'.padStart(10)} ${'Size'.padStart(
          10
        )} Status`
      )
      console.log(`  ${'-'.repeat(60)}`)

      for (const r of results) {
        const status = r.success ? '✓' : `✗ ${r.error?.slice(0, 30)}`
        console.log(
          `  ${r.file.padEnd(25)} ${(r.time.toFixed(1) + 'ms').padStart(10)} ${(
            (r.size / 1024).toFixed(1) + 'KB'
          ).padStart(10)} ${status}`
        )
      }

      console.log(`  ${'-'.repeat(60)}`)
      console.log(
        `  ${'TOTAL'.padEnd(25)} ${(totalTime.toFixed(1) + 'ms').padStart(10)}`
      )

      // All should succeed
      const failures = results.filter((r) => !r.success)
      expect(failures.length).toBe(0)
      // An explicit budget, because bun's default 5s is a stopwatch this test never agreed
      // to race. What it asserts is that all 36 modules TRANSPILE; the wall clock is
      // incidental, and it is dominated by one file — `parser-transforms.ts` alone is ~3.1s
      // of ~7.4s, which is the known quadratic in `preprocess` (TODO.md), not a property of
      // the canary.
      //
      // Verified it is not a regression: A/B'd with and without the overload change on the
      // same machine, 7.24s vs 8.28s — both far over 5s, so the default had simply stopped
      // fitting as the corpus grew. Left as a FAILURE rather than a silent slow test, it
      // reported "something fundamental is broken" when nothing was, which is worse than no
      // canary. Generous on purpose: this is a correctness assertion wearing a benchmark's
      // clothes, and the benchmark that measures the quadratic is elsewhere.
    }, 60_000)
  })

  describe('True self-hosting: transpiled TJS validates types', () => {
    it('should execute transpiled checkType and typeToString', () => {
      const start = performance.now()

      // Step 1: Transpile inference.ts
      const inferencePath = path.join(import.meta.dir, '../lang/inference.ts')
      const inferenceSource = fs.readFileSync(inferencePath, 'utf-8')

      const transpileStart = performance.now()
      const inferenceResult = fromTS(inferenceSource)
      const transpileTime = performance.now() - transpileStart

      expect(inferenceResult.code).toBeTruthy()
      expect(inferenceResult.code.length).toBeGreaterThan(1000)

      // Step 2: Execute the transpiled inference module
      // checkType and typeToString work on raw values, not AST nodes
      const execStart = performance.now()
      const strippedInference = inferenceResult.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')

      const inferenceModule = new Function(`
        ${strippedInference}
        return { checkType, typeToString };
      `)()
      const execTime = performance.now() - execStart

      // Step 3: Test transpiled checkType with various types
      const testStart = performance.now()

      // String type
      expect(inferenceModule.checkType('hello', { kind: 'string' })).toBe(true)
      expect(inferenceModule.checkType(42, { kind: 'string' })).toBe(false)

      // Number type
      expect(inferenceModule.checkType(42, { kind: 'number' })).toBe(true)
      expect(inferenceModule.checkType('42', { kind: 'number' })).toBe(false)

      // Boolean type
      expect(inferenceModule.checkType(true, { kind: 'boolean' })).toBe(true)
      expect(inferenceModule.checkType(1, { kind: 'boolean' })).toBe(false)

      // Null handling
      expect(inferenceModule.checkType(null, { kind: 'null' })).toBe(true)
      expect(
        inferenceModule.checkType(null, { kind: 'string', nullable: true })
      ).toBe(true)
      expect(inferenceModule.checkType(null, { kind: 'string' })).toBe(false)

      // Array type
      expect(
        inferenceModule.checkType([1, 2, 3], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(['a', 'b'], {
          kind: 'array',
          items: { kind: 'string' },
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType([1, 'a'], {
          kind: 'array',
          items: { kind: 'number' },
        })
      ).toBe(false)

      // Object type
      expect(
        inferenceModule.checkType(
          { name: 'test', age: 25 },
          {
            kind: 'object',
            shape: { name: { kind: 'string' }, age: { kind: 'number' } },
          }
        )
      ).toBe(true)

      // Union type
      expect(
        inferenceModule.checkType('hello', {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(42, {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(true)
      expect(
        inferenceModule.checkType(true, {
          kind: 'union',
          members: [{ kind: 'string' }, { kind: 'number' }],
        })
      ).toBe(false)

      // Step 4: Test transpiled typeToString
      expect(inferenceModule.typeToString({ kind: 'string' })).toBe('string')
      expect(inferenceModule.typeToString({ kind: 'number' })).toBe('number')
      expect(inferenceModule.typeToString({ kind: 'boolean' })).toBe('boolean')
      expect(
        inferenceModule.typeToString({
          kind: 'array',
          items: { kind: 'string' },
        })
      ).toBe('string[]')
      expect(
        inferenceModule.typeToString({ kind: 'string', nullable: true })
      ).toBe('string | null')

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  True self-hosting test:`)
      console.log(
        `    Transpile inference.ts: ${transpileTime.toFixed(2)}ms (${(
          inferenceResult.code.length / 1024
        ).toFixed(1)}KB)`
      )
      console.log(`    Execute module:         ${execTime.toFixed(2)}ms`)
      console.log(`    Run checkType tests:    ${testTime.toFixed(2)}ms`)
      console.log(`    Total:                  ${totalTime.toFixed(2)}ms`)
      console.log(
        `    Status:                 ✓ Transpiled checkType/typeToString work correctly`
      )
    })

    it('should produce identical checkType results vs native', () => {
      // Transpile and execute inference.ts
      const inferencePath = path.join(import.meta.dir, '../lang/inference.ts')
      const inferenceSource = fs.readFileSync(inferencePath, 'utf-8')
      const inferenceResult = fromTS(inferenceSource)

      const strippedCode = inferenceResult.code
        .replace(/^import\s+.*$/gm, '')
        .replace(/^export\s+/gm, '')

      const bootstrappedInference = new Function(`
        ${strippedCode}
        return { checkType, typeToString };
      `)()

      // Import native inference
      const nativeInference = require('../lang/inference')

      // Test cases: [value, type, expectedResult]
      const testCases: [any, any, boolean][] = [
        ['hello', { kind: 'string' }, true],
        [42, { kind: 'string' }, false],
        [42, { kind: 'number' }, true],
        [true, { kind: 'boolean' }, true],
        [null, { kind: 'null' }, true],
        [null, { kind: 'string', nullable: true }, true],
        [[1, 2, 3], { kind: 'array', items: { kind: 'number' } }, true],
        [{ x: 1 }, { kind: 'object', shape: { x: { kind: 'number' } } }, true],
        [
          'a',
          { kind: 'union', members: [{ kind: 'string' }, { kind: 'number' }] },
          true,
        ],
      ]

      for (const [value, type, expected] of testCases) {
        const nativeResult = nativeInference.checkType(value, type)
        const bootstrappedResult = bootstrappedInference.checkType(value, type)

        expect(bootstrappedResult).toBe(nativeResult)
        expect(bootstrappedResult).toBe(expected)
      }

      // Test typeToString equivalence
      const types = [
        { kind: 'string' },
        { kind: 'number' },
        { kind: 'boolean' },
        { kind: 'null' },
        { kind: 'any' },
        { kind: 'array', items: { kind: 'string' } },
        { kind: 'string', nullable: true },
        { kind: 'object', shape: { name: { kind: 'string' } } },
      ]

      for (const type of types) {
        const nativeStr = nativeInference.typeToString(type)
        const bootstrappedStr = bootstrappedInference.typeToString(type)
        expect(bootstrappedStr).toBe(nativeStr)
      }

      console.log(`\n  Bootstrapped vs Native comparison:`)
      console.log(`    checkType:    ${testCases.length} test cases ✓`)
      console.log(`    typeToString: ${types.length} test cases ✓`)
      console.log(`    All results match native implementation`)
    })

    it('the module list covers every local import of the bundled modules', () => {
      // The strip-comments injection list was made DERIVED (see the header) precisely
      // because a hand-written list with a "remember to update this" note did not get
      // updated. The MODULE list is still hand-written, and it bit exactly the same way:
      // splitting `declaredClassNames` into its own file broke this canary with
      // "declaredClassNames is not defined" — a message naming the symptom, not the cause.
      //
      // Ordering stays manual (the bundle is concatenated, so dependencies come first),
      // but COMPLETENESS does not have to. This reads what the bundled modules actually
      // import from `../lang` and fails naming the missing file.
      //
      // Some imports are deliberately NOT bundled, so each exclusion is listed WITH ITS
      // REASON — an unexplained exemption is a silent hole, which is the same rule
      // `src/docs-index.test.ts` applies to its allowlist.
      const EXCLUDED: Record<string, string> = {
        'types.ts':
          'error classes and type-only declarations; the transpiled bundle never ' +
          'constructs them on the paths under test',
        'inference.ts':
          'acorn-backed engine module — out of scope for a parser-only bundle',
        'predicate.ts':
          'acorn-backed engine module; its one needed function, emitVerifiedPredicate, ' +
          'is injected natively above',
        'switch-transform.ts':
          "acorn-loose-backed, and reachable only from `parse`'s repair path (#43 " +
          'item 4). This bundle exercises `preprocess`, which never calls `parse`, so ' +
          'the import is not on any path it runs.',
      }
      const langDir = path.join(import.meta.dir, '../lang')
      const listed = [
        'parser-types.ts',
        'declared-classes.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]
      const missing: string[] = []
      for (const file of listed) {
        const src = fs.readFileSync(path.join(langDir, file), 'utf-8')
        for (const m of src.matchAll(
          /^import\s[\s\S]*?from\s+'\.\/([\w-]+)'/gm
        )) {
          const dep = `${m[1]}.ts`
          if (listed.includes(dep) || dep in EXCLUDED) continue
          if (fs.existsSync(path.join(langDir, dep))) {
            missing.push(
              `${file} imports ./${m[1]} — add '${dep}' to the bundle list, or to ` +
                `EXCLUDED with a reason`
            )
          }
        }
      }
      expect([...new Set(missing)]).toEqual([])
    })

    it('should execute transpiled preprocess to transform TJS syntax', () => {
      const start = performance.now()

      // Step 1: Transpile all parser modules (split into types, params, transforms, orchestrator)
      const langDir = path.join(import.meta.dir, '../lang')
      const moduleFiles = [
        'parser-types.ts',
        'declared-classes.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]

      const transpileStart = performance.now()
      const combinedCode = flattenModules(moduleFiles, langDir)
      const transpileTime = performance.now() - transpileStart

      expect(combinedCode).toBeTruthy()
      expect(combinedCode.length).toBeGreaterThan(10000)

      // Step 2: Execute the combined transpiled parser modules
      const execStart = performance.now()

      // parser-transforms.ts calls emitVerifiedPredicate (from predicate.ts, an
      // acorn-backed engine module not in this parser-only bundle) — inject the
      // native one so the self-hosted preprocess can verify Type/Generic predicates.
      // Same for stripLineComments, which moved to the dependency-free
      // `src/strip-comments.ts` so `emitters/from-ts.ts` could use it without dragging
      // the whole parser into the browser bundle.
      const parserModule = new Function(
        'emitVerifiedPredicate',
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${combinedCode}
        return { preprocess };
      `
      )(emitVerifiedPredicate, ...STRIP_COMMENTS_VALUES)
      const execTime = performance.now() - execStart

      expect(typeof parserModule.preprocess).toBe('function')

      // Step 3: Test TJS preprocessing
      const testStart = performance.now()

      // Test colon shorthand -> default params
      const result1 = parserModule.preprocess(`
        function greet(name: 'World'): '' {
          return 'Hello, ' + name + '!'
        }
      `)
      expect(result1.source).toContain("name = 'World'")
      expect(result1.source).not.toContain("name: 'World'")

      // Test arrow return type extraction
      const result2 = parserModule.preprocess(`
        function add(a: 0, b: 0): 0 {
          return a + b
        }
      `)
      expect(result2.returnType).toBe('0')
      expect(result2.source).toContain('a = 0')
      expect(result2.source).toContain('b = 0')
      expect(result2.source).not.toContain('-> 0')

      // Test required params (with colon, not default)
      const result3 = parserModule.preprocess(`
        function fetch(url: '') {
          return url
        }
      `)
      // `requiredParams` is a coarse module-wide set of NAMES again. The precise,
      // per-parameter answer is carried positionally (`requiredValueOffsets`), because
      // no key over names or values can distinguish two functions that share both.
      expect(result3.requiredParams.has('url')).toBe(true)
      expect(result3.requiredValueOffsets.size).toBeGreaterThan(0)

      // Test safety markers
      const result4 = parserModule.preprocess(`
        function fast(! x: 0) { return x }
        function safe(? y: 0) { return y }
      `)
      expect(result4.unsafeFunctions.has('fast')).toBe(true)
      expect(result4.safeFunctions.has('safe')).toBe(true)

      // Test Type declaration transformation
      const result5 = parserModule.preprocess(`
        Type User {
          description: 'a user'
          example: { name: '', age: 0 }
        }
      `)
      expect(result5.source).toContain('const User = Type(')

      // Test Generic declaration transformation
      const result6 = parserModule.preprocess(`
        Generic Box<T> {
          description: 'boxed value'
          predicate(x, T) { return T(x.value) }
        }
      `)
      expect(result6.source).toContain('const Box = Generic(')

      // Test Is/IsNot operators
      const result7 = parserModule.preprocess(`
        if (x Is y) { return true }
        if (a IsNot b) { return false }
      `)
      expect(result7.source).toContain('Is(x, y)')
      expect(result7.source).toContain('IsNot(a, b)')

      const testTime = performance.now() - testStart
      const totalTime = performance.now() - start

      console.log(`\n  Transpiled parser (preprocess) test:`)
      console.log(
        `    Transpile parser modules: ${transpileTime.toFixed(2)}ms (${(
          combinedCode.length / 1024
        ).toFixed(1)}KB)`
      )
      console.log(`    Execute module:      ${execTime.toFixed(2)}ms`)
      console.log(`    Run preprocess tests: ${testTime.toFixed(2)}ms`)
      console.log(`    Total:               ${totalTime.toFixed(2)}ms`)
      console.log(
        `    Status:              ✓ Transpiled preprocess transforms TJS correctly`
      )
    })

    it('should produce identical preprocess results vs native', () => {
      // Transpile and execute all parser modules
      const langDir = path.join(import.meta.dir, '../lang')
      const moduleFiles = [
        'parser-types.ts',
        'declared-classes.ts',
        'parser-params.ts',
        'parser-transforms.ts',
        'type-signature.ts',
        'keywords.ts',
        'given-transform.ts',
        'parser.ts',
      ]

      const combinedCode = flattenModules(moduleFiles, langDir)

      const bootstrappedParser = new Function(
        'emitVerifiedPredicate',
        ...STRIP_COMMENTS_EXPORTS,
        `
        ${combinedCode}
        return { preprocess };
      `
      )(emitVerifiedPredicate, ...STRIP_COMMENTS_VALUES)

      // Import native parser
      const nativeParser = require('../lang/parser')

      // Test cases - various TJS syntax
      const testCases = [
        `function f(x: 0) { return x }`,
        `function g(a: '', b = 1): '' { return a }`,
        `function h(! fast: 0) { return fast }`,
        `Type Foo { example: { x: 0 } }`,
        `Generic Bar<T> { predicate(x, T) { return true } }`,
        `if (a Is b) { x = 1 }`,
        `Union Dir 'direction' 'up' | 'down'`,
        `Enum Color 'color' { Red: 'red' }`,
      ]

      let passed = 0
      for (const source of testCases) {
        const nativeResult = nativeParser.preprocess(source)
        const bootstrappedResult = bootstrappedParser.preprocess(source)

        // Compare outputs
        expect(bootstrappedResult.source).toBe(nativeResult.source)
        expect(bootstrappedResult.returnType).toBe(nativeResult.returnType)
        expect([...bootstrappedResult.requiredParams]).toEqual([
          ...nativeResult.requiredParams,
        ])
        expect([...bootstrappedResult.unsafeFunctions]).toEqual([
          ...nativeResult.unsafeFunctions,
        ])
        expect([...bootstrappedResult.safeFunctions]).toEqual([
          ...nativeResult.safeFunctions,
        ])
        passed++
      }

      console.log(`\n  Bootstrapped vs Native preprocess:`)
      console.log(`    ${passed}/${testCases.length} test cases ✓`)
      console.log(`    All outputs match native implementation`)
    })
  })
})
