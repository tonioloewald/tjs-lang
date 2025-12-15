import { getVectorCapability } from './vector'
import { getStoreCapability } from './store'
import { getLLMCapability } from './llm'

export const batteries = {
  vector: getVectorCapability(),
  store: getStoreCapability(),
  llm: getLLMCapability(),
}

export function getStandardCapabilities() {
  return {
    vector: getVectorCapability(),
    store: getStoreCapability(),
    llm: getLLMCapability(),
  }
}