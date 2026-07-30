import { auditModels, type ModelAudit } from './audit'
import { LLM_BASE_URL, LLM_MODEL, EMBEDDING_MODEL } from './config'

const DEFAULT_BASE_URL = LLM_BASE_URL

/**
 * A model named explicitly via env (see config.ts). We can't probe it — on a
 * load-on-demand server (mlx-omni-server) a capability probe would load the whole
 * model just to ask a question — so trust the operator: an explicitly-named LLM is
 * assumed structured-output capable, and its embedding dimension is discovered on
 * first use rather than up front.
 */
function declaredModel(id: string, type: 'LLM' | 'Embedding'): ModelAudit {
  return {
    id,
    type,
    structuredOutput: type === 'LLM',
    vision: false,
    status: 'declared via env (not probed)',
  }
}

export class LocalModels {
  private models: ModelAudit[] = []
  private defaultLLM: ModelAudit | null = null
  private defaultEmbedding: ModelAudit | null = null
  private defaultStructuredLLM: ModelAudit | null = null

  constructor(private baseUrl = DEFAULT_BASE_URL) {}

  async audit() {
    // Skip the probe entirely when BOTH models are named — on a load-on-demand
    // server there's nothing to enumerate and probing would load models to ask.
    if (LLM_MODEL && EMBEDDING_MODEL) {
      this.models = [
        declaredModel(LLM_MODEL, 'LLM'),
        declaredModel(EMBEDDING_MODEL, 'Embedding'),
      ]
    } else {
      this.models = await auditModels(this.baseUrl)
      // Named models supplement discovery (e.g. only one of the two is declared).
      if (LLM_MODEL && !this.models.some((m) => m.id === LLM_MODEL)) {
        this.models.push(declaredModel(LLM_MODEL, 'LLM'))
      }
      if (
        EMBEDDING_MODEL &&
        !this.models.some((m) => m.id === EMBEDDING_MODEL)
      ) {
        this.models.push(declaredModel(EMBEDDING_MODEL, 'Embedding'))
      }
    }
    this.selectDefaults()
  }

  private selectDefaults() {
    // An explicitly-named model wins over a discovered one.
    this.defaultEmbedding =
      (EMBEDDING_MODEL && this.models.find((m) => m.id === EMBEDDING_MODEL)) ||
      this.models.find((m) => m.type === 'Embedding') ||
      null
    this.defaultLLM =
      (LLM_MODEL && this.models.find((m) => m.id === LLM_MODEL)) ||
      this.models.find((m) => m.type === 'LLM') ||
      null
    this.defaultStructuredLLM =
      (LLM_MODEL && this.models.find((m) => m.id === LLM_MODEL)) ||
      this.models.find((m) => m.type === 'LLM' && m.structuredOutput) ||
      null

    const hint =
      ' (set TJS_LLM_MODEL / TJS_EMBEDDING_MODEL if your server does not list models)'
    if (!this.defaultEmbedding) {
      console.warn('⚠️ No embedding model found.' + hint)
    }
    if (!this.defaultLLM) {
      console.warn('⚠️ No LLM found.' + hint)
    }
    if (!this.defaultStructuredLLM) {
      console.warn('⚠️ No LLM with structured output support found.' + hint)
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
      (m) => m.dimension !== undefined,
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
