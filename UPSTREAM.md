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

_Filed from tjs-lang; not yet an issue on the tosijs-schema repo._

## tosijs-coding-practices — one canonical safe-port-reclaim

`src/cli/port.ts` is the **third** independent implementation of "find the process
LISTENING on a port, decide whether it is ours, terminate it politely, then forcibly"
across the sibling repos:

- `tjs-lang/src/cli/port.ts` (this one)
- `haltija/src/port-pid.ts`
- `tosijs-ui/src/doc-system/site/dev-server.ts` — whose own comment reads _"We shipped
  that reasoning in this very file … and then failed to apply it here."_

**The duplication has already cost a regression, in the direction that matters.** haltija
identifies the victim by **command line** (`/haltija|tosijs-dev/i`). This repo's newer copy
shipped identifying it by **executable name** (`/^(bun|node|deno)$/`) — which is an
ecosystem, not an identity. A reviewer reproduced the consequence live: a plain `node`
server was reported `ours: true` and terminated. Since `tjs-playground` is a published bin,
`tjs-playground --port 3000 --force` would SIGTERM→SIGKILL a consumer's Vite or bun dev
server and report it as reclaiming its own. The same copy had also dropped haltija's
`pid !== process.pid` filter, so a `--force` reclaim could signal the caller — running the
port tests against that version SIGTERMed the test runner itself, mid-suite.

**Fixed locally (2026-08-16):** identity is now the full argv matched against `OUR_SERVERS`
(the entry points this package actually ships), plus an explicit refusal to signal
`process.pid`. Tests cover both directions — a positive control that runs a real process at
a matching path, and a stranger `node` server that must survive `--force` intact.

**Suggested:** one shared implementation, or at minimum a practices note stating the rule —
_a process's executable name is never an identity; match the command line_ — since all
three copies got the easy half right and only one got this half right.

_Filed from tjs-lang; not yet an issue on the tosijs-coding-practices repo._
