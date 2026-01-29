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
- [ ] Portable Type predicates - expression-only AJS subset (no loops, no async, serializable)
- [ ] Inline WASM for TJS
- [ ] TjsNosemicolon - prevents ASI footguns (not yet implemented)

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
- [x] Deprecate LegacyEquals (now a no-op with warning)
- [x] Updated Is() for nullish equality (null == undefined)
- [x] Added Is/IsNot tests (structural equality, nullish handling)
