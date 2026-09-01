/**
 * Parser parameter and annotation processing
 *
 * Handles the unified paren expression transformer that converts TJS syntax
 * (colon defaults, return type annotations, safe/unsafe markers) into valid JS.
 */

import { SyntaxError } from './types'
import type {
  TokenizerState,
  StructuralContext,
  ContextFrame,
} from './parser-types'
import { locAt } from './parser-transforms'
import {
  isRegexStart,
  findRegexEnd,
  isEscapedAt,
  maskLiterals,
  scanLiterals,
  splitTopLevel,
  splitTopLevelTrimmed,
} from '../strip-comments'
import {
  isTypeNameAnnotation,
  typeArgumentSource,
  typeNameExample,
} from './inference'

/**
 * Markers the parser writes INTO the rewritten parameter, between the `=` and the value.
 *
 * Two facts live only in the parser: that `n = number` came from `n?: number` (a dangling
 * annotation, not a default) and that `x = 2` came from `x: 2` (required, not defaulted).
 * The AST cannot carry them — `n?: MyThing` and `x = someVar` produce byte-identical trees.
 *
 * They were carried in module-wide SETS, first keyed by bare name and then by name plus
 * value text. Both collide, and the second collides on ordinary code: any two parameters in
 * a module sharing a name and a literal (`0`, `1`, `''`, `[]`) are indistinguishable, so
 *
 *     function scale(factor: 1) {…}
 *     function grow(factor = 1) { return factor + 1 }   // grow() -> MonadicError, not 2
 *
 * silently lost a legitimate JavaScript default — a `PRINCIPLES.md` TJS ⊇ JS violation with
 * a green suite, because the test that was meant to catch it only ever paired values that
 * DIFFER.
 *
 * A marker cannot collide, because it is not a key: each occurrence carries its own answer,
 * positionally, and travels with the parameter through every later rewrite. It is a block
 * comment, so acorn ignores it and inference still reads the value it precedes.
 *
 * The emitter deletes the whole `= value` span for both marked cases, so markers do not
 * reach the output; `stripParamMarkers` is the belt-and-braces sweep for any that survive a
 * path that does not delete.
 */
export const PARAM_REQUIRED_MARKER = '/*!tjs-req*/'
export const PARAM_TYPENAME_MARKER = '/*!tjs-opt*/'
/** Shared by both markers — lets the walk `indexOf` between candidates. */
const MARKER_PREFIX = '/*!tjs-'

/**
 * Keywords after which an identifier-then-paren is a CALL, never a declaration.
 *
 * Each introduces an expression, so `<kw> name(` cannot be a method head. `new` is the one
 * that reaches a class body in practice (a field initializer is the only expression that
 * appears there directly); the others are here so the guard is a rule rather than a patch.
 */
const EXPRESSION_PREFIX_KEYWORDS = new Set([
  'new',
  'return',
  'typeof',
  'await',
  'yield',
  'void',
  'delete',
  'throw',
  'case',
  'in',
  'of',
  'instanceof',
])

/** Remove markers from a fragment being read mid-transform (see `parseParamList`). */
export function stripParamMarkers(code: string): string {
  return code
    .split(PARAM_REQUIRED_MARKER)
    .join('')
    .split(PARAM_TYPENAME_MARKER)
    .join('')
}

/**
 * Strip every marker from the finished source, recording WHERE each one pointed.
 *
 * Run once, after all transforms. The marker is a carrier, not a payload: leaving it in
 * the emitted source means every pass that reads parameter text has to know about it, and
 * they do not — `typeSignatureForDefault` read the marker followed by `0` as `any`, so all
 * polymorphic variants looked identical and legal overloads were rejected; the wasm
 * capture scanner picked the marker up as an identifier. That is an unbounded set of
 * consumers to teach.
 *
 * Converting to OFFSETS at the end gives both halves: the transforms get a carrier that
 * cannot collide (unlike a name- or value-keyed set), and everything downstream — acorn,
 * the wasm scanner, polymorphic detection, the emitted output — sees source that never
 * contained a marker. The offsets are computed against the CLEANED string, so they are
 * exactly the `end` acorn will report for the value each marker followed.
 *
 * The marker trails its value rather than preceding it, because the passes that run
 * BETWEEN emission and extraction match FORWARD from the `=`: the wasm capture scanner
 * reads `xs = new Float32Array(0)` to recover a typed-array annotation, and a comment
 * wedged after the `=` defeated it.
 */
export function extractParamMarkers(src: string): {
  source: string
  required: Set<number>
  typeName: Set<number>
} {
  const required = new Set<number>()
  const typeName = new Set<number>()
  if (
    !src.includes(PARAM_REQUIRED_MARKER) &&
    !src.includes(PARAM_TYPENAME_MARKER)
  ) {
    return { source: src, required, typeName }
  }
  // Marker text inside a STRING is data, not a marker.
  //
  // This walked raw text, so `return 'x/*!tjs-req*/y'` came out as `'xy'` — the emitted
  // program silently returned a different value than the source says. The markers are
  // ours and are only ever emitted into parameter lists, so anything that looks like one
  // inside a literal was written by the user and must survive untouched.
  //
  // Same family as the `const!` rewrite that edited string contents, and the reason the
  // shared scanner exists: `scanLiterals` is memoized, so the guard costs a lookup.
  //
  // Both the guard and the walk are O(n + regions), not O(n × regions):
  //
  //   - `i` only ever moves FORWARD, so the region lookup is a cursor over the ascending
  //     region list, not a `.some()` over all of them at every position. The `.some()`
  //     version cost 152ms on a 174KB file and quadrupled with every doubling of input —
  //     a transpiler pass that gets slower per byte the bigger your file is.
  //   - Both markers share the `/*!tjs-` prefix, so `indexOf` jumps between candidates and
  //     the text in between is copied by `slice` rather than one character at a time.
  const regions = scanLiterals(src).filter(
    (r) => r.kind === 'string' || r.kind === 'template' || r.kind === 'regex'
  )
  let ri = 0
  const literalAt = (pos: number) => {
    while (ri < regions.length && regions[ri].innerEnd <= pos) ri++
    return ri < regions.length && pos >= regions[ri].innerStart
  }

  // The output accumulates as CHUNKS with a running length, never as one growing string.
  //
  // `out += …` builds a rope, which is cheap — but `out.endsWith(' ')` and `out.length`
  // at every marker force it flat, so the cost is the length of everything written so far,
  // once per marker. That is a second, subtler quadratic hiding behind the first: with the
  // per-position region scan removed, a 622KB file still took 34ms and still grew ~3.5×
  // per doubling. A chunk list plus a counter makes each marker O(1).
  const chunks: string[] = []
  let outLen = 0
  const emit = (s: string) => {
    if (!s) return
    chunks.push(s)
    outLen += s.length
  }

  let i = 0
  for (;;) {
    const at = src.indexOf(MARKER_PREFIX, i)
    if (at < 0) {
      emit(src.slice(i))
      break
    }
    const isReq = src.startsWith(PARAM_REQUIRED_MARKER, at)
    const isOpt = !isReq && src.startsWith(PARAM_TYPENAME_MARKER, at)
    if ((!isReq && !isOpt) || literalAt(at)) {
      // Not one of ours, or user text that merely looks like one — copy it through.
      emit(src.slice(i, at + MARKER_PREFIX.length))
      i = at + MARKER_PREFIX.length
      continue
    }
    emit(src.slice(i, at))
    // Drop the single space emitted before the marker, so the value's END lands exactly
    // at the offset recorded here.
    const last = chunks[chunks.length - 1]
    if (last && last.endsWith(' ')) {
      chunks[chunks.length - 1] = last.slice(0, -1)
      outLen--
    }
    ;(isReq ? required : typeName).add(outLen)
    i = at + (isReq ? PARAM_REQUIRED_MARKER : PARAM_TYPENAME_MARKER).length
  }
  return { source: chunks.join(''), required, typeName }
}

