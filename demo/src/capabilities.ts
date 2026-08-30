/*
 * capabilities.ts - Shared LLM capability builders for demo
 *
 * Used by both playground.ts and LiveExample contexts
 */

import {
  checkVision,
  isEmbeddingModel,
  looksLikeVisionModel,
} from '../../src/batteries/audit'
import { VISION_MODEL } from '../../src/batteries/config'

// Module-level cache for LM Studio models, keyed by endpoint URL
let cachedLocalModels: Map<string, string[]> = new Map()

// LM Studio load detection
interface LoadStatus {
  isLoaded: boolean
  lastCheck: number
  pendingRequests: number
}
const loadStatus: Map<string, LoadStatus> = new Map()
const LOAD_CHECK_INTERVAL = 5000 // Recheck load every 5 seconds
const LOAD_CHECK_TIMEOUT = 2000 // If ping takes > 2s, server is loaded

// Check if LM Studio is responsive (fast ping)
export async function checkServerLoad(url: string): Promise<boolean> {
  const now = Date.now()
  const status = loadStatus.get(url)

  // Use cached status if recent
  if (status && now - status.lastCheck < LOAD_CHECK_INTERVAL) {
    return !status.isLoaded
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LOAD_CHECK_TIMEOUT)

    const start = Date.now()
    await fetch(`${url}/models`, { signal: controller.signal })
    clearTimeout(timeout)

    const elapsed = Date.now() - start
    const isLoaded = elapsed > LOAD_CHECK_TIMEOUT * 0.8 // 80% of timeout = loaded

    loadStatus.set(url, {
      isLoaded,
      lastCheck: now,
      pendingRequests: status?.pendingRequests || 0,
    })

    if (isLoaded) {
      console.log(
        `⏳ LM Studio at ${url} is under load (${elapsed}ms response)`
      )
    }

    return !isLoaded
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.log(`⏳ LM Studio at ${url} is under heavy load (timeout)`)
      loadStatus.set(url, {
        isLoaded: true,
        lastCheck: now,
        pendingRequests: status?.pendingRequests || 0,
      })
      return false
    }
    // Connection error - server might be down
    return false
  }
}

// Track pending requests
function trackRequest(url: string, delta: number): number {
  const status = loadStatus.get(url) || {
    isLoaded: false,
    lastCheck: 0,
    pendingRequests: 0,
  }
  status.pendingRequests = Math.max(0, status.pendingRequests + delta)
  loadStatus.set(url, status)
  return status.pendingRequests
}

// Get current pending request count
export function getPendingRequests(url: string): number {
  return loadStatus.get(url)?.pendingRequests || 0
}

// Cache for verified vision models (keyed by URL)
let verifiedVisionModels: Map<string, string | null> = new Map()

// Clear the model cache (call this to force rescan)
export function clearModelCache(): void {
  cachedLocalModels.clear()
  verifiedVisionModels.clear()
  console.log('🔄 Model cache cleared (including vision verification)')
}

// Rescan models from LM Studio and return the list
export async function rescanLocalModels(
  customLlmUrl?: string
): Promise<string[]> {
  const url = customLlmUrl || localStorage.getItem('customLlmUrl') || ''
  if (!url) {
    console.log('⚠️ No custom LLM URL configured')
    return []
  }

  try {
    const response = await fetch(`${url}/models`)
    if (response.ok) {
      const data = await response.json()
      const models = data.data?.map((m: any) => m.id) || []
      cachedLocalModels.set(url, models)
      console.log(`✅ Found ${models.length} models at ${url}:`, models)
      return models
    }
  } catch (e) {
    console.error('❌ Failed to fetch models:', e)
  }
  cachedLocalModels.set(url, [])
  return []
}

// Get cached models (or fetch if not cached)
export async function getLocalModels(customLlmUrl?: string): Promise<string[]> {
  const url = customLlmUrl || localStorage.getItem('customLlmUrl') || ''
  if (!url) return []

  const cached = cachedLocalModels.get(url)
  if (cached !== undefined) return cached
  return rescanLocalModels(url)
}

