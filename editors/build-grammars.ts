#!/usr/bin/env bun
/**
 * Build script for editor grammars
 *
 * Generates JSON grammar files from the TypeScript source of truth (ajs-syntax.ts).
 * Run with: bun editors/build-grammars.ts
 */

import { KEYWORDS, FORBIDDEN_KEYWORDS, TYPE_CONSTRUCTORS } from './ajs-syntax'
import {
  KEYWORDS as TJS_KEYWORDS,
  FORBIDDEN_KEYWORDS as TJS_FORBIDDEN,
  TYPE_CONSTRUCTORS as TJS_TYPE_CONSTRUCTORS,
  TJS_PATTERNS,
} from './tjs-syntax'
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

// TJS VSCode grammar (extends AJS)
function buildTJSVSCodeGrammar() {
  const grammarPath = join(editorsDir, 'vscode/syntaxes/tjs.tmLanguage.json')

  // Build regex patterns from TJS arrays
  const forbiddenPattern = `\\\\b(${TJS_FORBIDDEN.join('|')})\\\\b`
  const keywordsPattern = `\\\\b(${TJS_KEYWORDS.filter(
    (k) => !['true', 'false', 'null', 'undefined'].includes(k)
  ).join('|')})\\\\b`
  const constantsPattern = `\\\\b(true|false|null|undefined)\\\\b`

  const grammar = {
    $schema:
      'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'TJS',
    scopeName: 'source.tjs',
    patterns: [
      { include: '#comments' },
      { include: '#strings' },
      { include: '#test-block' },
      { include: '#mock-block' },
      { include: '#unsafe-block' },
      { include: '#function-def' },
      { include: '#return-type' },
      { include: '#forbidden' },
      { include: '#keywords' },
      { include: '#builtins' },
      { include: '#type-parameters' },
      { include: '#numbers' },
      { include: '#operators' },
    ],
    repository: {
      'test-block': {
        begin: '\\b(test)\\s*\\(\\s*([\'"`])([^\'"`]*)(\\2)\\s*\\)\\s*\\{',
        beginCaptures: {
          '1': { name: 'keyword.control.test.tjs' },
          '2': { name: 'punctuation.definition.string.begin.tjs' },
          '3': { name: 'string.quoted.test-description.tjs' },
          '4': { name: 'punctuation.definition.string.end.tjs' },
        },
        end: '\\}',
        patterns: [{ include: '$self' }],
      },
      'mock-block': {
        begin: '\\b(mock)\\s*\\{',
        beginCaptures: {
          '1': { name: 'keyword.control.mock.tjs' },
        },
        end: '\\}',
        patterns: [{ include: '$self' }],
      },
      'unsafe-block': {
        begin: '\\b(unsafe)\\s*\\{',
        beginCaptures: {
          '1': { name: 'keyword.control.unsafe.tjs' },
        },
        end: '\\}',
        patterns: [{ include: '$self' }],
      },
      'return-type': {
        match:
          '\\)\\s*(->)\\s*(\\{[^}]+\\}|\'[^\']*\'|"[^"]*"|\\[[^\\]]*\\]|\\w+)',
        captures: {
          '1': { name: 'keyword.operator.return-type.tjs' },
          '2': { name: 'support.type.return.tjs' },
        },
      },
      'function-def': {
        begin: '\\b(async\\s+)?(function)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(',
        beginCaptures: {
          '1': { name: 'keyword.control.async.tjs' },
          '2': { name: 'keyword.control.tjs' },
          '3': { name: 'entity.name.function.tjs' },
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
              '1': { name: 'variable.parameter.tjs' },
              '2': { name: 'punctuation.separator.type.tjs' },
              '3': { name: 'support.type.tjs' },
            },
          },
          {
            comment: 'Optional parameter with default: name = value',
            match:
              '([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*(=)\\s*(?=null\\s*&&|\'|"|\\d|\\{|\\[|true|false|null)',
            captures: {
              '1': { name: 'variable.parameter.tjs' },
              '2': { name: 'keyword.operator.assignment.tjs' },
            },
          },
          {
            comment: 'Simple parameter name',
            match: '([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\\s*[,)])',
            captures: {
              '1': { name: 'variable.parameter.tjs' },
            },
          },
        ],
      },
      forbidden: {
        patterns: [
          {
            match: forbiddenPattern,
            name: 'invalid.illegal.forbidden.tjs',
          },
        ],
      },
      keywords: {
        patterns: [
          {
            match: keywordsPattern,
            name: 'keyword.control.tjs',
          },
          {
            match: constantsPattern,
            name: 'constant.language.tjs',
          },
        ],
      },
      builtins: {
        patterns: [
          {
            match: `\\\\b(${TJS_TYPE_CONSTRUCTORS.join('|')})\\\\b`,
            name: 'support.class.tjs',
          },
        ],
      },
      strings: {
        patterns: [
          {
            name: 'string.quoted.single.tjs',
            begin: "'",
            end: "'",
            patterns: [
              { name: 'constant.character.escape.tjs', match: '\\\\.' },
            ],
          },
          {
            name: 'string.quoted.double.tjs',
            begin: '"',
            end: '"',
            patterns: [
              { name: 'constant.character.escape.tjs', match: '\\\\.' },
            ],
          },
          {
            name: 'string.template.tjs',
            begin: '`',
            end: '`',
            patterns: [
              { name: 'constant.character.escape.tjs', match: '\\\\.' },
              {
                name: 'meta.template.expression.tjs',
                begin: '\\$\\{',
                end: '\\}',
                beginCaptures: {
                  '0': {
                    name: 'punctuation.definition.template-expression.begin.tjs',
                  },
                },
                endCaptures: {
                  '0': {
                    name: 'punctuation.definition.template-expression.end.tjs',
                  },
                },
                patterns: [{ include: '$self' }],
              },
            ],
          },
        ],
      },
      numbers: {
        patterns: [
          {
            match: '\\b\\d+\\.\\d+([eE][+-]?\\d+)?\\b',
            name: 'constant.numeric.float.tjs',
          },
          { match: '\\b\\d+\\b', name: 'constant.numeric.integer.tjs' },
        ],
      },
      operators: {
        patterns: [
          { match: '->', name: 'keyword.operator.return-type.tjs' },
          {
            match: '\\?\\?|&&|\\|\\||!|===|!==|==|!=|>=|<=|>|<',
            name: 'keyword.operator.logical.tjs',
          },
          {
            match: '\\+|\\-|\\*|\\/|%|\\*\\*',
            name: 'keyword.operator.arithmetic.tjs',
          },
          { match: '=', name: 'keyword.operator.assignment.tjs' },
          { match: '\\?\\.?', name: 'keyword.operator.optional.tjs' },
        ],
      },
      comments: {
        patterns: [
          { name: 'comment.line.double-slash.tjs', match: '//.*$' },
          {
            name: 'comment.block.documentation.tjs',
            begin: '/\\*\\*',
            end: '\\*/',
            patterns: [
              {
                match: '@(param|returns?|description|example)\\b',
                name: 'keyword.other.documentation.tjs',
              },
            ],
          },
          {
            comment:
              'Non-JSDoc block comments - could add markdown highlighting here',
            name: 'comment.block.markdown.tjs',
            begin: '/\\*(?!\\*)',
            end: '\\*/',
            patterns: [
              {
                match: '(^|\\s)(#{1,6})\\s+.*$',
                name: 'markup.heading.markdown.tjs',
              },
              { match: '\\*\\*[^*]+\\*\\*', name: 'markup.bold.markdown.tjs' },
              { match: '`[^`]+`', name: 'markup.inline.raw.markdown.tjs' },
            ],
          },
        ],
      },
    },
  }

  writeFileSync(grammarPath, JSON.stringify(grammar, null, 2) + '\n')
  console.log(`Generated: ${grammarPath}`)
}

// Main
console.log('Building editor grammars from ajs-syntax.ts...\n')
console.log(`KEYWORDS: ${KEYWORDS.length} items`)
console.log(`FORBIDDEN_KEYWORDS: ${FORBIDDEN_KEYWORDS.length} items`)
console.log(`TYPE_CONSTRUCTORS: ${TYPE_CONSTRUCTORS.length} items\n`)

console.log(`TJS_KEYWORDS: ${TJS_KEYWORDS.length} items`)
console.log(`TJS_FORBIDDEN: ${TJS_FORBIDDEN.length} items`)
console.log(`TJS_TYPE_CONSTRUCTORS: ${TJS_TYPE_CONSTRUCTORS.length} items\n`)

buildVSCodeGrammar()
buildTJSVSCodeGrammar()
console.log('\nDone!')
