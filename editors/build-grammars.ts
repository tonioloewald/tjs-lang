#!/usr/bin/env bun
/**
 * Build script for editor grammars
 *
 * Generates JSON grammar files from the TypeScript source of truth (ajs-syntax.ts).
 * Run with: bun editors/build-grammars.ts
 */

import { KEYWORDS, FORBIDDEN_KEYWORDS, TYPE_CONSTRUCTORS } from './ajs-syntax'
import { writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'

const editorsDir = dirname(new URL(import.meta.url).pathname)

// VSCode TextMate grammar
function buildVSCodeGrammar() {
  const grammarPath = join(editorsDir, 'vscode/syntaxes/ajs.tmLanguage.json')

  // Build regex patterns from arrays
  const forbiddenPattern = `\\\\b(${FORBIDDEN_KEYWORDS.join('|')})\\\\b`
  const keywordsPattern = `\\\\b(${KEYWORDS.filter(
    (k) => !['true', 'false', 'null', 'undefined'].includes(k)
  ).join('|')})\\\\b`
  const constantsPattern = `\\\\b(true|false|null|undefined)\\\\b`

  const grammar = {
    $schema:
      'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'AsyncJS',
    scopeName: 'source.ajs',
    patterns: [
      { include: '#comments' },
      { include: '#strings' },
      { include: '#function-def' },
      { include: '#forbidden' },
      { include: '#keywords' },
      { include: '#builtins' },
      { include: '#type-parameters' },
      { include: '#numbers' },
      { include: '#operators' },
    ],
    repository: {
      'function-def': {
        begin: '\\b(function)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(',
        beginCaptures: {
          '1': { name: 'keyword.control.ajs' },
          '2': { name: 'entity.name.function.ajs' },
        },
        end: '\\)',
        patterns: [{ include: '#type-parameters' }, { include: '#comments' }],
      },
      'type-parameters': {
        patterns: [
          {
            comment: "Required parameter with type: name: 'string' or name: 0",
            match:
              '([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*(:)\\s*(\'[^\']*\'|"[^"]*"|\\d+|\\{[^}]*\\}|\\[[^\\]]*\\]|true|false|null)',
            captures: {
              '1': { name: 'variable.parameter.ajs' },
              '2': { name: 'punctuation.separator.ajs' },
              '3': { name: 'support.type.ajs' },
            },
          },
          {
            comment: 'Optional parameter with default: name = value',
            match:
              '([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*(=)\\s*(?=null\\s*&&|\'|"|\\d|\\{|\\[|true|false|null)',
            captures: {
              '1': { name: 'variable.parameter.ajs' },
              '2': { name: 'keyword.operator.assignment.ajs' },
            },
          },
          {
            comment: 'Simple parameter name',
            match: '([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\\s*[,)])',
            captures: {
              '1': { name: 'variable.parameter.ajs' },
            },
          },
        ],
      },
      forbidden: {
        comment: 'Auto-generated from editors/ajs-syntax.ts FORBIDDEN_KEYWORDS',
        patterns: [
          {
            match: forbiddenPattern,
            name: 'invalid.illegal.forbidden.ajs',
          },
        ],
      },
      keywords: {
        comment: 'Auto-generated from editors/ajs-syntax.ts KEYWORDS',
        patterns: [
          {
            match: keywordsPattern,
            name: 'keyword.control.ajs',
          },
          {
            match: constantsPattern,
            name: 'constant.language.ajs',
          },
        ],
      },
      builtins: {
        comment: 'Auto-generated from editors/ajs-syntax.ts TYPE_CONSTRUCTORS',
        patterns: [
          {
            match: `\\\\b(${TYPE_CONSTRUCTORS.join('|')})\\\\b`,
            name: 'support.class.ajs',
          },
        ],
      },
      strings: {
        patterns: [
          {
            name: 'string.quoted.single.ajs',
            begin: "'",
            end: "'",
            patterns: [
              { name: 'constant.character.escape.ajs', match: '\\\\.' },
            ],
          },
          {
            name: 'string.quoted.double.ajs',
            begin: '"',
            end: '"',
            patterns: [
              { name: 'constant.character.escape.ajs', match: '\\\\.' },
            ],
          },
          {
            name: 'string.template.ajs',
            begin: '`',
            end: '`',
            patterns: [
              { name: 'constant.character.escape.ajs', match: '\\\\.' },
              {
                name: 'meta.template.expression.ajs',
                begin: '\\$\\{',
                end: '\\}',
                beginCaptures: {
                  '0': {
                    name: 'punctuation.definition.template-expression.begin.ajs',
                  },
                },
                endCaptures: {
                  '0': {
                    name: 'punctuation.definition.template-expression.end.ajs',
                  },
                },
                patterns: [
                  { include: '#forbidden' },
                  { include: '#keywords' },
                  { include: '#builtins' },
                  { include: '#numbers' },
                  { include: '#operators' },
                ],
              },
            ],
          },
        ],
      },
      numbers: {
        patterns: [
          {
            match: '\\b\\d+\\.\\d+([eE][+-]?\\d+)?\\b',
            name: 'constant.numeric.float.ajs',
          },
          {
            match: '\\b\\d+\\b',
            name: 'constant.numeric.integer.ajs',
          },
        ],
      },
      operators: {
        patterns: [
          {
            match: '\\?\\?|&&|\\|\\||!|===|!==|==|!=|>=|<=|>|<',
            name: 'keyword.operator.logical.ajs',
          },
          {
            match: '\\+|\\-|\\*|\\/|%|\\*\\*',
            name: 'keyword.operator.arithmetic.ajs',
          },
          {
            match: '=',
            name: 'keyword.operator.assignment.ajs',
          },
          {
            match: '\\?\\.?',
            name: 'keyword.operator.optional.ajs',
          },
        ],
      },
      comments: {
        patterns: [
          {
            name: 'comment.line.double-slash.ajs',
            match: '//.*$',
          },
          {
            name: 'comment.block.documentation.ajs',
            begin: '/\\*\\*',
            end: '\\*/',
            patterns: [
              {
                match: '@(param|returns?|description|example)\\b',
                name: 'keyword.other.documentation.ajs',
              },
            ],
          },
          {
            name: 'comment.block.ajs',
            begin: '/\\*',
            end: '\\*/',
          },
        ],
      },
    },
  }

  writeFileSync(grammarPath, JSON.stringify(grammar, null, 2) + '\n')
  console.log(`Generated: ${grammarPath}`)
}

// Monaco and Ace use TypeScript directly, so just verify they import correctly
function verifyTypeScriptGrammars() {
  // These will fail at import time if broken
  try {
    require('./monaco/ajs-monarch')
    console.log('Verified: monaco/ajs-monarch.ts imports correctly')
  } catch (e) {
    console.error('Failed to import monaco/ajs-monarch.ts:', e)
  }

  try {
    require('./ace/ajs-mode')
    console.log('Verified: ace/ajs-mode.ts imports correctly')
  } catch (e) {
    console.error('Failed to import ace/ajs-mode.ts:', e)
  }

  try {
    require('./codemirror/ajs-language')
    console.log('Verified: codemirror/ajs-language.ts imports correctly')
  } catch (e) {
    console.error('Failed to import codemirror/ajs-language.ts:', e)
  }
}

// Main
console.log('Building editor grammars from ajs-syntax.ts...\n')
console.log(`KEYWORDS: ${KEYWORDS.length} items`)
console.log(`FORBIDDEN_KEYWORDS: ${FORBIDDEN_KEYWORDS.length} items`)
console.log(`TYPE_CONSTRUCTORS: ${TYPE_CONSTRUCTORS.length} items\n`)

buildVSCodeGrammar()
console.log('\nDone!')
