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

## Vision on mlx-omni-server: possible in principle, blocked in practice (v0.5.3, 2026-08-02)

> **Filed upstream** (gates 1 and 2 below): [mlx-omni-server#128](https://github.com/madroidmaq/mlx-omni-server/issues/128)
> (schema rejects the standard `image_url` block) and
> [#129](https://github.com/madroidmaq/mlx-omni-server/issues/129) (`MLX_VLM_ONLY_MODELS` gates
> vision to one architecture). Gate 3 is model-side, not a server bug. Tracked in `UPSTREAM.md`.

Investigated properly, because the first answer ("the server can't do vision") was wrong and
the real picture is more useful. Three separate gates, in order:

**1. The request schema.** `/v1/chat/completions` types `content` as
`string | Array<{[k: string]: string}> | null`. The array form therefore accepts
`{type:'text', text:'…'}` — all values are strings — but **rejects the standard OpenAI
image block** `{type:'image_url', image_url:{url:'…'}}`, because `image_url` is a nested
object. Pydantic refuses it before any model is consulted:

```
"Input should be a valid string" … loc: ["body","messages",0,"content","str"]
```

A **flattened** `{type:'image_url', image_url:'<data-uri>'}` does satisfy the schema and gets
through to the handler. So our batteries would need a non-standard request shape.

**2. Architecture routing.** The server sends a model to `mlx_vlm` only if it matches:

```python
MLX_VLM_ONLY_MODELS = {"gemma4"}      # chat/mlx/model_types.py
```

**One architecture.** Everything else falls through to `mlx_lm`, which has no vision
support, and fails with `Model type <arch> not supported` — verified with
`SmolVLM-Instruct-bf16` (`idefics3`), which mlx_vlm itself supports perfectly well. So the
choice of VLM is not free: it must be gemma4.

**3. Weight compatibility.** `mlx-community/gemma-4-e2b-it-4bit` routes correctly to
`mlx_vlm` and then fails loading:

```
Received 2 parameters not in model:
  language_model.model.per_layer_model_projection.biases, …scales
```

— a build/mlx_vlm-version skew, not a routing problem. Another gemma4 build may work; each
attempt is a multi-gigabyte download, so it is not worth doing speculatively.

**Practical answer:** run the vision lane against LM Studio, which speaks the standard
OpenAI multimodal format. Chat, embeddings and the full `bun test` gate all work on MLX. The
vision examples self-skip, which is expected rather than a failure.

### Tried and failed, 2026-08-03 — three servers, three different breakages

Recorded so nobody repeats it. **Every attempt failed for a DIFFERENT reason**, which is
the useful signal: MLX vision on this stack is currently a moving target of version skew,
not one fixable bug.

| attempt | failure |
| --- | --- |
| `mlx-omni-server` + SmolVLM (`idefics3`) | `Model type idefics3 not supported` — routed to `mlx_lm`, because only `gemma4` reaches `mlx_vlm` |
| `mlx-omni-server` + `gemma-4-e2b-it-4bit` | routed correctly, then `Received 2 parameters not in model: …per_layer_model_projection.biases/scales` — build/mlx_vlm skew |
| `mlx-openai-server --model-type multimodal` + SmolVLM | server starts and lists the model, then `BatchGenerator.__init__() got an unexpected keyword argument 'kv_bits'` — the server's own dependency skew |
| `mlx-openai-server` + `gemma-4-e2b-it-4bit` | **identical** weight error to omni — so that failure is model-side, not server-side |

A fourth attempt closed the matrix: **gemma-4-e2b-it-4bit on `mlx-openai-server`** failed
with the *identical* `per_layer_model_projection.biases/scales` error it produced on omni.
Reproducing byte-for-byte on two independent servers proves that one is **model-side, not
server-side** — the 4-bit build's weights do not match what mlx_vlm 0.4.4 expects.

That is a useful narrowing, because the two failing parameter names are **quantization
artifacts** (`.scales`, `.biases`). An **unquantized** gemma-4 build (bf16) has neither, so
it is the obvious next thing to try — and the only attempt worth another download.

Worth noting `mlx-openai-server` got furthest overall: it accepts the **standard** OpenAI
image block (no flattening needed) and its `/v1/models` actually lists the model, unlike
omni. Its `kv_bits` skew is the other thing to watch upstream — filed as
[mlx-openai-server#320](https://github.com/cubist38/mlx-openai-server/issues/320).

**Cost so far:** ~6.6GB of model downloads, none usable. Do not retry speculatively.

**Current answer: use LM Studio for the vision lane.** Chat, embeddings and the full
`bun test` gate all work on MLX today.

### The likely right answer: run `mlx_vlm.server` for the vision lane

`mlx-vlm` and `mlx-omni-server` are **different things**, and advice about one does not
transfer. mlx-vlm ships its own OpenAI-compatible server (`python -m mlx_vlm.server`) whose
whole purpose is VLMs — no `MLX_VLM_ONLY_MODELS` gate, so `Qwen2-VL`, `gemma-3n` and the
rest work there. mlx-omni-server is a multi-modality *aggregator* that happens to bundle
mlx_vlm and only routes `gemma4` to it.

So the cheap path is two servers: mlx-omni-server for chat/embeddings, `mlx_vlm.server` on
another port for vision, with `TJS_VISION_MODEL` pointed at the second. Untested here —
recorded because it is the first thing to try, not because it is known to work.

**Whichever route**, `src/batteries/llm.ts` may still need the flattened image shape; check
the target server's schema before assuming the standard OpenAI block is accepted.

## Setup

Verified end-to-end on macOS 26.5 / Apple silicon, 2026-07-30.

```bash
# 1. install. Use uv — it manages its own Python; the system python3 here is
#    Xcode's 3.9, too old for MLX, and shouldn't be polluted anyway.
brew install uv
uv tool install mlx-omni-server      # binary lands in ~/.local/bin

# 2. PRE-DOWNLOAD the models you want (see "on-demand loading" below — the server
#    will NOT fetch them for you). Small, capable, non-Meta defaults:
hf download mlx-community/Qwen2.5-1.5B-Instruct-4bit   # chat  (~840MB)
hf download mlx-community/bge-small-en-v1.5-bf16       # embed (~65MB)

# 3. run the server (default port 10240)
mlx-omni-server --port 10240

# 4. point tjs-lang at it, naming the models
export TJS_LLM_BASE_URL=http://localhost:10240/v1
export TJS_LLM_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
export TJS_EMBEDDING_MODEL=mlx-community/bge-small-en-v1.5-bf16

# 5. verify
bun run test:llm                     # live smoke: audit + predict + embed
```

### Two gotchas that will bite you (both cost real time here)

**1. `/v1/models` returns an empty list — you must name your models.** (Filed upstream:
[mlx-omni-server#130](https://github.com/madroidmaq/mlx-omni-server/issues/130).) LM Studio lists
the models it has loaded, so the batteries could *discover* and classify them. mlx-omni-server
loads a model on demand from the id in each request, so it has nothing to enumerate and
returns `{"data": []}` — discovery finds nothing and every call fails with "No LLM available"
even though the server works perfectly. Hence `TJS_LLM_MODEL` / `TJS_EMBEDDING_MODEL`: name
them and the audit is skipped (a capability probe would load a whole model just to ask about
it). A declared model is trusted, not probed — so its embedding `dimension` is unknown until
first use, which is expected, not a failure.

**2. The server does not download models; it serves what's cached.** It passes
`local_files_only=True` to HuggingFace, so an unknown model id fails with a confusing
"outgoing traffic has been disabled" (even with a working connection). Pre-download with
`hf download <id>` — the `hf` CLI ships inside the uv tool env
(`~/.local/share/uv/tools/mlx-omni-server/bin`).

**A third, environment-specific one:** if `pyenv` is on the PATH with no usable `python`
shim, the server dies at startup with `Failed to inspect Python interpreter … pyenv: python:
command not found`. Put a real Python first on the PATH (the tool's own env works:
`export PATH="$HOME/.local/share/uv/tools/mlx-omni-server/bin:$PATH"`).

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

## TTS / voice: spike findings (2026-07-30)

For the narrative/voice use-case (ariosto: "specific voices with acting directions"), the
server's `/v1/audio/speech` is backed by `mlx_audio`, which ships ~40 TTS families. Two things
make it workable as a harness target:

- **The request schema is `extra = "allow"`** and forwards unknown fields straight to
  `mlx_audio`'s `generate_audio(**extra)`. So model-specific params (`exaggeration`,
  `instruct`, …) pass through the standard OpenAI-shaped endpoint. That's the escape hatch a
  `speak()` capability needs — no forked endpoint required.
- Models are **pre-downloaded, not fetched on demand** (same as chat — see gotcha 2 above).

### Chatterbox: good voice cloning, but the emotion control is intensity, not emotion

**Verified working** (`mlx-community/chatterbox-fp16`, MIT) — 24kHz WAV, ~1.5–2.6s per short
line. Caveat: Chatterbox is a **pure voice-cloning model with no built-in voices**; the
`Chatterbox-TTS-*` repos omit `conds.safetensors` and fail outright with "No conditionals
available". Use `chatterbox-fp16` (ships default conditionals) or supply `audio_prompt`.

Its only emotion control is an `exaggeration` scalar (0–~1.5, saturates above that).
**Measured across six presets** (sad/happy/nervous/hesitant/sly/angry, same line, mapped to
exaggeration+cfg_weight), acoustic analysis says the scalar does **not** encode emotion:

| preset   | dur   | loudness | pitch  |
| -------- | ----- | -------- | ------ |
| sly      | 2.00s | 0.095    | 131 Hz |
| sad      | 2.12s | 0.088    | 121 Hz |
| hesitant | 2.12s | 0.091    | 133 Hz |
| nervous  | 2.16s | 0.089    | 163 Hz |
| happy    | 2.88s | 0.083    | 138 Hz |
| angry    | 3.96s | 0.098    | 144 Hz |

Loudness is flat (±15%) and pitch nearly so; **duration is the only thing that really moves**.
In normalized feature distance the closest pairs are sad↔hesitant (1.59) and sly↔hesitant
(1.75) — and damningly, **sad↔happy (2.25) is barely more distinct than sad↔hesitant**. A single
intensity scalar cannot encode *valence*, so "sad" and "happy" are not separable this way.

**Conclusion:** parameter-mapping a direction onto `exaggeration` is a dead end. With
Chatterbox, distinct emotions must come from **reference audio** — a voice bank per character
per emotion (`narrator-sad.wav`, `narrator-sly.wav`), with `exaggeration` as an intensity trim.

### The better fit: models that take a text instruction

`mlx_audio` includes families with a natural-language style/instruction interface —
`qwen3_tts`, `moss_tts`, `higgs_audio_v3`, `omnivoice`, `voxcpm2`, `zonos2`, `bailingmm`,
`irodori_tts`, `tada`. Most promising: **`qwen3_tts`** (Alibaba), whose API is exactly the
shape the use-case wants:

```python
generate(text, voice=..., instruct="Instruction text for voice style",
         ref_audio=..., speed=..., ...)
```

That is a real acting-direction interface (direction as *text*), plus `voice` and `ref_audio`
cloning. **Not yet auditioned** — quality/direction-following is unverified and needs ears.

**Open question for the `speak()` API:** if an instruct-model follows directions well, the
capability is `speak(text, {voice, direction})` passed straight through. If not, it falls back
to the voice-bank design, and the LLM's job becomes *selecting a clip + intensity* rather than
writing a direction string. Audition before designing.

## Status

**Use-case 1 (agent-flow testing) works on MLX today** — the live smoke (audit + predict +
embed) is green against `mlx-omni-server` with no LM Studio involved. Backend-agnostic config
+ explicit model naming landed (`src/batteries/config.ts`).

Still ahead for the broader "shared LLM harness" direction: a `speak()` capability for TTS
with voice + acting directions (ariosto — `mlx-omni-server` exposes `/v1/audio/speech`, and
its install pulled `vocos-mlx`, so the plumbing is there; the open question is which model
actually follows *acting directions*), offline/self-hosted coding, and the cross-project
consumption shape. See `TODO.md`.
