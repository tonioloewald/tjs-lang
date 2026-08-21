/**
 * tjs convert - Convert TypeScript files to JavaScript (via TJS)
 *
 * By default, converts TS → JS with runtime type checks and introspection.
 * Use --emit-tjs to output the intermediate TJS format instead.
 *
 * Usage:
 *   tjs convert <file.ts>              Convert single file, output to stdout
 *   tjs convert <file.ts> -o <out.js>  Convert single file to output file
 *   tjs convert <dir> -o <outdir>      Convert all .ts files in directory
 *   tjs convert --emit-tjs <file.ts>   Output intermediate TJS instead of JS
 */

import { readEntries, shouldDescend } from '../walk'
import {
  readFileSync,
  writeFileSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { join, basename, dirname, extname } from 'path'
import { fromTS } from '../../lang/emitters/from-ts'
import { reportWarnings } from '../warnings'
import { tjs } from '../../lang'

export interface ConvertOptions {
  output?: string
  recursive?: boolean
  verbose?: boolean
  /** Output intermediate TJS instead of final JS */
  emitTJS?: boolean
}

export async function convert(
  input: string,
  options: ConvertOptions = {}
): Promise<void> {
  const { output, recursive = true, verbose = false, emitTJS = false } = options
  const stats = statSync(input)

  if (stats.isFile()) {
    // Single file conversion
    if (!(await convertFile(input, output, verbose, emitTJS))) process.exit(1)
  } else if (stats.isDirectory()) {
    // Directory conversion
    if (!output) {
      console.error('Error: Output directory required for directory conversion')
      console.error('Usage: tjs convert <dir> -o <outdir>')
      process.exit(1)
    }
    const tally = await convertDirectory(
      input,
      output,
      recursive,
      verbose,
      emitTJS
    )
    // EXIT NON-ZERO on any failure. Reporting a failure and exiting 0 is worse than not
    // reporting it: a CI step goes green while its output is incomplete.
    if (tally.failed > 0) process.exit(1)
  } else {
    console.error(`Error: ${input} is not a file or directory`)
    process.exit(1)
  }
}

/**
 * Convert one file. Returns false on failure — it does NOT swallow.
 *
 * It used to catch its own error and return normally whenever `outputPath` was set, so
 * `convertDirectory`'s `catch { failed++ }` was UNREACHABLE: one good file and one bad
 * file reported "2 converted, 0 failed, 0 skipped" and exited 0, with the bad file
 * silently missing from the output. The failure then surfaced two steps later as
 * `Could not resolve: "./schematic"` at bundle time (issue #24).
 *
 * In the release that headlines the TS→TJS on-ramp, a batch converter that reports success
 * while dropping files makes the 100% dogfood claim unverifiable in anyone else's CI.
 */
async function convertFile(
  inputPath: string,
  outputPath?: string,
  verbose = false,
  emitTJS = false
): Promise<boolean> {
  const source = readFileSync(inputPath, 'utf-8')
  const filename = basename(inputPath)

  try {
    const tjsResult = fromTS(source, { emitTJS: true, filename })

    // Unconditional, not behind --verbose. Conversion is exactly the moment a TS author
    // learns which annotations survived and which degraded to `any` — hiding the remedy
    // behind a flag they have no reason to pass makes the guidance arrive never. This is
    // the release's own measured finding: a shown remedy is repaired ~80% of the time, a
    // bare diagnostic 0%.
    reportWarnings(inputPath, tjsResult.warnings)

    let code: string

    if (emitTJS) {
      // Output intermediate TJS
      code = tjsResult.code
    } else {
      // Chain through tjs() for full JS with runtime checks
      const jsResult = tjs(tjsResult.code, {
        filename,
        runTests: 'report',
      })

      // Report test results
      const testResults = jsResult.testResults || []
      if (testResults.length > 0) {
        const passed = testResults.filter((r) => r.passed).length
        const failures = testResults.filter((r) => !r.passed)

        if (failures.length > 0) {
          console.error(
            `${inputPath}: ${passed} passed, ${failures.length} failed`
          )
          for (const f of failures) {
            if (f.isSignatureTest) {
              console.error(`  ✗ Signature: ${f.error}`)
            } else {
              console.error(`  ✗ ${f.description}: ${f.error}`)
            }
          }
        } else if (verbose) {
          console.error(`  ✓ ${testResults.length} tests passed`)
        }
      }

      code = jsResult.code
    }

    if (outputPath) {
      // Ensure output directory exists
      const outDir = dirname(outputPath)
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true })
      }
      writeFileSync(outputPath, code)
      console.log(`✓ ${inputPath} -> ${outputPath}`)
    } else {
      // Output to stdout
      console.log(code)
    }
    return true
  } catch (error: any) {
    console.error(`✗ ${inputPath}: ${error.message}`)
    return false
  }
}

async function convertDirectory(
  inputDir: string,
  outputDir: string,
  recursive: boolean,
  verbose: boolean,
  emitTJS: boolean
): Promise<{ converted: number; failed: number; skipped: number }> {
  // Shared entry listing — see `readEntries`, and `emit` for the three hazards it closes.
  const entries = readEntries(inputDir)
  let converted = 0
  let failed = 0
  let skipped = 0

  const outExt = emitTJS ? '.tjs' : '.js'

  for (const { name: entry, isFile, isDirectory } of entries) {
    const inputPath = join(inputDir, entry)

    if (isDirectory && recursive && shouldDescend(entry)) {
      // `shouldDescend` — SHARED with the other walks, because this one had neither
      // exclusion. `tjs convert . -o out` mirrored `node_modules` and every dot-directory
      // into the output: 913 real `.ts` files in this repo alone, converted and written.
      //
      // Recurse into subdirectory — and CARRY THE TALLY UP. A nested failure used to
      // vanish at the recursion boundary as well as at the try/catch.
      const sub = await convertDirectory(
        inputPath,
        join(outputDir, entry),
        recursive,
        verbose,
        emitTJS
      )
      converted += sub.converted
      failed += sub.failed
      skipped += sub.skipped
    } else if (isFile && extname(entry) === '.ts') {
      // Skip test files and declaration files
      if (entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
        skipped++
        if (verbose) {
          console.log(`- Skipping ${inputPath}`)
        }
        continue
      }

      const outputPath = join(outputDir, entry.replace(/\.ts$/, outExt))
      if (await convertFile(inputPath, outputPath, verbose, emitTJS))
        converted++
      else failed++
    }
  }

  if (verbose || converted > 0 || failed > 0) {
    console.log(
      `\nDirectory ${inputDir}: ${converted} converted, ${failed} failed, ${skipped} skipped`
    )
  }
  return { converted, failed, skipped }
}
