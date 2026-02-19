# TJS-Lang TODO

## Playground - Error Navigation

- [ ] Test errors: click should navigate to source location
- [ ] Console errors: click should navigate to source location
- [ ] Error in imported module: click through to source

## Playground - Module Management

- [ ] Import one example from another in playground
- [ ] Save/Load TS examples (consistency with TJS examples)
- [ ] File name should be linked to example name
- [ ] New example button in playground
- [ ] UI for managing stored modules (browse/delete IndexedDB)
- [ ] Auto-discover and build local dependencies in module resolution

## Language Features

- [ ] Portable Type predicates - expression-only AJS subset (no loops, no async, serializable)
- [ ] Sync AJS / AJS-to-JS compilation - for type-checked AJS that passes static analysis, transpile to native JS with fuel injection points. Enables both type safety guarantees AND native performance for RBAC rules, predicates, etc.
- [ ] Self-contained transpiler output (no runtime dependency)
  - Currently transpiled code references `globalThis.__tjs` for pushStack/popStack, typeError, Is/IsNot
  - Requires runtime to be installed or a stub (see playground's manual \_\_tjs stub)
  - Goal: TJS produces completely independent code, only needing semantic dependencies
  - Options: inline minimal runtime (~1KB), `{ standalone: true }` option, or tree-shake
  - See: src/lang/emitters/js.ts TODO comment for details
- [x] WASM compilation at transpile time (not runtime)
  - [x] Compile wasm {} blocks during transpilation
  - [x] Embed base64-encoded WASM bytes in output
  - [x] Include WAT disassembly as comment for debugging/learning
  - [x] Self-contained async instantiation (no separate compileWasmBlocksForIframe)
- [x] Expand WASM support beyond POC
  - [x] For loops with numeric bounds
  - [x] Conditionals (if/else)
  - [x] Local variables within block
  - [x] Typed array access (Float32Array, Float64Array, Int32Array, Uint8Array)
  - [x] Memory operations
  - [x] Continue/break statements
  - [x] Logical expressions (&& / ||)
  - [x] Math functions (sqrt, abs, floor, ceil, min, max, sin, cos, log, exp, pow)
- [x] WASM SIMD support (v128/f32x4)
  - 12 f32x4 intrinsics: load, store, splat, extract_lane, replace_lane, add, sub, mul, div, neg, sqrt
  - Explicit intrinsic approach (users call f32x4\_\* in wasm blocks)
  - Disassembler handles 0xfd prefix with LEB128 sub-opcodes
  - 16-byte aligned memory for v128 loads/stores
  - Demos: starfield SIMD rotation, vector search cosine similarity
- [ ] WASM SIMD vector search (batteries)
  - Replace JS vectorSearch battery with WASM SIMD implementation
  - SIMD cosine similarity demonstrated in vector search demo
  - TODO: integrate as a battery atom with auto-detect + fallback

## Editor

- [ ] Embedded AJS syntax highlighting

## Documentation / Examples

- [ ] Create an endpoint example
- [ ] Fold docs and tests into one panel, with passing tests collapsed by default (ts -> tjs inserts test; tjs -> js turns test blocks into documentation along with outcomes).
- [ ] Dim/hide the preview tab if nothing ever changed it
- [ ] Single source of truth for version number. I note the badge displayed in console is not matching the version. No hardwired versions -- version number is pulled from package.json and written to version.ts somewhere and that is the single source of truth.

## Infrastructure

- [ ] Make playground components reusable for others
- [ ] Web worker for transpiles (freezer - not needed yet)
- [x] Retarget Firebase as host platform (vs GitHub Pages)
- [ ] Universal LLM endpoint with real LLMs (OpenAI, Anthropic, etc.)
- [ ] ESM-as-a-service: versioned library endpoints
- [ ] User accounts (Google sign-in) for API key storage
- [ ] AJS-based Firestore and Storage security rules
- [ ] npx tjs-playground - run playground locally with LM Studio
- [ ] Virtual subdomains for user apps (yourapp.tjs.land)
  - [ ] Wildcard DNS to Firebase
  - [ ] Subdomain routing in Cloud Function
  - [ ] Deploy button in playground
  - [ ] Public/private visibility toggle
- [ ] Rate limiting / abuse prevention for LLM endpoint
- [ ] Usage tracking / billing foundation (for future paid tiers)

---

## Completed (this session)

### Project Rename

- [x] Rename from tosijs-agent to tjs-lang
- [x] Update all references in package.json, docs, scripts
- [x] Remove bd (beads) issue tracker, replace with TODO.md

### Timestamp & LegalDate Utilities

- [x] Timestamp - pure functions, 1-based months, no Date warts (53 tests)
  - now, from, parse, tryParse
  - addDays/Hours/Minutes/Seconds/Weeks/Months/Years
  - diff, diffSeconds/Minutes/Hours/Days
  - year/month/day/hour/minute/second/millisecond/dayOfWeek
  - toLocal, format, formatDate, formatTime, toDate
  - isBefore/isAfter/isEqual/min/max
  - startOf/endOf Day/Month/Year
- [x] LegalDate - pure functions, YYYY-MM-DD strings (55 tests)
  - today, todayIn, from, parse, tryParse
  - addDays/Weeks/Months/Years
  - diff, diffMonths, diffYears
  - year/month/day/dayOfWeek/weekOfYear/dayOfYear/quarter
  - isLeapYear, daysInMonth, daysInYear
  - toTimestamp, toUnix, fromUnix
  - format, formatLong, formatShort
  - isBefore/isAfter/isEqual/min/max/isBetween
  - startOf/endOf Month/Quarter/Year/Week
- [x] Portable predicate helpers: isValidUrl, isValidTimestamp, isValidLegalDate

### TJS Mode System (JS is now the default)

- [x] Invert mode system - JS semantics are default, improvements opt-in
- [x] TjsEquals directive - structural == and != (null == undefined)
- [x] TjsClass directive - classes callable without new
- [x] TjsDate directive - bans Date constructor/methods
- [x] TjsNoeval directive - bans eval() and new Function()
- [x] TjsStrict directive - enables all of the above
- [x] TjsSafeEval directive - includes Eval/SafeFunction for dynamic code execution
- [x] Updated Is() for nullish equality (null == undefined)
- [x] Added Is/IsNot tests (structural equality, nullish handling)
- [x] TjsStandard directive - newlines as statement terminators (prevents ASI footguns)
- [x] WASM POC - wasm {} blocks with parsing, fallback mechanism, basic numeric compilation
- [x] Eval/SafeFunction - proper VM-backed implementation with fuel metering and capabilities

### Bundle Size Optimization

- [x] Separated Eval/SafeFunction into standalone module (eval.ts)
- [x] Created core.ts - AJS transpiler without TypeScript dependency
- [x] Fixed tjs-transpiler bundle: 4.14MB → 88.9KB (27KB gzipped)
- [x] Runtime is now ~5KB gzipped (just Is/IsNot, wrap, Type, etc.)
- [x] Eval adds ~27KB gzipped (VM + AJS transpiler, no TypeScript)
- [x] TypeScript only bundled in playground (5.8MB) for real-time TS transpilation
