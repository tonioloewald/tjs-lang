<!--{"parent": "ajs.md", "order": 8}-->
<!-- TODO review -->

# The universal endpoint: isomorphic atoms, one security model

The AJS VM was built to run untrusted agent code safely: fuel-metered, capability-sandboxed,
with errors as values instead of exceptions. Running the same program in a browser and on a
server was never a goal. It falls out of the design anyway, and it gives an application
something that is hard to get any other way: one agent program, one set of tools, and one set
of authorization rules, running unchanged on both sides.

This chapter assumes you know how to define an atom and inject a capability. Both are covered
in [Hosting the VM](/ajs-host/) and [Capabilities and Custom Atoms](/ajs-capabilities/).

## The pattern

An **agent endpoint** is an `AgentVM` plus the atoms agents run against. A **universal**
endpoint is a pair of them, one in the web client and one in the data center, whose atoms have
the same names and the same input and output schemas: **isomorphic atoms**. Because the
contracts match, the same agent AST runs against either side.

The example below has one such pair, `getRecords`:

- **The client `getRecords`** looks in the records the page has already loaded. If they are
  all there, it returns them with no network request. If some are missing, it sends the server
  a small, fixed read agent for just those ids, and merges the reply.
- **The server `getRecords`** queries the datastore.

The agent calls `getRecords({ ids })` and does not know which implementation answered. The
local-first lookup and the fallback live in the atom, not in the program. Only the read crosses
the wire: the agent that called `getRecords` keeps running in the browser, and nothing it did
before or after the call runs again on the server. So any agent that reads records gets the
local-first behaviour, whatever else it does and whatever it returns.

What this buys:

