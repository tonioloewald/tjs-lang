# Running the LLM test suite (LM Studio setup)

The LLM-dependent tests (`bun test` without `SKIP_LLM_TESTS`) talk to a local
**LM Studio** OpenAI-compatible server. This doc captures the setup and the
pain points hit getting it working on Linux — read the troubleshooting section
first if a model won't load or LLM tests fail fast.

## What has to be true

- LM Studio server running at **`http://localhost:1234/v1`** — this is hardcoded
  (`src/batteries/models.ts` → `DEFAULT_BASE_URL`), **no env override**. Any
  OpenAI-compatible server on 1234 works (Ollama bound to 1234 is a drop-in).
- **One chat LLM and one embedding model loaded** — the model audit
  (`src/batteries/audit.ts`) needs both; it auto-detects a structured-output LLM
  from the chat model.
- **CORS enabled** in LM Studio (see below) — required for the playground-example
  tests, which run under happy-dom and send a CORS preflight.

## Quick start (happy path)

1. Install LM Studio, **update the runtimes** (see Install).
2. Load a chat LLM + an embedding model (e.g. `nomic-embed-text-v1.5`).
3. Developer → **Start Server** (port 1234) → **Enable CORS**.
4. Warm a clean audit cache, then run the full suite:
   ```bash
   rm -f .models.cache.json
   bun run test:llm        # warms + writes one clean cache, in isolation
   bun test                # full suite reuses that cache (avoids the race below)
   ```

Sanity check the server (note **127.0.0.1**, not `localhost` — see IPv6 note):
```bash
curl -s http://127.0.0.1:1234/v1/models | grep -oE '"id":"[^"]*"'
~/.lmstudio/bin/lms ps     # what's loaded + on GPU or CPU
```

## Install (Linux)

- **AppImage only** — no `.deb`/apt/snap. On the Ubuntu 24.04 / Mint 22 base,
  install `libfuse2t64` first, then `chmod +x` and run.
- Requires **x86-64 + AVX2** (`grep -w avx2 /proc/cpuinfo`).
- **Update the inference runtimes after installing.** A fresh install ships with
  old engines; recent model architectures (Gemma 3/3n/QAT, etc.) won't load until
  you update. LM Studio → Settings → **Runtime** → update all. (A fresh install
  needed many updates.)
- The CLI lives at `~/.lmstudio/bin/lms` (`lms bootstrap` adds it to PATH).

## Enable CORS (needed for playground-example tests)

`demo/examples.test.ts` runs under happy-dom (a browser-like env) and issues a
CORS preflight `OPTIONS` to `localhost:1234`. Without CORS enabled LM Studio
answers `400` and those ~8 tests fail with **"Cross-Origin Request Blocked"**.
Toggle **Enable CORS** in the LM Studio server settings. (Production doesn't hit
this — the playground proxies LLM calls through the `/run` cloud function.)

## Troubleshooting

### "Error loading model. (Exit code: null)" — crash partway through loading

The loader process died, almost always **out of VRAM** (it crashes mid-offload —
e.g. at ~53% of a 5–6.5 GB model) or, rarely, an architecture the runtime can't
build. Diagnose:

```bash
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader
nvidia-smi --query-compute-apps=pid,used_memory,process_name --format=csv
```

Two fixes:

- **Free VRAM** (see stray-worker note) so the model fits, or
- **Force CPU load** — slower but reliable, fits in system RAM:
  ```bash
  ~/.lmstudio/bin/lms load <model-id> --gpu off
  ```

The recent **gemma-4 / gemma-3n** models are multimodal (note the `mmproj-*.gguf`
projector files) and memory-heavy. A 12 GB card runs them fine **once VRAM is
actually free**. Blackwell GPUs (RTX 50xx) need a recent driver — 595+/CUDA 13
works.

### Leaked VRAM / killing the stray `node` worker — THE big one

LM Studio's **embedding worker** (`~/.lmstudio/.internal/utils/node` running
`embeddingworker.js`) can leak VRAM — observed holding **6.5 GB** while only
~700 MB of embedding models were loaded — and it is a **detached child process
that survives app restarts.** Closing/reopening the LM Studio window does *not*
reap it, so VRAM stays pinned and every subsequent GPU load crashes. Failed
GPU loads compound the leak (partial offloads never released).

Reclaim it by killing the workers directly, then verify before relaunching:

```bash
pkill -f 'LM-Studio/lm-studio'
pkill -f '.lmstudio/.internal/utils/node'   # the stuck embedding/resource workers
sleep 2
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader  # should drop to ~1 GB used
```

Then relaunch LM Studio fresh, Start Server, reload both models. If "restarting"
didn't help, you didn't kill these — check `nvidia-smi --query-compute-apps`.

### `curl localhost:1234` fails but the server is up

`localhost` may resolve to IPv6 `::1` while LM Studio listens on IPv4
`0.0.0.0:1234` → connection refused. Use **`127.0.0.1`** for manual probes.
(`ss -ltn | grep 1234` confirms it's listening regardless.)

### LLM tests fail *fast* (single-digit ms) with "No LLM/embedding available"

The audit classified no usable model and the result is cached. Causes:
- Models weren't loaded/ready when the audit ran (it caches the bad result for 24h).
- A model is listed in `/v1/models` (downloaded) but fails to load (see above).

Fix: make sure both model types are loaded and inferring, then **clear the cache**:
```bash
rm -f .models.cache.json
```

### Audit misclassifies models on a parallel run

`.models.cache.json` (cwd, 24h TTL) is shared, and many test files call `audit()`
concurrently. Clearing the cache right before a full parallel `bun test` makes
several audits probe **at once**, and under that load classifications come back
scrambled (embedding models tagged `LLM`, etc.). **Work around it** by writing one
clean cache in isolation first (`bun run test:llm`) and *not* clearing it before
the full run. (Proper fix is tracked in TODO — serialize the audit / isolate the
cache.)

### 3 `TJS Performance > CLI cold start` failures

Known, not LLM-related: `perf.test.ts` asserts cold start `< 200ms`; a loaded or
slower box measures ~210ms. Ignore, or relax the threshold.

## Command reference

```bash
~/.lmstudio/bin/lms ps                 # loaded models, device (GPU/CPU/Local), TTL
~/.lmstudio/bin/lms server status      # is the OpenAI endpoint up + which port
~/.lmstudio/bin/lms load <id> --gpu off   # CPU-only load (off | max | 0..1)
nvidia-smi --query-compute-apps=pid,used_memory,process_name --format=csv
curl -s http://127.0.0.1:1234/v1/models | grep -oE '"id":"[^"]*"'
```
