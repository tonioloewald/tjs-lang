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

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'fs'
import { join, basename, dirname, extname } from 'path'
import { fromTS } from '../../lang/emitters/from-ts'
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
    await convertFile(input, output, verbose, emitTJS)
  } else if (stats.isDirectory()) {
    // Directory conversion
    if (!output) {
      console.error('Error: Output directory required for directory conversion')
      console.error('Usage: tjs convert <dir> -o <outdir>')
      process.exit(1)
    }
    await convertDirectory(input, output, recursive, verbose, emitTJS)
  } else {
    console.error(`Error: ${input} is not a file or directory`)
    process.exit(1)
  }
}

async function convertFile(
  inputPath: string,
  outputPath?: string,
  verbose = false,
  emitTJS = false
): Promise<void> {
  const source = readFileSync(inputPath, 'utf-8')
  const filename = basename(inputPath)

  try {
    const tjsResult = fromTS(source, { emitTJS: true, filename })

    if (tjsResult.warnings && tjsResult.warnings.length > 0 && verbose) {
      console.error(`Warnings for ${inputPath}:`)
      for (const warning of tjsResult.warnings) {
        console.error(`  - ${warning}`)
      }
    }

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
  } catch (error: any) {
    console.error(`✗ ${inputPath}: ${error.message}`)
    if (!outputPath) {
      process.exit(1)
    }
  }
}

async function convertDirectory(
  inputDir: string,
  outputDir: string,
  recursive: boolean,
  verbose: boolean,
  emitTJS: boolean
): Promise<void> {
  const entries = readdirSync(inputDir)
  let converted = 0
  let failed = 0
  let skipped = 0

  const outExt = emitTJS ? '.tjs' : '.js'

  for (const entry of entries) {
    const inputPath = join(inputDir, entry)
    const stats = statSync(inputPath)

    if (stats.isDirectory() && recursive) {
      // Recurse into subdirectory
      const subOutputDir = join(outputDir, entry)
      await convertDirectory(
        inputPath,
        subOutputDir,
        recursive,
        verbose,
        emitTJS
      )
    } else if (stats.isFile() && extname(entry) === '.ts') {
      // Skip test files and declaration files
      if (entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
        skipped++
        if (verbose) {
          console.log(`- Skipping ${inputPath}`)
        }
        continue
      }

      const outputPath = join(outputDir, entry.replace(/\.ts$/, outExt))
      try {
        await convertFile(inputPath, outputPath, verbose, emitTJS)
        converted++
      } catch {
        failed++
      }
    }
  }

  if (verbose || converted > 0 || failed > 0) {
    console.log(
      `\nDirectory ${inputDir}: ${converted} converted, ${failed} failed, ${skipped} skipped`
    )
  }
}
