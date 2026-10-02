export const meta = {
  name: 'pre-release-review',
  description:
    'Tiered adversarial pre-release review: lens set selected by `tier` (always-on: correctness + blast radius; pre-minor adds efficiency + security; quarterly: ecosystem + practices)',
  phases: [
    {
      title: 'Review',
      detail: 'independent lens reviewers over the diff, per the selected tier',
    },
    {
      title: 'Verify',
      detail:
        'adversarially verify decision-changing findings (blockers always; majors unless depth=fast)',
    },
    { title: 'Triage', detail: 'dedupe, rank, GO / BLOCK recommendation' },
  ],
}

// ---- inputs -----------------------------------------------------------------
// args: { baseRef?, bump?: 'patch'|'minor'|'major', scope?, depth?: 'fast'|'full', repoDir? }
// args may arrive as a JSON string depending on the caller — parse defensively
// (this silently degraded three real runs to base='main', an empty diff)
const opts = typeof args === 'string' ? JSON.parse(args) : args || {}
const base = opts.baseRef || 'main'
const bump = opts.bump || 'minor'
const diffCmd =
  opts.scope ||
  `git diff ${base}...HEAD` +
    ` # if this diff is empty, the base is wrong: fall back to \`git describe --tags --abbrev=0\` (or the last version-bump commit if no tags) and diff against that — and REPORT the empty-base as a finding`

// How deep to VERIFY. Verification is ~70% of this workflow's cost, and measurement across
// six real runs of this exact gate showed the money was being spent in the wrong place:
//   - refute rate is LOWEST on blockers (3%) and HIGHEST on minor/nit (11%);
//   - but a finding's truth only matters when it changes the release decision. A blocker's
//     truth gates the tag — a false blocker wastes a whole fix cycle, so verifying it is
//     cheap insurance on a rare, expensive error. A minor/nit is a follow-up either way, so
//     verifying it changes nothing and is pure waste.
// So we NEVER adversarially verify minor/nit — they ship reported-but-unverified — and we
// scale how much of the rest we verify:
//   full (default, pre-tag): verify blocker + major.   ~35% cheaper than verify-everything.
//   fast (iterating):        verify blocker only.       ~62% cheaper — run it every iteration.
// The lens set does NOT shrink in either mode: lenses are cheap (~0.3 MB each) and are where
// the value is (blast-radius alone found 8 blockers). Cutting lenses would cut value, not cost.
const depth = opts.depth || 'full'
// Tier structure (reviews/2026-09-practices-audit.md D2): which lenses run depends on tier.
//   'always-on'  — correctness + blast-radius, every substantive change, pair with depth:'fast'
//   'pre-minor'  — adds efficiency + security; DRY/DX ride inside correctness/blast-radius
//   'quarterly'  — ecosystem + practices dispositions (never release-gating)
// Docs & coverage lenses are retired to the Tier-0 script (tools/release-doctor.ts).
const tier = opts.tier || 'pre-minor'
const TIERS = {
  'always-on': ['correctness', 'blast-radius'],
  'pre-minor': ['correctness', 'efficiency', 'security', 'blast-radius'],
  quarterly: ['ecosystem', 'practices'],
  // THE CONSUMER-FACING TIER. `dx`, `docs`, `coverage` and `dryness` are in
  // the pool and in no tier, so they run only if someone asks for them by
  // name — and over tosijs 1.11.0 they went seven rounds without running
  // once, on a release that changed the emitted type surface, the published
  // docs and the tarball layout. Those are exactly the dimensions the other
  // tiers do not look at: pre-minor asks "is it correct and safe", this asks
  // "is it pleasant, honest and covered". Pair with a WHOLE-RELEASE baseRef,
  // not a remediation diff — the questions are release-level.
  dx: ['dx', 'docs', 'coverage', 'dryness'],
  // THE IDIOM TIER (owner, 2026-09-26): tosijs code judged as what it is. Agents
  // write React-shaped code by default and hand-roll what the library already does
  // (observe -> DOM instead of bind), then patch the edge cases one at a time. Run
  // on any repo with tosijs components or state, over the whole release or the
  // whole subsystem — reactisms accumulate across diffs.
  idiom: ['idiom'],
}
const VERIFY_SEVERITIES = depth === 'fast' ? ['blocker'] : ['blocker', 'major']
// Key on the severity you'd ACT on, not just the label the finder typed: a reviewer who is
// unsure a "minor" isn't really a blocker sets severityUncertain, and that uncertainty is
// itself a decision-changing question — so it triggers verification too (review.md).
const shouldVerify = (f) =>
  VERIFY_SEVERITIES.includes(f.severity) || f.severityUncertain === true