export function transformParenExpressions(
  source: string,
  ctx: {
    originalSource: string
    requiredParams: Set<string>
    /**
     * Optional params whose annotation was a bare TYPE NAME (`n?: number`), not an
     * example value (`n?: 0`).
     *
     * The rewrite below has to emit `n = number` so acorn can parse it and inference can
     * read the type off the identifier — but that default is a DANGLING REFERENCE at run
     * time. The emitter deletes it, and needs this set to know which defaults are
     * annotations rather than genuine JS defaults: `n?: MyThing` and `x = someVar` produce
     * byte-identical AST, and only the parser knows which is which.
     */
    typeNameOptionals: Set<string>
    /**
     * Types declared in this module (`Type X {…}`), so an annotation like `Box<int>` can
     * be recognised as an APPLICATION of one rather than a comparison.
     */
    declaredTypes?: Set<string>
    /**
     * Hoisted `const __ta_… = Box(…)` declarations produced by type arguments. The caller
     * prepends them, so an applied type is constructed ONCE per module instead of on
     * every call — and so the annotation itself stays a bare identifier, which is the
     * shape the emitter's declared-type path already handles.
     */
    hoistedTypeArgs?: HoistedTypeArg[]
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  }
): {
  source: string
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
} {
  let result = ''
  let i = 0
  let firstReturnType: string | undefined
  let firstReturnSafety: 'safe' | 'unsafe' | undefined

  // State machine for tokenizing
  let state: TokenizerState = 'normal'
  // Stack for template string interpolation depth (each entry is brace depth within that interpolation)
  const templateStack: number[] = []

  // Structural context tracking - know if we're in a class body, function body, etc.
  const contextStack: ContextFrame[] = [{ type: 'top-level', braceDepth: 0 }]
  let braceDepth = 0

  // Helper to get current structural context (reserved for future use)
  const _currentContext = (): StructuralContext =>
    contextStack[contextStack.length - 1]?.type || 'top-level'

  // Helper to check if we're directly in a class body (not nested in a function/block inside it)
  const isInClassBody = (): boolean => {
    const frame = contextStack[contextStack.length - 1]
    return frame?.type === 'class-body' && braceDepth === frame.braceDepth + 1
  }

  while (i < source.length) {
    const char = source[i]
    const nextChar = source[i + 1]

    // Handle state transitions based on current state
    switch (state) {
      case 'single-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === "'") {
          state = 'normal'
        }
        i++
        continue

      case 'double-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '"') {
          state = 'normal'
        }
        i++
        continue

      case 'template-string':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '$' && nextChar === '{') {
          // Enter template expression
          result += nextChar
          i += 2
          templateStack.push(1) // Start with brace depth 1
          state = 'normal' // Back to normal parsing inside ${}
          continue
        }
        if (char === '`') {
          state = 'normal'
        }
        i++
        continue

      case 'line-comment':
        result += char
        if (char === '\n') {
          state = 'normal'
        }
        i++
        continue

      case 'block-comment':
        result += char
        if (char === '*' && nextChar === '/') {
          result += nextChar
          i += 2
          state = 'normal'
          continue
        }
        i++
        continue

      case 'regex':
        result += char
        if (char === '\\' && i + 1 < source.length) {
          result += nextChar
          i += 2
          continue
        }
        if (char === '[') {
          // Character class - read until ]
          i++
          while (i < source.length && source[i] !== ']') {
            result += source[i]
            if (source[i] === '\\' && i + 1 < source.length) {
              result += source[i + 1]
              i += 2
            } else {
              i++
            }
          }
          if (i < source.length) {
            result += source[i]
            i++
          }
          continue
        }
        if (char === '/') {
          // End of regex, consume flags
          i++
          while (i < source.length && /[gimsuy]/.test(source[i])) {
            result += source[i]
            i++
          }
          state = 'normal'
          continue
        }
        i++
        continue

      case 'normal':
        // Handle template stack - track braces inside template expressions
        if (templateStack.length > 0) {
          if (char === '{') {
            templateStack[templateStack.length - 1]++
          } else if (char === '}') {
            templateStack[templateStack.length - 1]--
            if (templateStack[templateStack.length - 1] === 0) {
              // Exiting template expression, back to template string
              templateStack.pop()
              result += char
              i++
              state = 'template-string'
              continue
            }
          }
        }

        // Check for string/comment/regex start
        if (char === "'") {
          result += char
          i++
          state = 'single-string'
          continue
        }
        if (char === '"') {
          result += char
          i++
          state = 'double-string'
          continue
        }
        if (char === '`') {
          result += char
          i++
          state = 'template-string'
          continue
        }
        if (char === '/' && nextChar === '/') {
          result += char + nextChar
          i += 2
          state = 'line-comment'
          continue
        }
        if (char === '/' && nextChar === '*') {
          result += char + nextChar
          i += 2
          state = 'block-comment'
          continue
        }

        // Check for regex literal
        if (char === '/') {
          const before = result.trimEnd()
          const lastChar = before[before.length - 1]
          const isRegexContext =
            !lastChar ||
            /[=(!,;:{[&|?+\-*%<>~^]$/.test(before) ||
            /\b(return|case|throw|in|of|typeof|instanceof|new|delete|void)\s*$/.test(
              before
            )
          if (isRegexContext) {
            result += char
            i++
            state = 'regex'
            continue
          }
        }

        // Now handle TJS-specific transformations in normal state
        break
    }

    // We're in normal state - look for TJS patterns

    // Track braces for structural context
    if (char === '{') {
      braceDepth++
      result += char
      i++
      continue
    }
    if (char === '}') {
      braceDepth--
      // Pop context if we're exiting it
      const frame = contextStack[contextStack.length - 1]
      if (frame && braceDepth === frame.braceDepth) {
        contextStack.pop()
      }
      result += char
      i++
      continue
    }

    // Look for class declarations: `class Name`, with any heritage clause.
    //
    // The base used to have to be a bare `\w+` (`extends\s+\w+`), so a class extending
    // anything else was not recognised as a class at all — no class-body context was pushed,
    // so no method inside it had its parameters or return annotation transformed, and the
    // file did not parse. That covers a great deal of real TypeScript:
    //
    //     class C extends Data.Class { … }              // qualified name
    //     class C extends Effect.Service<C>()("t", …) { … }
    //     class C extends mixin(Base) { … }
    //
    // The heritage clause is now scanned rather than matched: from after the name, walk to
    // the `{` that opens the BODY — the first one at bracket depth zero, so a brace inside
    // `({ … })` is skipped, and quoted text is stepped over because `extends Tag("a{b")` is
    // ordinary. A class declaration always has a body, so this terminates on real input.
    const nameMatch = matchAt(RE_CLASS_NAME, source, i)
    let classHeaderLen = -1
    if (nameMatch) {
      let d = 0
      let j = i + nameMatch[0].length
      for (; j < source.length; j++) {
        const c = source[j]
        if (c === '"' || c === "'" || c === '`') {
          const quote = c
          j++
          while (j < source.length && source[j] !== quote) {
            if (source[j] === '\\') j++
            j++
          }
          continue
        }
        if (c === '(' || c === '[') d++
        else if (c === ')' || c === ']') d--
        else if (c === '{' && d === 0) break
        // A `;` or `}` at depth 0 before any `{` means this was not a declaration we can
        // read; bail rather than swallow the rest of the file.
        else if ((c === ';' || c === '}') && d === 0) {
          j = -1
          break
        }
      }
      if (j > 0 && j < source.length) classHeaderLen = j - i
    }
    if (classHeaderLen > 0) {
      // Output everything up to but not including the {
      const classHeader = source.slice(i, i + classHeaderLen)
      result += classHeader
      i += classHeader.length
      // Push class-body context (will be entered when we see the {)
      contextStack.push({ type: 'class-body', braceDepth })
      continue
    }

    // Look for function declarations: function name( or function name (
    //
    // The name is OPTIONAL: `const f = function (n: 0) {}` is a function expression, and
    // requiring a name here meant its annotated params never reached the colon-shorthand
    // rewrite — so the file did not parse at all, while the identical arrow did. A
    // spelling should not decide whether the language accepts your code.
    // `\s+name` OR straight to `(`. Writing this as `\s*(\w*)\s*\(` instead matched
    // `functionMetaToJSONSchema(` as the keyword plus a name of `MetaToJSONSchema` —
    // an identifier that merely STARTS with the keyword. Caught by examples/json-schema.tjs.
    // The `*` is OPTIONAL for the same reason the name is: `function* gen(): 0 {}` is a
    // generator declaration, and not matching it here meant its annotations never reached the
    // colon-shorthand rewrite, so `function* count():! 0.0 { yield 1 }` did not parse at all
    // — while the identical non-generator did. `fromTS` EMITS that form, so the converter was
    // producing TJS that TJS could not read. Invisible while the JS output came from
    // `ts.transpileModule`, because nothing ran our parser over it (`no-ts-emitter.test.ts`).
    const funcMatch = matchAt(RE_FUNCTION_HEAD, source, i)
    if (funcMatch) {
      // Keep the ORIGINAL spelling in the output — a function expression may genuinely
      // have no name, and inventing one both changes the emitted code and creates an
      // identifier the metadata then references but nothing declares.
      const declaredName = funcMatch[1]
      // The `*` is part of the DECLARATION, not decoration: dropping it while rebuilding the
      // header turns a generator into an ordinary function, and every `yield` in the body
      // then fails to parse as a reserved word.
      const star = funcMatch[0].includes('*') ? '*' : ''
      const funcName = declaredName || 'anonymous'
      const matchLen = funcMatch[0].length

      // Check for safety marker right after opening paren: (? or (!
      const afterParen = source[i + matchLen]
      let safetyMarker: '?' | '!' | null
      let paramStart = i + matchLen

      if (afterParen === '?' || afterParen === '!') {
        safetyMarker = afterParen
        paramStart++
        if (safetyMarker === '!') {
          ctx.unsafeFunctions.add(funcName)
        } else {
          ctx.safeFunctions.add(funcName)
        }
      }

      result += declaredName
        ? `function${star} ${declaredName}(`
        : `function${star} (`
      i = paramStart

      // Find matching ) using balanced counting
      const paramsResult = extractBalancedContent(source, i, '(', ')')
      if (!paramsResult) {
        // Unbalanced - just copy character and continue
        result += source[i]
        i++
        continue
      }

      const { content: params, endPos } = paramsResult
      i = endPos

      // Process the params (transform : to = for required params, handle nested arrows)
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'

      // Check what follows the closing paren: return type annotation (:, :?, :!)
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        let safety: 'safe' | 'unsafe' | undefined
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
          safety = colonMarker === ':?' ? 'safe' : 'unsafe'
        } else {
          j += 1
        }
        while (j < source.length && /\s/.test(source[j])) j++

        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          if (firstReturnType === undefined) {
            firstReturnType = typeResult.type
            if (safety) firstReturnSafety = safety
          }
          i = typeResult.endPos
        }
      }

      // Catch a common mistake: writing `=> {` after a function declaration's
      // return type (or after `)`), as if it were an arrow function. Without
      // this check, the `=>` would pass through to Acorn, which complains
      // with a generic "Unexpected token" at a misleading position.
      let arrowCheck = i
      while (arrowCheck < source.length && /\s/.test(source[arrowCheck]))
        arrowCheck++
      if (source[arrowCheck] === '=' && source[arrowCheck + 1] === '>') {
        throw new SyntaxError(
          "Unexpected '=>' after function declaration. " +
            'Function declarations use `function name(params) { body }`, ' +
            'not arrow syntax. Remove the `=>`.',
          locAt(ctx.originalSource, arrowCheck),
          ctx.originalSource
        )
      }
      continue
    }

    // Look for class method syntax: constructor(, methodName(, get name(, set name(
    // These appear inside class bodies and need param transformation
    // Only match if we're actually in a class body (proper context tracking)
    // Must NOT match function calls in expressions (div(), span(), etc.)
    // A COMPUTED name (`[Equal.symbol](…)`) is a method declaration too. Without the
    // `\[[^\]]+\]` alternatives the scanner skipped the `[`, then matched `symbol(` — the
    // tail of the computed name — as if it were the method's own name, and the emitted class
    // did not parse. effect declares `[Equal.symbol]` and `[Hash.symbol]` on most of its
    // types, so this was its second-largest conversion failure.
    const methodMatch = matchAt(RE_METHOD_HEAD, source, i)
    // Check that the preceding non-whitespace character indicates this is a
    // declaration, not a function call in an expression.
    // Method declarations follow: newline, {, ;, or start of file
    // Function calls follow: = => , [ ( . operators etc.
    // Index of that character too, so the preceding WORD can be read without copying
    // `result`. A `result.trimEnd()` here was O(len(result)) per candidate and turned the
    // scan quadratic — the dogfood ratchet went from ~90s to 223s and timed out. In a pass
    // that already has one unlocated quadratic, a look-back must not allocate.
    let prevIdx = -1
    for (let k = result.length - 1; k >= 0; k--) {
      if (!/\s/.test(result[k])) {
        prevIdx = k
        break
      }
    }
    const prevNonWs = prevIdx < 0 ? '\n' : result[prevIdx] // '\n' = start of input
    // The preceding WORD, when the preceding character is an identifier character. A
    // single-character look-back cannot tell `new E(` from a method named `E`: the character
    // before `E` is `w`, which is in none of the exclusions below, so `new E({ x: 1 })` in a
    // static field initializer read as a method declaration and its ARGUMENT was rewritten as
    // a parameter list — `{ x: 1 }` became `{ x = 1 }`, a shorthand-assignment pattern outside
    // a pattern position, which acorn rejects. Two effect files failed on exactly this.
    //
    // Every keyword here introduces an EXPRESSION, so what follows is a call, never a
    // declaration. `new` is the one that occurs in a class body directly (field initializers
    // are the only expressions there); the rest cost nothing and remove a whole shape of bug
    // rather than the one instance of it.
    let prevWord = ''
    if (prevIdx >= 0 && /[A-Za-z0-9_$]/.test(prevNonWs)) {
      let w = prevIdx
      while (w >= 0 && /[A-Za-z0-9_$]/.test(result[w])) w--
      prevWord = result.slice(w + 1, prevIdx + 1)
    }
    // Method declarations can follow almost anything (property, }, ;, etc.)
    // Function CALLS in expressions specifically follow: = => , [ (
    const isMethodDecl =
      !EXPRESSION_PREFIX_KEYWORDS.has(prevWord) &&
      prevNonWs !== '=' &&
      prevNonWs !== ',' &&
      prevNonWs !== '(' &&
      prevNonWs !== '[' &&
      // A method name cannot follow a dot — `Equal.symbol(` is a member call, never a
      // declaration. Without this the tail of a computed name read as a method name.
      prevNonWs !== '.' &&
      prevNonWs !== '>' // catches =>
    if (methodMatch && isInClassBody() && !isMethodDecl) {
      // Not a method declaration (it's a function call in an expression).
      // Skip past the identifier to prevent re-matching a suffix
      // (e.g. 'div(' → skip 'div', don't let 'iv(' match next).
      const skipLen = methodMatch[1].length
      result += source.slice(i, i + skipLen)
      i += skipLen
      continue
    }
    if (methodMatch && isInClassBody() && isMethodDecl) {
      // We're actually in a class body - this is a method definition
      const methodPart = methodMatch[1]
      const matchLen = methodMatch[0].length
      const paramStart = i + matchLen

      result += methodPart + '('
      i = paramStart

      // Find matching )
      const paramsResult = extractBalancedContent(source, i, '(', ')')
      if (!paramsResult) {
        result += source[i]
        i++
        continue
      }

      const { content: params, endPos } = paramsResult
      i = endPos

      // Process the params (transform : to = for TJS types)
      const processedParams = processParamString(params, ctx, true)
      result += processedParams + ')'

      // Check for return type annotation: ): type, ):! type, ):? type
      let j = i
      while (j < source.length && /\s/.test(source[j])) j++

      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
        } else {
          j++
        }
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          i = typeResult.endPos
        }
      }

      // Same `=>` check for class methods.
      let k = i
      while (k < source.length && /\s/.test(source[k])) k++
      if (source[k] === '=' && source[k + 1] === '>') {
        throw new SyntaxError(
          "Unexpected '=>' after method declaration. " +
            'Methods use `name(params) { body }`, not arrow syntax. ' +
            'Remove the `=>`.',
          locAt(ctx.originalSource, k),
          ctx.originalSource
        )
      }

      continue
    }

    // Look for arrow function params: (params) =>
    // We need to be careful to only transform when followed by =>
    //
    // A CALL's argument list is not a parameter list. Without this check the scan read
    //
    //     const m = k
    //       ? (x, i) => f(a)
    //       : (x) => x
    //
    // as `(a): (x) => …` — an arrow whose parameters are `a` and whose RETURN TYPE is `(x)` —
    // and stripped the annotation, deleting the ternary's `: (x)` and leaving `=> x` dangling
    // at the start of a line. Silent corruption; radash and two effect files hit it.
    //
    // A call's `(` follows its callee, so an identifier, `)` or `]` immediately before means
    // this is an argument list. `async` is the one identifier that legitimately precedes a
    // parameter list.
    const prevTok = (() => {
      let k = i - 1
      while (k >= 0 && /\s/.test(source[k])) k--
      return k < 0 ? '' : source[k]
    })()
    const isCallArgs =
      /[A-Za-z0-9_$)\]]/.test(prevTok) &&
      !/(^|[^A-Za-z0-9_$])async\s*$/.test(source.slice(Math.max(0, i - 12), i))
    if (source[i] === '(' && !isCallArgs) {
      // First, find the matching ) without consuming any safety marker
      // We'll check for safety marker only if this is actually an arrow function
      const fullParamsResult = extractBalancedContent(source, i + 1, '(', ')')
      if (!fullParamsResult) {
        result += source[i]
        i++
        continue
      }

      const fullContent = fullParamsResult.content
      const endPos = fullParamsResult.endPos

      // Check what follows: whitespace then `=>` (arrow function), optionally preceded
      // by a `): type` return annotation. (`arrowReturnType` = the return type OF an arrow
      // function; TJS has no arrow-shaped return syntax.)
      let j = endPos
      while (j < source.length && /\s/.test(source[j])) j++

      // Check for return type annotation on arrow function: ): type =>
      let arrowReturnType: string | undefined
      if (source[j] === ':') {
        const colonMarker = source.slice(j, j + 2)
        if (colonMarker === ':?' || colonMarker === ':!') {
          j += 2
        } else {
          j++
        }
        while (j < source.length && /\s/.test(source[j])) j++
        const typeResult = extractReturnTypeValue(source, j)
        if (typeResult) {
          arrowReturnType = typeResult.type
          j = typeResult.endPos
          while (j < source.length && /\s/.test(source[j])) j++
        }
      }

      if (source.slice(j, j + 2) === '=>') {
        // This IS an arrow function - now check for safety marker
        let safetyMarker: '?' | '!' | null = null
        let params = fullContent

        // Check if content starts with safety marker (? or !) followed by whitespace
        const trimmedContent = fullContent.trimStart()
        if (
          trimmedContent.startsWith('?') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '?'
          params = trimmedContent.slice(1)
        } else if (
          trimmedContent.startsWith('!') &&
          (trimmedContent.length === 1 || /\s/.test(trimmedContent[1]))
        ) {
          safetyMarker = '!'
          params = trimmedContent.slice(1)
        }

        // Process the params, TRACKING REQUIRED — arrows follow the same rule as
        // declarations, and used not to.
        //
        // With `trackRequired: false`, `const f = (n: 0) => n * 2` recorded nothing, so
        // the emitter left `n = 0` in place and `f()` returned 0 while the identical
        // `function g(n: 0)` returned a MonadicError. The colon value silently became a
        // JS DEFAULT, which contradicts the language's central rule (`:` is required, `=`
        // is defaulted) in the parameter shape most TypeScript actually uses.
        const processedParams = processParamString(params, ctx, true)
        // Add safety marker as comment for arrow functions (since we can't track them by name)
        const safetyComment =
          safetyMarker === '?'
            ? '/* safe */ '
            : safetyMarker === '!'
            ? '/* unsafe */ '
            : ''
        result += `(${safetyComment}${processedParams})`
        // Skip the return type annotation (we extracted it but don't emit it)
        i = endPos
        // Skip to just before the =>
        while (i < j && /\s/.test(source[i])) {
          result += source[i]
          i++
        }
        // If there was a return type, we need to skip past it to =>
        if (arrowReturnType) {
          i = j
        }
      } else {
        // Not an arrow function - recursively transform the content for nested arrows
        // but don't process as param declarations (no colon-to-equals transform)
        const transformed = transformParenExpressions(fullContent, ctx)
        result += `(${transformed.source})`
        i = endPos
      }
      continue
    }

    result += source[i]
    i++
  }

  return {
    source: result,
    returnType: firstReturnType,
    returnSafety: firstReturnSafety,
  }
}

