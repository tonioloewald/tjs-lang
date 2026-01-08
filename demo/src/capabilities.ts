/*
 * capabilities.ts - Shared LLM capability builders for demo
 * 
 * Used by both playground.ts and LiveExample contexts
 */

// LLM provider type
export type LLMProvider = 'auto' | 'custom' | 'openai' | 'anthropic' | 'deepseek'

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
    preferredProvider: (localStorage.getItem('preferredProvider') || 'auto') as LLMProvider,
    openaiKey: localStorage.getItem('openaiKey') || '',
    anthropicKey: localStorage.getItem('anthropicKey') || '',
    deepseekKey: localStorage.getItem('deepseekKey') || '',
    customLlmUrl: localStorage.getItem('customLlmUrl') || '',
  }
}

// Build LLM capability from settings (simple predict interface)
export function buildLLMCapability(settings: LLMSettings) {
  const { preferredProvider, openaiKey, anthropicKey, deepseekKey, customLlmUrl } = settings

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
    
    try {
      const response = await fetch(`${customLlmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(
          `LLM Error: ${response.status} - Check that LM Studio is running at ${customLlmUrl}`
        )
      }
      const data = await response.json()
      return data.choices?.[0]?.message?.content ?? ''
    } catch (e: any) {
      if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
        throw new Error(
          `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled (Server settings → Enable CORS).`
        )
      }
      throw e
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
        `OpenAI Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  const callAnthropic = async (prompt: string, options?: any): Promise<string> => {
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
        `Anthropic Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return data.content?.[0]?.text ?? ''
  }

  const callDeepseek = async (prompt: string, options?: any): Promise<string> => {
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
        `Deepseek Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  return {
    async predict(prompt: string, options?: any): Promise<string> {
      // If a specific provider is selected, use it
      if (preferredProvider === 'custom' && hasCustomUrl) return callCustom(prompt, options)
      if (preferredProvider === 'openai' && hasOpenAI) return callOpenAI(prompt, options)
      if (preferredProvider === 'anthropic' && hasAnthropic) return callAnthropic(prompt, options)
      if (preferredProvider === 'deepseek' && hasDeepseek) return callDeepseek(prompt, options)

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
export function buildLLMBattery(settings: LLMSettings) {
  const { preferredProvider, openaiKey, anthropicKey, deepseekKey, customLlmUrl } = settings

  const hasCustomUrl = customLlmUrl && customLlmUrl.trim() !== ''
  const hasOpenAI = openaiKey && openaiKey.trim() !== ''
  const hasAnthropic = anthropicKey && anthropicKey.trim() !== ''
  const hasDeepseek = deepseekKey && deepseekKey.trim() !== ''

  if (!hasCustomUrl && !hasOpenAI && !hasAnthropic && !hasDeepseek) {
    return null
  }

  type BatteryResult = { content?: string; tool_calls?: any[] }

  // Provider implementations
  const callCustom = async (
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]
    try {
      const response = await fetch(`${customLlmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages,
          temperature: 0.7,
          tools,
          response_format: responseFormat,
        }),
      })
      if (!response.ok) {
        throw new Error(
          `LLM Error: ${response.status} - Check that LM Studio is running`
        )
      }
      const data = await response.json()
      return data.choices?.[0]?.message ?? { content: '' }
    } catch (e: any) {
      if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
        throw new Error(
          `Cannot connect to LM Studio at ${customLlmUrl}. Make sure LM Studio is running and CORS is enabled.`
        )
      }
      throw e
    }
  }

  const callOpenAI = async (
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
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
        `OpenAI Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message ?? { content: '' }
  }

  const callAnthropic = async (
    system: string,
    user: string,
    _tools?: any[],
    _responseFormat?: any
  ): Promise<BatteryResult> => {
    // Anthropic has different tool format, simplified here
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
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(
        `Anthropic Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return { content: data.content?.[0]?.text ?? '' }
  }

  const callDeepseek = async (
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ): Promise<BatteryResult> => {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
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
        `Deepseek Error: ${response.status} - ${error.error?.message || 'Check your API key'}`
      )
    }
    const data = await response.json()
    return data.choices?.[0]?.message ?? { content: '' }
  }

  return {
    async predict(
      system: string,
      user: string,
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
      if (hasAnthropic) return callAnthropic(system, user, tools, responseFormat)
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
