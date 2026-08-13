/**
 * The port helper never kills a process that is not a JS runtime, and never kills a client.
 *
 * `tjs-playground` shipped `kill -9 $(lsof -ti:PORT)` — no `-sTCP:LISTEN`, no identity
 * check, no opt-out, running unconditionally at startup. `lsof -ti:PORT` matches every
 * socket touching the port in EITHER direction, so a browser tab open on the playground
 * made Chrome's network process the first match. It was SIGKILLed, and the tool announced
 * it as "Killing existing process on port 8699".
 *
 * These tests use a REAL listener on an ephemeral port, because the bug was in what `lsof`
 * returns — a mocked `lsof` would have returned exactly what the author assumed it did, and
 * proved nothing.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { portListeners, reclaimPort, validPort } from './port'

const servers: Array<{ stop: () => void }> = []

afterEach(() => {
  for (const s of servers.splice(0)) {
    try {
      s.stop()
    } catch {
      /* already stopped */
    }
  }
})

function listen(): { port: number; stop: () => void } {
  const server = Bun.serve({ port: 0, fetch: () => new Response('ok') })
  const handle = { stop: () => server.stop(true) }
  servers.push(handle)
  return { port: server.port, stop: handle.stop }
}

describe('finding who holds a port', () => {
  it('finds a real listener and identifies it as ours', async () => {
    const { port } = listen()
    const holders = await portListeners(port)
    expect(holders.length).toBeGreaterThan(0)
    // The test process IS bun, so this is genuinely one of ours.
    expect(holders.every((h) => h.ours)).toBe(true)
    expect(holders.some((h) => h.pid === process.pid)).toBe(true)
  })

  it('reports nothing for a port with no listener', async () => {
    const { port, stop } = listen()
    stop()
    // Give the socket a moment to leave LISTEN.
    await new Promise((r) => setTimeout(r, 100))
    expect(await portListeners(port)).toEqual([])
  })

  it('does not report a CLIENT connected to the port', async () => {
    // THE bug, and it needs a client in a SEPARATE process to be visible at all: a
    // same-process fetch shares this pid with the listener, so `lsof` deduplicates and
    // the broken and fixed versions return an identical answer. That weaker version of
    // this test passed against the unfixed code.
    const { port } = listen()

    const client = Bun.spawn(
      [
        'bun',
        '-e',
        `await Bun.connect({
           hostname: 'localhost',
           port: ${port},
           socket: { data() {}, open() {} },
         })
         await new Promise((r) => setTimeout(r, 10000))`,
      ],
      { stdout: 'ignore', stderr: 'ignore' }
    )

    try {
      // Wait for the connection to actually exist.
      const deadline = Date.now() + 3000
      let raw = ''
      while (Date.now() < deadline) {
        raw = await Bun.$`lsof -ti:${port}`
          .quiet()
          .text()
          .catch(() => '')
        if (raw.split('\n').filter(Boolean).length > 1) break
        await new Promise((r) => setTimeout(r, 50))
      }

      const naive = raw.split('\n').filter(Boolean).map(Number)
      // Apparatus: if the naive command never saw the client, this test proves nothing.
      expect(
        naive.includes(client.pid),
        'apparatus: the old `lsof -ti:PORT` did not match the client, so there is ' +
          'nothing here to be safe about'
      ).toBe(true)

      const holders = await portListeners(port)
      expect(
        holders.map((h) => h.pid),
        'a connected client is not a port holder and must never be killed'
      ).not.toContain(client.pid)
      expect(holders.map((h) => h.pid)).toContain(process.pid)
    } finally {
      client.kill()
    }
  })
})

describe('reclaiming is refused by default', () => {
  it('leaves an occupied port alone and explains', async () => {
    const { port } = listen()
    const result = await reclaimPort(port, { force: false })
    expect(result.free).toBe(false)
    expect(result.message).toContain('--force')
    // Still serving: refusing must actually refuse.
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe('ok')
  })

  it('reports a free port as free', async () => {
    const { port, stop } = listen()
    stop()
    await new Promise((r) => setTimeout(r, 100))
    expect((await reclaimPort(port)).free).toBe(true)
  })
})

describe('port validation', () => {
  it('rejects what `parseInt` turns into NaN', () => {
    // `tjs-playground --port` with no value produced NaN, which flowed into the kill.
    expect(validPort(NaN)).toBe(false)
    expect(validPort(parseInt('', 10))).toBe(false)
    expect(validPort(0)).toBe(false)
    expect(validPort(70000)).toBe(false)
    expect(validPort(8699)).toBe(true)
  })

  it('reclaimPort refuses an invalid port rather than shelling out', async () => {
    const result = await reclaimPort(NaN as unknown as number)
    expect(result.free).toBe(false)
    expect(result.message).toContain('Invalid port')
  })
})
