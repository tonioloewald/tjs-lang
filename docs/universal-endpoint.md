# The universal endpoint: isomorphic atoms, one security model

> An emergent win. The VM was built to run *untrusted* agent code safely —
> fuel-metered, capability-sandboxed, monadic errors instead of exceptions.
> Isomorphism was never a goal. But because of how those pieces fit, the same
> agent program runs **unchanged in the data center and in the browser client**,
> with one security model spanning both — and that turned out to be the most
> valuable property in production.

## What it buys you

In production we ran a **single agent endpoint that exists in two places at
once**: in the data center, and locally inside the web client. Tools (atoms)
come in matched pairs — a client-side implementation that can satisfy a request
from data already loaded in the browser, and a server-side implementation that
hits the datastore. The agent program is identical on both sides and doesn't
know which one it's talking to.

Concretely: both endpoints expose a `getRecords` atom.

- **Client `getRecords`** — looks for the records already loaded in the client.
  If they're there, it returns them with **zero network round-trips**. If they're
  not, it transparently delegates to the server-side `getRecords`.
- **Server `getRecords`** — queries the datastore.

Same name, same input/output schema, same authorization envelope. A program
written against `getRecords` runs locally-first and falls back to the server only
on a genuine miss — and you never wrote that fallback logic into the program. It
lives in the atom.

The three wins that fell out:

1. **One security model, front to back.** The same capability/fuel/RBAC envelope
   is enforced in the browser and on the server — not duplicated, not "the client
   asks nicely and the server re-checks." The *same rules* run in both places.
2. **Minimized round-tripping / data locality.** Code travels to the data.
   Reads that hit already-loaded client state never leave the browser; only real
   misses go to the server.
3. **Parallel tools.** The full toolset is available on both sides, so an
   orchestration can run partly local and partly remote, transparently.

## Why it falls out of the architecture (rather than being bolted on)

Three properties of the AJS/AgentVM design make this work, and none of them were
added for isomorphism — they were there for *safe sandboxed execution*:

**1. Code is data.** An agent is a JSON AST (`ajs\`...\``/`transpile()`), not
compiled JavaScript. The same program serializes and runs anywhere a JS
`AgentVM` exists — a Node server, a Cloud Function, or a browser tab. "Code
travels to data" stops being a slogan and becomes a deployment option.

**2. The VM is environment-agnostic; all IO is injected.** `AgentVM` has zero IO
by default. Every side effect arrives through `ctx.capabilities` (`fetch`,
`store`, `llm`, …) passed to `run()`. So the *same* agent gets browser-flavored
capabilities in the client and data-center capabilities on the server — the
program is unaware of the difference. (See `src/vm/runtime.ts` — atoms only ever
reach the outside world via `ctx.capabilities`.)

**3. Atoms are the seam.** `new AgentVM(customAtoms)` merges environment-specific
implementations over the core set:

```ts
// src/vm/vm.ts
constructor(customAtoms = {}) {
  this.atoms = { ...coreAtoms, ...customAtoms }
}
```

The atom *contract* (op name, input/output schema) is identical across
environments; the *implementation* differs. The client VM is built with a
client `getRecords`; the server VM with a server `getRecords`. Swapping the
implementation per environment is the whole trick — and it's just object spread.

```ts
// client
const clientVM = new AgentVM({
  getRecords: defineAtom('getRecords', In, Out, async (input, ctx) => {
    const local = findLoaded(input, ctx)            // already in the client?
    if (local) return local                          // → no round-trip
    return ctx.capabilities.fetch(SERVER_ENDPOINT, …) // → fall back to server
  }),
})

// server
const serverVM = new AgentVM({
  getRecords: defineAtom('getRecords', In, Out, async (input, ctx) =>
    ctx.capabilities.store.query(input)              // hit the datastore
  ),
})
```

## Why the single security model is the real prize

Normally the client and server each reimplement data access *and* authorization,
kept in sync by hand, and the client can't safely share the server's auth logic —
so the server re-validates everything and you maintain two security surfaces.

Here there's one. Authorization is the injected-capability boundary plus the
fuel budget plus RBAC — and the RBAC **rules themselves are TJS** (`src/rbac/`,
`rules.tjs`), i.e. portable, serializable data, not compiled server code. So the
exact same rule set evaluates in the browser and in the data center. A request
that's denied locally is denied for the same reason it'd be denied server-side,
because it's *the same rule running*. Fuel metering and monadic errors (no
thrown exceptions to exploit) apply identically in both runtimes.

Front-to-back, the security model isn't *mirrored* — it's *singular*.

## When to reach for it

- A rich client that already holds a working set of data, where most reads can be
  served locally and only misses need the server.
- A system where you want one authorization story rather than a client SDK's
  rules and a server API's rules drifting apart.
- Agent/tool orchestration that should run wherever the data is cheapest to
  reach, without rewriting the program per environment.

## See also

- `CONTEXT.md` — architecture deep dive
- AJS pillar in `CLAUDE.md` — "Code travels to data"
- `src/vm/vm.ts`, `src/vm/runtime.ts` — the VM and the capability boundary
- `src/rbac/` — portable (TJS) security rules