// LLM provider type
export type LLMProvider =
  | 'auto'
  /**
   * The hosted demo model — our key, their sign-in, a server-enforced daily cap.
   *
   * Deliberately LAST in auto-mode priority: a visitor who configured their own provider
   * means it, and should not silently spend our quota instead. It is what makes the
   * playground work with no configuration at all, which is the whole point of a demo.
   */
  | 'demo'
  | 'custom'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'

export interface LLMSettings {
  preferredProvider: LLMProvider
  openaiKey: string
  anthropicKey: string
  geminiKey: string
  deepseekKey: string
  customLlmUrl: string
}

import { canUseDemoModel } from './demo-model'

// Get settings from localStorage
export function getSettings(): LLMSettings {
  return {
    preferredProvider: (localStorage.getItem('preferredProvider') ||
      'auto') as LLMProvider,
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
    geminiKey: localStorage.getItem('geminiKey') || '',
    deepseekKey: localStorage.getItem('deepseekKey') || '',
    customLlmUrl: localStorage.getItem('customLlmUrl') || '',
  }
}

// Build LLM capability from settings (simple predict interface)
export function buildLLMCapability(settings: LLMSettings) {
  const {
    preferredProvider,
    openaiKey,
    anthropicKey,
    geminiKey,
    deepseekKey,
    customLlmUrl,
  } = settings

  // Determine which providers are available
  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''
  const hasGemini = geminiKey && geminiKey.trim() !== ''
  const hasDeepseek = deepseekKey && deepseekKey.trim() !== ''

  if (
    !hasCustomUrl &&
    !hasOpenAI &&
    !hasAnthropic &&
    !hasGemini &&
    !hasDeepseek
  ) {
    return null
  }

  /**
   * The first usable chat model on the server, resolved once.
   *
   * `'local-model'` is not a model; it is a placeholder, and an OpenAI-compatible server
   * rejects it: `Invalid model identifier "local-model"`. The vision path already learned
   * this (see `findVisionModel` — discovery failing there fell through to the same
   * placeholder and 400'd); the plain chat path kept it. Every `llm` example in the release
   * gate failed on it, and the failure was reported as LM Studio being down.
   */
  let chatModelPromise: Promise<string> | null = null
  const resolveChatModel = (): Promise<string> => {
    chatModelPromise ??= (async () => {
      try {
        const res = await fetch(`${customLlmUrl}/models`)
        if (!res.ok) return 'local-model'
        const ids: string[] = ((await res.json())?.data ?? []).map(
          (m: any) => m?.id
        )
        // Embedding models answer /v1/models too and cannot serve a chat completion.
        return (
          ids.find((id) => id && !/embed/i.test(id)) ?? ids[0] ?? 'local-model'
        )
      } catch {
        // Unreachable server is a different failure, reported by the caller.
        return 'local-model'
      }
    })()
    return chatModelPromise
  }

  /*
   * The hosted demo model.
   *
   * No API key here, by design — the key lives in the Cloud Function and never reaches the
   * browser. A key in a public bundle is a key you have given away; "minified" is not a
   * control. Sign-in is what makes the per-user cap enforceable, and the cap itself is
   * enforced server-side because a client-side limit is a suggestion.
   */
  const callDemo = async (prompt: string, _options?: any): Promise<string> => {
    const { callDemoModel } = await import('./demo-model')
    return callDemoModel(prompt)
  }

  // Provider implementations
  const callCustom = async (prompt: string, options?: any): Promise<string> => {
    const body: any = {
      model: options?.model || (await resolveChatModel()),
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.7,
    }
    if (options?.responseFormat) body.response_format = options.responseFormat

    const pending = trackRequest(customLlmUrl, 1)
    if (pending > 1) {
      console.log(`⏳ LM Studio: ${pending} requests pending`)
    }

    try {
      const startTime = Date.now()
      const response = await fetch(`${customLlmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const elapsed = Date.now() - startTime

      if (!response.ok) {
        // The SERVER'S explanation, not ours. This said "Check that LM Studio is running",
        // which is wrong exactly when it matters: a 400 means the server is running and is
        // telling you why it refused. Here it was saying `Invalid model identifier
        // "local-model"` — the whole diagnosis, discarded and replaced with a guess that
        // sent debugging at LM Studio's health for a bug in our request.
        const detail = await response.text().catch(() => '')
        let message = detail
        try {
          const j = JSON.parse(detail)
          message = j?.error?.message ?? j?.error ?? detail
        } catch {
          // Not JSON — the raw body is still better than nothing.
        }
        throw new Error(
          `LLM Error: ${response.status} ${response.statusText} — ` +
            `${String(message).trim().slice(0, 500)} (at ${customLlmUrl})`
        )
      }
      console.log(`✅ LM Studio response in ${elapsed}ms`)
      const data = await response.json()
      return data.choices?.[0]?.message?.content ?? ''
    } catch (e: any) {
      if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
        throw new Error(
          `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled (Server settings → Enable CORS).`
        )
      }
      throw e
    } finally {
      trackRequest(customLlmUrl, -1)
    }
  }

  const callOpenAI = async (prompt: string, options?: any): Promise<string> => {
    const body: any = {
      model: options?.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.7,
    }
    if (options?.responseFormat) body.response_format = options.responseFormat

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `OpenAI Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  const callAnthropic = async (
    prompt: string,
    options?: any
  ): Promise<string> => {
    // Note: Anthropic doesn't support response_format the same way
    // It uses tool_use for structured output instead
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: options?.model || 'claude-3-haiku-20240307',
        max_tokens: options?.maxTokens || 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Anthropic Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.content?.[0]?.text ?? ''
  }

  const callGemini = async (prompt: string, options?: any): Promise<string> => {
    const model = options?.model || 'gemini-3.5-flash-lite'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
          },
        }),
      }
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Gemini Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  const callDeepseek = async (
    prompt: string,
    options?: any
  ): Promise<string> => {
    const body: any = {
      model: options?.model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: options?.temperature ?? 0.7,
    }
    if (options?.responseFormat) body.response_format = options.responseFormat

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Deepseek Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  return {
    async predict(prompt: string, options?: any): Promise<string> {
      // If a specific provider is selected, use it
      if (preferredProvider === 'demo') return callDemo(prompt, options)
      if (preferredProvider === 'custom' && hasCustomUrl)
        return callCustom(prompt, options)
      if (preferredProvider === 'openai' && hasOpenAI)
        return callOpenAI(prompt, options)
      if (preferredProvider === 'anthropic' && hasAnthropic)
        return callAnthropic(prompt, options)
      if (preferredProvider === 'gemini' && hasGemini)
        return callGemini(prompt, options)
      if (preferredProvider === 'deepseek' && hasDeepseek)
        return callDeepseek(prompt, options)

      // If preferred provider not available, show helpful error
      if (preferredProvider !== 'auto') {
        const providerNames: Record<string, string> = {
          demo: 'Demo Model',
          custom: 'Custom Endpoint',
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          gemini: 'Google Gemini',
          deepseek: 'Deepseek',
        }
        throw new Error(
          `${providerNames[preferredProvider]} is selected but not configured. Add your API key in Settings.`
        )
      }

      // Auto mode: use first available in priority order. The hosted demo model is LAST —
      // a visitor who configured their own provider meant it, and must not silently spend
      // our quota instead.
      if (hasCustomUrl) return callCustom(prompt, options)
      if (hasOpenAI) return callOpenAI(prompt, options)
      if (hasAnthropic) return callAnthropic(prompt, options)
      if (hasGemini) return callGemini(prompt, options)
      if (hasDeepseek) return callDeepseek(prompt, options)
      if (await canUseDemoModel()) return callDemo(prompt, options)

      throw new Error(
        'No LLM provider configured. Sign in to use the demo model, or add your own API ' +
          'key in Settings.'
      )
    },
  }
}

// Build LLM Battery capability (supports system/user, tools, responseFormat)
// UserContent can be a simple string or multimodal with images
type UserContent = string | { text: string; images?: string[] }

// Build user message content - supports text-only or multimodal (text + images)
function buildUserContent(user: UserContent): any {
  if (typeof user === 'string') {
    return user
  }

  // Multimodal: array of content blocks (OpenAI vision format)
  const content: any[] = [{ type: 'text', text: user.text }]

  for (const img of user.images || []) {
    content.push({
      type: 'image_url',
      image_url: {
        url: img, // Can be URL or data:image/...;base64,...
      },
    })
  }

  return content
}

export function buildLLMBattery(settings: LLMSettings) {
  const {
    preferredProvider,
    openaiKey,
    anthropicKey,
    geminiKey,
    deepseekKey,
    customLlmUrl,
  } = settings

  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''
  const hasGemini = geminiKey && geminiKey.trim() !== ''
  const hasDeepseek = deepseekKey && deepseekKey.trim() !== ''

  if (
    !hasCustomUrl &&
    !hasOpenAI &&
    !hasAnthropic &&
    !hasGemini &&
    !hasDeepseek
  ) {
    return null
  }

  type BatteryResult = { content?: string; tool_calls?: any[] }

  // Find a working vision model by testing candidates.
  //
  // The probe is `checkVision` from the batteries — the SHARED one, deliberately. This used
  // to be a local `testVisionCapability` that asserted on the model's ANSWER ("does the reply
  // mention a circle?"), and that is the wrong question: gemma-4 is a thinking model that
  // returns an empty `content`, so a genuinely multimodal model was judged blind, discovery
  // fell through to `model: 'local-model'`, the server 400'd, and the demo's own vision tests
  // failed. Ask about SHAPE, never content — a model that accepts the multimodal request
  // supports vision, however poorly it then answers.
  const findVisionModel = async (): Promise<string | null> => {
    // A DECLARED model short-circuits discovery entirely. Discovery has to guess from a
    // model list, and guessing has failed here in three different ways — a name allowlist
    // that predated `gemma-4`, a canvas-synthesised probe image that happy-dom cannot
    // produce, and an empty model list. Naming the model is the one thing that cannot
    // misfire, which is why TJS_VISION_MODEL exists.
    if (VISION_MODEL) return VISION_MODEL

    // Check cache first
    const cacheKey = customLlmUrl
    if (verifiedVisionModels.has(cacheKey)) {
      return verifiedVisionModels.get(cacheKey) || null
    }

    const models = await getLocalModels(customLlmUrl)

    // Name is a HINT for ordering, never a filter — see `looksLikeVisionModel`.
    const uniqueCandidates = [
      ...new Set(
        models
          .filter((id) => !isEmbeddingModel(id))
          .sort(
            (a, b) =>
              Number(looksLikeVisionModel(b)) - Number(looksLikeVisionModel(a))
          )
      ),
    ]

    // Test each candidate
    for (const model of uniqueCandidates) {
      console.log(`🔍 Testing vision capability: ${model}`)
      if (await checkVision(customLlmUrl, model)) {
        verifiedVisionModels.set(cacheKey, model)
        return model
      }
    }

    verifiedVisionModels.set(cacheKey, null)
    return null
  }

  /*
   * The hosted demo model.
   *
   * No API key here, by design — the key lives in the Cloud Function and never reaches the
   * browser. A key in a public bundle is a key you have given away; "minified" is not a
   * control. Sign-in is what makes the per-user cap enforceable, and the cap itself is
   * enforced server-side because a client-side limit is a suggestion.
   */
  const callDemo = async (
    system: string,
    user: UserContent,
    _tools?: any[],
    _responseFormat?: any
  ): Promise<BatteryResult> => {
    // The demo model takes a single prompt: it is a tyre-kicking path, not the full battery.
    // Tools and structured output are NOT silently dropped — they are refused, because
    // returning prose where the caller asked for a schema is the kind of quiet wrong answer
    // that costs an afternoon.
    if (_tools?.length || _responseFormat) {
      throw new Error(
        'The demo model does not support tools or structured output. Add your own API key ' +
          'in Settings for those.'
      )
    }
    const text = typeof user === 'string' ? user : user.text
    const { callDemoModel } = await import('./demo-model')
    return {
      content: await callDemoModel(system ? `${system}\n\n${text}` : text),
    }
  }

  // Provider implementations
  const callCustom = async (
    system: string,
    user: UserContent,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: buildUserContent(user) },
    ]
    const isMultimodal = typeof user !== 'string' && user.images?.length

    // Select appropriate model
    let model = 'local-model'
    if (isMultimodal) {
      const visionModel = await findVisionModel()
      if (visionModel) {
        model = visionModel
        console.log(`🔍 Using vision model: ${visionModel}`)
      } else {
        console.warn('⚠️ No vision model found, using default')
      }
      // Debug: log image info
      const images = (user as { text: string; images?: string[] }).images || []
      console.log(
        `📷 Sending ${images.length} image(s), first image length: ${
          images[0]?.length || 0
        }`
      )
    }

    // Check server load before making request
    const pending = trackRequest(customLlmUrl, 1)
    if (pending > 1) {
      console.log(
        `⏳ LM Studio: ${pending} requests pending (including this one)`
      )
    }

    try {
      const requestBody = {
        model,
        messages,
        temperature: 0.7,
        tools,
        response_format: responseFormat,
      }

      // Debug: log the request structure (not the full base64)
      if (isMultimodal) {
        const debugMessages = messages.map((m: any) => {
          if (Array.isArray(m.content)) {
            return {
              role: m.role,
              content: m.content.map((c: any) => {
                if (c.type === 'image_url') {
                  return {
                    type: 'image_url',
                    url_length: c.image_url?.url?.length,
                  }
                }
                return c
              }),
            }
          }
          return m
        })
        console.log(
          '📤 Request structure:',
          JSON.stringify({ model, messages: debugMessages }, null, 2)
        )
      }

      const startTime = Date.now()
      const response = await fetch(`${customLlmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const elapsed = Date.now() - startTime

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error?.message || ''
        // Check if this might be a vision request without a vision model
        if (response.status === 400 && isMultimodal) {
          const hasVisionModel = model !== 'local-model'
          if (!hasVisionModel) {
            throw new Error(
              `LLM Error: ${response.status} - No vision model found in LM Studio. ` +
                `Load a vision model (e.g., llava, qwen-vl) or use OpenAI/Anthropic.`
            )
          }
          throw new Error(
            `LLM Error: ${response.status} - Vision request failed with model '${model}'. ${errorMsg}`
          )
        }
        throw new Error(
          `LLM Error: ${response.status} - ${
            errorMsg || 'Check that LM Studio is running'
          }`
        )
      }

      console.log(`✅ LM Studio response in ${elapsed}ms`)
      const data = await response.json()
      return data.choices?.[0]?.message ?? { content: '' }
    } catch (e: any) {
      if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
        throw new Error(
          `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled.`
        )
      }
      throw e
    } finally {
      trackRequest(customLlmUrl, -1)
    }
  }

  const callOpenAI = async (
    system: string,
    user: UserContent,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: buildUserContent(user) },
    ]
    const body: any = {
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
    }
    if (tools?.length) body.tools = tools
    if (responseFormat) body.response_format = responseFormat

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `OpenAI Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message ?? { content: '' }
  }

  const callAnthropic = async (
    system: string,
    user: UserContent,
    _tools?: any[],
    _responseFormat?: any
  ): Promise<BatteryResult> => {
    // Anthropic has different format for multimodal - build content array
    let userContent: any
    if (typeof user === 'string') {
      userContent = user
    } else {
      // Anthropic multimodal format
      userContent = [{ type: 'text', text: user.text }]
      for (const img of user.images || []) {
        // Anthropic expects base64 data, extract from data URL
        const match = img.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          userContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
          })
        }
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Anthropic Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return { content: data.content?.[0]?.text ?? '' }
  }

  const callDeepseek = async (
    system: string,
    user: UserContent,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    // Deepseek uses OpenAI-compatible format
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: buildUserContent(user) },
    ]
    const body: any = {
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
    }
    if (tools?.length) body.tools = tools
    if (responseFormat) body.response_format = responseFormat

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Deepseek Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message ?? { content: '' }
  }

  const callGemini = async (
    system: string,
    user: UserContent,
    _tools?: any[],
    _responseFormat?: any
  ): Promise<BatteryResult> => {
    const model = 'gemini-3.5-flash-lite'
    const userText = typeof user === 'string' ? user : user.text
    const contents: any[] = []
    if (system) {
      contents.push({ role: 'user', parts: [{ text: system }] })
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood.' }],
      })
    }
    const userParts: any[] = [{ text: userText }]
    if (typeof user !== 'string' && user.images?.length) {
      for (const img of user.images) {
        const match = img.match(/^data:(.*?);base64,(.*)$/)
        if (match) {
          userParts.push({
            inline_data: { mime_type: match[1], data: match[2] },
          })
        }
      }
    }
    contents.push({ role: 'user', parts: userParts })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7 },
        }),
      }
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Gemini Error: ${response.status} - ${
          error.error?.message || 'Check your API key'
        }`
      )
    }
    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    return { content: text }
  }

  return {
    async predict(
      system: string,
      user: UserContent,
      tools?: any[],
      responseFormat?: any
    ): Promise<BatteryResult> {
      // If a specific provider is selected, use it
      if (preferredProvider === 'demo')
        return callDemo(system, user, tools, responseFormat)
      if (preferredProvider === 'custom' && hasCustomUrl)
        return callCustom(system, user, tools, responseFormat)
      if (preferredProvider === 'openai' && hasOpenAI)
        return callOpenAI(system, user, tools, responseFormat)
      if (preferredProvider === 'anthropic' && hasAnthropic)
        return callAnthropic(system, user, tools, responseFormat)
      if (preferredProvider === 'gemini' && hasGemini)
        return callGemini(system, user, tools, responseFormat)
      if (preferredProvider === 'deepseek' && hasDeepseek)
        return callDeepseek(system, user, tools, responseFormat)

      // If preferred provider not available, show helpful error
      if (preferredProvider !== 'auto') {
        const providerNames: Record<string, string> = {
          demo: 'Demo Model',
          custom: 'Custom Endpoint',
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          gemini: 'Google Gemini',
          deepseek: 'Deepseek',
        }
        throw new Error(
          `${providerNames[preferredProvider]} is selected but not configured. Add your API key in Settings.`
        )
      }

      // Auto mode: use first available in priority order
      if (hasCustomUrl) return callCustom(system, user, tools, responseFormat)
      if (hasOpenAI) return callOpenAI(system, user, tools, responseFormat)
      if (hasAnthropic)
        return callAnthropic(system, user, tools, responseFormat)
      if (hasGemini) return callGemini(system, user, tools, responseFormat)
      if (hasDeepseek) return callDeepseek(system, user, tools, responseFormat)
      // Last, so a configured provider always wins over our quota.
      if (!tools?.length && !responseFormat && (await canUseDemoModel()))
        return callDemo(system, user, tools, responseFormat)

      throw new Error(
        'No LLM provider configured. Sign in to use the demo model, or add your own API ' +
          'key in Settings.'
      )
    },

    async embed(text: string): Promise<number[]> {
      // Embedding support for custom URL only (LM Studio)
      if (hasCustomUrl) {
        try {
          const response = await fetch(`${customLlmUrl}/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'text-embedding-model',
              input: text,
            }),
          })
          if (!response.ok) {
            throw new Error(`Embedding Error: ${response.status}`)
          }
          const data = await response.json()
          return data.data?.[0]?.embedding ?? []
        } catch {
          throw new Error('Embedding not available')
        }
      }
      throw new Error('Embedding requires LM Studio endpoint')
    },
  }
}

// Build full capabilities object from settings
export function buildCapabilities(settings?: LLMSettings) {
  const s = settings || getSettings()
  const llmCapability = buildLLMCapability(s)
  const llmBattery = buildLLMBattery(s)

  return {
    llm: llmCapability,
    llmBattery,
  }
}
