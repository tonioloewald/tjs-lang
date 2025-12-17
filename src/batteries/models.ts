import { auditModels, type ModelAudit } from './audit'

const DEFAULT_BASE_URL = 'http://localhost:1234/v1'

export class LocalModels {
  private models: ModelAudit[] = []
  private defaultLLM: ModelAudit | null = null
  private defaultEmbedding: ModelAudit | null = null
  private defaultStructuredLLM: ModelAudit | null = null

  constructor(private baseUrl = DEFAULT_BASE_URL) {}

  async audit() {
    this.models = await auditModels(this.baseUrl)
    this.selectDefaults()
  }

  private selectDefaults() {
    this.defaultEmbedding =
      this.models.find((m) => m.type === 'Embedding') || null
    this.defaultLLM = this.models.find((m) => m.type === 'LLM') || null
    this.defaultStructuredLLM =
      this.models.find((m) => m.type === 'LLM' && m.structuredOutput) || null

    if (!this.defaultEmbedding) {
      console.warn('⚠️ No embedding model found.')
    }
    if (!this.defaultLLM) {
      console.warn('⚠️ No LLM found.')
    }
    if (!this.defaultStructuredLLM) {
      console.warn('⚠️ No LLM with structured output support found.')
    }
  }

  getModels() {
    return this.models
  }

  setDefaultLLM(modelId: string) {
    const model = this.models.find((m) => m.id === modelId && m.type === 'LLM')
    if (!model) {
      throw new Error(`Model ${modelId} not found or is not an LLM.`)
    }
    this.defaultLLM = model
  }

  setDefaultEmbedding(modelId: string) {
    const model = this.models.find(
      (m) => m.id === modelId && m.type === 'Embedding'
    )
    if (!model) {
      throw new Error(
        `Model ${modelId} not found or is not an embedding model.`
      )
    }
    this.defaultEmbedding = model
  }

  setDefaultStructuredLLM(modelId: string) {
    const model = this.models.find(
      (m) => m.id === modelId && m.type === 'LLM' && m.structuredOutput
    )
    if (!model) {
      throw new Error(
        `Model ${modelId} not found or is not a structured-output LLM.`
      )
    }
    this.defaultStructuredLLM = model
  }

  getLLM() {
    if (!this.defaultLLM) {
      throw new Error('No LLM available.')
    }
    return this.defaultLLM
  }

  getEmbedding() {
    if (!this.defaultEmbedding) {
      throw new Error('No embedding model available.')
    }
    return this.defaultEmbedding
  }

  getStructuredLLM() {
    if (!this.defaultStructuredLLM) {
      throw new Error('No structured-output LLM available.')
    }
    return this.defaultStructuredLLM
  }
}
