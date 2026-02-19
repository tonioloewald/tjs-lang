/*#
# LLM Capability

Creates an LLM capability using the user's API keys.
Supports OpenAI, Anthropic, Gemini, and DeepSeek providers.
*/

export function createLlmCapability(apiKeys) {
  return {
    async predict(prompt, options = {}) {
      const apiKey = apiKeys.openai || apiKeys.anthropic || apiKeys.gemini || apiKeys.deepseek

      if (!apiKey) {
        return { error: 'No LLM API key configured' }
      }

      let endpoint, headers, body

      if (apiKeys.openai) {
        endpoint = 'https://api.openai.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.openai}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000
        }
      } else if (apiKeys.anthropic) {
        endpoint = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKeys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'claude-3-haiku-20240307',
          max_tokens: options.maxTokens || 1000,
          messages: [{ role: 'user', content: prompt }]
        }
      } else if (apiKeys.gemini) {
        const model = options.model || 'gemini-2.0-flash'
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`
        headers = { 'Content-Type': 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }]
        }
      } else if (apiKeys.deepseek) {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.deepseek}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: options.model || 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens || 1000
        }
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        })

        const data = await response.json()

        let text
        if (apiKeys.gemini) {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text
        } else if (apiKeys.anthropic) {
          text = data.content?.[0]?.text
        } else {
          text = data.choices?.[0]?.message?.content
        }

        if (typeof text !== 'string') {
          throw new Error('LLM returned unexpected format: ' + JSON.stringify(data))
        }
        return text
      } catch (error) {
        throw new Error('LLM error: ' + error.message)
      }
    }
  }
}
createLlmCapability.__tjs = {
  "params": {
    "apiKeys": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "llm.tjs:8"
}
