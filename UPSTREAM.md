# Upstream issues

Bugs and gaps in tjs-lang's dependencies (Bun, tosijs, tosijs-ui, …) that we've
**filed upstream and worked around locally**. We keep the workaround; this file is
the paper trail so the workaround can be removed once upstream lands, and so a future
reader knows the odd-looking local code is compensating for a known external issue —
not a mistake.

Convention: file the issue on the upstream repo, add a row here with the URL, and
leave a comment at the workaround site pointing back. **Never fix it by editing the
upstream repo from here** — file, don't fix.

| Upstream issue                                                   | What                                                                                                                                                                                                                              | Local workaround                                                                                                                                | Remove when                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [oven-sh/bun#34397](https://github.com/oven-sh/bun/issues/34397) | `fetch()` connection-refused error shape differs from Node: Bun uses top-level `e.code === 'ConnectionRefused'`, Node uses `e.cause.code === 'ECONNREFUSED'`. Code checking only the Node shape silently never matches under Bun. | `isConnectionRefused()` in `src/batteries/llm.ts` checks **both** shapes, so the friendly "start LM Studio" message fires under either runtime. | Bun aligns its fetch error shape with Node/undici (or documents the divergence and we standardize on checking both permanently). |
