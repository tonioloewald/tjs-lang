import { describe, it, expect } from 'bun:test'
import { LocalModels } from './models'
import { getLLMCapability } from './llm'

describe('LocalModels Integration Test', () => {
  it('should audit models from a live server and classify them correctly', async () => {
    // This test requires a running LM Studio instance at the default URL.
    const localModels = new LocalModels()
    await localModels.audit()

    const models = localModels.getModels()
    // Depending on the models loaded in LM Studio, this will vary.
    // We expect at least one model to be found.
    expect(models.length).toBeGreaterThan(0)

    const llm = localModels.getLLM()
    expect(llm).not.toBeNull()
    expect(llm.type).toBe('LLM')

    const embeddingModel = localModels.getEmbedding()
    expect(embeddingModel).not.toBeNull()
    // With the fix, a model could be an LLM and have a dimension.
    // So we check for the dimension property.
    expect(embeddingModel.dimension).toBeGreaterThan(0)

    console.log('Default LLM:', llm.id)
    console.log('Default Embedding Model:', embeddingModel.id)

    const aKnownLLM = models.find(m => m.id.includes('llama'))
    if (aKnownLLM) {
      expect(aKnownLLM.type).toBe('LLM')
    }

    const aKnownEmbeddingModel = models.find(m => m.id.includes('embedding'))
    if (aKnownEmbeddingModel) {
      expect(aKnownEmbeddingModel.dimension).toBeGreaterThan(0)
    }
  }, 20000) // Increase timeout for network requests

  it('should be able to make a simple prediction', async () => {
    const localModels = new LocalModels();
    await localModels.audit();
    const { predict } = getLLMCapability(localModels);
    const res = await predict('the color of the sky is', 'test');
    expect(typeof res.content).toBe('string');
    expect(res.content.length).toBeGreaterThan(5);
  }, 10000)

  it('should be able to get a vector embedding', async () => {
    const localModels = new LocalModels();
    await localModels.audit();
    const { embed } = getLLMCapability(localModels);
    const res = await embed('this is a test');
    expect(Array.isArray(res)).toBe(true)
    expect(res.length).toBeGreaterThan(100)
    expect(typeof res[0]).toBe('number')
  }, 10000)

  it('should be able to do a structured query', async () => {
    const localModels = new LocalModels();
    await localModels.audit();
    const { predict } = getLLMCapability(localModels);
    const res = await predict('test', 'respond with JSON: {"a": 1, "b": 2}', [], {
        type: 'json_schema',
        json_schema: {
          name: 'test',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
          },
        },
      },
    )
    
    const parsed = JSON.parse(res.content);
    expect(typeof parsed).toBe('object')
    expect(parsed).toHaveProperty('a')
    expect(parsed).toHaveProperty('b')
    expect(typeof parsed.a).toBe('number')
    expect(typeof parsed.b).toBe('number')
  }, 10000)
})
