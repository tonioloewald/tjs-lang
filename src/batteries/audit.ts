const TIMEOUT_MS = 60000
const CACHE_FILE = '.models.cache.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface ModelAudit {
  id: string
  type: 'LLM' | 'Embedding' | 'Unknown'
  structuredOutput: boolean
  vision: boolean
  dimension?: number
  status: string
}

interface CacheData {
  timestamp: number
  baseUrl: string
  models: ModelAudit[]
}

const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

async function readCache(baseUrl: string): Promise<ModelAudit[] | null> {
  try {
    if (isBrowser) {
      const cached = window.localStorage.getItem(CACHE_FILE)
      if (!cached) return null
      const data: CacheData = JSON.parse(cached)
      // Check TTL and baseUrl match
      if (data.baseUrl !== baseUrl) return null
      if (Date.now() - data.timestamp > CACHE_TTL_MS) return null
      return data.models
    } else {
      // Node.js: read from file
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const cacheFile = path.join(process.cwd(), CACHE_FILE)
      try {
        const content = await fs.readFile(cacheFile, 'utf-8')
        const data: CacheData = JSON.parse(content)
        // Check TTL and baseUrl match
        if (data.baseUrl !== baseUrl) return null
        if (Date.now() - data.timestamp > CACHE_TTL_MS) return null
        return data.models
      } catch {
        return null // File doesn't exist or can't be read
      }
    }
  } catch (e) {
    console.warn('⚠️ Error reading model cache:', e)
    return null
  }
}

async function writeCache(
  baseUrl: string,
  models: ModelAudit[]
): Promise<void> {
  const data: CacheData = {
    timestamp: Date.now(),
    baseUrl,
    models,
  }
  try {
    if (isBrowser) {
      window.localStorage.setItem(CACHE_FILE, JSON.stringify(data))
    } else {
      // Node.js: write to file
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const cacheFile = path.join(process.cwd(), CACHE_FILE)
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2))
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

// Tiny 1x1 red PNG as base64 for vision testing
const TINY_TEST_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

async function checkVision(baseUrl: string, modelId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What color is this?' },
              { type: 'image_url', image_url: { url: TINY_TEST_IMAGE } },
            ],
          },
        ],
        max_tokens: 10,
      }),
    })
    // If the model accepts the multimodal format without error, it supports vision
    return res.ok
  } catch {
    return false
  }
}

export async function auditModels(baseUrl: string): Promise<ModelAudit[]> {
  // 1. Try to load from cache first (file-based with 24h TTL)
  const cachedData = await readCache(baseUrl)

  // 2. Get current model list from server
  let serverModelIds: string[] = []
  try {
    const res = await fetch(`${baseUrl}/models`)
    if (!res.ok) throw new Error('Could not connect')
    const data = (await res.json()) as { data: { id: string }[] }
    serverModelIds = data.data.map((m) => m.id).sort()
  } catch (e) {
    // If we have cache and server is unavailable, use cache
    if (cachedData) {
      console.log('⚠️ LM Studio unavailable, using cached model audit.')
      return cachedData
    }
    console.error('❌ Failed to connect to LM Studio.')
    return []
  }

  // 3. Check if cache is still valid (same models)
  if (cachedData) {
    const cachedModelIds = cachedData.map((m) => m.id).sort()
    if (JSON.stringify(serverModelIds) === JSON.stringify(cachedModelIds)) {
      console.log('✅ Using cached model audit.')
      return cachedData
    }
    console.log('🔍 Model list changed. Re-running audit...')
  }

  // 4. Run full audit
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
    let vision = false
    let statusMsg = ''
    let dimension: number | undefined = undefined

    const isLLM = await checkLLM(baseUrl, model.id)
    const dim = await checkEmbedding(baseUrl, model.id)

    if (dim) {
      dimension = dim
    }

    if (isLLM) {
      type = 'LLM'
      const structRes = await checkStructured(baseUrl, model.id)
      structured = structRes.ok
      vision = await checkVision(baseUrl, model.id)
      statusMsg = structured ? structRes.msg! : `Fail: ${structRes.msg}`
      if (vision) statusMsg += ' +Vision'
    } else if (dim) {
      type = 'Embedding'
      statusMsg = `OK (Dim: ${dim})`
    } else {
      statusMsg = 'LLM Fail'
    }

    results.push({
      id: model.id,
      type,
      structuredOutput: structured,
      vision,
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

  // 5. Save to cache
  await writeCache(baseUrl, results)
  console.log(`📝 Audit results saved to cache.`)

  return results
}
