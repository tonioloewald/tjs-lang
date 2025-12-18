let memoryCache: ModelAudit[] | null = null

const TIMEOUT_MS = 60000
const CACHE_KEY = '.models.cache.json'

export interface ModelAudit {
  id: string
  type: 'LLM' | 'Embedding' | 'Unknown'
  structuredOutput: boolean
  dimension?: number
  status: string
}

const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

async function readCache(): Promise<ModelAudit[] | null> {
  try {
    if (isBrowser) {
      const cached = window.localStorage.getItem(CACHE_KEY)
      return cached ? JSON.parse(cached) : null
    } else {
      return memoryCache
    }
  } catch (e) {
    console.warn('⚠️ Error reading model cache:', e)
    return null
  }
}

async function writeCache(data: ModelAudit[]): Promise<void> {
  try {
    if (isBrowser) {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } else {
      memoryCache = data
    }
  } catch (e) {
    console.error('❌ Error writing model cache:', e)
  }
}

// ... (fetchWithTimeout, checkStructured, etc. remain the same)
const fetchWithTimeout = async (url: string, options: RequestInit) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

async function checkStructured(
  baseUrl: string,
  modelId: string
): Promise<{ ok: boolean; msg?: string }> {
  try {
    const schemaPayload = {
      type: 'json_schema',
      json_schema: {
        name: 'test',
        strict: false,
        schema: {
          type: 'object',
          properties: { status: { type: 'string' } },
        },
      },
    }
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: 'You respond in JSON.' },
          { role: 'user', content: 'Return JSON: {"status": "ok"}' },
        ],
        response_format: schemaPayload,
        max_tokens: 20,
      }),
    })
    if (!res.ok) {
      if (res.status === 400) {
        return checkStructuredLegacy(baseUrl, modelId)
      }
      return { ok: false, msg: `HTTP ${res.status}` }
    }
    const data = await res.json()
    JSON.parse(data.choices[0].message.content)
    return { ok: true, msg: 'OK (Schema)' }
  } catch (e: any) {
    return { ok: false, msg: e.message || 'Error' }
  }
}

async function checkStructuredLegacy(
  baseUrl: string,
  modelId: string
): Promise<{ ok: boolean; msg?: string }> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'JSON: {"a":1}' }],
        response_format: { type: 'json_object' },
        max_tokens: 10,
      }),
    })
    if (res.ok) return { ok: true, msg: 'OK (Legacy Mode)' }
    return { ok: false, msg: 'Not Supported' }
  } catch {
    return { ok: false, msg: 'Legacy Fail' }
  }
}

async function checkLLM(baseUrl: string, modelId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function checkEmbedding(
  baseUrl: string,
  modelId: string
): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, input: 'test' }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data[0]?.embedding?.length ?? null
  } catch {
    return null
  }
}

export async function auditModels(baseUrl: string): Promise<ModelAudit[]> {
  // 1. Get current model list from server
  let serverModelIds: string[] = []
  try {
    const res = await fetch(`${baseUrl}/models`)
    if (!res.ok) throw new Error('Could not connect')
    const data = (await res.json()) as { data: { id: string }[] }
    serverModelIds = data.data.map((m) => m.id).sort()
  } catch (e) {
    console.error('❌ Failed to connect to LM Studio.')
    return []
  }

  // 2. Try to load from cache
  const cachedData = await readCache()
  if (cachedData) {
    const cachedModelIds = cachedData.map((m) => m.id).sort()
    if (JSON.stringify(serverModelIds) === JSON.stringify(cachedModelIds)) {
      console.log('✅ Using cached model audit.')
      return cachedData
    }
    console.log('🔍 Model list changed. Re-running audit...')
  }

  // 3. Run full audit
  console.log('🔍 Scanning models (this may take a moment)...')
  const results: ModelAudit[] = []
  const modelList = serverModelIds.map((id) => ({ id }))

  let readline: typeof import('node:readline') | undefined
  if (!isBrowser) {
    readline = await import('node:readline')
  }

  for (const model of modelList) {
    if (!isBrowser && readline) {
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(`👉 Testing: ${model.id}...`)
      readline.clearLine(process.stdout, 1)
    }
    let type: ModelAudit['type'] = 'Unknown'
    let structured = false
    let statusMsg = ''
    let dimension: number | undefined = undefined

    const isLLM = await checkLLM(baseUrl, model.id);
    const dim = await checkEmbedding(baseUrl, model.id);

    if (dim) {
      dimension = dim;
    }

    if (isLLM) {
      type = 'LLM';
      const structRes = await checkStructured(baseUrl, model.id);
      structured = structRes.ok;
      statusMsg = structured ? structRes.msg! : `Fail: ${structRes.msg}`;
    } else if (dim) {
      type = 'Embedding';
      statusMsg = `OK (Dim: ${dim})`;
    } else {
      statusMsg = 'LLM Fail';
    }

    results.push({
      id: model.id,
      type,
      structuredOutput: structured,
      dimension,
      status: statusMsg,
    })
  }
  if (!isBrowser && readline) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
  }

  console.log('\n')
  console.table(results)

  // 4. Save to cache
  await writeCache(results)
  console.log(`📝 Audit results saved to cache.`)

  return results
}