// ---- the lens pool; `tier` selects from it (criteria mirror practices/review.md) ----
// 1-6 look AT THE CHANGE, and 9 at what the change touches BEYOND THE REPO
// (global binaries, $HOME, other processes, ports — state with no test suite and
// no rollback). 7-8 look outward (the tools we depend on) and inward (our own
// practices) — the compounding ones.
const LENSES = [
  {
    key: 'correctness',
    title: 'Correctness',
    checks: `Behavior is right. Stack-specific: observant correctness (new state paths actually observed/bound — no manual re-render sneaking in; \`await updates()\` around post-mutation assertions; id-path surgical updates intact); boxed vs raw (no proxy-on-proxy nesting; \`===\` on a BoxedScalar and \`toDOM\` getting raw values are silent traps); component lifecycle (\`content()\` once vs \`render()\` structural-only; \`value\` never an initAttribute; boolean attrs default false; light-vs-shadow DOM — path bindings break inside shadow DOM; no \`on<Event>\` callback props); edge cases, async settling, form-association, error/failure paths.`,
  },
  {
    key: 'efficiency',
    title: 'Efficiency',
    checks: `Performance. Surgical updates not rebuilds; id-paths for in-place list mutation; bulk-mutate-raw-then-touch()-once for large updates. Bundle size: any new runtime dep in a core library is a red flag; peers must be external; never sideEffects:false on an element-registering lib. Hot paths: no revalidation in internals (validate at the edge, not per hop); high-frequency handlers throttled/debounced; heavy deps lazy-loaded; big work off the main thread.`,
  },
  {
    key: 'dryness',
    title: 'DRYness (reuse & simplification)',
    checks: `Duplicated non-trivial logic that should be one shared helper; reuse what the stack already provides (dom.ts, throttle/debounce, existing bindings, StyleSheet()/vars — never raw CSS strings) rather than reimplementing; copy-paste that has drifted. Over-abstraction / premature generalization is ALSO a smell — flag both.`,
  },
  {
    key: 'docs',
    title: 'Documentation accuracy & up-to-dateness',
    checks: `Regenerate generated docs and diff-check: run the build/doc generator then \`git diff --exit-code\` over docs/, llms.txt, version.ts, examples.md, API.md — a dirty tree means shipped docs are stale. Inline /*# */ doc-comments must match the changed public API; live-example fences valid (only html/css/js/test execute). CHANGELOG has an entry for this version. README / CLAUDE.md / AGENTS.md reflect the change. Deprecations warn once and name their replacement.`,
  },
  {
    key: 'coverage',
    title: 'Test coverage',
    checks: `RUN the suite first (\`bun test\`, and the doc/browser tiers if they exist) and read the output — reviewing coverage without running it is guessing. **Every failing or skipped test is IN SCOPE. Never dismiss a failure as "pre-existing", "flaky", or "not caused by this change".** A change easily slips out of context and causes a downstream failure that then gets waved away as someone else's; treat every red test as a finding (with the failing test name + suspected cause). Then: new behavior has tests; every bug fix ships a failing-first regression test. Right tier: pure logic extracted and unit-tested; DOM via Happy DOM with \`await updates()\`; integration/E2E actually starts its target; type-level tests in *.types.ts under tsc. Security-critical code (VM/runtime, capability registry, RBAC) held to its high coverage bar. No skip-guarded tests passing vacuously (green != ran); no Bun-only imports leaked into Playwright tests.`,
  },
  {
    key: 'dx',
    title: 'Developer experience',
    checks: `The DX we PROVIDE. API ergonomics: emitted types accurate (no required->optional .d.ts drift), good inference, no re-introduced footgun (on<Event>, value-as-attribute, boolean-defaulting-true). Error messages actionable; assignment-strictness / monadic errors used where apt. OUTPUT IS SIGNAL, NOT NARRATION — flag log/console spam in the diff: breadcrumb/happy-path logs (entering handler, processing item, reached here), leftover debug output, repeated/unaddressed deprecation or retry warnings. Test per line: does it change what a reader would DO? If not it's spam (keep receipts for destructive/rare actions). Raise it even though it reads cosmetic — spam is almost always a SYMPTOM (a debug log left from a bug hunt, a deprecation nobody fixed, retry noise from a flaky dep), so flagging it drives the underlying cause to be fixed; and noise trains the team to stop reading output, so the one real line scrolls past unseen. Conventions: handle<Event> callbacks; deprecations keep old names working + warn once. The "point an agent at it and it works" test: CLAUDE.md/AGENTS.md current, gotchas documented, and \`bun install\` -> \`bun start\`/\`bun test\`/\`bun run build\` succeed from a fresh clone (TLS certs, single lockfile).
**BREAKING CHANGES — check all four.** If this release removes or changes public API: (1) is the break JUSTIFIED (does it buy something a deprecation couldn't? an incidental break, made because the old API was in the way of a refactor, is the kind consumers resent); (2) does the VERSION reflect it; (3) is there a CHANGELOG ENTRY NAMING EXACTLY WHAT BROKE — a release that removes public API with no changelog entry is a trap, and an easy one to ship because the code still compiles; (4) are there MIGRATION NOTES (ecosystem convention: a \`Migration.md\` shipped in \`docPaths\`) telling a consumer precisely what to change, before -> after. Prefer the deprecation path; if you break, say why.`,
  },
  {
    key: 'ecosystem',
    title: 'Ecosystem & abstraction health (BOTH directions)',
    checks: `This lens runs in TWO DIRECTIONS AND BOTH HALVES ARE MANDATORY. Reviewers reliably do 7a and skip 7b — DO NOT. Run both and report both, as separate sections of your findings.

=== 7a. OUTGOING — are we paying for someone else's missing seam? ===
Look UP and OUT, not down. Lens 6 asks "is the DX we PROVIDE good?" — you ask "is the DX we CONSUME good, and is this code quietly paying for it being bad?" Hunt for:
- **Work happening in the wrong layer:** boilerplate or workarounds that exist here only because an upstream tool (tosijs, tosijs-ui, tjs-lang, tosijs-schema, the site builder, haltija) lacks a seam. If several consumers each hand-roll the same thing, that is ONE missing library affordance, not N local problems.
- **Nascent anti-patterns:** a clever workaround one copy-paste away from becoming convention; a pattern spreading because the right way is too hard; code fighting the observant model (reaching for a re-render because a binding was awkward to express).
- **Compensating complexity:** defensive unwrapping, sanitizing inputs the upstream should have handled, indirection routing around a limitation, a version pin that dodges a bug instead of fixing it.
- **Normalized friction:** loop steps we've stopped noticing (manual regeneration, port collisions, cert setup, two lockfiles, a script renamed to dodge a builtin). Familiarity is not the same as fine.
For each outgoing finding, name the UPSTREAM tool and the missing seam/affordance, and propose the upstream fix. The recommendation must be to **FILE A GITHUB ISSUE on the upstream repo** (the channel), with the body OPENING \`From: <this repo> @ <version>\` — everything posts from one account, so provenance lives in the body or nowhere — and mirror it in this repo's UPSTREAM.md with the issue URL. NEVER edit the upstream repo directly (agents stay in their own repo; that requires human signoff). Do not accept a silent workaround.

=== 7b. INCOMING — what have our consumers filed against US? ===
ENUMERATE, DO NOT GLANCE. This is not a footnote; it is half the lens. Resolve the repo from \`git remote get-url origin\`, then run:
  gh issue list -R tonioloewald/<this-repo> --state open
- GIVE EVERY OPEN ISSUE A DISPOSITION. For each, state which: FIXED BY THIS RELEASE (-> close it naming the version, AND put it in the release notes), STILL OPEN (-> say so), or STALE (-> close it). An issue this release silently closes can REFRAME WHAT THE RELEASE IS — e.g. a library migration that also happens to unblock a downstream port is not just a library migration, and the notes must say so.
- CROSS-CHECK EVERY WORKAROUND FROM 7a AGAINST THE ISSUE LIST. Is there already an issue for it? A TEST LOOSENED, OR COMPLEXITY ADDED, TO ROUTE AROUND A BUG WE FILED AGAINST OURSELVES is the signature failure of this half — 7a flags the SHAPE of it and will not connect it to the open issue unless you deliberately do.
- ON A BREAKING OR TIGHTENING CHANGE, MEASURE THE CONSUMER FOOTPRINT — do not assume it: \`curl -s https://api.npmjs.org/downloads/point/last-month/<pkg>\` + the repo's GitHub dependents. The numbers calibrate severity BOTH ways: a footprint that quietly grew makes a casual break a real finding, and a measured-zero consumer base makes a breakage/publish-state finding bookkeeping (minor), NOT a blocker. Grade against the base you measured, not the one you imagined. (Known-real as of writing: tosijs, tosijs-ui — dozens of users by download stats. The ecosystem has never received a breakage complaint.)
Report 7b findings even when they are not defects in the diff (e.g. "issue #N has been fixed since 1.6.11 and is still open — close it").`,
  },
  {
    key: 'practices',
    title: 'Practices & process self-review',
    checks: `The review reviews itself. Read the shared practices — the repo at https://github.com/tonioloewald/tosijs-coding-practices (or the sibling checkout ../tosijs-coding-practices — \`git -C\` pull it first, a stale checkout serves stale practices — or this project's CLAUDE.md/AGENTS.md pointer) — and ask:
- Did this release **contradict, outdate, or vindicate** a documented practice? A practice that didn't match reality is a BUG IN THE KNOWLEDGE BASE — say so and propose the correction (with attribution), don't route around it.
- What did we learn here that **would have saved time if it had been written down**? Propose the entry and which doc it belongs in.
- Did the **process** hold — did a lens miss something that bit us, is a lens dead weight, did the gate work?
- If the repo carries a PRIOR lens-8 write-back claim (a checked TODO item, a docs/reviews report), verify it NAMES THE COMMIT RANGE it covered (\`<base>..<sha>\`) and that nothing landed after it. A claim with no range, or one that predates later commits while asserting completion, is a finding — staleness must be checkable, not merely noticeable.
- Are this project's own CLAUDE.md / AGENTS.md still accurate after the change?
- RUN THE READ DIRECTION TOO: did the practices move under THIS project? \`git -C <practices-checkout> log --oneline --since=<this project's last release date>\` and disposition each change that touches how this project works — adopted, already compliant, or deliberately diverging (the divergence goes to 00-stack.md "Known divergences"). A practices change nobody dispositioned is a silent fork.
Findings here are proposed CHANGES TO THE PRACTICES (or to this repo's agent docs), not to the shipping code. Severity is usually minor/major, rarely a blocker. Returning zero findings is suspicious — it usually means nobody looked.`,
  },
  {
    key: 'idiom',
    title: 'tosijs idiom: antipatterns and reactisms',
    checks: `Judge this code as tosijs code, against practices/observant-model.md, practices/model-priors.md, practices/web-components.md and practices/state-and-schema.md (read them first). tosijs is OBSERVANT, not reactive: the DOM is built once and updated pin-point from observed state; there is no UI = f(state), no re-render, no diff. The failure you are hunting is code that imports mainstream habits, or hand-rolls what the library already provides. For each finding, name the idiomatic replacement (the library facility that already does it) and the edge cases the hand-rolled version will keep hitting. A finding here IS "this is React-shaped" — that is the defect, the inverse of the prior-art rule other lenses apply.`,
  },
  {
    key: 'security',
    title: 'Security (subsystem-scoped)',
    checks: `Review security-critical subsystems the diff touches OR sits adjacent to — sandbox/VM, capability and tool boundaries, RBAC/auth, URL/SSRF guards, regex/ReDoS and other untrusted-input paths, secrets handling, network listeners. Security holes are LATENT: they sit in already-shipped code outside the diff, so escalate any touched security subsystem to WHOLE-SUBSYSTEM depth regardless of diff size (a minor bump's review once found five VM blockers, four latent in the prior shipped release). Check: unauthenticated reachable surfaces (who can hit this endpoint/port/handler, from where, with what Origin); input validation at every trust boundary; fail-open vs fail-closed on every gate (a gate must never report a pass it didn't earn, and a documented divergence at a gate is still fail-open); what a compromised or malicious caller could make this code do; whether tests cover the hostile input class, not just the happy path. Findings whose subject is an isolation, capability, or auth guarantee get adversarially verified regardless of reported severity.`,
  },
  {
    key: 'blast-radius',
    title: 'Blast radius (what propagates outside the repo — cost or benefit)',
    checks: `Lenses 1-6 review the code. You review what this change PROPAGATES beyond the repo. Blast radius has a SIGN, and the amplitude multiplies whichever sign it has: a bug in a widely-used library is catastrophic for the same reason an improvement in it is enormously valuable. Run BOTH directions.

=== A. POSITIVE BLAST RADIUS — harm that propagates (the footprint) ===
Everything this change writes, spawns, binds, or kills that OUTLIVES THE PROCESS and is shared with software we do not own. That state has no test suite, no code review and no rollback. It is where a tool stops being wrong in its own repo and starts being wrong ON THE USER'S MACHINE.

MACHINE SCOPE IS NOT AUTOMATICALLY A SMELL, AND YOU ARE NOT HERE TO ELIMINATE IT. Some problems are intrinsically machine-scoped ("which version of this shared CLI does every shell on this box run?") and CANNOT be solved per-project; a tool that refuses to look outside its own directory just leaves them unsolved. Acting at machine scope is then a FEATURE, and scoping it down to look tidy is the actual bug. Do not file "this touches global state" as a finding on its own. Ask instead: IS IT DONE RIGHT? Done right =
  (1) SCOPED TO REAL HARM — act only on what is actually causing the problem, positively identified; never "everything that matches", never "everything older than me";
  (2) ASK, DON'T INFER — if the thing can be ASKED to stop, ask it; prefer a request over a signal, a version query over a byte-compare. Inferred values (a pid from a port, a version from file size) are where the bugs are;
  (3) SELF-TERMINATING — keyed on the condition that makes something harmful, so it stops firing once that condition is gone;
  (4) NEVER CLOBBERS A DELIBERATE CHOICE — a symlink, a pin, a hand-edited config;
  (5) REVERSIBLE, with an opt-out documented where the AFFECTED person will see it;
  (6) ACCOUNTABLE — the one everyone skips. An append-only receipt of every machine-scope action (timestamp, version, AND the cwd of the project that triggered it), announced on STDERR (harnesses swallow stdout). This matters most when the tool is a TRANSITIVE DEPENDENCY: someone runs ANOTHER project's test script, it spawns this tool, and it touches their machine — and they have never heard of it. There must always be an answer to "what did this do to my machine, and which project caused it?" UNACCOUNTABLE global action is what you forbid; global action is not.

=== B. NEGATIVE BLAST RADIUS — benefit that propagates (leverage) ===
This is what a library is FOR: do a thing well in one place, and every consumer gets it for free on the next update. Ask whether this change CAPTURED that leverage or LEAKED it:
  - A LOCAL fix to a GENERAL problem is a leak — the next consumer re-hits it. Was the fix made at the layer where everyone benefits, or patched where it happened to bite?
  - DUPLICATION is a leak, and worse than untidy: it SEVERS THE PROPAGATION PATH. When the same logic lives in two places a fix reaches only one — and if the TESTED copy is the one that doesn't ship, improvements propagate to NOBODY. (This is the real cost DRY guards; report it here, from the propagation angle, when a change adds or leaves such a copy on a path that matters.)
  - PROPAGATION COST: a benefit consumers get by merely updating is true negative blast radius; one that forces every consumer to change code (a breaking change, a migration) is leverage with friction — ask whether it could have shipped without the friction.
  - GENERATED, not just propagated: a build/dev/review tool encounters the rest of the stack every run, and each encounter can leave it BETTER. Two moves, and their absence is a finding: (i) SURFACE AND ROUTE, don't absorb — a defect this diff WORKS AROUND in something it doesn't own (a dependency, the machine, another process) should be FILED upstream with the workaround kept only until the fix ships; a silent local workaround buries the signal and guarantees the next consumer re-hits it; (ii) FEED THE LESSON BACK — when this change was prompted by a bug some earlier review/build caught, was the CLASS of it encoded where the tool re-applies it automatically (a lens prompt, a preflight check, a KB entry)? A one-off catch helps one release; a hardened guard helps every release after. A diff that hand-patches around an upstream bug with no issue filed, or fixes a bug-class without hardening the guard that missed it, has left negative blast radius on the table — report it.
Not every change has a B-half finding; a pure internal refactor may capture leverage cleanly. But a change that fixes a bug LOCALLY that other consumers will hit, or that hand-copies a shared policy, has leaked leverage — say so.

FAST EXIT (applies to the A-half): if the diff writes nothing outside the repo, spawns nothing, binds nothing and kills nothing, say so in one line and return no A-half findings. Do not manufacture footprint findings — on a pure library change the A-half is correctly quiet. (Still run the B-half.)

Otherwise ENUMERATE the footprint (grep the diff for: homedir(), os.homedir, '~/', /usr/local, .local/bin, XDG_, process.kill, spawn, execSync, lsof, Bun.serve, listen, writeFileSync to paths outside the repo) and interrogate each:

- **Global binaries & PATH** (~/.local/bin, /usr/local/bin, shell rc files): ONE binary, EVERY project. If N versions of the tool can each install it, ask WHICH ONE WINS — "last process to boot" is a race, not a policy. Never clobber a symlink (it is a deliberate install; overwriting reverts someone's tooling under them).
- **Home-dir / XDG state** (~/.config, ~/.cache, dotdirs, registries, lockfiles): does it survive uninstall? Can a stale entry outlive its writer, and what reads it afterwards?
- **Other processes** — anything spawned, signalled or killed. KILLING IS A POLICY, NOT A FIX: state the predicate, and state how you IDENTIFY the victim.
  * The predicate: "older than me" is almost always WRONG — it never terminates, and two peers on adjacent versions kill each other forever. Key it on what makes the other process HARMFUL (e.g. below the version that fixed the harm) so it self-terminates.
  * The identification: BE ADVERSARIAL ABOUT HOW THE PID IS RESOLVED. Port-to-pid lookups are a classic trap — \`lsof -i :PORT\` matches sockets whose LOCAL **OR REMOTE** port is PORT, so it returns CONNECTED CLIENTS as well as the listener, and a long-lived client (a browser) usually sorts FIRST by pid. Killing pids[0] then SIGTERMs the user's browser while the actual target survives and the log cheerfully reports success. Require \`-sTCP:LISTEN\`, and sanity-check the process identity (\`ps -p PID -o comm=\`) before signalling. NEVER signal a pid you have not positively identified.
  * When it cannot act, it must COMPLAIN, not fail silently — an unfixed hazard the user does not know about is worse than a loud one.
- **Ports/sockets**: a well-known default port is shared state; squatting or reclaiming it affects whoever else wanted it.
- **THE TEST SUITE'S OWN FOOTPRINT — the sharpest edge on this lens.** Ask explicitly: DOES RUNNING THE TESTS DO ANY OF THE ABOVE? A SPAWNED process re-reads the real config path and the real \$HOME — an in-process \`dir\` option or DI seam does NOT contain it. Destructive startup behavior (killing, installing to ~/.local/bin) runs in EVERY test-spawned server unless a test explicitly disables it: grep for the opt-out env var and confirm the test spawns actually set it. This corrupts the developer's own environment, so it presents as "my tools got weird", never as a red test. CHECK THIS EVEN IF THE DIFF DOES NOT TOUCH TESTS.

Ask of each: WHO ELSE CAN THIS SURPRISE, AND CAN THEY UNDO IT? Prefer additive and reversible; where you cannot, be loud, and document the behavior and its opt-out somewhere the USER can see (README / --help / CHANGELOG — note that CLAUDE.md is usually NOT shipped to users).

Findings that touch the user's machine — a global binary, a kill policy, a test that writes to \$HOME — are BLOCKERS, not nits. A change that is correct in-repo and hostile on the machine has not passed review.`,
  },
]

