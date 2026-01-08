import { getStoreCapability as getStoreCapabilityDefault } from './store'
import { getLLMCapability } from './llm'
import { LocalModels } from './models'

// Check if we're in a browser on HTTPS (can't connect to local HTTP endpoints)
const isBrowser = typeof window !== 'undefined'
const isHttps = isBrowser && window.location.protocol === 'https:'

// Lazy initialization - don't audit on import
let localModels: LocalModels | null = null
let llm: ReturnType<typeof getLLMCapability> | null = null
let initializationAttempted = false

async function ensureInitialized() {
  if (initializationAttempted) {
    return { localModels, llm }
  }
  initializationAttempted = true

  // Skip local LLM initialization on HTTPS (mixed content would block it anyway)
  if (isHttps) {
    console.log(
      '📡 HTTPS detected - local LLM endpoints disabled. Use HTTP for local LLM support.'
    )
    return { localModels: null, llm: null }
  }

  try {
    localModels = new LocalModels()
    await localModels.audit()
    llm = getLLMCapability(localModels)
  } catch (e) {
    console.warn('⚠️ Could not connect to local LLM:', e)
  }
  return { localModels, llm }
}

export async function getBatteries() {
  const { localModels, llm } = await ensureInitialized()
  return {
    vector: llm ? { embed: llm.embed } : undefined,
    store: getStoreCapabilityDefault(),
    llmBattery: llm,
    models: localModels,
  }
}

export async function getStandardCapabilities() {
  return getBatteries()
}

// For non-async access (after initialization)
export { LocalModels, getLLMCapability, getStoreCapabilityDefault }

// Synchronous batteries object for tests and simple use cases
export const batteries = {
  store: getStoreCapabilityDefault(),
  llmBattery: null as ReturnType<typeof getLLMCapability> | null,
  vector: undefined as { embed: (text: string) => Promise<number[]> } | undefined,
  models: null as LocalModels | null,
}