/**
 * Extract balanced content between delimiters
 * @param source The source string
 * @param start Position after the opening delimiter
 * @param open Opening delimiter character (for depth counting of nested structures)
 * @param close Closing delimiter character
 * @returns The content between delimiters and position after closing delimiter, or null if unbalanced
 */
function extractBalancedContent(
  source: string,
  start: number,
  open: string,
  close: string
): { content: string; endPos: number } | null {
  let depth = 1
  let i = start
  let inString = false
  let stringChar = ''
  // Trailing context OUTSIDE any literal, for telling a regex from a division. Keeps a
  // short tail rather than one character because `isRegexStart` also recognises keywords
  // (`return /re/`), which a single char cannot express.
  let sigTail = open

  while (i < source.length && depth > 0) {
    const char = source[i]

    // Handle string literals.
    //
    // Escapes are consumed FORWARD, not detected by looking back at `source[i - 1]`.
    // The lookback is wrong for an escaped backslash: in `'\\'` the closing quote IS
    // preceded by a backslash, so it read as escaped and the string never closed —
    // desyncing everything after `if (char === '\\')`, a line this codebase has in
    // several scanners.
    if (inString && char === '\\') {
      i += 2
      continue
    }
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar) {
      inString = false
    } else if (!inString) {
      // REGEX LITERALS. A `)` inside a character class — `/[)\]']/` — used to close the
      // enclosing paren, so `if (/[)\]']/.test(c))` handed the caller the fragment `/[`
      // and every function after it went untransformed. Skip the literal whole.
      if (char === '/' && isRegexStart(sigTail)) {
        const end = findRegexEnd(source, i)
        if (end !== -1) {
          i = end + 1
          sigTail = '/'
          continue
        }
      }
      if (char === open) depth++
      else if (char === close) depth--
      sigTail = (sigTail + char).slice(-24)
    }
    i++
  }

  if (depth !== 0) return null

  return {
    content: source.slice(start, i - 1),
    endPos: i,
  }
}

