/**
 * tjs emit - Output transpiled JavaScript
 *
 * Usage:
 *   tjs emit <file.tjs>                 Emit single file to stdout
 *   tjs emit <file.tjs> -o <out.js>     Emit single file to output
 *   tjs emit <dir> -o <outdir>          Emit all .tjs files in directory
 *   tjs emit --unsafe <file.tjs>        Emit without __tjs metadata (production)
 *   tjs emit --dts <file.tjs>           Also generate .d.ts declaration file
 *   tjs emit --no-docs <file.tjs>       Suppress documentation generation
 *   tjs emit --docs-dir <dir>           Output docs to separate directory
 *   tjs emit --jfdi <file.tjs>          Emit even if tests fail (just fucking do it)
 */

import { walkTree, writeEmitted } from '../walk'
import { readFileSync, statSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import { tjs, dialectForFilename } from '../../lang'
import { generateDocs } from '../../lang/docs'
import { reportWarnings } from '../warnings'
import { generateDTS } from '../../lang/emitters/dts'

export interface EmitOptions {
  /** Include source locations in __tjs metadata */
  debug?: boolean
  /** Output path (file or directory) */
  output?: string
  /** Strip __tjs metadata for production builds */
  unsafe?: boolean
  /** Recursive directory processing */
  recursive?: boolean
  /** Verbose output */
  verbose?: boolean
  /** Suppress documentation generation */
  noDocs?: boolean
  /** Output docs to separate directory (default: alongside JS) */
  docsDir?: string
  /** Emit even if tests fail (just fucking do it) */
  jfdi?: boolean
  /** Generate .d.ts TypeScript declaration file alongside JS */
  dts?: boolean
}

export async function emit(
  input: string,
  options: EmitOptions = {}
): Promise<void> {
  const { output, recursive = true } = options

  // Check if input exists
  if (!existsSync(input)) {
    console.error(`Error: ${input} does not exist`)
    process.exit(1)
  }

  const stats = statSync(input)

  if (stats.isFile()) {
    // Exit code follows the outcome. A single-file emit that failed used to exit 0 with no
    // file written whenever `-o` was given.
    if (!(await emitFile(input, output, options))) process.exit(1)
  } else if (stats.isDirectory()) {
    if (!output) {
      console.error('Error: Output directory required for directory emit')
      console.error('Usage: tjs emit <dir> -o <outdir>')
      process.exit(1)
    }
    const tally = await emitDirectory(input, output, recursive, options)
    if (tally.failed > 0) process.exit(1)
  } else {
    console.error(`Error: ${input} is not a file or directory`)
    process.exit(1)
  }
}

/**
 * A sibling artifact path (`.d.ts`, `.md`) derived from the emitted file's path.
 *
 * `outputPath.replace(/\.js$/, …)` only matches a literal `.js`, so `-o out/a.mjs` — the
 * normal ask for a `"type": "module"` package — produced `docsPath === outputPath` and the
 * generated MARKDOWN overwrote the module it had just written. Exit 0, `✓ a.tjs -> out/a.mjs`,
 * and the file starts with a fenced code block. With `--dts` it happened twice.
 *
 * Stripping whatever extension is actually there fixes the common case; the equality check
 * is what makes it safe in general, because a derived path equal to the artifact is a BUG,
 * never a user's intent.
 */
function siblingPath(outputPath: string, suffix: string): string | null {
  const stem = outputPath.replace(/\.[^./\\]+$/, '')
  const candidate = `${stem}${suffix}`
  return candidate === outputPath ? null : candidate
}

/**
 * Emit ONE file. Returns whether it actually produced output.
 *
 * It used to return `void` and swallow its own error whenever `outputPath` was set, so
 * `emitDirectory`'s `catch { failed++ }` was unreachable for the entire practical surface:
 * a directory containing one broken file reported `2 emitted, 0 failed`, exit 0, with the
 * broken file's output ABSENT. `tjs emit` is the documented production build path, so a CI
 * step went green having produced a missing module. `convert` fixed exactly this (issue
 * #24) and `emit`, its structural twin, never got the same treatment.
 */
async function emitFile(
  inputPath: string,
  outputPath: string | undefined,
  options: EmitOptions,
  /** The user-named `-o` directory, if any — writes may not escape it. */
  root?: string
): Promise<boolean> {
  const source = readFileSync(inputPath, 'utf-8')
  const filename = basename(inputPath)

  try {
    // Use 'report' mode to get test results without throwing.
    // `.js`/`.mjs` ⇒ plain-JS semantics preserved; `.tjs` ⇒ native modes.
    const result = tjs(source, {
      filename,
      dialect: dialectForFilename(inputPath),
      debug: options.debug,
      runTests: 'report',
    })

    // Warnings to STDERR, so `tjs emit file.tjs > out.js` still produces clean output.
    // `emit` was silent about degraded annotations, which is the worst place for it: the
    // author is generating the artifact they will ship, and the moment to learn a type
    // was dropped is before that, not after.
    reportWarnings(inputPath, result.warnings)

    // Check test results
    const testResults = result.testResults || []
    const failures = testResults.filter((r) => !r.passed)
    const hasFailures = failures.length > 0

    // Report test results
    if (testResults.length > 0) {
      const passed = testResults.filter((r) => r.passed).length
      const failed = failures.length

      if (options.verbose || hasFailures) {
        if (hasFailures) {
          console.log(`\n${inputPath}: ${passed} passed, ${failed} failed`)
          for (const f of failures) {
            if (f.isSignatureTest) {
              console.log(`  ✗ Signature: ${f.error}`)
            } else {
              console.log(`  ✗ ${f.description}: ${f.error}`)
            }
          }
        } else if (options.verbose) {
          console.log(`  ✓ ${testResults.length} tests passed`)
        }
      }
    }

    // Don't emit if tests failed (unless --jfdi)
    if (hasFailures && !options.jfdi) {
      if (!options.verbose) {
        // Show failures even in non-verbose mode
        console.error(`✗ ${inputPath}: ${failures.length} test(s) failed`)
        for (const f of failures) {
          if (f.isSignatureTest) {
            console.error(`  Signature: ${f.error}`)
          } else {
            console.error(`  ${f.description}: ${f.error}`)
          }
        }
      }
      console.error(`  (use --jfdi to emit anyway)`)
      // A failed signature test means NO FILE IS WRITTEN, so it is a failure and must be
      // reported as one. A bare `return` here was counted as success.
      return false
    }

    let code = result.code

    // Strip __tjs metadata if unsafe mode
    if (options.unsafe) {
      code = stripTJSMetadata(code)
    }

    if (outputPath) {
      // `writeEmitted` — re-attaches the `#!` line and refuses to write THROUGH a symlink.
      writeEmitted(outputPath, code, result.hashbang, root)
      if (options.verbose) {
        const suffix = hasFailures ? ' (tests failed, --jfdi)' : ''
        console.log(`✓ ${inputPath} -> ${outputPath}${suffix}`)
      }

      // Generate .d.ts if requested
      if (options.dts) {
        try {
          const dtsContent = generateDTS(result, source)
          const dtsPath = siblingPath(outputPath, '.d.ts')
          if (!dtsPath) {
            console.error(
              `✗ ${inputPath}: --dts would overwrite ${outputPath}; choose a different -o`
            )
            return false
          }

          // Through the same boundary as the JS. `emit` writes THREE files and only the
          // first went through `writeEmitted`, so `emit --dts` still destroyed a symlink's
          // target — the identical defect, surviving in a sibling site twenty lines below
          // the fix for it.
          writeEmitted(dtsPath, dtsContent, undefined, root)
          if (options.verbose) {
            console.log(`  ${dtsPath}`)
          }
        } catch (dtsError: any) {
          if (options.verbose) {
            console.log(`  .d.ts skipped: ${dtsError.message}`)
          }
        }
      }

      // Generate docs unless suppressed
      if (!options.noDocs) {
        try {
          const docs = generateDocs(source)
          const docsPath = options.docsDir
            ? join(
                options.docsDir,
                `${basename(outputPath).replace(/\.[^./\\]+$/, '')}.md`
              )
            : siblingPath(outputPath, '.md')
          if (!docsPath) {
            console.error(
              `✗ ${inputPath}: docs would overwrite ${outputPath}; choose a different -o`
            )
            return false
          }

          // Ensure docs directory exists
          writeEmitted(
            docsPath,
            docs.markdown,
            undefined,
            options.docsDir ?? root
          )
          if (options.verbose) {
            console.log(`  📄 ${docsPath}`)
          }
        } catch (docsError: any) {
          // Don't fail emit if docs generation fails
          if (options.verbose) {
            console.log(`  ⚠ docs skipped: ${docsError.message}`)
          }
        }
      }
    } else {
      // STDOUT is an artifact sink too — the `#!` line belongs here as well.
      //
      // `tjs emit bin.tjs > bin.js` is the FIRST example in `--help`, appears in
      // `docs/WASM-QUICKSTART.md` and `guides/tjs-examples.md`, and is what
      // `functions/package.json`'s build script actually runs. Moving the hashbang to the
      // file-write seam fixed `-o` and silently regressed this branch — the same
      // sibling-site miss, inside the fix for that class. A file and a pipe are two
      // consumers of one decision; they must not be written in two places.
      process.stdout.write(
        result.hashbang ? `${result.hashbang}\n${code}` : code
      )
      if (!code.endsWith('\n')) process.stdout.write('\n')
    }
    return true
  } catch (error: any) {
    // This is a real transpilation error (syntax, parse, etc.)
    console.error(`✗ ${inputPath}: ${error.message}`)
    // REPORTED, not swallowed. The caller decides the exit code — a single-file emit exits
    // non-zero, and a directory emit counts it and exits non-zero at the end.
    return false
  }
}

/**
 * Emit a directory tree — the per-command policy, over the shared `walkTree`.
 *
 * What used to be forty lines duplicated with `convertDirectory` is now four callbacks: the
 * extension we take, the files we deliberately skip, how the output is named, and the work
 * itself. The descent policy, tally rollup and `-o` containment live in `walkTree`, which is
 * where they stopped being possible to fix in only one of two places.
 */
async function emitDirectory(
  inputDir: string,
  outputDir: string,
  recursive: boolean,
  options: EmitOptions
): Promise<{ emitted: number; failed: number; skipped: number }> {
  const tally = await walkTree(inputDir, outputDir, {
    recursive,
    accept: (n) => extname(n) === '.tjs',
    // Test files are not production output.
    skip: (n) => n.endsWith('.test.tjs'),
    onSkip: (p) => options.verbose && console.log(`- Skipping test: ${p}`),
    outputName: (n) => n.replace(/\.tjs$/, '.js'),
    onFile: (inputPath, outputPath, root) =>
      emitFile(inputPath, outputPath, { ...options, verbose: true }, root),
  })

  if (options.verbose || tally.ok > 0 || tally.failed > 0) {
    console.log(
      `\n${inputDir}: ${tally.ok} emitted, ${tally.failed} failed, ${tally.skipped} skipped`
    )
  }
  return { emitted: tally.ok, failed: tally.failed, skipped: tally.skipped }
}

/**
 * Strip __tjs metadata from transpiled code for production builds.
 * This removes runtime validation, giving pure JS performance.
 */
function stripTJSMetadata(code: string): string {
  // Remove __tjs property assignments from function declarations
  // Pattern: function foo(x) { ... }\nfoo.__tjs = { ... };
  code = code.replace(/\n\w+\.__tjs\s*=\s*\{[^}]*\};?/g, '')

  // Remove __tjs from object method shorthand and arrow functions
  // Pattern: const foo = (x) => { ... };\nfoo.__tjs = { ... };
  code = code.replace(/;\s*\w+\.__tjs\s*=\s*\{[^}]*\};?/g, ';')

  // Remove standalone __tjs assignments that might remain
  code = code.replace(/^\w+\.__tjs\s*=\s*\{[^}]*\};?\n?/gm, '')

  // Clean up any double newlines left behind
  code = code.replace(/\n{3,}/g, '\n\n')

  return code
}
