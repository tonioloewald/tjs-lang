/**
 * Local-AI backend configuration for the batteries.
 *
 * The batteries talk to any **OpenAI-compatible** local server over HTTP — so the
 * same client works against LM Studio, an MLX server (`mlx_lm.server` or the richer
 * `mlx-omni-server`), or anything else that speaks `/v1/chat/completions`,
 * `/v1/embeddings`, and `/v1/models`. Point at your backend with the
 * `TJS_LLM_BASE_URL` env var; models are auto-discovered from `/v1/models`, so
 * there is nothing backend-specific to hardcode.
 *
 *   # LM Studio (default)      → http://localhost:1234/v1
 *   # mlx-omni-server          → export TJS_LLM_BASE_URL=http://localhost:10240/v1
 *   # mlx_lm.server            → export TJS_LLM_BASE_URL=http://localhost:8080/v1
 *
 * See docs/mlx-setup.md for the MLX harness (the direction going forward).
 */

/** Read an env var in a browser-safe way (batteries also run in the browser). */
function env(name: string): string | undefined {
  try {
    return typeof process !== 'undefined' ? process.env?.[name] : undefined
  } catch {
    return undefined
  }
}

/** Base URL of the OpenAI-compatible local server. `TJS_LLM_BASE_URL` overrides. */
export const LLM_BASE_URL =
  env('TJS_LLM_BASE_URL') || 'http://localhost:1234/v1'

/**
 * Explicitly-named models, for servers that DON'T enumerate `/v1/models`.
 *
 * LM Studio lists its loaded models, so the audit can discover and classify them.
 * **mlx-omni-server returns an empty list** — it loads a model on demand from the
 * id in each request, so there is nothing to enumerate until after you've used one.
 * Discovery-only model selection therefore finds nothing and every call fails with
 * "No LLM available", even though the server works perfectly.
 *
 * So: name the models directly and skip discovery. These are HuggingFace repo ids
 * for MLX (pre-download with `hf download <id>`; the server serves what's cached).
 *
 *   export TJS_LLM_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
 *   export TJS_EMBEDDING_MODEL=mlx-community/bge-small-en-v1.5-bf16
 *
 * Unset → fall back to auditing `/v1/models` (the LM Studio path). Set → used as-is,
 * no probing, because a probe would load the model just to ask about it.
 */
export const LLM_MODEL = env('TJS_LLM_MODEL')
export const EMBEDDING_MODEL = env('TJS_EMBEDDING_MODEL')