/**
 * Extract a JS value starting at a position in source.
 * Handles nested objects {}, arrays [], strings, numbers, booleans, null.
 * Uses state machine to properly track nesting.
 */
export function extractJSValue(
  source: string,
  start: number
): { value: string; endPos: number } | null {
  let i = start

  // Skip leading whitespace
  while (i < source.length && /\s/.test(source[i])) i++
  if (i >= source.length) return null

  const valueStart = i
  const firstChar = source[i]

  // Handle objects and arrays with balanced parsing
  if (firstChar === '{' || firstChar === '[') {
    const close = firstChar === '{' ? '}' : ']'
    const result = extractBalancedContent(source, i + 1, firstChar, close)
    if (!result) return null
    return {
      value: source.slice(valueStart, result.endPos),
      endPos: result.endPos,
    }
  }

  // Handle strings
  if (firstChar === "'" || firstChar === '"' || firstChar === '`') {
    i++
    while (i < source.length) {
      if (source[i] === firstChar && !isEscapedAt(source, i)) {
        i++
        return { value: source.slice(valueStart, i), endPos: i }
      }
      i++
    }
    return null // Unterminated string
  }

  // Handle numbers (including negative and decimals)
  if (/[-+\d]/.test(firstChar)) {
    while (i < source.length && /[\d.eE+-]/.test(source[i])) i++
    return { value: source.slice(valueStart, i), endPos: i }
  }

  // Handle keywords: true, false, null, undefined
  const keywordMatch = matchAt(RE_KEYWORD_VALUE, source, i)
  if (keywordMatch) {
    return {
      value: keywordMatch[1],
      endPos: i + keywordMatch[1].length,
    }
  }

  return null
}

