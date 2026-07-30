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

**1. `/v1/models` returns an empty list — you must name your models.** LM Studio lists
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