1. **One security model.** The same capability, fuel and authorization rules run in the browser
   and on the server, because they are the same code. The server's copy is what enforces; the
   client's copy keeps the page consistent with it (see [One rule set, two
   places](#one-rule-set-two-places)).
2. **Data locality.** Reads that hit data the client already holds never leave the browser;
   only real misses reach the server.
3. **The same toolset on both sides.** An orchestration can run partly local and partly remote
   without being rewritten per environment.

## A working pair

Both sides are below in one file, so you can run it with Bun. The client's `fetch` capability
calls the server's handler in-process; in a browser it would be a wrapper around `window.fetch`
and the handler would sit behind a real route.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'
import { buildRuleContext, evaluateAccessShortcut } from 'tjs-lang/rbac'

// ---- Shared by both sides ----------------------------------------------
const In = s.object({ ids: s.array(s.string) })
const Out = s.array(s.object({ id: s.string, title: s.string }))

// One authorization rule, imported by the client and the server alike.
function canRead(user, doc) {
  const context = buildRuleContext({
    uid: user.uid,
    roles: user.roles,
    method: 'read',
    collection: 'notes',
    docId: doc.id,
    doc,
  })
  // 'owner:ownerId' allows when doc.ownerId equals the user's uid.
  return evaluateAccessShortcut('owner:ownerId', context).allowed
}

// Records as the agent sees them: no ownerId.
const view = ({ id, title }) => ({ id, title })

// ---- Server --------------------------------------------------------------
const datastore = new Map([
  ['n1', { id: 'n1', title: 'Shopping', ownerId: 'ada' }],
  ['n2', { id: 'n2', title: 'Talk notes', ownerId: 'ada' }],
  ['n3', { id: 'n3', title: 'Diary', ownerId: 'grace' }],
])

const serverVM = new AgentVM({
  getRecords: defineAtom('getRecords', In, Out, async ({ ids }, ctx) => {
    const { user } = ctx.capabilities // set by the host, invisible to the agent
    return ids
      .map((id) => datastore.get(id))
      .filter((doc) => doc && canRead(user, doc))
      .map(view)
  }),
})

// The read agent the client sends on a miss. It does one thing, so a miss
// re-runs only the read on the server, never the agent that asked for it.
const readAgent = transpile(
  `function read({ ids = ['n1'] }) {
    let records = getRecords({ ids })
    return { records }
  }`,
  { atoms: serverVM.atoms }
).ast

// POST /agent. `user` comes from the request's session, never from the body.
async function agentEndpoint(request, user) {
  const { ast, args } = await request.json()
  const run = await serverVM.run(ast, args, {
    fuel: 100,
    timeoutMs: 1000,
    capabilities: { user },
  })
  return Response.json(run.error ? { error: run.error.message } : run.result)
}

// ---- Client --------------------------------------------------------------
const user = { uid: 'ada', roles: ['user'] } // the signed-in user
const loaded = new Map([['n1', datastore.get('n1')]]) // already in the page

const clientVM = new AgentVM({
  getRecords: defineAtom('getRecords', In, Out, async ({ ids }, ctx) => {
    const found = new Map()
    for (const id of ids) {
      const doc = loaded.get(id)
      // Loaded but not readable: dropped, as the server would drop it.
      if (doc && canRead(user, doc)) found.set(id, view(doc))
    }
    const missing = ids.filter((id) => !loaded.has(id))

    if (missing.length > 0) {
      const reply = await ctx.capabilities
        .fetch('/agent', {
          method: 'POST',
          body: JSON.stringify({ ast: readAgent, args: { ids: missing } }),
        })
        .then((response) => response.json()) // plain data, not the Response
      if (reply.error) throw new Error(reply.error)
      for (const record of reply.records) found.set(record.id, record)
    }

    // In the order asked for.
    return ids.filter((id) => found.has(id)).map((id) => found.get(id))
  }),
})

// Any agent that calls getRecords. This one does more than read.
const { ast } = transpile(
  `function summary({ ids = ['n1'] }) {
    let records = getRecords({ ids })
    return { count: records.length, records }
  }`,
  { atoms: clientVM.atoms }
)

// In the browser this is a wrapper around window.fetch. Here it calls the
// server in-process.
let requests = 0
const fetch = (url, init) => {
  requests++
  const request = new Request(new URL(url, 'https://app.example'), init)
  return agentEndpoint(request, user)
}

const run = (ids) =>
  clientVM.run(ast, { ids }, { fuel: 100, capabilities: { fetch } })

console.log((await run(['n1'])).result)
// { count: 1, records: [ { id: 'n1', title: 'Shopping' } ] }
console.log(requests) // 0: n1 was already in the page

console.log((await run(['n3', 'n2', 'n1'])).result)
// { count: 2, records: [ { id: 'n2', title: 'Talk notes' }, { id: 'n1', title: 'Shopping' } ] }
console.log(requests) // 1: n2 and n3 in one request; n3 is grace's, so it never comes back
```

If the server refuses (here, if its run ran out of fuel), the client atom throws. A thrown
error in an atom is an ordinary failure, not the end of the run: the agent can catch it with
`try`/`catch` (the catch binding is the error's message), and if it does not, the run stops
with `run.error`, an `AgentError` whose `message` is the thrown one (`'Out of Fuel'` in that
case) and whose `op` is `'getRecords'`.

### What carries the safety

**The server treats the agent as untrusted.** It sets its own fuel and timeout, it decides which
atoms exist, and it takes the user from the request's session, not from anything in the body.
The client sends the read agent, but nothing stops a hostile client sending any AST it likes, so
the server cannot rely on that. A hostile AST can ask for any ids; the server atom answers only
for records the user may read, which is why `n3` never comes back. Besides `getRecords`, the
server VM has the built-in core atoms, and the ones that touch the world need a capability the
server does not pass: with no `fetch` capability and no `allowedFetchDomains`, `httpFetch`
fetches nothing, there is no `llm`, and the store atoms see only an in-memory store that belongs
to that one run. What remains is pure computation, bounded by fuel and the timeout. For a public
route, also cap atom calls with `quotas` and the size of what crosses the boundary with
`argsMaxBytes` and `membraneMaxBytes` ([Hosting the VM](/ajs-host/)).

**The AST is the wire format.** The client never sends source; the server receives an AST and
runs it on `tjs-lang/vm-ast`, which contains no parser. A server that accepts agents from clients
should never parse their source, for the reasons in [Hosting the VM](/ajs-host/). The read agent
is transpiled against `serverVM.atoms`, and the calling agent against `clientVM.atoms`; either
check is valid on the other side because the two `getRecords` atoms declare the same schemas.

**The user reaches the atom through capabilities.** `ctx.capabilities` is the host's object as
passed to `run()`; the agent cannot read it. Putting per-request identity there keeps it out of
the agent's reach while letting every server atom see it.

**Both atoms are behind the membrane.** Neither `defineAtom` call passes `effects`, and for an
atom you define the default is `'io'`. That puts every call through the capability boundary: the
input reaches the atom as a copy checked against `In`, and the atom's return is copied back as
plain data, checked against `Out`. The agent cannot hand the atom anything but `{ ids: [...] }`,
and the atom cannot hand the agent a live host object. `Out` is also why `view` is there and not
cosmetic: it admits only `id` and `title`, so an atom that returned the raw record would fail
with `Output validation failed for 'getRecords'` rather than leak `ownerId` to the agent. Do not
mark either atom `'pure'`; they read host state.

**The client atom returns data, not a `Response`.** The membrane admits JSON data plus `Date`.
An atom that returned `ctx.capabilities.fetch(...)` directly would hand back a `Response`, which
is a class instance: the boundary refuses it, and because JSON could not have produced that
value, the refusal ends the run rather than becoming a catchable error. Read the body
(`.then((response) => response.json())`) and return that.

**The client atom calls `fetch` itself, so `httpFetch`'s checks do not apply.** The allowlist,
method and header checks and the `X-Agent-Depth` header belong to the built-in `httpFetch`
atom; an atom you write that calls the `fetch` capability directly gets none of them. Give the
client atom a `fetch` capability scoped to the endpoint. This pair cannot loop, because the
server passes no `fetch` capability at all; a server whose atoms make further agent calls should
read the incoming `X-Agent-Depth` header and pass it back in as `context.requestDepth` (see [AJS
Patterns](/patterns/)).

## Why it falls out of the architecture

Three properties make this work, and none was added for it. They are there for sandboxed
execution.

**Code is data.** An agent compiles to a JSON AST (`transpile()`), not to JavaScript. The same
AST runs anywhere an `AgentVM` exists: a Node or Bun server, a cloud function, a browser tab.
AJS's motto, "code travels to data", becomes a deployment option.

**All IO is injected.** An `AgentVM` has no IO of its own. Every effect on the world arrives
through `ctx.capabilities` (`fetch`, `store`, `llm`, and whatever else the host passes to
`run()`). The client passes browser capabilities, the server passes data-center capabilities,
and the program cannot tell the difference.

**Atoms are the seam.** `new AgentVM(customAtoms)` adds your atoms to the built-in ones every VM
has. The contract an agent compiles against is the atom's name and input schema
(`transpile(source, { atoms: vm.atoms })` checks every call against it); the implementation is
whatever the VM it runs on supplies. Give each side its own implementation of the same contract,
and the same AST runs on both.

## One rule set, two places

Usually the client and the server each implement data access and authorization, kept in step by
hand. The client cannot safely share the server's rules, so the server re-checks everything and
there are two security surfaces to maintain.

Here the rules are one piece of code. The example imports `buildRuleContext` and
`evaluateAccessShortcut` from `tjs-lang/rbac`, the published rule layer: pure functions with no
IO, so the same import works in the browser bundle and in the server. `buildRuleContext` turns
the user, the operation and the document into the context a rule reads (`_uid`, `_roles`,
`_method`, `_collection`, `doc`, …). `evaluateAccessShortcut` evaluates a rule written as a
string: `'owner:ownerId'` allows when the document's `ownerId` field equals the user's uid. The
other shortcuts are `'all'`, `'none'`, `'authenticated'`, `'admin'`, `'author'` and
`'role:<name>'`; they are documented in `src/rbac/rules.tjs`. A request denied in the page is
denied for the same reason it would be denied on the server, because it is the same rule running.

A rule that a shortcut cannot express can be an agent itself. Run it in the VM and pass its
result through `interpretRuleResult`, which turns the rule's `{ allow, reason }` into
`{ allowed, reason }` (an empty reason becomes `null`). It grants only a real boolean `true` or
`{ allow: true }`. Anything else denies, including a rule that ran out of fuel or returned a
truthy string:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'
import { interpretRuleResult } from 'tjs-lang/rbac'

const { ast: rule } = transpile(`function published({ doc = { published: false } }) {
  if (doc.published) return { allow: true, reason: '' }
  return { allow: false, reason: 'not published' }
}`)

async function check(doc, fuel = 10) {
  const run = await new AgentVM().run(rule, { doc }, { fuel })
  return interpretRuleResult(run.result)
}

console.log(await check({ published: true })) // { allowed: true, reason: null }
console.log(await check({ published: false })) // { allowed: false, reason: 'not published' }
console.log(await check({ published: true }, 0.01)) // out of fuel:
// { allowed: false, reason: 'rule returned an object whose `allow` is not a boolean — denying' }
```

To use such a rule in the pair, have `canRead` call `check(doc)` and both `getRecords` atoms
await it. Ship the rule's AST to the client as data, in the bundle or from the server, rather
than its source, so both sides run the same AST. Running a rule inside an atom is a nested
`vm.run`: it has its own fuel and its own quota counter, separate from the agent's. To hold a
quota across both, pass the same `quotaUsed` object to each run ([Hosting the
VM](/ajs-host/)).

Be precise about what "one security model" means. The client's copy of a rule is not what
protects the data: a hostile client can skip it, or run without the page at all. What protects
the data is the server applying the same rule to every request it receives, as `getRecords`
does above. The client's copy means the page never shows or offers what the server would
refuse, and that the two can never disagree, because there is only one definition. Fuel
metering, the membrane and errors-as-values apply the same way in both runtimes.

## When to reach for it

- A rich client that already holds a working set of data, where most reads can be served
  locally and only misses need the server.
- A system where you want one authorization story, rather than a client SDK's rules and a
  server API's rules drifting apart.
- Agent or tool orchestration that should run wherever the data is cheapest to reach, without
  rewriting the program per environment.

It is not worth it when the client holds little of the data, so nearly every read is a miss
and the local lookup only adds work; or when the authorization a read needs is something only
the server can decide (it depends on data the client must not see), so the client's copy of the
rule cannot answer and the page cannot stay consistent with it.

## See also

- [Capabilities and Custom Atoms](/ajs-capabilities/): defining atoms, `effects`, and what may
  cross the capability boundary.
- [Hosting the VM](/ajs-host/): fuel, timeouts, the heap ceiling, quotas, and why the VM should
  receive ASTs rather than source.
- [AJS Patterns](/patterns/): why defences such as fetch allowlists and request depth belong in
  capabilities rather than agent code.
- [VM budgets](/vm-budgets/): how fuel and the heap ceiling stay true.
