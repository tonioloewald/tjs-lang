/*
 * capabilities.ts - Shared LLM capability builders for demo
 *
 * Used by both playground.ts and LiveExample contexts
 */

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
  | 'custom'
  | 'openai'
  | 'anthropic'
  | 'deepseek'

export interface LLMSettings {
  preferredProvider: LLMProvider
  openaiKey: string
  anthropicKey: string
  deepseekKey: string
  customLlmUrl: string
}

// Get settings from localStorage
export function getSettings(): LLMSettings {
  return {
    preferredProvider: (localStorage.getItem('preferredProvider') ||
      'auto') as LLMProvider,
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
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
    deepseekKey,
    customLlmUrl,
  } = settings

  // Determine which providers are available
  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''
  const hasDeepseek = deepseekKey && deepseekKey.trim() !== ''

  if (!hasCustomUrl && !hasOpenAI && !hasAnthropic && !hasDeepseek) {
    return null
  }

  // Provider implementations
  const callCustom = async (prompt: string, options?: any): Promise<string> => {
    const body: any = {
      model: options?.model || 'local-model',
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
        throw new Error(
          `LLM Error: ${response.status} - Check that LM Studio is running at ${customLlmUrl}`
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
      if (preferredProvider === 'custom' && hasCustomUrl)
        return callCustom(prompt, options)
      if (preferredProvider === 'openai' && hasOpenAI)
        return callOpenAI(prompt, options)
      if (preferredProvider === 'anthropic' && hasAnthropic)
        return callAnthropic(prompt, options)
      if (preferredProvider === 'deepseek' && hasDeepseek)
        return callDeepseek(prompt, options)

      // If preferred provider not available, show helpful error
      if (preferredProvider !== 'auto') {
        const providerNames: Record<string, string> = {
          custom: 'Custom Endpoint',
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          deepseek: 'Deepseek',
        }
        throw new Error(
          `${providerNames[preferredProvider]} is selected but not configured. Add your API key in Settings.`
        )
      }

      // Auto mode: use first available in priority order
      if (hasCustomUrl) return callCustom(prompt, options)
      if (hasOpenAI) return callOpenAI(prompt, options)
      if (hasAnthropic) return callAnthropic(prompt, options)
      if (hasDeepseek) return callDeepseek(prompt, options)

      throw new Error('No LLM provider configured')
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
    deepseekKey,
    customLlmUrl,
  } = settings

  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''
  const hasDeepseek = deepseekKey && deepseekKey.trim() !== ''

  if (!hasCustomUrl && !hasOpenAI && !hasAnthropic && !hasDeepseek) {
    return null
  }

  type BatteryResult = { content?: string; tool_calls?: any[] }

  // Get a test image for vision capability testing
  const getTestImage = async (): Promise<string | null> => {
    // Browser: synthesize with canvas (circle and square like test-shapes.jpg)
    if (
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function'
    ) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 200
        canvas.height = 200
        const ctx = canvas.getContext('2d')
        if (ctx) {
          // White background
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, 200, 200)
          // Blue circle on left
          ctx.fillStyle = '#3366cc'
          ctx.beginPath()
          ctx.arc(60, 100, 40, 0, Math.PI * 2)
          ctx.fill()
          // Red square on right
          ctx.fillStyle = '#cc3333'
          ctx.fillRect(100, 60, 80, 80)
          return canvas.toDataURL('image/jpeg', 0.9)
        }
      } catch {}
    }

    // Node/Bun: read test-shapes.jpg from disk
    try {
      const fs = await import('fs')
      const path = await import('path')
      const imagePath = path.join(process.cwd(), 'test-data/test-shapes.jpg')
      const buffer = fs.readFileSync(imagePath)
      const base64 = buffer.toString('base64')
      return `data:image/jpeg;base64,${base64}`
    } catch {}

    return null
  }

  // Test if a model can actually do vision
  const testVisionCapability = async (model: string): Promise<boolean> => {
    try {
      const testImage = await getTestImage()
      if (!testImage) {
        console.log(`🧪 Vision test for ${model}: test image not available`)
        return false
      }

      const response = await fetch(`${customLlmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What shapes do you see? Reply briefly.',
                },
                { type: 'image_url', image_url: { url: testImage } },
              ],
            },
          ],
          max_tokens: 30,
          temperature: 0,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.log(
          `🧪 Vision test for ${model}: HTTP ${
            response.status
          } - ${errorText.slice(0, 100)}`
        )
        return false
      }

      const data = await response.json()
      const answer = (data.choices?.[0]?.message?.content || '').toLowerCase()
      // Accept circle, square, or red (canvas generates red circle, test-shapes.jpg has circle+square)
      const isCorrect =
        answer.includes('circle') ||
        answer.includes('square') ||
        answer.includes('red')
      console.log(
        `🧪 Vision test for ${model}: "${answer}" - ${isCorrect ? '✓' : '✗'}`
      )
      return isCorrect
    } catch (e) {
      console.log(`🧪 Vision test for ${model}: failed - ${e}`)
      return false
    }
  }

  // Find a working vision model by testing candidates
  const findVisionModel = async (): Promise<string | null> => {
    // Check cache first
    const cacheKey = customLlmUrl
    if (verifiedVisionModels.has(cacheKey)) {
      return verifiedVisionModels.get(cacheKey) || null
    }

    const models = await getLocalModels(customLlmUrl)

    // Candidates in priority order (most likely to support vision first)
    const candidates = [
      ...models.filter(
        (id) => id.includes('-vl') || id.includes('vl-') || id.includes('llava')
      ),
      ...models.filter((id) => id.includes('vision')),
      ...models.filter((id) => id.includes('gemma-3') || id.includes('gemma3')),
    ]

    // Remove duplicates
    const uniqueCandidates = [...new Set(candidates)]

    // Test each candidate
    for (const model of uniqueCandidates) {
      console.log(`🔍 Testing vision capability: ${model}`)
      if (await testVisionCapability(model)) {
        verifiedVisionModels.set(cacheKey, model)
        return model
      }
    }

    verifiedVisionModels.set(cacheKey, null)
    return null
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

  return {
    async predict(
      system: string,
      user: UserContent,
      tools?: any[],
      responseFormat?: any
    ): Promise<BatteryResult> {
      // If a specific provider is selected, use it
      if (preferredProvider === 'custom' && hasCustomUrl)
        return callCustom(system, user, tools, responseFormat)
      if (preferredProvider === 'openai' && hasOpenAI)
        return callOpenAI(system, user, tools, responseFormat)
      if (preferredProvider === 'anthropic' && hasAnthropic)
        return callAnthropic(system, user, tools, responseFormat)
      if (preferredProvider === 'deepseek' && hasDeepseek)
        return callDeepseek(system, user, tools, responseFormat)

      // If preferred provider not available, show helpful error
      if (preferredProvider !== 'auto') {
        const providerNames: Record<string, string> = {
          custom: 'Custom Endpoint',
          openai: 'OpenAI',
          anthropic: 'Anthropic',
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
      if (hasDeepseek) return callDeepseek(system, user, tools, responseFormat)

      throw new Error('No LLM provider configured')
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
