# Upstream issues

Bugs and gaps in tjs-lang's dependencies (Bun, tosijs, tosijs-ui, …) that we've
**filed upstream and worked around locally**. We keep the workaround; this file is
the paper trail so the workaround can be removed once upstream lands, and so a future
reader knows the odd-looking local code is compensating for a known external issue —
not a mistake.

Convention: file the issue on the upstream repo, add a row here with the URL, and
leave a comment at the workaround site pointing back. **Never fix it by editing the
upstream repo from here** — file, don't fix.

| Upstream issue                                                                             | What                                                                                                                                                                                                                                                           | Local workaround                                                                                                                                                                                                                                                            | Remove when                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [oven-sh/bun#34397](https://github.com/oven-sh/bun/issues/34397)                           | `fetch()` connection-refused error shape differs from Node: Bun uses top-level `e.code === 'ConnectionRefused'`, Node uses `e.cause.code === 'ECONNREFUSED'`. Code checking only the Node shape silently never matches under Bun.                              | `isConnectionRefused()` in `src/batteries/llm.ts` checks **both** shapes, so the friendly "start LM Studio" message fires under either runtime.                                                                                                                             | Bun aligns its fetch error shape with Node/undici (or documents the divergence and we standardize on checking both permanently).                                                                           |
| [madroidmaq/mlx-omni-server#130](https://github.com/madroidmaq/mlx-omni-server/issues/130) | `/v1/models` returns `{"data": []}` — the server loads on demand, so it has nothing resident to enumerate. Model discovery finds nothing and every call fails with "No LLM available" **while the server works perfectly**.                                    | `TJS_LLM_MODEL` / `TJS_EMBEDDING_MODEL` name the models explicitly and skip the audit (`src/batteries/config.ts`). A declared model is trusted, not probed — so its embedding `dimension` is unknown until first use, which is expected. Documented in `docs/mlx-setup.md`. | `/v1/models` enumerates servable (cached) models, or returns something a client can distinguish from "no models". The env-var override stays useful regardless; what goes away is its being **mandatory**. |
| [madroidmaq/mlx-omni-server#128](https://github.com/madroidmaq/mlx-omni-server/issues/128) | `/v1/chat/completions` types `content` as `list[dict[str, str]]`, so it **rejects the standard OpenAI image block** (`image_url` is a nested object) before any model is consulted. A flattened `{type:'image_url', image_url:'<data-uri>'}` does get through. | **None — deliberately not worked around.** Emitting a server-specific request shape from portable battery code is the wrong trade; vision on this backend is documented as blocked instead (`docs/mlx-setup.md`). Vision tests self-skip.                                   | The content-part union is typed structurally (or the flattened form is documented as a supported alias). Then `llmVision` can target this backend.                                                         |
| [madroidmaq/mlx-omni-server#129](https://github.com/madroidmaq/mlx-omni-server/issues/129) | `MLX_VLM_ONLY_MODELS = {"gemma4"}` gates vision to **one architecture**; every other VLM falls through to `mlx_lm` and fails with `Model type <arch> not supported` — naming the model, not the routing decision that caused it.                               | None. Recorded in `docs/mlx-setup.md` as gate 2 of 3, with the full 4-combination matrix so nobody re-runs the investigation.                                                                                                                                               | Routing derives from `mlx_vlm`'s own registry, or the error names the gate. Until then, VLM choice on this backend is not free.                                                                            |
| [cubist38/mlx-openai-server#320](https://github.com/cubist38/mlx-openai-server/issues/320) | `--model-type multimodal` starts, lists the model, then fails at generation with `BatchGenerator.__init__() got an unexpected keyword argument 'kv_bits'` — dependency skew, surfacing only after everything says the setup is correct.                        | None. This server otherwise got **furthest**: it accepts the standard OpenAI image block and its `/v1/models` actually lists the model, so it is the one to re-test first when this lands.                                                                                  | `kv_bits` skew resolved upstream. Then re-evaluate it as the vision backend ahead of mlx-omni-server.                                                                                                      |

## tosijs-schema — no way to declare an OPEN object

**Filed:** [tosijs-schema#5](https://github.com/tonioloewald/tosijs-schema/issues/5).

`s.object()` always emits `additionalProperties: false`, and there is no `.open` /
`.passthrough` / options argument. That is the right default, but it leaves no spelling
for "these fields, plus whatever the other side adds" — which is what you need whenever
the shape belongs to a protocol you do not control.

**How it bit us (2026-08-11):** the `llmPredictBattery` and `llmVision` atoms declared an
OpenAI-compatible chat message with `s.object({ role, content, tool_calls })`. That was
silently open until tosijs-schema 1.5.0 started enforcing `additionalProperties`
correctly; from then on gemma-4's `reasoning_content` field failed output validation and
every vision call errored.

**Worked around locally** with `s.record(s.any)`, which is open but drops the field
documentation. The named-fields-plus-open combination is not expressible today.

**Suggested:** `s.object(props, { additionalProperties: true })`, or an `.open` modifier
on the returned builder, so the JSON Schema keeps `properties`/`required` and relaxes only
the closure.

**Companion issue** — [tosijs-schema#4](https://github.com/tonioloewald/tosijs-schema/issues/4):
1.5.0 shipped that validation-tightening as a MINOR, so `^1.4.0` ranges pick it up on the
next install and already-published consumers break with no change on their side. Verified in
clean installs of each version: the exact schema `tjs-lang@0.12.0` ships validates an
OpenAI message carrying `reasoning_content` as **true on 1.4.0 and false on 1.5.1**. Under
0.x semver `^0.12.0` does not float to `0.13.0`, so an affected consumer cannot get the fix
by updating either. The two compound: the correct spelling did not exist, so the accidental
one was load-bearing.

**Still to do at publish time (user action — npm auth):** `npm deprecate 'tjs-lang@<0.13.0'`
with a message naming that exact symptom and 0.13.0 as the fix. Neither published version
carries a `deprecated` field today, and a changelog paragraph is not a delivery mechanism
for a break that fires on install.

## tosijs-coding-practices — one canonical safe-port-reclaim

**Filed:** [tosijs-coding-practices#5](https://github.com/tonioloewald/tosijs-coding-practices/issues/5)
(the rule) · [tosijs-ui#77](https://github.com/tonioloewald/tosijs-ui/issues/77) (a real bug
there) · [haltija#34](https://github.com/tonioloewald/haltija/issues/34) (no change asked —
it is the reference implementation).

`src/cli/port.ts` is the **third** independent implementation of "find the process LISTENING
on a port, decide whether it is ours, terminate it politely, then forcibly". All three got
the hard-won `-sTCP:LISTEN` half right; the identity half is the one that keeps getting
written loose, and it is the half that can reach a stranger's machine.

| repo                                          | identity check                                                           | filters own pid          |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------ |
| `haltija/src/port-pid.ts`                     | `ps -o command=` matched `/haltija\|tosijs-dev/i` — **the command line** | yes                      |
| `tosijs-ui/src/doc-system/site/dev-server.ts` | `ps -o comm=` matched `/\b(bun\|node\|deno)\b/`                          | yes                      |
| `tjs-lang/src/cli/port.ts`                    | was `ps -o comm=` matched `/^(bun\|node\|deno)$/`                        | **no**, until 2026-08-16 |

**Read directly, not taken on report.** The review characterised this as three copies of one
idea; the checkouts say something sharper. haltija is _correct_ — it matches the command line
AND filters its own pid. tosijs-ui carries the same over-loose identity check this repo had,
and calls `killStrayServer` unconditionally at startup with no `--force` gate, while its own
warning text says "which is not a **dev server**" for a condition that tests "is not a JS
**runtime**". tjs-lang's was the worst of the three: loose identity _and_ no self-pid filter.

`/^(bun|node|deno)$/` is not an identity, it is an ecosystem. Since `tjs-playground` is a
published bin, `tjs-playground --port 3000 --force` would SIGTERM→SIGKILL a consumer's Vite
or bun dev server and report it as reclaiming its own — reproduced live in review against a
plain `node` server. The missing self-pid filter was worse than it sounds: running the new
tests against the unfixed code SIGTERMed **the test runner**, mid-suite.

**Fixed locally (2026-08-16, `6596ae3`):** identity is the full argv matched against
`OUR_SERVERS` — the entry points this package actually ships — plus an explicit refusal to
signal `process.pid`. `portListeners` still reports the caller honestly; `reclaimPort`
refuses to act on it. Tests cover both directions: a positive control that runs a real
process at a matching path (without it, defining `ours` as "never" passes everything else
and silently disables reclaiming), and a stranger `node` server that must survive `--force`.

**The rule, filed upstream:** _a process's executable name is never an identity; match the
command line._ What makes it a rule rather than a preference is the asymmetry —
**over-matching kills somebody else's work, under-matching prints "choose another port"** —
so there is no trade-off to weigh and strictness is simply correct.

### Two more rules learned after filing (2026-08-19) — NOT yet written back

`tosijs-coding-practices#5` is still open and currently carries only the first rule. Two
more came out of hardening `port.ts` here, and both have the same asymmetry that makes the
first one a rule rather than a preference:

1. **A generic entry path is not an identity either — anchor it to YOUR installation.**
   `bin/dev.ts` is about the least distinctive path in web tooling. Reproduced: a listener
   at a stranger's `bin/dev.ts` under `/tmp` was identified as ours, SIGTERMed, and
   announced as our own server. Matching the command line is necessary and not sufficient;
   the argv must also reference the package root. (A published BIN NAME can stand alone —
   `tjs-playground` — and must, since a global or `npx` install shows no repo path at all.
   The two branches rest on different guarantees and the docstring should say which.)

2. **Re-verify identity before escalating to SIGKILL.** Between SIGTERM and SIGKILL the
   process can exit and the PID be reused. The polite signal is the one you can afford to
   get wrong; the forcible one is not, so it must re-read the command line rather than
   trust the PortHolder it was handed.

Both are implemented in `src/cli/port.ts`. Neither is upstream. **Owed to
`tosijs-coding-practices#5`.**
