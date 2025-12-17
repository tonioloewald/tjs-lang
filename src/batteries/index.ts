import { getStoreCapability as getStoreCapabilityDefault } from './store'
import { getLLMCapability } from './llm'
import { LocalModels } from './models'

const localModels = new LocalModels()
await localModels.audit()

const llm = getLLMCapability(localModels)

export const batteries = {
  vector: { embed: llm.embed },
  store: getStoreCapabilityDefault(),
  llm,
  models: localModels,
}

export function getStandardCapabilities() {
  return {
    vector: { embed: llm.embed },
    store: getStoreCapabilityDefault(),
    llm,
    models: localModels,
  }
}
