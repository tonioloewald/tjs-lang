/**
 * tjs emit - Output transpiled JavaScript
 *
 * Usage:
 *   tjs emit <file.tjs>                 Emit single file to stdout
 *   tjs emit <file.tjs> -o <out.js>     Emit single file to output
 *   tjs emit <dir> -o <outdir>          Emit all .tjs files in directory
 *   tjs emit --unsafe <file.tjs>        Emit without __tjs metadata (production)
 *   tjs emit --no-docs <file.tjs>       Suppress documentation generation
 *   tjs emit --docs-dir <dir>           Output docs to separate directory
 *   tjs emit --jfdi <file.tjs>          Emit even if tests fail (just fucking do it)
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { join, basename, dirname, extname, relative } from 'path'
import { tjs } from '../../lang'
import { generateDocs } from '../../lang/docs'

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
}

export async function emit(
  input: string,
  options: EmitOptions = {}
): Promise<void> {
  const { output, recursive = true, verbose = false } = options

  // Check if input exists
  if (!existsSync(input)) {
    console.error(`Error: ${input} does not exist`)
    process.exit(1)
  }

  const stats = statSync(input)

  if (stats.isFile()) {
    await emitFile(input, output, options)
  } else if (stats.isDirectory()) {
    if (!output) {
      console.error('Error: Output directory required for directory emit')
      console.error('Usage: tjs emit <dir> -o <outdir>')
      process.exit(1)
    }
    await emitDirectory(input, output, recursive, options)
  } else {
    console.error(`Error: ${input} is not a file or directory`)
    process.exit(1)
  }
}

async function emitFile(
  inputPath: string,
  outputPath: string | undefined,
  options: EmitOptions
): Promise<void> {
  const source = readFileSync(inputPath, 'utf-8')
  const filename = basename(inputPath)

  try {
    // Use 'report' mode to get test results without throwing
    const result = tjs(source, {
      filename,
      debug: options.debug,
      runTests: 'report',
    })

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
      return
    }

    let code = result.code

    // Strip __tjs metadata if unsafe mode
    if (options.unsafe) {
      code = stripTJSMetadata(code)
    }

    if (outputPath) {
      // Ensure output directory exists
      const outDir = dirname(outputPath)
      if (outDir && !existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true })
      }
      writeFileSync(outputPath, code)
      if (options.verbose) {
        const suffix = hasFailures ? ' (tests failed, --jfdi)' : ''
        console.log(`✓ ${inputPath} -> ${outputPath}${suffix}`)
      }

      // Generate docs unless suppressed
      if (!options.noDocs) {
        try {
          const docs = generateDocs(source)
          const docsPath = options.docsDir
            ? join(
                options.docsDir,
                basename(outputPath).replace(/\.js$/, '.md')
              )
            : outputPath.replace(/\.js$/, '.md')

          // Ensure docs directory exists
          const docsDir = dirname(docsPath)
          if (docsDir && !existsSync(docsDir)) {
            mkdirSync(docsDir, { recursive: true })
          }

          writeFileSync(docsPath, docs.markdown)
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
      // Output to stdout
      console.log(code)
    }
  } catch (error: any) {
    // This is a real transpilation error (syntax, parse, etc.)
    console.error(`✗ ${inputPath}: ${error.message}`)
    if (!outputPath) {
      process.exit(1)
    }
  }
}

async function emitDirectory(
  inputDir: string,
  outputDir: string,
  recursive: boolean,
  options: EmitOptions
): Promise<void> {
  const entries = readdirSync(inputDir)
  let emitted = 0
  let failed = 0
  let skipped = 0

  for (const entry of entries) {
    const inputPath = join(inputDir, entry)
    const stats = statSync(inputPath)

    if (stats.isDirectory()) {
      if (recursive && !entry.startsWith('.') && entry !== 'node_modules') {
        const subOutputDir = join(outputDir, entry)
        await emitDirectory(inputPath, subOutputDir, recursive, options)
      }
    } else if (stats.isFile() && extname(entry) === '.tjs') {
      // Skip test files for production emit
      if (entry.endsWith('.test.tjs')) {
        skipped++
        if (options.verbose) {
          console.log(`- Skipping test: ${inputPath}`)
        }
        continue
      }

      const outputPath = join(outputDir, entry.replace(/\.tjs$/, '.js'))
      try {
        await emitFile(inputPath, outputPath, { ...options, verbose: true })
        emitted++
      } catch {
        failed++
      }
    }
  }

  if (options.verbose || emitted > 0 || failed > 0) {
    console.log(
      `\n${inputDir}: ${emitted} emitted, ${failed} failed, ${skipped} skipped`
    )
  }
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
