import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { VM } from '../runtime'
import { s } from 'tosijs-schema'

describe('Use Case: Random ID Storage', () => {
  // Shared store for persisting data between agent runs
  const db = new Map<string, any>()
  const caps = {
    store: {
      get: mock(async (key) => db.get(key)),
      set: mock(async (key, value) => {
        db.set(key, value)
      }),
    },
  }

  it('should generate ID, store data, and retrieve it', async () => {
    // 1. Create Agent: Generate ID and Store Data
    // Logic:
    //   id = random({ format: 'base36', length: 8 })
    //   store.set(id, input.data)
    //   return { id }
    const createRecord = A99.take(s.object({ data: s.any }))
      .random({ format: 'base36', length: 8 })
      .as('id')
      .storeSet({ key: 'id', value: A99.args('data') })
      .return(s.object({ id: s.string }))

    // Execute Creation
    const dataToStore = { foo: 'bar', timestamp: 12345 }
    const createRes = await VM.run(
      createRecord.toJSON(),
      { data: dataToStore },
      { capabilities: caps }
    )

    const generatedId = createRes.result.id
    expect(generatedId).toMatch(/^[0-9a-z]{8}$/)
    expect(caps.store.set).toHaveBeenCalled()

    // 2. Retrieve Agent: Fetch by ID
    // Logic:
    //   record = store.get(id)
    //   return { record }
    const getRecord = A99.take(s.object({ id: s.string }))
      .storeGet({ key: A99.args('id') })
      .as('record')
      .return(s.object({ record: s.any }))

    // Execute Retrieval
    const getRes = await VM.run(
      getRecord.toJSON(),
      { id: generatedId },
      { capabilities: caps }
    )

    expect(caps.store.get).toHaveBeenCalledWith(generatedId)
    expect(getRes.result.record).toEqual(dataToStore)
  })

  it('should use UUID atom correctly', async () => {
    const uuidAgent = A99.take(s.object({}))
      .uuid({})
      .as('uuid')
      .return(s.object({ uuid: s.string }))

    const res = await VM.run(uuidAgent.toJSON(), {})
    expect(res.result.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('should handle concurrent random generation uniquely', async () => {
    const genAgent = A99.take(s.object({}))
      .random({ format: 'base36', length: 12 })
      .as('val')
      .return(s.object({ val: s.string }))

    const ast = genAgent.toJSON()
    const count = 50
    const results = await Promise.all(
      Array.from({ length: count }, () => VM.run(ast, {}))
    )

    const values = results.map((r) => r.result.val)
    const unique = new Set(values)
    expect(unique.size).toBe(count) // All should be unique
  })
})