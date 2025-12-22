import { describe, it, expect } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

// To skip benchmarks, run with a filter that excludes them
// bun test --except-filter=benchmark
const benchmarks = describe.each([
  { run: process.env.RUN_BENCHMARKS !== 'false' },
])

function generatePrimes(n: number): number[] {
  const primes: number[] = []
  const isPrime = new Array(n + 1).fill(true)
  isPrime[0] = isPrime[1] = false
  for (let p = 2; p * p <= n; p++) {
    if (isPrime[p]) {
      for (let i = p * p; i <= n; i += p) isPrime[i] = false
    }
  }
  for (let p = 2; p <= n; p++) {
    if (isPrime[p]) primes.push(p)
  }
  return primes
}

function generateRecords(n: number) {
  const records = []
  for (let i = 0; i < n; i++) {
    const record: Record<string, string | number> = { id: i }
    for (let j = 0; j < 50; j++) {
      record[`s${j}`] = `record-${i}-prop-${j}`
      record[`n${j}`] = i * 100 + j
    }
    records.push(record)
  }
  return records
}

benchmarks('VM Benchmarks ($run)', ({ run }) => {
  const benchmark = run ? it : it.skip

  const VM = new AgentVM()
  it('should have a basic test runner working', async () => {
    const ast = A99.take(s.object({ a: s.number, b: s.number }))
      .varsImport(['a', 'b'])
      .mathCalc({ expr: 'a + b', vars: { a: 'a', b: 'b' } })
      .as('result')
      .return(s.object({ result: s.number }))
      .toJSON()
    const { result } = await VM.run(ast, { a: 2, b: 3 })
    expect(result.result).toBe(5)
  })

  benchmark(
    'benchmark: first n primes',
    async () => {
      const n = 1000
      const expectedPrimes = generatePrimes(n)

      const ast = A99.take(s.object({ n: s.number }))
        .varsImport(['n'])
        .varsLet({
          primes: [],
          i: 2, // Start checking from 2
        })
        .while('i <= n', { i: 'i', n: 'n' }, (b) =>
          b
            .varsLet({ isPrime: true, j: 2 })
            .while('j * j <= i', { j: 'j', i: 'i' }, (b) =>
              b
                .if('i % j == 0', { i: 'i', j: 'j' }, (b) =>
                  b.varSet({ key: 'isPrime', value: false })
                )
                .mathCalc({ expr: 'j + 1', vars: { j: 'j' } })
                .as('j')
            )
            .if('isPrime', { isPrime: 'isPrime' }, (b) =>
              b.push({ list: 'primes', item: 'i' })
            )
            .mathCalc({ expr: 'i + 1', vars: { i: 'i' } })
            .as('i')
        )
        .return(s.object({ primes: s.array(s.number) }))
        .toJSON()

      const { result } = await VM.run(ast, { n }, { fuel: 1_000_000 })
      expect(result.primes).toEqual(expectedPrimes)
    },
    { timeout: 20000 }
  )

  benchmark(
    'benchmark: filter and remap large dataset',
    async () => {
      const n = 1000
      const records = generateRecords(n)
      const expectedCount = records.filter((r) =>
        (r.s10 as string).includes('record-5')
      ).length

      const ast = VM.A99.varSet({ key: 'data', value: A99.args('records') })
        .map('data', 'item', (b) =>
          b
            .regexMatch({ pattern: 'record-5', value: 'item.s10' })
            .as('match')
            .if('match == true', { match: 'match' }, (b) =>
              b
                .pick({
                  obj: 'item',
                  keys: [
                    's0',
                    's5',
                    's10',
                    's15',
                    's20',
                    's25',
                    's30',
                    's35',
                    's40',
                    's45',
                    'n0',
                    'n5',
                    'n10',
                    'n15',
                    'n20',
                    'n25',
                    'n30',
                    'n35',
                    'n40',
                    'n45',
                  ],
                })
                .as('result')
            )
        )
        .as('mapped')
        // Filter out nulls from map
        .varSet({ key: 'filtered', value: [] })
        .map('mapped', 'item', (b) =>
          b.if('item != null', { item: 'item' }, (b) =>
            b.push({ list: 'filtered', item: 'item' })
          )
        )
        .return(s.object({ filtered: s.array(s.any) }))
        .toJSON()

      const { result } = await VM.run(ast, { records }, { fuel: 5_000_000 })

      const finalResult = result.filtered

      expect(finalResult.length).toBe(expectedCount)
      expect(Object.keys(finalResult[0]).length).toBe(20)
    },
    { timeout: 60000 }
  )

  benchmark(
    'benchmark: filter large dataset',
    async () => {
      const n = 1000
      const records = generateRecords(n)
      const expectedCount = records.filter((r) =>
        (r.s10 as string).includes('record-5')
      ).length

      const ast = VM.A99.varSet({ key: 'data', value: A99.args('records') })
        .varSet({ key: 'filtered', value: [] })
        .map('data', 'item', (b) =>
          b
            .regexMatch({ pattern: 'record-5', value: 'item.s10' })
            .as('match')
            .if('match == true', { match: 'match' }, (b) =>
              b.push({ list: 'filtered', item: 'item' })
            )
        )
        .return(s.object({ filtered: s.array(s.any) }))
        .toJSON()

      const { result } = await VM.run(ast, { records }, { fuel: 5_000_000 })

      const finalResult = result.filtered
      expect(finalResult.length).toBe(expectedCount)
    },
    { timeout: 60000 }
  )

  benchmark(
    'benchmark: remap large dataset',
    async () => {
      const n = 1000
      const records = generateRecords(n)

      const ast = VM.A99.varSet({ key: 'data', value: A99.args('records') })
        .map('data', 'item', (b) =>
          b
            .pick({
              obj: 'item',
              keys: [
                's0',
                's5',
                's10',
                's15',
                's20',
                's25',
                's30',
                's35',
                's40',
                's45',
                'n0',
                'n5',
                'n10',
                'n15',
                'n20',
                'n25',
                'n30',
                'n35',
                'n40',
                'n45',
              ],
            })
            .as('result')
        )
        .as('remapped')
        .return(s.object({ remapped: s.array(s.any) }))
        .toJSON()

      const { result } = await VM.run(ast, { records }, { fuel: 5_000_000 })

      const finalResult = result.remapped

      expect(finalResult.length).toBe(n)
      expect(Object.keys(finalResult[0]).length).toBe(20)
    },
    { timeout: 60000 }
  )

  benchmark(
    'benchmark: torture test for filter and remap (concurrent)',
    async () => {
      const n = 1000
      const records = generateRecords(n)

      const keysToPick = [
        'id',
        's0',
        's5',
        's10',
        's15',
        's20',
        'n0',
        'n5',
        'n10',
        'n15',
        'n20',
      ]

      // Calculate expected result for one run
      const expectedRecords = records
        .filter((r) => (r.s10 as string).includes('record-5'))
        .map((r) => {
          const newR: Record<string, any> = {}
          for (const key of keysToPick) {
            newR[key] = r[key]
          }
          return newR
        })
      const expectedCount = expectedRecords.length

      const ast = VM.A99.varSet({ key: 'data', value: A99.args('records') })
        .map('data', 'item', (b) =>
          b
            .regexMatch({ pattern: 'record-5', value: 'item.s10' })
            .as('match')
            .if('match == true', { match: 'match' }, (b) =>
              b.pick({ obj: 'item', keys: keysToPick }).as('result')
            )
        )
        .as('mapped')
        // Filter out nulls from map
        .varSet({ key: 'filtered', value: [] })
        .map('mapped', 'item', (b) =>
          b.if('item != null', { item: 'item' }, (b) =>
            b.push({ list: 'filtered', item: 'item' })
          )
        )
        .return(s.object({ filtered: s.array(s.any) }))
        .toJSON()

      const promises = Array.from({ length: 10 }).map(() =>
        new AgentVM().run(
          JSON.parse(JSON.stringify(ast)),
          { records },
          { fuel: 5_000_000 }
        )
      )

      const results = await Promise.all(promises)

      for (const { result } of results) {
        const finalResult = result.filtered
        expect(finalResult.length).toBe(expectedCount)
        if (finalResult.length > 0) {
          expect(Object.keys(finalResult[0]).length).toBe(keysToPick.length)
          expect(finalResult).toEqual(expectedRecords)
        }
      }
    },
    { timeout: 120000 }
  )
})
