import { describe, it, expect, mock } from 'bun:test'
import { Agent } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

describe('Use Case: Caching Proxy', () => {
  const VM = new AgentVM()

  it('should fetch from source on cache miss and cache the result', async () => {
    const caps = {
      store: {
        get: mock(async () => null), // Cache Miss
        set: mock(async () => {
          // noop
        }),
      },
      fetch: mock(async () => ({ data: 'fresh' })),
    }

    const refinedProxy = Agent.take(s.object({ url: s.string }))
      .storeGet({ key: 'args.url' }) // Use URL as key directly
      .as('cached')
      .if('cached != null', { cached: 'cached' }, (b) =>
        b
          .varSet({ key: 'result', value: 'cached' })
          .return(s.object({ result: s.any }))
      )
      .httpFetch({ url: Agent.args('url') })
      .as('fetched')
      .storeSet({ key: Agent.args('url'), value: 'fetched' })
      .varSet({ key: 'result', value: 'fetched' })
      .return(s.object({ result: s.any }))

    // Execute Miss
    const resMiss = await VM.run(
      refinedProxy.toJSON(),
      { url: 'http://api.data' },
      { capabilities: caps }
    )

    expect(caps.store.get).toHaveBeenCalled()
    expect(caps.fetch).toHaveBeenCalled()
    expect(caps.store.set).toHaveBeenCalledWith('http://api.data', {
      data: 'fresh',
    })
    expect(resMiss.result.result).toEqual({ data: 'fresh' })
  })

  it('should return cached value on cache hit without fetching', async () => {
    const caps = {
      store: {
        get: mock(async () => ({ data: 'cached' })), // Cache Hit
        set: mock(async () => {
          // noop
        }),
      },
      fetch: mock(async () => ({ data: 'fresh' })),
    }

    const refinedProxy = Agent.take(s.object({ url: s.string }))
      .storeGet({ key: 'args.url' })
      .as('cached')
      .if('cached != null', { cached: 'cached' }, (b) =>
        b
          .varSet({ key: 'result', value: 'cached' })
          .return(s.object({ result: s.any }))
      )
      .httpFetch({ url: Agent.args('url') }) // Should not reach here
      .as('fetched')
      .varSet({ key: 'result', value: 'fetched' })
      .return(s.object({ result: s.any }))

    // Execute Hit
    const resHit = await VM.run(
      refinedProxy.toJSON(),
      { url: 'http://api.data' },
      { capabilities: caps }
    )

    expect(caps.store.get).toHaveBeenCalled()
    expect(caps.fetch).not.toHaveBeenCalled()
    expect(resHit.result.result).toEqual({ data: 'cached' })
  })

  it('should handle concurrent requests', async () => {
    const refinedProxy = Agent.take(s.object({ url: s.string }))
      .storeGet({ key: 'args.url' })
      .as('cached')
      .if('cached != null', { cached: 'cached' }, (b) =>
        b
          .varSet({ key: 'result', value: 'cached' })
          .return(s.object({ result: s.any }))
      )
      .httpFetch({ url: Agent.args('url') })
      .as('fetched')
      .storeSet({ key: Agent.args('url'), value: 'fetched' })
      .varSet({ key: 'result', value: 'fetched' })
      .return(s.object({ result: s.any }))

    const ast = refinedProxy.toJSON()
    const caps = {
      store: {
        get: mock(async () => null),
        set: mock(async () => {
          // noop
        }),
      },
      fetch: mock(async (url) => ({ data: `fresh for ${url}` })),
    }

    const urls = Array.from({ length: 10 }, (_, i) => `http://site-${i}.com`)
    const results = await Promise.all(
      urls.map((url) => VM.run(ast, { url }, { capabilities: caps }))
    )

    results.forEach((res, i) => {
      expect(res.result.result).toEqual({ data: `fresh for ${urls[i]}` })
    })
    expect(caps.store.set).toHaveBeenCalledTimes(10)
  })
})
