/*
 * docs.js - Documentation extractor for agent-99
 *
 * Scans source files for /*# ... *​/ markdown blocks and .md files,
 * outputs demo/docs.json for the documentation site.
 *
 * Adapted from tosijs-ui's docs.js
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

const TRIM_REGEX = /^#+ |`/g

function metadata(content, filePath) {
  let source = content.match(/<\!\-\-(\{.*\})\-\->|\/\*(\{.*\})\*\//)
  let data = {}
  if (source) {
    try {
      data = JSON.parse(source[1] || source[2])
    } catch (e) {
      console.error('bad metadata in doc', filePath)
    }
  }
  return data
}

function pinnedSort(a, b) {
  a =
    (a.pin === 'top' ? 'A' : a.pin === 'bottom' ? 'Z' : 'M') +
    a.title.toLocaleLowerCase()
  b =
    (b.pin === 'top' ? 'A' : b.pin === 'bottom' ? 'Z' : 'M') +
    b.title.toLocaleLowerCase()
  return a > b ? 1 : b > a ? -1 : 0
}

function findMarkdownFiles(dirs, ignore) {
  let markdownFiles = []

  function traverseDirectory(dir, ignore) {
    const files = readdirSync(dir)
    if (ignore.includes(basename(dir))) {
      return
    }

    files.forEach((file) => {
      const filePath = join(dir, file)

      // Skip if in ignore list
      if (ignore.includes(file)) {
        return
      }

      const stats = statSync(filePath)

      if (stats.isDirectory()) {
        traverseDirectory(filePath, ignore)
      } else if (extname(file) === '.md') {
        const content = readFileSync(filePath, 'utf8')
        // Find the first heading line (skip metadata comments)
        const lines = content.split('\n')
        let titleLine = lines.find((line) => line.startsWith('#')) || lines[0]
        markdownFiles.push({
          text: content,
          title: titleLine.replace(TRIM_REGEX, ''),
          filename: file,
          path: filePath,
          ...metadata(content, filePath),
        })
      } else if (['.ts', '.js'].includes(extname(file))) {
        const content = readFileSync(filePath, 'utf8')
        // Match /*# ... */ blocks (inline markdown documentation)
        const docs = content.match(/\/\*#[\s\S]+?\*\//g) || []
        if (docs.length) {
          const markdown = docs.map((s) => s.substring(3, s.length - 2).trim())
          const text = markdown.join('\n\n---\n\n')
          // Use filename as title for source files (more descriptive than first heading)
          const fileTitle = basename(file, extname(file))
          markdownFiles.push({
            text,
            title: `${fileTitle} (inline docs)`,
            filename: file,
            path: filePath,
            ...metadata(content, filePath),
          })
        }
      }
    })
  }

  dirs.forEach((dir) => {
    traverseDirectory(dir, ignore)
  })

  return markdownFiles.sort(pinnedSort)
}

function saveAsJSON(data, outputFilePath) {
  const jsonData = JSON.stringify(data, null, 2)
  writeFileSync(outputFilePath, jsonData, 'utf8')
  console.log(`Generated ${outputFilePath} with ${data.length} documents`)
}

// Directories to ignore
const ignore = [
  'node_modules',
  'dist',
  'docs',
  'third-party',
  '.git',
  '.archive',
  'editors',
  'demo',
  'bin',
]

// Directories to search
const directoriesToSearch = ['.']

// Dedupe by normalized path
function dedupeByPath(docs) {
  const seen = new Map()
  for (const doc of docs) {
    // Normalize path to avoid duplicates from different starting points
    const normalizedPath = doc.path.replace(/^\.\//, '')
    if (!seen.has(normalizedPath)) {
      seen.set(normalizedPath, doc)
    }
  }
  return Array.from(seen.values())
}

// Find all documentation and dedupe
const markdownFiles = dedupeByPath(
  findMarkdownFiles(directoriesToSearch, ignore)
)

// Save to demo/docs.json
const outputPath = './demo/docs.json'
saveAsJSON(markdownFiles, outputPath)

// List what was found
console.log('\nDocuments found:')
markdownFiles.forEach((doc, i) => {
  const pinIndicator =
    doc.pin === 'top'
      ? ' [pinned top]'
      : doc.pin === 'bottom'
      ? ' [pinned bottom]'
      : ''
  console.log(`  ${i + 1}. ${doc.title}${pinIndicator} (${doc.filename})`)
})