/**
 * Normalize union syntax in type strings
 * Converts single | to || for TJS consistency (needed for JS parsing)
 */
function normalizeUnionSyntax(type: string): string {
  // Replace single | (not ||) with || for proper JS parsing
  // Use negative lookbehind and lookahead to avoid matching ||
  return type.replace(/(?<!\|)\|(?!\|)/g, ' || ')
}

/**
 * Extract a return type value starting at the given position
 * Handles: simple types ('', 0, null), objects ({ }), arrays ([ ]), unions (| or ||)
 */
/**
 * Sticky patterns for the character scan below.
 *
 * `source.slice(i).match(/^…/)` allocates a copy of the REMAINING SOURCE at every character,
 * which makes the scan quadratic in file size. Measured on effect's generated
 * `httpApiSwagger.ts` (1.96 MB): 16KB took 182ms, 32KB 642ms, 64KB 2.5s, 128KB 10.2s,
 * 256KB 39.4s — a clean 4x per doubling, extrapolating to ~37 minutes for the whole file.
 * The converter did not fail on it, it HUNG, which is worse: a corpus scan sat at 100% CPU
 * for 51 minutes with no output.
 *
 * A sticky regex (`/y`) anchors the match at `lastIndex` and reads the string in place, so
 * the same scan is linear. `parser-transforms.ts` already fixed its own copy of this defect
 * with index-based checks; these are the remaining hot ones.
 */
const RE_CLASS_NAME = /class\s+\w+/y
const RE_FUNCTION_HEAD = /function\s*\*?(?:\s+(\w+))?\s*\(/y
const RE_METHOD_HEAD =
  /(constructor|(?:get|set)\s+(?:\w+|\[[^\]]+\])|async\s+(?:\w+|\[[^\]]+\])|\w+|\[[^\]]+\])\s*\(/y
const RE_KEYWORD_VALUE = /(true|false|null|undefined)\b/y

/** Match `re` AT `at` without copying the tail. */
function matchAt(
  re: RegExp,
  source: string,
  at: number
): RegExpExecArray | null {
  re.lastIndex = at
  return re.exec(source)
}

function extractReturnTypeValue(
  source: string,
  start: number
): { type: string; endPos: number } | null {
  let i = start
  let depth = 0
  let inString = false
  let stringChar = ''
  let sawContent = false

  // Helper to create result with normalized type
  const makeResult = (endPos: number) => ({
    type: normalizeUnionSyntax(source.slice(start, endPos).trim()),
    endPos,
  })

  while (i < source.length) {
    const char = source[i]

    // A REGEX LITERAL is a legitimate example value — `s: /^\d+$/` denotes a RegExp under
    // the example rule exactly as `s: 5` denotes a number, and `fromTS` maps the TS type
    // `RegExp` to `/example/`. This scanner had no case for it, so the `/` fell through,
    // the type ended mid-pattern, and `tjs convert` emitted `):! /example/ {` — which does
    // not parse. Every TypeScript function returning a RegExp failed to convert; the
    // parameter position handled it correctly all along, so the two disagreed.
    if (!inString && char === '/') {
      const end = findRegexEnd(source, i)
      if (end !== -1 && isRegexStart(source.slice(start, i))) {
        i = end + 1
        // Flags (`/x/gi`).
        while (i < source.length && /[a-z]/.test(source[i])) i++
        sawContent = true
        // A completed value at depth 0 ends the type — unless a union follows. Without
        // this the next `{` is read as an opening bracket (the depth branch runs before
        // the function-body check) and the whole body is swallowed into the "type".
        if (depth === 0) {
          let j = i
          while (j < source.length && /\s/.test(source[j])) j++
          if (source[j] !== '|' && source[j] !== '&') return makeResult(i)
        }
        continue
      }
    }

    // Handle string literals
    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      sawContent = true
      i++
      continue
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(source, i)) {
        inString = false
        i++ // Move past closing quote
        // Just finished a string at depth 0
        if (depth === 0) {
          // Check if next non-ws is function body { or union |
          let j = i
          while (j < source.length && /\s/.test(source[j])) j++
          if (source[j] === '{') {
            // Check if it's object type or function body
            const afterBrace = source.slice(j + 1).match(/^\s*(\w+)\s*:/)
            if (!afterBrace) {
              // Function body - type ends here
              return makeResult(i)
            }
          }
          if (source[j] !== '|' && source[j] !== '&') {
            // No union - type ends here
            return makeResult(i)
          }
        }
        continue
      }
      i++
      continue
    }

    // Track bracket depth
    if (char === '{' || char === '[' || char === '(') {
      depth++
      sawContent = true
      i++
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth--
      if (depth === 0) {
        i++
        // Check for union after closing bracket
        let j = i
        while (j < source.length && /\s/.test(source[j])) j++
        if (source[j] === '|' || source[j] === '&') {
          continue // More type content
        }
        return makeResult(i)
      }
      i++
      continue
    }

    // At depth 0, check for function body
    if (depth === 0 && char === '{') {
      if (sawContent) {
        return makeResult(i)
      }
      // First { - check if object type or function body
      const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/)
      if (afterBrace) {
        depth++
        sawContent = true
        i++
        continue
      }
      return makeResult(i)
    }

    // Handle union/intersection at depth 0
    if (depth === 0 && (char === '|' || char === '&')) {
      i++
      if (i < source.length && source[i] === '|') i++ // Skip second | for ||
      while (i < source.length && /\s/.test(source[i])) i++
      continue
    }

    // Handle numbers (including decimals like 14.5, -3.14)
    if (
      depth === 0 &&
      (/\d/.test(char) || (char === '-' && /\d/.test(source[i + 1])))
    ) {
      let j = i
      if (source[j] === '-') j++ // Skip negative sign
      while (j < source.length && /\d/.test(source[j])) j++
      let isIntegral = true
      // Handle decimal part
      if (j < source.length && source[j] === '.' && /\d/.test(source[j + 1])) {
        isIntegral = false
        j++ // Skip decimal point
        while (j < source.length && /\d/.test(source[j])) j++
      }
      // Handle exponent (1e10, 1.5e-3)
      if (j < source.length && (source[j] === 'e' || source[j] === 'E')) {
        isIntegral = false
        j++
        if (j < source.length && (source[j] === '+' || source[j] === '-')) j++
        while (j < source.length && /\d/.test(source[j])) j++
      }
      // BigInt suffix — `0n`. Only after an integral literal, because `0.5n` and `1e3n`
      // are not valid JavaScript. Without this the return position rejected the very
      // example form `fromTS` emits for a TS `bigint`, so converted output did not parse.
      if (isIntegral && j < source.length && source[j] === 'n') j++
      sawContent = true
      i = j
      // Check what's next
      while (i < source.length && /\s/.test(source[i])) i++
      if (i < source.length && source[i] === '{') {
        // Function body - type ends here
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      if (source[i] !== '|' && source[i] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }

    // Handle identifiers (null, undefined, true, false, type names)
    if (depth === 0 && /[a-zA-Z_]/.test(char)) {
      let j = i
      while (j < source.length && /\w/.test(source[j])) j++
      sawContent = true
      i = j
      // Check what's next
      while (i < source.length && /\s/.test(source[i])) i++

      // Identifier followed by ( — constructor/function call as return type
      // e.g. FunctionPredicate('function', { params: ... })
      if (i < source.length && source[i] === '(') {
        depth++
        i++
        continue
      }

      if (i < source.length && source[i] === '{') {
        // Check if function body
        const afterBrace = source.slice(i + 1).match(/^\s*(\w+)\s*:/)
        if (!afterBrace) {
          // Function body - type ends before whitespace
          let typeEnd = j
          while (typeEnd > start && /\s/.test(source[typeEnd - 1])) typeEnd--
          return {
            type: normalizeUnionSyntax(source.slice(start, typeEnd).trim()),
            endPos: j,
          }
        }
      }
      if (source[i] !== '|' && source[i] !== '&') {
        return {
          type: normalizeUnionSyntax(source.slice(start, j).trim()),
          endPos: j,
        }
      }
      continue
    }

    i++
  }

  // Reached end of source
  if (sawContent) {
    return makeResult(i)
  }
  return null
}

