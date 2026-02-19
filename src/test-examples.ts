/**
 * Helpers for loading and testing playground example markdown files.
 *
 * Usage:
 *   import { loadExample, loadExamples } from './test-examples'
 *
 *   const ex = loadExample('guides/examples/tjs/wasm-starfield.md')
 *   // ex.code     — the source code from the first code block
 *   // ex.language — 'tjs', 'ajs', 'javascript', etc.
 *   // ex.title    — from the markdown # heading
 *   // ex.metadata — parsed JSON from <!--{...}--> comment
 *
 *   const all = loadExamples('guides/examples/tjs')
 *   // array of all examples in that directory
 */

import { readFileSync, readdirSync } from 'fs'
import { join, extname } from 'path'

export interface ExampleFile {
  /** Absolute or relative path to the source .md file */
  path: string
  /** Title from the first # heading */
  title: string
  /** Description — first paragraph between title and code block */
  description: string
  /** Source code from the first fenced code block */
  code: string
  /** Language tag from the code fence (e.g. 'tjs', 'ajs', 'javascript') */
  language: string
  /** Parsed metadata from the <!--{...}--> comment, if present */
  metadata: Record<string, any>
}

/**
 * Load a single example from a markdown file.
 */
export function loadExample(filePath: string): ExampleFile {
  const content = readFileSync(filePath, 'utf-8')
  return parseExample(content, filePath)
}

/**
 * Load all .md examples from a directory.
 */
export function loadExamples(dirPath: string): ExampleFile[] {
  const files = readdirSync(dirPath)
    .filter((f) => extname(f) === '.md')
    .sort()
  return files.map((f) => loadExample(join(dirPath, f)))
}

/**
 * Parse example content from markdown source.
 */
export function parseExample(content: string, filePath = ''): ExampleFile {
  // Extract metadata from <!--{...}--> comment
  const metaMatch = content.match(/<!--(\{.*?\})-->/)
  let metadata: Record<string, any> = {}
  if (metaMatch) {
    try {
      metadata = JSON.parse(metaMatch[1])
    } catch {
      /* invalid JSON metadata, ignore */
    }
  }

  // Extract title from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : ''

  // Extract description — text between title and first code fence
  let description = ''
  if (titleMatch) {
    const afterTitle = content.slice(
      content.indexOf(titleMatch[0]) + titleMatch[0].length
    )
    const beforeCode = afterTitle.split(/^```/m)[0]
    description = beforeCode
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('<!--'))
      .join(' ')
  }

  // Extract first fenced code block (supports ``` or ```` fences)
  const codeMatch = content.match(/^(`{3,})(\w*)\n([\s\S]*?)^\1/m)
  const language = codeMatch?.[2] || ''
  const code = codeMatch?.[3]?.trimEnd() || ''

  return { path: filePath, title, description, code, language, metadata }
}