/*
Cascades (2026-09, owner; practices/review.md "Lenses are cascades"): a criterion is a FACT
CHECK (one right answer, obtained by looking) or a JUDGEMENT CALL (gated — it must name the
fact that fires it and the fact that settles it). Each lens leads with its cascade: facts in
order, each "no" closes a branch, judgement only where triggered. Measured basis: over nine
consumer upgrades in the release-RFC threads, judgement ceremony caught nothing; every fact
check that existed paid.
*/
const CASCADES = {
  idiom: `1. Greppable reactisms (grep the changed files, then read each hit): render() that builds or rebuilds DOM, or holds conditional/dynamic logic; conditional or data-dependent logic in content(); observe(...) callbacks that write to the DOM (use bind / bindings); innerHTML or string-built markup; on<Event> callback props (the element factory turns them into listeners — use handle<Event>); cond && child in element trees; document.createElement('style') or raw CSS strings (use StyleSheet / vars); setTimeout or requestAnimationFrame to wait for a render (use await updates()); === on a boxed value; value declared as an initAttribute; path bindings inside shadow DOM. Each hit is a finding unless the code states why it is the exception.
2. Hand-rolled library features: home-grown memoization, coalescing, dirty-checking or change-detection (the observer already coalesces); manual list rendering or index-keyed rebuilds instead of list bindings with id-paths; querySelector lookups for the component's own elements instead of parts; local component state that mirrors tosi state instead of binding to it. Each: name the facility that already does it.
3. Edge-case accretion: does the diff patch several edge cases around one hand-written mechanism (observer, list, lifecycle)? If yes, the finding is the mechanism, not the cases: replace it with the library facility (practices/review.md 'look for the guard at the earliest point').
4. Judgement, triggered only by gates 1-3 having found something: is there a legitimate reason to leave the platform idiom here (performance measured, a third-party integration)? If the code does not say so, it is a finding.`,
  correctness: `1. Did runtime behavior change (non-test, non-doc code in the diff)? NO -> only gates 5-6 can fire.
2. For each behavioral change: does a test exist that FAILS without it? (run it) NO -> finding.
3. Does the changed code run in >1 mode (flags, http/https, dev/prod, headless/desktop)? YES -> state what it does in EACH mode. Hard rules: a default only one path sets = finding; a check reading input that is parsed later = finding.
4. Greppable hard rules, each hit = finding: manual re-render; on<Event> callback props; value as initAttribute; proxy-on-proxy; path bindings inside shadow DOM.
5. Diff touches measurement/inspection/remote-control code? YES -> can a result be right-looking-but-wrong? Then it must carry the caveat that makes it interpretable.
6. Did an instrument gain a signal it previously lacked? YES -> every prior green obtained with the old instrument is unverified; re-run those checks.`,
  efficiency: `1. Is the bundle-size delta printed? (if the build doesn't print it, THAT is the finding) Grew -> named in the CHANGELOG? Unexplained growth = finding; explained -> judgement: justified?
2. New runtime dependency (package.json diff)? In a core library = finding, hard rule.
3. Does the diff add work to a hot path (per-frame / per-keystroke / per-row / per-binding)? YES -> complexity before vs after; O(N) on a hot path = finding.
4. Did build or suite wall-clock grow? Print the numbers — friction habituates, a printed number that grew does not.`,
  dryness: `1. Did the code get NET LARGER? (git diff --stat, source lines) YES -> judgement, triggered: what does the size buy? Could it be smaller without losing function?
2. Does new code duplicate an existing path? (search for the same shape: helper names, near-identical blocks, a second implementation of one behavior) YES -> unify, or record the keep-decision; a structural twin cannot be deferred without one.
3. New abstraction with fewer than two real consumers? (count call sites) YES -> premature generalization, flag.
4. Does an existing copy-pair show drift? (diff the twins) Drift = a correctness bug wearing two addresses; report both copies.`,
  docs: `1. Do generated docs regenerate clean? (build, then git diff --exit-code)
2. Did the public surface change (export/.d.ts diff)? Each new surface: named in a consumer-facing doc? REACHABLE from the error/warning a user hits when they have the problem it solves?
3. CHANGELOG entry for this version? (Tier 0 answers this — trust its output.)
4. Security-relevant fix? -> does the entry name the affected SHIPPED versions?
5. Anything deprecated? -> warns once and names its replacement?`,
  coverage: `1. Was the suite RUN and the output READ?
2. Any failing or skipped test? Each is IN SCOPE — hard rule, no dismissals.
3. For each bug fix: does a failing-first regression test exist? (verify it fails pre-fix where feasible)
4. For each NEW test or check: has it been SEEN RED? A check nobody has seen fail is not a check.
5. Any skip-guard or early return that can never un-skip? Green != ran.`,
  dx: `1. Did public APIs change (exported surface / built .d.ts diff)? NO -> skip to gate 8.
2. For each changed symbol: additive or breaking? (fact, per symbol)
3. Every new API documented — and reachable, not just present?
4. Any API deprecated? -> warns once, names the replacement, migration explained AND reachable from the installed artifact?
5. Is the surface BIGGER (count exported symbols before/after)? YES -> judgement, triggered: justified? Could it be smaller without losing functionality?
6. Are new names consistent with the existing API's style and vocabulary? A word meaning two things across the surface = finding. (Scope: the new names only.)
7. Breaking? -> four facts, any missing one = finding: justified beyond what a deprecation could buy / version reflects it / CHANGELOG names exactly what broke / migration notes reachable from the artifact.
8. Any new log/console output? Each line: does it change what a reader would DO? NO -> spam, finding.`,
  ecosystem: `1. Does the diff contain a workaround, pin, defensive unwrap, or hand-rolled copy of something an upstream should provide? Each -> name the upstream + the missing seam; disposition = FILE AN ISSUE, never a silent workaround.
2. Enumerate open incoming issues (gh issue list). Does EVERY one have a disposition (fixed-by-this-release / still-open / stale)?
3. Cross-check every gate-1 workaround against the incoming list — is there already an issue for it?
4. Breaking or tightening? -> MEASURE the consumer footprint (downloads + dependents + owner knowledge); grade severity against the measured base, both directions.`,
  practices: `1. Did the practices move under this project? (git log --since last release on the practices checkout) Each change touching this project -> dispositioned: adopted / already compliant / deliberately diverging (recorded).
2. Does a prior lens-8 write-back exist? -> does it name its commit range, and has anything landed after it? Stale claim = finding.
3. Did this release contradict or vindicate a documented practice? (judgement, triggered by an OBSERVED divergence — name the practice and the observation.)
4. Read reviews/AAR.md entries since the last pass — this lens is where their analysis happens. Deterministic triggers: a recorded blocker->fix->blocker cycle (-> ask WHY the review didn't frame the class the first time, and WHY the fix didn't close it); recurring friction lines (-> tooling opportunity); a lens returning zero findings twice running (dead weight, or nobody looked — say which); a check that fired but has never been seen red.`,
  security: `1. Does the diff touch or sit adjacent to a security subsystem (sandbox/VM, capability/tool boundary, auth, URL/SSRF, regex over untrusted input, secrets, listeners)? NO -> say so; done. YES -> whole-subsystem depth (holes are latent; diff size is irrelevant).
2. For each reachable surface: who can hit it, from where, unauthenticated? (fact)
3. Every gate: fail-open or fail-closed? (fact, per gate; fail-open = finding)
4. Is the hostile-input class covered by a test, not just the happy path? (fact)`,
  'blast-radius': `1. Does the diff write, spawn, bind, kill, or delete ANYTHING outside the repo? (grep the diff: homedir, ~/, /usr/local, .local/bin, XDG_, process.kill, spawn, listen, out-of-repo writes, deletion paths) NO -> the harm half closes in ONE LINE; do not manufacture findings.
2. YES -> enumerate the footprint; each item through the six done-right criteria (mostly facts: predicate stated? self-terminating? receipt written? opt-out documented?).
3. Does the TEST SUITE touch any of it? Check even when the diff doesn't touch tests.
4. Benefit half, triggered: does the diff fix a bug, work around a dependency, or copy a policy? Each -> captured or leaked (fixed where every consumer benefits? workaround filed upstream? does the copy sever propagation?)`,
}
LENSES.forEach((l) => {
  if (CASCADES[l.key])
    l.checks =
      `CASCADE — answer the facts IN ORDER; each "no" closes its branch; judgement fires only where its trigger fact fired. "No findings" must mean "the gates answered no", never "nothing occurred to me" — state which gates closed on fact.\n${
        CASCADES[l.key]
      }\n\nFULL CRITERIA (rationale and evidence for the gates):\n` + l.checks
})

