function __ub(v){try{if(v instanceof String)return String.prototype.valueOf.call(v);if(v instanceof Number)return Number.prototype.valueOf.call(v);if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)}catch{return v}return v};
const __ac=Object.create(null);function __proj(v){if(v===null||v===undefined||typeof v!=='object')return v;let k;try{k=v.constructor&&v.constructor.name}catch{return v}let f=k&&Object.prototype.hasOwnProperty.call(__ac,k)?__ac[k]:null;if(typeof f!=='function'){try{f=v.asCompared}catch{return v}}if(typeof f!=='function')return v;let p;try{p=f.call(v)}catch{return v}const t=typeof p;return p===null||p===undefined||t==='number'||t==='string'||t==='boolean'?p:v};
function TypeOf(v){return v===null?'null':typeof v};
function toBool(v){v=__proj(v);try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {TypeOf,toBool};
const __tjsToBool = __tjs.toBool; __tjs.toBool = function(v){ return __tjsToBool(__proj(v)) };
/*#
# LLM Capability

Creates an LLM capability using the user's API keys.
Supports OpenAI, Anthropic, Gemini, and DeepSeek providers.
*/

export function createLlmCapability(apiKeys) {
  return {
    async predict(prompt, options = {}) {
      const apiKey = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(apiKeys.deepseek))(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(apiKeys.gemini))(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(apiKeys.anthropic))(apiKeys.openai)))

      if (__tjs.toBool(!__tjs.toBool(apiKey))) {
        return { error: 'No LLM API key configured' }
      }

      let endpoint, headers, body

      if (__tjs.toBool(apiKeys.openai)) {
        endpoint = 'https://api.openai.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.openai}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('gpt-4o-mini'))(options.model),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(1000))(options.maxTokens)
        }
      } else if (__tjs.toBool(apiKeys.anthropic)) {
        endpoint = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKeys.anthropic,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
        body = {
          model: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('claude-3-haiku-20240307'))(options.model),
          max_tokens: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(1000))(options.maxTokens),
          messages: [{ role: 'user', content: prompt }]
        }
      } else if (__tjs.toBool(apiKeys.gemini)) {
        const model = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('gemini-2.5-flash-lite'))(options.model)
        endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`
        headers = { 'Content-Type': 'application/json' }
        body = {
          contents: [{ parts: [{ text: prompt }] }]
        }
      } else if (__tjs.toBool(apiKeys.deepseek)) {
        endpoint = 'https://api.deepseek.com/v1/chat/completions'
        headers = {
          'Authorization': `Bearer ${apiKeys.deepseek}`,
          'Content-Type': 'application/json'
        }
        body = {
          model: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:('deepseek-chat'))(options.model),
          messages: [{ role: 'user', content: prompt }],
          max_tokens: ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(1000))(options.maxTokens)
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
        if (__tjs.toBool(apiKeys.gemini)) {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text
        } else if (__tjs.toBool(apiKeys.anthropic)) {
          text = data.content?.[0]?.text
        } else {
          text = data.choices?.[0]?.message?.content
        }

        if (__tjs.toBool(TypeOf(text) !== 'string')) {
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
