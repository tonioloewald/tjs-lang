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

  private _setDefaultModel(
    modelId: string,
    property: 'defaultLLM' | 'defaultEmbedding' | 'defaultStructuredLLM',
    predicate: (model: ModelAudit) => boolean,
    errorType: string
  ) {
    const model = this.models.find((m) => m.id === modelId && predicate(m))
    if (!model) {
      throw new Error(`Model '${modelId}' not found or is not ${errorType}.`)
    }
    this[property] = model
  }

  setDefaultLLM(modelId: string) {
    this._setDefaultModel(
      modelId,
      'defaultLLM',
      (m) => m.type === 'LLM',
      'an LLM'
    )
  }

  setDefaultEmbedding(modelId: string) {
    this._setDefaultModel(
      modelId,
      'defaultEmbedding',
      (m) => m.type === 'Embedding',
      'an embedding model'
    )
  }

  setDefaultStructuredLLM(modelId: string) {
    this._setDefaultModel(
      modelId,
      'defaultStructuredLLM',
      (m) => m.type === 'LLM' && m.structuredOutput,
      'a structured-output LLM'
    )
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