// Fold the retired DRY/DX lenses into the survivors as framings (27% duplicate rate;
// DX never originated a blocker — 2026-09 audit). Structural-twin DRY lives in Tier 3.
const FOLDED = {
  correctness: `\n- DIFF-LEVEL DRY AS CORRECTNESS: a copy-paste that has already drifted is a correctness bug wearing two addresses — report the drift AND name both copies. New near-duplicate logic in the diff: flag it once, here.\n- DX AS CORRECTNESS: emitted types that lie (required->optional drift), error messages that misdirect, a footgun reintroduced — report as the defects they are.`,
  'blast-radius': `\n- STRUCTURAL DUPLICATION AS SEVERED PROPAGATION: if the diff adds or entrenches a parallel code path / structural twin (two implementations of one behavior), report it HERE with the propagation argument — and note it CANNOT be deferred without a recorded keep-decision (structural twins compound: every future fix must land twice).`,
}
LENSES.forEach((l) => {
  if (FOLDED[l.key]) l.checks += FOLDED[l.key]
})
const activeLenses = LENSES.filter((l) =>
  (TIERS[tier] || TIERS['pre-minor']).includes(l.key)
)

const SEVERITY = ['blocker', 'major', 'minor', 'nit']

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'findings'],
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'severity',
          'title',
          'file',
          'failureScenario',
          'recommendation',
        ],
        properties: {
          severity: { type: 'string', enum: SEVERITY },
          title: {
            type: 'string',
            description: 'one-sentence statement of the issue',
          },
          file: {
            type: 'string',
            description: 'repo-relative path, or "(cross-cutting)"',
          },
          line: { type: ['integer', 'null'] },
          failureScenario: {
            type: 'string',
            description:
              'concrete inputs/state -> wrong outcome; for non-correctness lenses, the concrete cost/risk',
          },
          recommendation: {
            type: 'string',
            description: 'what to do about it',
          },
          severityUncertain: {
            type: 'boolean',
            description:
              'true if you are not confident the severity label is right (e.g. "this minor might really be a blocker") — uncertain findings get verified regardless of label',
          },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasoning'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'plausible', 'refuted'] },
    reasoning: { type: 'string' },
    adjustedSeverity: {
      type: ['string', 'null'],
      enum: ['blocker', 'major', 'minor', 'nit', null],
      description: 'set only if the original severity was wrong',
    },
  },
}

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendation', 'summary', 'reportMarkdown'],
  properties: {
    recommendation: {
      type: 'string',
      enum: ['GO', 'GO_WITH_FOLLOWUPS', 'BLOCK'],
    },
    summary: { type: 'string' },
    blockerCount: { type: 'integer' },
    reportMarkdown: {
      type: 'string',
      description: 'full formatted review report, ready to save/paste',
    },
  },
}

