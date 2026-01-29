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
- [ ] SafeFunction - AJS Function constructor exposed to TJS
- [ ] Linter: flag eval() and new Function() as errors unless unsafe block
- [ ] Portable Type predicates - expression-only AJS subset (no loops, no async, serializable)
- [ ] Inline WASM for TJS
- [ ] Timestamp utilities - pure functions, no Date warts, 1-based months
  - [ ] Timestamp.now() -> ISO string
  - [ ] Timestamp.from(year, month, day, hour?, min?, sec?, ms?) -> ISO string
  - [ ] Timestamp.parse(string) -> ISO string (flexible input)
  - [ ] Timestamp.addDays/Hours/Minutes/Seconds(ts, n) -> ISO string
  - [ ] Timestamp.diff(a, b) -> milliseconds
  - [ ] Timestamp.year/month/day/hour/minute/second(ts) -> number
  - [ ] Timestamp.toLocal(ts, timezone?) -> formatted string for display
- [ ] LegalDate utilities - pure functions, YYYY-MM-DD strings
  - [ ] LegalDate.today() -> date string
  - [ ] LegalDate.from(year, month, day) -> date string
  - [ ] LegalDate.addDays/Months/Years(date, n) -> date string
  - [ ] LegalDate.diff(a, b) -> days
  - [ ] LegalDate.year/month/day(date) -> number
  - [ ] LegalDate.toTimestamp(date) -> ISO string (midnight UTC)
- [ ] TJS strict mode directives (opt-in, JS is baseline)
  - [ ] TjsEquals - structural == and !=
  - [ ] TjsDate - bans Date, use Timestamp/LegalDate
  - [ ] TjsClass - new automatic and illegal
  - [ ] TjsNoeval - bans eval/Function, allows Eval/SafeFunction
  - [ ] TjsNosemicolon - prevents ASI footguns
  - [ ] TjsStrict - all of the above

## Editor
- [ ] Embedded AJS syntax highlighting

## Documentation / Examples
- [ ] Create an endpoint example

## Infrastructure
- [ ] Make playground components reusable for others
- [ ] Web worker for transpiles (freezer - not needed yet)
- [ ] Retarget Firebase as host platform (vs GitHub Pages)
- [ ] Universal LLM endpoint with real LLMs (OpenAI, Anthropic, etc.)
- [ ] ESM-as-a-service: versioned library endpoints
- [ ] User accounts (Google sign-in) for API key storage
- [ ] AJS-based Firestore and Storage security rules
- [ ] npx tjs-playground - run playground locally with LM Studio
