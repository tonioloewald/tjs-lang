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