const GAPS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['gaps'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'string',
        description:
          'a subsystem, claim, or lens that was NOT adequately reviewed',
      },
    },
  },
}

const READONLY = `You are REVIEWING, read-only. Do NOT edit, write, or create any file, and do NOT run any mutating command (no git add/commit/push/checkout/stash, no formatter). Running the test suite (\`bun test\`) or a read-only build to OBSERVE results is fine — just don't commit or hand-edit anything.${
  opts.repoDir
    ? `\n\nIMPORTANT: the repository under review is \`${opts.repoDir}\` — NOT the session's default working directory. cd there first; run ALL commands (git, bun, file reads) against that directory.`
    : ''
}`

const reviewPrompt = (lens) =>
  `${READONLY}

You are the **${
    lens.title
  }** reviewer in a pre-release review of THIS repository.

Scope: run \`${diffCmd}\` and \`git diff --stat ${base}...HEAD\` to see everything that changed since the last release (base = \`${base}\`). Read the changed files, and the tests/docs/config around them, as needed for real judgment.${
    bump === 'major'
      ? ' This is a MAJOR release — also review the whole affected subsystems, not only the diff.'
      : ''
  }

Review ONLY through the ${lens.title} lens:
${lens.checks}

REVIEW THE CODE AS WHAT IT IS — not as a deficient version of the mainstream thing it resembles. tosijs is NOT a deficient React (observant, not reactive: static-by-default DOM, pin-point updates, no re-render, no diff); tjs is NOT a deficient TypeScript. The stack's divergences from mainstream convention are DELIBERATE — they are the product — and a finding whose remedy is "make it more like React / TypeScript / the usual convention" is presumptively an imported prior, not a defect. To report such a finding you must ground it in a CONCRETE FAILURE SCENARIO in this stack or a documented principle of this stack (practices/observant-model.md, practices/model-priors.md, the project's own docs) — "this differs from what <mainstream tool> does" is not a failure scenario. (A deliberate divergence is not self-justifying either: if it causes a MEASURED problem here, report that on the measurement.)

Report concrete, ranked findings. Each finding needs a real failure scenario (or, for non-correctness lenses, the concrete cost/risk) and an actionable recommendation. Prefer a few high-signal findings over an exhaustive dump; if the diff is clean on this lens, return an empty findings array. Severity: blocker (must fix before release) / major / minor / nit. BLOCKER IS A STATUS, NOT A SEVERITY: it means only "the release waits for this" — a typo'd name in docs can be a blocker without being poor work. Report blockers without moral weight; do not frame them as failures of whoever wrote the code. For each blocker, ALSO state its RE-REVIEW SCOPE: which lens(es) must re-examine what after the fix — default "correctness + blast-radius over the remediation diff only"; for mechanical fixes (typo, missing entry) say "Tier 0 only" so the cheap case stays cheap. If you are not confident in a severity label — especially "this minor might really be a blocker" — set severityUncertain: true so it gets adversarially verified regardless of the label.`

