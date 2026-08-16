/**
 * The port helper never kills a process that is not one of OUR servers, and never kills a
 * client.
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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { portListeners, reclaimPort, validPort } from './port'

const servers: Array<{ stop: () => void }> = []

/** This package's root — the anchor `isOurServer` matches against. */
const REPO_ROOT = join(import.meta.dir, '..', '..')

/** Scratch dirs created under the repo root; removed in afterEach, never committed. */
const scratchDirs: string[] = []

/**
 * A listener in a SEPARATE process whose argv identifies it as one of ours.
 *
 * Identity is the command line, so the only honest way to test a positive match is to run
 * a real process at a path that matches — here `.../bin/dev.ts`, one of the entry points
 * `OUR_SERVERS` names. Asserting on a hand-built PortHolder object would test the shape of
 * a literal, not the identification.
 */
function listenAsOurs(): { proc: Bun.Subprocess; port: number } {
  // UNDER THE PACKAGE ROOT, not `tmpdir()`.
  //
  // "Ours" is now anchored: a generic entry path like `bin/dev.ts` only counts when the
  // argv also references this installation. The previous version of this helper wrote to
  // `/tmp/tjs-port-*/bin/dev.ts`, so it was satisfied by a file that has nothing to do
  // with us — which is exactly the hole being closed. A positive control that a stranger's
  // process can satisfy is not a positive control.
  const dir = mkdtempSync(join(REPO_ROOT, '.tmp-port-test-'))
  scratchDirs.push(dir)
  const binDir = join(dir, 'bin')
  mkdirSync(binDir, { recursive: true })
  const script = join(binDir, 'dev.ts')
  const port = 18700 + (Math.floor(process.uptime() * 1000) % 4000)
  writeFileSync(
    script,
    `Bun.serve({ port: ${port}, fetch: () => new Response('ours') })\n` +
      `await new Promise((r) => setTimeout(r, 30000))\n`
  )
  const proc = Bun.spawn(['bun', script], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  return { proc, port }
}

/** Wait until something is LISTENING on `port`, or give up. */
async function awaitListener(port: number): Promise<boolean> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if ((await portListeners(port)).length > 0) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

afterEach(() => {
  for (const d of scratchDirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* already gone */
    }
  }
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
  it('finds a real listener', async () => {
    const { port } = listen()
    const holders = await portListeners(port)
    expect(holders.length).toBeGreaterThan(0)
    expect(holders.some((h) => h.pid === process.pid)).toBe(true)
  })

  it('does NOT call the test runner ours, even though it is bun', async () => {
    // This assertion used to read the other way, with the comment "The test process IS
    // bun, so this is genuinely one of ours" — which is precisely the reasoning that made
    // `tjs-playground --port 3000 --force` able to SIGKILL a stranger's Vite server. A JS
    // runtime is an ecosystem, not an identity. `bun test …` is not one of our servers.
    const { port } = listen()
    const holders = await portListeners(port)
    expect(holders.length).toBeGreaterThan(0)
    expect(holders.every((h) => h.ours)).toBe(false)
  })

  it("does NOT identify a stranger's bin/dev.ts as ours", async () => {
    // The anchor. `OUR_SERVERS` matched `bin/dev.ts` anywhere on disk, which is about the
    // least distinctive path in web tooling — reproduced live: a listener at a stranger's
    // `bin/dev.ts` under /tmp came back `ours: true`, and `--force` would have SIGTERMed
    // it and announced it as our own server. That also falsified the shipped `--help`.
    const dir = mkdtempSync(join(tmpdir(), 'stranger-'))
    try {
      mkdirSync(join(dir, 'bin'), { recursive: true })
      const port = 18990
      writeFileSync(
        join(dir, 'bin', 'dev.ts'),
        `Bun.serve({ port: ${port}, fetch: () => new Response('stranger') })\n` +
          `await new Promise((r) => setTimeout(r, 30000))\n`
      )
      const proc = Bun.spawn(['bun', join(dir, 'bin', 'dev.ts')], {
        stdout: 'ignore',
        stderr: 'ignore',
      })
      try {
        expect(
          await awaitListener(port),
          'apparatus: stranger not listening'
        ).toBe(true)
        const holders = await portListeners(port)
        const them = holders.find((h) => h.pid === proc.pid)
        expect(them?.ours ?? 'not found').toBe(false)
        // And --force must leave it running.
        const r = await reclaimPort(port, { force: true })
        expect(r.free).toBe(false)
        expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe(
          'stranger'
        )
      } finally {
        proc.kill()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('DOES identify a real server of ours, by command line', async () => {
    // The positive control. Without it, defining `ours` as "never" would pass every other
    // test in this file and silently disable reclaiming altogether.
    const { proc, port } = listenAsOurs()
    try {
      expect(
        await awaitListener(port),
        'apparatus: the helper process never started listening'
      ).toBe(true)
      const holders = await portListeners(port)
      const mine = holders.find((h) => h.pid === proc.pid)
      expect(mine?.ours ?? 'not found').toBe(true)
    } finally {
      proc.kill()
    }
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
    // Needs a listener in ANOTHER process: reclaiming a port this very process holds is
    // refused earlier, by the self-pid guard, so a same-process listener would exercise
    // the wrong branch and never reach the --force message.
    const { proc, port } = listenAsOurs()
    try {
      expect(await awaitListener(port), 'apparatus: helper not listening').toBe(
        true
      )
      const result = await reclaimPort(port, { force: false })
      expect(result.free).toBe(false)
      expect(result.message).toContain('--force')
      // Still serving: refusing must actually refuse.
      expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe(
        'ours'
      )
    } finally {
      proc.kill()
    }
  })

  it('refuses to signal the calling process, with --force', async () => {
    // `portListeners` reports us when we really are listening, which is honest. Acting on
    // that would be a self-inflicted SIGKILL, and no flag can mean that.
    const { port } = listen()
    const result = await reclaimPort(port, { force: true })
    expect(result.free).toBe(false)
    expect(result.message).toContain('this very process')
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe('ok')
  })

  it('refuses a port held by a stranger, even with --force', async () => {
    // The finding that prompted the tightening: a plain `node` server was reported
    // `ours: true` and terminated. It is a JS runtime; it is not ours.
    const proc = Bun.spawn(
      [
        'node',
        '-e',
        `require('http').createServer((_q, s) => s.end('stranger')).listen(18999)` +
          `; setTimeout(() => {}, 30000)`,
      ],
      { stdout: 'ignore', stderr: 'ignore' }
    )
    try {
      expect(
        await awaitListener(18999),
        'apparatus: the stranger never started listening'
      ).toBe(true)
      const result = await reclaimPort(18999, { force: true })
      expect(result.free).toBe(false)
      expect(result.message).toContain('not a server of ours')
      expect(
        await (await fetch('http://localhost:18999/')).text(),
        'the stranger must still be running'
      ).toBe('stranger')
    } finally {
      proc.kill()
    }
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