/**
 * Split a parameter list on its top-level commas.
 *
 * Scans a **literal-masked view** — same length, with string / template / regex contents
 * and whole comments blanked — and slices the boundaries out of the ORIGINAL. So a comma
 * or a brace inside a literal can never be structure, and nothing in the output is
 * rewritten: what goes in comes back out byte-identical between the split points.
 *
 * It used to hand-roll comment tracking and bracket depth and know nothing about strings,
 * which put it squarely in the literal-blindness family (`src/strip-comments.ts`). Splitting
 * `{what = 'hello,', who: 'alice'}` mid-literal and rejoining the pieces with `', '` put the
 * comma back WITH A SPACE AFTER IT, inside the string:
 *
 *   {what = 'hello,', who: 'alice'}   →   { what = 'hello, ', who = 'alice' }
 *
 * Silent — the output parses and runs and returns a plausible wrong answer — and it reached
 * the emitted `__tjs` metadata too, so the wrong default propagated into `.d.ts` and JSON
 * Schema. A regex default was worse still: `/,/` became `/, /`, which is a different regex.
 * Pinned by `src/lang/literal-blindness.test.ts`.
 */

/**
 * `Box<int>` in annotation position -> a hoisted `const`, leaving a bare identifier.
 *
 *   function unbox(b: Box<int>)
 *     -> const __ta_Box_1 = Box(Number.isInteger)
 *        function unbox(b = __ta_Box_1)
 *
 * Applying a parameterized type is a CALL at run time — `Generic` returns a function and
 * calling it yields the checked type — and a primitive argument becomes a PREDICATE, which
 * is the only representation available for something with no runtime binding (`int`
 * compiles to an inline check, so `Box(int)` would reference nothing).
 *
 * Hoisting rather than inlining the call buys two things. The type is built once per
 * module instead of once per call; and the annotation stays an identifier, so the emitter's
 * existing declared-type path handles it with no change — the alternative was teaching
 * inference and codegen about call-shaped annotations, i.e. a second mechanism for
 * something the first already does.
 *
 * Unambiguous in this position: an annotation is delimited by `,` or `)`, so `Box<int>)`
 * cannot be a comparison. The identity of the argument is irrelevant — `Box<number>` and
 * `Box<string>` are no more reserved than `int`.
 *
 * Returns the input unchanged unless the head is a type declared in this module, so
 * ordinary annotations take exactly the path they took before.
 */
function rewriteTypeArguments(
  type: string,
  ctx: {
    declaredTypes?: Set<string>
    hoistedTypeArgs?: HoistedTypeArg[]
  }
): string {
  // `T[]` -> the array-example spelling, which the array path already handles:
  //   xs: number[]     ->  xs: [0.0]
  //   xs: string[][]   ->  xs: [['']]
  // Rewriting to the existing form rather than adding a second array representation means
  // `T[]` inherits item checking, `.d.ts` emit and JSON-Schema with no new code — and it
  // makes REST params work, since `...xs: T[]` was never a rest-param gap at all: the
  // annotation simply did not parse.
  const arr = rewriteArraySuffix(type)
  if (arr !== null) return arr

  if (!ctx.declaredTypes || !ctx.hoistedTypeArgs) return type
  const expr = applyTypeArguments(type, ctx.declaredTypes)
  if (expr === null) return type
  // Named after the annotation, not `__ta_0`: this identifier IS what a type error says
  // it expected, and "Expected __ta_0" tells the reader nothing about their own code.
  const base = type
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, '_')
    .replace(/_+$/, '')
  let alias = base
  for (let n = 2; ctx.declaredTypes.has(alias); n++) alias = `${base}_${n}`
  // `head` is the type being applied. The caller places the declaration immediately after
  // THAT type's own declaration: `Box` is a `const`, so a `const __ta_0 = Box(…)` placed
  // before it hits the temporal dead zone at module evaluation.
  ctx.hoistedTypeArgs.push({
    alias,
    head: expr.slice(0, expr.indexOf('(')),
    text: `const ${alias} = ${expr}`,
  })
  // The alias is itself a declared type from here on, so the emitter checks with it.
  ctx.declaredTypes.add(alias)
  return alias
}

/** A `const __ta_N = Box(…)` to be emitted after `Box`'s own declaration. */
export interface HoistedTypeArg {
  alias: string
  /** The type being applied — determines where the declaration must go. */
  head: string
  text: string
}

/**
 * Index of a top-level `=` that is an ASSIGNMENT, or -1.
 *
 * Skips `==`/`===`/`!=`/`>=`/`<=` and the arrow of `=>`, so an annotation whose example
 * contains a comparison or a callback (`[(x) => x]`) is not mistaken for a default.
 */
function topLevelAssignment(src: string): number {
  const masked = maskLiterals(src)
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === '=' && depth === 0) {
      if (masked[i + 1] === '=' || masked[i + 1] === '>') continue
      if ('=!<>'.includes(masked[i - 1] ?? '')) continue
      return i
    }
  }
  return -1
}

/** `number[]` -> `[0.0]`, `string[][]` -> `[['']]`; `null` when not an array suffix. */
function rewriteArraySuffix(type: string): string | null {
  const t = type.trim()
  if (!t.endsWith('[]')) return null
  const inner = t.slice(0, -2).trim()
  if (!inner) return null
  const nested = rewriteArraySuffix(inner)
  if (nested !== null) return `[${nested}]`
  const example = typeNameExample(inner)
  // An unknown element type is left alone rather than guessed at — a wrong example would
  // validate against the wrong thing, which is worse than not validating.
  return example ? `[${example}]` : null
}

/** `Box<int>` -> `Box(Number.isInteger)`, or null when this is not an applied type. */
function applyTypeArguments(
  type: string,
  declaredTypes: Set<string>
): string | null {
  const m = type.trim().match(/^([A-Z][A-Za-z0-9_$]*)\s*<(.+)>$/)
  if (!m) return null
  const [, name, argsSrc] = m
  if (!declaredTypes.has(name)) return null
  // Top-level split, so `Pair<Box<int>, int>` keeps its inner arguments together.
  const args: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < argsSrc.length; i++) {
    const c = argsSrc[i]
    if (c === '<' || c === '(' || c === '[' || c === '{') depth++
    else if (c === '>' || c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) {
      args.push(argsSrc.slice(start, i))
      start = i + 1
    }
  }
  args.push(argsSrc.slice(start))
  const resolved: string[] = []
  for (const a of args) {
    const t = a.trim()
    if (!t) return null
    // Nested application resolves recursively; a declared type is already a runtime
    // binding and needs no translation.
    const nested = applyTypeArguments(t, declaredTypes)
    if (nested) {
      resolved.push(nested)
      continue
    }
    const prim = typeArgumentSource(t)
    if (prim) {
      resolved.push(prim)
      continue
    }
    if (declaredTypes.has(t)) {
      resolved.push(t)
      continue
    }
    return null // an argument we cannot represent — leave the annotation alone
  }
  return `${name}(${resolved.join(', ')})`
}

/** Top-level comma split, untrimmed — see `splitTopLevel` in strip-comments. */
function splitParameters(params: string): string[] {
  return splitTopLevel(params)
}

/**
 * Process a parameter string, transforming : to = for required params
 * and recursively handling nested arrow functions
 */
