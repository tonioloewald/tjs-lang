# MLX as the local-AI harness

tjs-lang's batteries talk to any **OpenAI-compatible** local server over HTTP, so the
backend is a config choice, not a code change. Going forward the intended backend is
**MLX** (Apple-silicon native, open source) rather than LM Studio (closed source) or
llama.cpp.

Point the batteries at your server with one env var:

```bash
export TJS_LLM_BASE_URL=http://localhost:10240/v1   # mlx-omni-server
```

Nothing else is backend-specific: models are auto-discovered from `/v1/models`, and the
audit classifies each into LLM / embedding / vision / structured-output capable.

## Which MLX server

| Server            | Endpoints                                             | Use it for                        |
| ----------------- | ----------------------------------------------------- | --------------------------------- |
| `mlx-omni-server` | chat, embeddings, **audio/speech (TTS)**, images, STT | the full harness (recommended)    |
| `mlx_lm.server`   | chat, (limited) completions                           | text-only, minimal                |

`mlx-omni-server` is the better fit because it covers the harness's whole surface —
including the TTS endpoint the narrative/voice work (ariosto) needs — behind the same
OpenAI-compatible API the batteries already speak.

## Setup

```bash
# 1. install (Apple silicon)
pip install mlx-omni-server          # or: uv tool install mlx-omni-server

# 2. run it (default port 10240)
mlx-omni-server                      # add --port 10240 to be explicit

# 3. point tjs-lang at it
export TJS_LLM_BASE_URL=http://localhost:10240/v1

# 4. verify the batteries see models
bun run test:llm                     # live smoke: audit + predict + embed
```

Models download from Hugging Face on first use (the `mlx-community/*` repos are the
MLX-converted ones). A chat model **and** an embedding model must be resolvable for the
full smoke to pass; the audit caches its classification for 24h (`.models.cache.json`).

## How this maps onto the three test lanes

The [three-lane discipline](../CLAUDE.md) is unchanged by the backend switch — that's the
point of having it:

1. **Deterministic plumbing** (`llm-transport.test.ts`, always runs) — the HTTP client is
   tested against an in-process fixture server. **No backend required**, so a laptop with
   no MLX installed still runs the whole fast suite.
2. **Live smoke** (`models.integration.test.ts`, gated by `SKIP_LLM_TESTS`) — the
   irreducible "our client still works against a real server". Now satisfied by MLX.
3. **AJS grokkability** (`bun run test:grok`, advisory) — needs a small pinned model;
   set `GROK_MODEL` to an MLX model id.

## Status

Backend-agnostic config landed (this doc + `src/batteries/config.ts`). Still ahead for the
broader "shared LLM harness" direction: a `speak()` capability for TTS with voice + acting
directions (ariosto), and the cross-project consumption shape. See `TODO.md`.
