import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { VM } from '../runtime'
import { s } from 'tosijs-schema'

describe('Use Case: Caching Proxy', () => {
  it('should fetch from source on cache miss and cache the result', async () => {
    const caps = {
      store: {
        get: mock(async () => null), // Cache Miss
        set: mock(async () => {}),
      },
      fetch: mock(async () => ({ data: 'fresh' })),
    }

    const refinedProxy = A99.take(s.object({ url: s.string }))
      ['store.get']({ key: 'args.url' }) // Use URL as key directly
      .as('cached')
      .if(
        'cached != null',
        { cached: 'cached' },
        (b) =>
          b
            ['var.set']({ key: 'result', value: 'cached' })
            ['return']({ schema: s.object({ result: s.any }).schema })
      )
      ['http.fetch']({ url: A99.args('url') })
      .as('fetched')
      ['store.set']({ key: A99.args('url'), value: 'fetched' })
      ['var.set']({ key: 'result', value: 'fetched' })
      ['return']({ schema: s.object({ result: s.any }).schema })

    // Execute Miss
    const resMiss = await VM.run(
      refinedProxy.toJSON(),
      { url: 'http://api.data' },
      { capabilities: caps }
    )

    expect(caps.store.get).toHaveBeenCalled()
    expect(caps.fetch).toHaveBeenCalled()
    expect(caps.store.set).toHaveBeenCalledWith(
      'http://api.data',
      { data: 'fresh' }
    )
    expect(resMiss.result).toEqual({ data: 'fresh' })
  })

  it('should return cached value on cache hit without fetching', async () => {
    const caps = {
      store: {
        get: mock(async () => ({ data: 'cached' })), // Cache Hit
        set: mock(async () => {}),
      },
      fetch: mock(async () => ({ data: 'fresh' })),
    }

    const refinedProxy = A99.take(s.object({ url: s.string }))
      ['store.get']({ key: 'args.url' })
      .as('cached')
      .if(
        'cached != null',
        { cached: 'cached' },
        (b) =>
          b
            ['var.set']({ key: 'result', value: 'cached' })
            ['return']({ schema: s.object({ result: s.any }).schema })
      )
      ['http.fetch']({ url: A99.args('url') }) // Should not reach here
      .as('fetched')
      ['var.set']({ key: 'result', value: 'fetched' })
      ['return']({ schema: s.object({ result: s.any }).schema })

    // Execute Hit
    const resHit = await VM.run(
      refinedProxy.toJSON(),
      { url: 'http://api.data' },
      { capabilities: caps }
    )

    expect(caps.store.get).toHaveBeenCalled()
    expect(caps.fetch).not.toHaveBeenCalled()
    expect(resHit.result).toEqual({ data: 'cached' })
  })
})