function processParamString(
  params: string,
  ctx: {
    requiredParams: Set<string>
    typeNameOptionals: Set<string>
    // Threaded through so a type argument can be recognised and hoisted; both are
    // optional so every existing caller keeps working untouched.
    declaredTypes?: Set<string>
    hoistedTypeArgs?: HoistedTypeArg[]
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  },
  trackRequired: boolean
): string {
  // First recursively process any nested arrow functions
  const withArrows = transformParenExpressions(params, {
    originalSource: params,
    requiredParams: ctx.requiredParams,
    typeNameOptionals: ctx.typeNameOptionals,
    unsafeFunctions: ctx.unsafeFunctions,
    safeFunctions: ctx.safeFunctions,
  }).source

  // Now split and process each parameter
  const paramList = splitParameters(withArrows)
  let sawOptional = false
  const seenNames = new Set<string>()

  // Helper to check for duplicate names
  const checkDuplicate = (name: string) => {
    if (trackRequired && /^\w+$/.test(name)) {
      if (seenNames.has(name)) {
        throw new Error(`Duplicate parameter name '${name}'`)
      }
      seenNames.add(name)
    }
  }

  const processed = paramList.map((param) => {
    const trimmed = param.trim()
    if (!trimmed) return param

    // Destructured parameters, in both spellings the language accepts:
    //
    //   TJS:  { name: 'Clara', age = 30 }            — members carry EXAMPLES
    //   TS:   { name, age }: { name: '', age: 0 }    — a plain pattern, then a type
    //
    // The second form must have its annotation SPLIT OFF rather than descended into. Testing
    // `startsWith('{') && endsWith('}')` matched the whole of `{ a, b }: { a: 0, b: 0 }` as
    // one pattern, so the colon-shorthand rewrite ran inside the TYPE — emitting
    // `{ a, b }: { a: 0, b = 0 }`, which is not JavaScript, and leaving the annotation in the
    // output. `fromTS` emits exactly this shape for a destructured TS parameter, so the
    // converter was producing TJS that TJS could not read. Invisible while the JS output came
    // from `ts.transpileModule` — nothing ran our parser over it (`no-ts-emitter.test.ts`).
    //
    // The annotation is dropped here and captured separately for `__tjs` metadata, exactly as
    // it is for a rest parameter below.
    if (trackRequired && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      const open = trimmed[0]
      const masked = maskLiterals(trimmed)
      let depth = 0
      let end = -1
      for (let i = 0; i < masked.length; i++) {
        const c = masked[i]
        if (c === '{' || c === '[') depth++
        else if (c === '}' || c === ']') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end !== -1) {
        const inner = trimmed.slice(1, end)
        const rest = trimmed.slice(end + 1).trim()
        const processedInner = processDestructuredObjectParams(inner, ctx)
        const pattern =
          open === '{' ? `{ ${processedInner} }` : `[ ${processedInner} ]`
        // `: T` is a type annotation and is erased; `= v` is a real default and is kept.
        if (rest.startsWith(':')) return pattern
        return rest ? `${pattern} ${rest}` : pattern
      }
    }

    // Handle rest parameters: ...args: [0] -> ...args (strip type, JS forbids defaults on rest)
    // The type annotation is still captured by extractFunctionTypeInfo for __tjs metadata
    if (trimmed.startsWith('...')) {
      const restColonPos = findTopLevelColon(trimmed)
      if (restColonPos !== -1) {
        const restName = trimmed.slice(0, restColonPos).trim()
        // A DEFAULT on a rest param is meaningless, and silently dropping it is the
        // "looks like it does something" failure this project treats as worse than an
        // error. JS rejects `...xs = [1]` outright — but the annotated form
        // `...xs: number[] = [1]` slipped past, because the annotation is stripped here
        // and the leftover `= [1]` went with it. `f()` returned `[]`, not `[1]`.
        //
        // A rest parameter is ALWAYS bound, to `[]` when no arguments are passed, so
        // there is no absent case for a default to fill.
        const annotation = trimmed.slice(restColonPos + 1)
        const eq = topLevelAssignment(annotation)
        if (eq !== -1) {
          throw new SyntaxError(
            `A rest parameter cannot have a default. \`${restName}\` is always bound — ` +
              `to \`[]\` when no arguments are passed — so \`= ${annotation
                .slice(eq + 1)
                .trim()}\` could never apply.\n\n` +
              `  Drop it:  ${restName}: ${annotation.slice(0, eq).trim()}\n\n` +
              `JavaScript rejects \`${restName} = …\` for the same reason; only the ` +
              `annotated spelling slipped through.`,
            locAt(trimmed, 0)
          )
        }
        return restName
      }
      return param
    }

    // Handle optional param syntax: x?: type -> x = type (not required)
    const optionalMatch = trimmed.match(/^(\w+)\s*\?\s*:\s*(.+)$/)
    if (optionalMatch) {
      const [, name, type] = optionalMatch
      checkDuplicate(name)
      sawOptional = true
      // Optional params are NOT tracked as required.
      //
      // `n?: number` legitimately becomes `n = number` HERE: this string feeds the acorn
      // parse, and inference reads that identifier to learn the type. Dropping it would
      // silently degrade the param to `any` — which is why the fix is not in this file.
      //
      // The EMITTER deletes the dangling default, so the type survives inference and the
      // emitted JS is `function g(n)` — a genuinely optional parameter, which is what
      // `n?: number` means. Before that, `g()` threw `number is not defined` at call time.
      // It is recorded here rather than detected there because `n?: MyThing` and
      // `x = someVar` produce byte-identical AST; only this branch knows the difference.
      if (isTypeNameAnnotation(type)) {
        ctx.typeNameOptionals.add(name)
        return `${name} = ${type} ${PARAM_TYPENAME_MARKER}`
      }
      return `${name} = ${type}`
    }

    // Check if param already has a default value (x = value)
    if (!hasColonNotEquals(trimmed)) {
      // Has equals sign (default value) - this is optional
      // Extract name from "name = value" pattern
      const eqMatch = trimmed.match(/^(\w+)\s*=/)
      if (eqMatch) {
        checkDuplicate(eqMatch[1])
      }
      sawOptional = true
      return param
    }

    // Handle required param syntax: x: type -> x = type (tracked as required)
    const colonPos = findTopLevelColon(trimmed)
    if (colonPos !== -1) {
      const name = trimmed.slice(0, colonPos).trim()
      const type = rewriteTypeArguments(trimmed.slice(colonPos + 1).trim(), ctx)

      checkDuplicate(name)

      // Required param after optional — warn but allow.
      // TypeScript permits this, and the TS→TJS converter can produce it
      // when earlier params degrade to 'any' (bare name, no : or =).
      if (sawOptional && trackRequired && /^\w+$/.test(name)) {
        // Allow it — JavaScript handles this fine (caller passes undefined)
      }

      // `x: T | undefined` is OPTIONAL. The union spells "or absent", which is what the
      // converter emits for a TypeScript optional — `?:` cannot be used there because it
      // means "defaults to this example" (CLAUDE-TJS-SYNTAX.md).
      //
      // It used to be recorded as REQUIRED, so the emitted metadata said `required: true`
      // for a parameter the converter had just described as optional. That disagreement is
      // what motivated switching the converter to `?:`, which fixed the metadata by
      // introducing a behaviour bug — a bad trade. Fixed here instead, at the one place that
      // knows the annotation contained `undefined`.
      //
      // The emitted JS is unaffected: the param still carries the marker, so the whole
      // dangling `= T | undefined` is stripped and the parameter is genuinely optional.
      if (trackRequired && /^\w+$/.test(name)) {
        if (isOptionalUnion(type)) {
          // The OPTIONAL marker, not the required one. `required` in the emitted metadata is
          // driven by which marker is recorded here, not by `requiredParams` — so marking it
          // required is what made the metadata contradict the converter.
          ctx.typeNameOptionals.add(name)
          return `${name} = ${type} ${PARAM_TYPENAME_MARKER}`
        }
        ctx.requiredParams.add(name)
        return `${name} = ${type} ${PARAM_REQUIRED_MARKER}`
      }
      return `${name} = ${type}`
    }

    return param
  })

  return processed.join(',')
}

/**
 * Does a type annotation spell "or absent" as a top-level union with `undefined`?
 *
 * `fromTS` emits `name: T | undefined` for a TypeScript optional. Depth-aware so a nested
 * `Foo<A | undefined>` — where the parameter itself is required — is not misread.
 */
function isOptionalUnion(type: string): boolean {
  return splitTopLevelTrimmed(type, '|').some((p) => p === 'undefined')
}

/**
 * Is the value after a `:` in a destructuring pattern a RENAME rather than a member example?
 *
 * `{ a: b }` and `{ a: b = 1 }` rebind `a` as `b` — plain JavaScript, and the only reading
 * available: a dictionary member's value must be a pure literal (`docs/dictionary-defaults.md`
 * §6.1), which an identifier is not.
 *
 * The keyword literals are the trap. `null`, `true`, `false` and `undefined` are lexically
 * identifiers or identifier-shaped, but they are values, so `{ x: null }` IS a member. So are
 * `NaN` and `Infinity`, which are genuinely bindings on the global object but are used as
 * literals everywhere and would read as renames without being named here.
 */
