/**
 * tjs convert - Convert TypeScript files to TJS
 *
 * Usage:
 *   tjs convert <file.ts>              Convert single file, output to stdout
 *   tjs convert <file.ts> -o <out.tjs> Convert single file to output file
 *   tjs convert <dir> -o <outdir>      Convert all .ts files in directory
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs'
import { join, basename, dirname, extname } from 'path'
import { fromTS } from '../../lang/emitters/from-ts'

export interface ConvertOptions {
  output?: string
  recursive?: boolean
  verbose?: boolean
}

export async function convert(input: string, options: ConvertOptions = {}): Promise<void> {
  const { output, recursive = true, verbose = false } = options
  const stats = statSync(input)

  if (stats.isFile()) {
    // Single file conversion
    await convertFile(input, output, verbose)
  } else if (stats.isDirectory()) {
    // Directory conversion
    if (!output) {
      console.error('Error: Output directory required for directory conversion')
      console.error('Usage: tjs convert <dir> -o <outdir>')
      process.exit(1)
    }
    await convertDirectory(input, output, recursive, verbose)
  } else {
    console.error(`Error: ${input} is not a file or directory`)
    process.exit(1)
  }
}

async function convertFile(inputPath: string, outputPath?: string, verbose = false): Promise<void> {
  const source = readFileSync(inputPath, 'utf-8')
  const filename = basename(inputPath)

  try {
    const result = fromTS(source, { emitTJS: true, filename })

    if (result.warnings.length > 0 && verbose) {
      console.error(`Warnings for ${inputPath}:`)
      for (const warning of result.warnings) {
        console.error(`  - ${warning}`)
      }
    }

    if (outputPath) {
      // Ensure output directory exists
      const outDir = dirname(outputPath)
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true })
      }
      writeFileSync(outputPath, result.code)
      console.log(`✓ ${inputPath} -> ${outputPath}`)
    } else {
      // Output to stdout
      console.log(result.code)
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
  verbose: boolean
): Promise<void> {
  const entries = readdirSync(inputDir)
  let converted = 0
  let failed = 0
  let skipped = 0

  for (const entry of entries) {
    const inputPath = join(inputDir, entry)
    const stats = statSync(inputPath)

    if (stats.isDirectory() && recursive) {
      // Recurse into subdirectory
      const subOutputDir = join(outputDir, entry)
      await convertDirectory(inputPath, subOutputDir, recursive, verbose)
    } else if (stats.isFile() && extname(entry) === '.ts') {
      // Skip test files and declaration files
      if (entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) {
        skipped++
        if (verbose) {
          console.log(`- Skipping ${inputPath}`)
        }
        continue
      }

      const outputPath = join(outputDir, entry.replace(/\.ts$/, '.tjs'))
      try {
        await convertFile(inputPath, outputPath, verbose)
        converted++
      } catch {
        failed++
      }
    }
  }

  if (verbose || converted > 0 || failed > 0) {
    console.log(`\nDirectory ${inputDir}: ${converted} converted, ${failed} failed, ${skipped} skipped`)
  }
}