const verifyPrompt = (f, lens) =>
  `${READONLY}

Adversarially verify ONE finding from the ${
    lens.title
  } pre-release reviewer. Default to skepticism: try to REFUTE it by inspecting the actual code (run \`${diffCmd}\`, read the file, check callers/tests).

Finding: "${f.title}"
File: ${f.file}${f.line ? ':' + f.line : ''}
Claimed failure/cost: ${f.failureScenario}
Claimed severity: ${f.severity}

Return: confirmed (real, reproducible as described), plausible (likely real but you couldn't fully confirm), or refuted (not a real issue, or already handled). Set adjustedSeverity only if the claimed severity is clearly wrong.

REFUTE any finding whose only support is conformance to mainstream prior art (React/TypeScript/convention) rather than a concrete failure in THIS stack — this stack's divergences are deliberate (practices/observant-model.md, practices/model-priors.md), and the review channel must not re-import the patterns the design rejects. A finding grounded in a measured problem stands regardless of whether the code is conventional.`

// ---- phase 1+2: review each lens, verify its findings as they land ----------
phase('Review')
const reviewed = await pipeline(
  activeLenses,
  (lens) =>
    agent(reviewPrompt(lens), {
      label: `review:${lens.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      agentType: 'general-purpose',
    }),
  (result, lens) =>
    parallel(
      (result && result.findings ? result.findings : []).map((f) => () => {
        const tagged = { ...f, lens: lens.key }
        // Only spend an adversarial verification where the verdict can change the release
        // decision (see VERIFY_SEVERITIES above). Everything else ships reported-but-unverified.
        if (!shouldVerify(f))
          return Promise.resolve({ ...tagged, verdict: null })
        return agent(verifyPrompt(f, lens), {
          label: `verify:${lens.key}`,
          phase: 'Verify',
          schema: VERDICT_SCHEMA,
          agentType: 'general-purpose',
        }).then((v) => ({ ...tagged, verdict: v }))
      })
    )
)

const all = reviewed
  .flat()
  .filter(Boolean)
  .map((f) => ({
    ...f,
    severity: (f.verdict && f.verdict.adjustedSeverity) || f.severity,
    verified: !!f.verdict,
    refuted: !!(f.verdict && f.verdict.verdict === 'refuted'),
  }))

// Findings that stand: everything not refuted. Unverified findings (minor/nit, and majors in
// fast mode) are kept and marked, so nothing silently vanishes.
const survived = all.filter((f) => !f.refuted)

// Refuted findings are NOT discarded. A finding a competent reviewer raised in good faith is
// valuable even when it's literally wrong: the usual reason a careful reader believed a false
// thing is that the truth is undiscoverable — a docs, naming, or surfacing gap. That
// second-order finding is real, and throwing it away because the first-order claim was
// "strictly speaking wrong" is the exact waste this step exists to avoid. Triage mines them.
const refuted = all.filter((f) => f.refuted)

const blockerCount = survived.filter((f) => f.severity === 'blocker').length
const verifiedCount = survived.filter((f) => f.verified).length
log(
  `${
    survived.length
  } findings (${blockerCount} blockers; ${verifiedCount} adversarially verified, ${
    survived.length - verifiedCount
  } reported-but-unverified — depth=${depth})`
)

// ---- phase 3: completeness critic (major only) + triage/report ---------------
phase('Triage')
let gaps = null
/*
Keyed to the TIER, not to `bump`. Gating this on `bump === 'major'` was the
version-letter trigger the 2026-09 audit retired: it made the strongest pass
available only to whoever had already decided to call the release major, and two
recorded gate-dodges came from choosing the letter first. `pre-minor` is the
pre-tag gate whatever letter the release ends up wearing, so the critic runs there.

It is also told which lenses ACTUALLY ran. The old prompt hardcoded all nine, so
under a narrower tier it asserted that docs, coverage, DX, ecosystem and practices
had been covered — suppressing the very gaps it exists to find.
*/
if (tier === 'pre-minor') {
  const ranNames = activeLenses.map((l) => l.key).join(', ')
  const poolNames = LENSES.map((l) => l.key).join(', ')
  gaps = await agent(
    `${READONLY}\n\nYou are the completeness critic for a pre-tag release review. EXACTLY these lenses ran over \`${diffCmd}\`: ${ranNames}. These did NOT run this time: ${
      poolNames
        .split(', ')
        .filter((k) => !ranNames.includes(k))
        .join(', ') || '(none)'
    } — their concerns are covered by the Tier-0 script or deferred to the quarterly audit, so do not simply re-report them wholesale, but DO name anything they would have caught that actually matters here.\n\nFirst check the DIFF BASIS itself: is \`${diffCmd}\` the change that is about to ship? A dirty working tree or a wrong base ref means the lenses reviewed the wrong thing, and that is the single most important gap you can report.\n\nThen inspect the diff and repo and name what was NOT adequately reviewed — an untouched-but-affected subsystem, an unverified claim, a public-API surface or migration path nobody checked. Be specific and short.`,
    {
      label: 'completeness-critic',
      phase: 'Triage',
      schema: GAPS_SCHEMA,
      agentType: 'general-purpose',
    }
  )
}

const report = await agent(
  `${READONLY}

You are the release manager triaging a pre-release review of THIS repo (base \`${base}\`, ${bump} bump, verify depth=${depth}).

Findings (JSON). Each has a \`verified\` flag: true = adversarially verified (a skeptic tried to refute it and failed); false = reported by the lens but NOT independently verified. By design we only spend verification where it changes the release decision — every blocker is verified; ${
    depth === 'fast'
      ? 'majors and below are not'
      : 'majors are too; minor/nit are not'
  }. An unverified finding is a lead, not a confirmed defect: never let one drive the verdict, and MARK IT as unverified in the report (e.g. "(unverified)") so the reader knows to sanity-check it before acting.
${JSON.stringify(survived, null, 2)}
${
  refuted.length
    ? `
Findings a skeptic REFUTED (the first-order claim is false — do NOT report these as defects):
${JSON.stringify(
  refuted.map((f) => ({
    title: f.title,
    lens: f.lens,
    why_refuted: f.verdict && f.verdict.reasoning,
  })),
  null,
  2
)}
Mine these briefly: a competent reviewer believing a false thing often means the truth is undiscoverable — surface that as a docs/naming follow-up (minor); if the refutation reveals no gap, drop it silently. Not a quota.`
    : ''
}
${
  gaps
    ? `\nCompleteness gaps (major release):\n${JSON.stringify(
        gaps.gaps,
        null,
        2
      )}`
    : ''
}

Produce a triaged report:
- Dedupe near-identical findings across lenses; keep the sharpest wording.
- Group by severity; within a group, correctness/security first.
- Recommendation: BLOCK if any confirmed blocker (or unresolved correctness/security) remains; GO_WITH_FOLLOWUPS if only non-blocking findings remain (list them as TODO items to file); GO if clean.
- Never silently drop a finding — deferred ones must appear as explicit follow-ups.
- **A failing test is never dismissed as "pre-existing" or "not caused by this change."** Any red/skipped test in the coverage findings must appear in the report — fixed if easy, otherwise flagged as a follow-up that is still scheduled, never waved away.
- **ROUTE BY LENS — findings do not all belong in the same place.** Put each follow-up under the right destination heading:
  - lenses correctness/efficiency/dryness/docs/coverage/dx/idiom -> fix now, or file to this repo's \`TODO.md\`.
  - lens **ecosystem** -> a **GitHub issue filed on the UPSTREAM repo** (name the tool and the missing seam), mirrored in this repo's \`UPSTREAM.md\` with the issue URL. NEVER a direct edit to another repo — agents stay in their own repo unless the human signs off. Also list any incoming open issues this release should have addressed or should now close.
  - lens **practices** -> a change to the shared \`tosijs-coding-practices\` repo (name the doc), and/or this repo's CLAUDE.md/AGENTS.md.
- **ecosystem and practices findings rarely BLOCK** — they compound. Do not let them drag the verdict to BLOCK unless something is actively broken; but never drop them either.
- **CYCLE FLAG (one line, no analysis).** Check \`reviews/\`: if any blocker in THIS run sits in code that was itself the remediation of a prior blocker, or the same lens has blocked twice this cycle, add ONE line to the report, at the top: "STOP: a blocker fix led to another blocker (<lens>). Before patching again, find the underlying problem and plan a proper fix; if that is not tractable now, file it as a separate task with the plan." Do not root-cause it yourself here; the stop and the plan are the remediating agent's job (practices/review.md "The fix-led-to-a-blocker stop").

reportMarkdown must be a complete, ready-to-read report: a one-line verdict, a per-lens summary, the blockers, then follow-ups as checkbox TODO lines **grouped by destination** (\`TODO.md\` / \`UPSTREAM.md\` + upstream repo / shared practices), then any completeness gaps.`,
  {
    label: 'triage',
    phase: 'Triage',
    schema: REPORT_SCHEMA,
    agentType: 'general-purpose',
  }
)

return {
  base,
  bump,
  findingCount: survived.length,
  blockerCount,
  recommendation: report.recommendation,
  summary: report.summary,
  reportMarkdown: report.reportMarkdown,
}