const LITERAL_KEYWORDS = new Set([
  'null',
  'true',
  'false',
  'undefined',
  'NaN',
  'Infinity',
])

function isDestructuringRename(value: string): boolean {
  // `ident`, or `ident = <default>` — but not `ident.foo`, `ident(…)`, `ident ? …`, which
  // are expressions and therefore not valid on either reading.
  const m = /^([A-Za-z_$][\w$]*)\s*(=(?!=)[\s\S]*)?$/.exec(value.trim())
  return !!m && !LITERAL_KEYWORDS.has(m[1])
}

/**
 * Process destructured object/array parameters
 *
 * In TJS destructuring patterns:
 * - `name: 'Clara'` means required param with example (transforms to `name = 'Clara'`)
 * - `age = 30` means optional param with default (stays as `age = 30`)
 * - Nested objects like `address: { street: '9 High St', zip = '0000' }` are tricky:
 *   the inner object is a value (object literal), not a pattern, so we transform it back
 *
 * Key insight: In destructuring, `foo: value` at top level is a required param,
 * but at nested levels within an object value, `:` is normal object literal syntax.
 *
 * Order does NOT matter in objects (unlike positional function params).
 */
function processDestructuredObjectParams(
  inner: string,
  ctx: {
    requiredParams: Set<string>
    typeNameOptionals: Set<string>
    unsafeFunctions: Set<string>
    safeFunctions: Set<string>
  }
): string {
  // Split on commas at the top level (respecting nested braces)
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Check for nested destructured object: name: { ... }
    // The inner { ... } is an object literal value, not a destructuring pattern
    const nestedObjectMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjectMatch) {
      const [, name, objectLiteral] = nestedObjectMatch
      // Process the inner object as an object literal (transform = to : for values)
      const processedLiteral = processObjectLiteralValue(objectLiteral)
      ctx.requiredParams.add(name)
      return `${name} = ${processedLiteral} ${PARAM_REQUIRED_MARKER}`
    }

    // Check for nested destructured array: name: [ ... ]
    const nestedArrayMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrayMatch) {
      const [, name, arrayLiteral] = nestedArrayMatch
      // Process the inner array as an array literal
      const processedLiteral = processArrayLiteralValue(arrayLiteral)
      ctx.requiredParams.add(name)
      return `${name} = ${processedLiteral} ${PARAM_REQUIRED_MARKER}`
    }

    // Handle simple colon syntax: name: 'value' -> name = 'value' (required)
    const colonMatch = trimmed.match(/^(\w+)\s*:\s*([\s\S]+)$/)
    if (colonMatch && isDestructuringRename(colonMatch[2])) {
      // `{ message: message_ }` is a destructuring RENAME, not a dictionary member, and
      // rewriting it to `{ message = message_ }` changes what the function binds: it declares
      // `message` (defaulted from a name that no longer exists) instead of `message_`.
      //
      // The distinction is not a heuristic — `docs/dictionary-defaults.md` §6.1 requires a
      // member's value to be a pure literal, and excludes "identifiers referencing live
      // objects" by name. So an identifier after the colon can only ever be a rename.
      //
      // Worth stating how this presented, because the loud half was the lucky half. Two effect
      // files failed to parse, because the renamed binding collided with a `const` of the
      // original name in the body. Where there is no collision the rewrite still happens and
      // the emitted code PARSES — `{ size: size_ = 8 }` became `{ size = size_ = 8 }`, which
      // binds `size` and assigns to an undeclared `size_`. Silent, and in converted output.
      return part
    }
    if (colonMatch) {
      const [, name, value] = colonMatch
      ctx.requiredParams.add(name)
      return `${name} = ${value} ${PARAM_REQUIRED_MARKER}`
    }

    // Handle equals syntax: name = value (optional, already valid JS)
    // Just preserve it as-is
    return part
  })

  return processed.join(', ')
}

/**
 * Process an object literal value (nested inside destructuring)
 *
 * In object literals, TJS allows `=` for optional values:
 *   { street: '9 High St', zip = '0000' }
 *
 * This must become valid JS object literal syntax:
 *   { street: '9 High St', zip: '0000' }
 *
 * (The `=` is TJS shorthand indicating the value is optional/has default,
 * but in an object literal context it must use `:`)
 */
function processObjectLiteralValue(literal: string): string {
  // Remove outer braces, process content, restore braces
  const inner = literal.slice(1, -1).trim()
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Handle nested objects: key: { ... } or key = { ... }
    const nestedObjColonMatch = trimmed.match(/^(\w+)\s*:\s*(\{[\s\S]*\})$/)
    if (nestedObjColonMatch) {
      const [, key, nested] = nestedObjColonMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }
    const nestedObjEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\{[\s\S]*\})$/)
    if (nestedObjEqualsMatch) {
      const [, key, nested] = nestedObjEqualsMatch
      return `${key}: ${processObjectLiteralValue(nested)}`
    }

    // Handle nested arrays: key: [ ... ] or key = [ ... ]
    const nestedArrColonMatch = trimmed.match(/^(\w+)\s*:\s*(\[[\s\S]*\])$/)
    if (nestedArrColonMatch) {
      const [, key, nested] = nestedArrColonMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }
    const nestedArrEqualsMatch = trimmed.match(/^(\w+)\s*=\s*(\[[\s\S]*\])$/)
    if (nestedArrEqualsMatch) {
      const [, key, nested] = nestedArrEqualsMatch
      return `${key}: ${processArrayLiteralValue(nested)}`
    }

    // Transform equals to colon for simple values: key = value -> key: value
    const equalsMatch = trimmed.match(/^(\w+)\s*=\s*([\s\S]+)$/)
    if (equalsMatch) {
      const [, key, value] = equalsMatch
      return `${key}: ${value}`
    }

    // Colon syntax is already valid: key: value
    return part
  })

  return `{ ${processed.join(', ')} }`
}

/**
 * Process an array literal value (nested inside destructuring)
 * Similar to processObjectLiteralValue but for arrays
 */
function processArrayLiteralValue(literal: string): string {
  // Remove outer brackets, process content, restore brackets
  const inner = literal.slice(1, -1).trim()
  const parts = splitParameters(inner)

  const processed = parts.map((part) => {
    const trimmed = part.trim()
    if (!trimmed) return part

    // Handle nested objects
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return processObjectLiteralValue(trimmed)
    }

    // Handle nested arrays
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return processArrayLiteralValue(trimmed)
    }

    // Array elements are just values, no transformation needed
    return part
  })

  return `[ ${processed.join(', ')} ]`
}

/**
 * Check if param has a top-level colon but no top-level equals
 * This distinguishes x: type from x = type and handles nested structures
 */
function hasColonNotEquals(param: string): boolean {
  let depth = 0
  let hasColon = false
  let hasEquals = false
  let inString = false
  let stringChar = ''

  for (let i = 0; i < param.length; i++) {
    const char = param[i]

    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(param, i)) inString = false
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0) {
      if (char === ':') hasColon = true
      if (char === '=' && param[i + 1] !== '>') hasEquals = true // Ignore =>
    }
  }

  return hasColon && !hasEquals
}

/**
 * Find the position of the first top-level colon in a param
 */
function findTopLevelColon(param: string): number {
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < param.length; i++) {
    const char = param[i]

    if (!inString && (char === "'" || char === '"' || char === '`')) {
      inString = true
      stringChar = char
      continue
    }
    if (inString) {
      if (char === stringChar && !isEscapedAt(param, i)) inString = false
      continue
    }

    if (char === '(' || char === '{' || char === '[') {
      depth++
    } else if (char === ')' || char === '}' || char === ']') {
      depth--
    } else if (depth === 0 && char === ':') {
      return i
    }
  }

  return -1
}

/**
 * Preprocess source to handle custom syntax extensions
 *
 * Transforms:
 *   function foo(x: 'example') { }
 * Into:
 *   function foo(x = 'example') { }
 * And tracks that 'x' is a required parameter.
 *
 * Also handles return type annotation:
 *   function foo(x: 'example') -> { result: 'string' } { }
 */
