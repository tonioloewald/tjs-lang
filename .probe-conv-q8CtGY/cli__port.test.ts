/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

import { mkdtempSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import {
  portListeners,
  reclaimPort,
  validPort,
  isOurServer,
} from '/Users/tonioloewald/tjs-lang/src/cli/port'

const servers = []

const REPO_ROOT = join('/Users/tonioloewald/tjs-lang/src/cli', '..', '..')
export {}

const scratchDirs = []

/* line 38 */
function listenAsOurs() {
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
listenAsOurs.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'object',
      shape: {
        proc: {
          kind: 'null',
        },
        port: {
          kind: 'number',
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:38',
}

/* line 65 */
async function awaitListener(port) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if ((await portListeners(port)).length > 0) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}
awaitListener.__tjs = {
  params: {
    port: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'boolean',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:65',
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

/* line 91 */
function listen() {
  const server = Bun.serve({ port: 0, fetch: () => new Response('ok') })
  const handle = { stop: () => server.stop(true) }
  servers.push(handle)
  return { port: server.port, stop: handle.stop }
}
listen.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'object',
      shape: {
        port: {
          kind: 'number',
        },
        stop: {
          kind: 'any',
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:91',
}

describe('finding who holds a port', () => {
  it('finds a real listener', async () => {
    const { port } = listen()
    const holders = await portListeners(port)
    expect(holders.length).toBeGreaterThan(0)
    expect(holders.some((h) => h.pid === process.pid)).toBe(true)
  })
  it('does NOT call the test runner ours, even though it is bun', async () => {
    const { port } = listen()
    const holders = await portListeners(port)
    expect(holders.length).toBeGreaterThan(0)
    expect(holders.every((h) => h.ours)).toBe(false)
  })
  it('does not call a test runner ours just because it NAMES one of our entry points', () => {
    const argv = `bun test ${join(
      REPO_ROOT,
      'src/cli/playground.test.ts'
    )} ${join(REPO_ROOT, 'src/cli/port.test.ts')}`
    expect(isOurServer(argv)).toBe(false)
  })
  it('still identifies the real entry points (control)', () => {
    for (const argv of [
      `bun ${join(REPO_ROOT, 'bin/dev.ts')}`,
      `bun ${join(REPO_ROOT, 'src/cli/playground.ts')} --port 3000`,
      `node ${join(REPO_ROOT, 'dist/cli/playground.js')}`,
      'node /usr/local/bin/tjs-playground --port 3000',
    ]) {
      expect({ argv, ours: isOurServer(argv) }).toEqual({ argv, ours: true })
    }
  })
  it("does NOT identify a stranger's bin/dev.ts as ours", async () => {
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

    await new Promise((r) => setTimeout(r, 100))
    expect(await portListeners(port)).toEqual([])
  })
  it('does not report a CLIENT connected to the port', async () => {
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
    const { proc, port } = listenAsOurs()
    try {
      expect(await awaitListener(port), 'apparatus: helper not listening').toBe(
        true
      )
      const result = await reclaimPort(port, { force: false })
      expect(result.free).toBe(false)
      expect(result.message).toContain('--force')

      expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe(
        'ours'
      )
    } finally {
      proc.kill()
    }
  })
  it('refuses to signal the calling process, with --force', async () => {
    const { port } = listen()
    const result = await reclaimPort(port, { force: true })
    expect(result.free).toBe(false)
    expect(result.message).toContain('this very process')
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe('ok')
  })
  it('refuses a port held by a stranger, even with --force', async () => {
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
    expect(validPort(NaN)).toBe(false)
    expect(validPort(parseInt('', 10))).toBe(false)
    expect(validPort(0)).toBe(false)
    expect(validPort(70000)).toBe(false)
    expect(validPort(8699)).toBe(true)
  })
  it('reclaimPort refuses an invalid port rather than shelling out', async () => {
    const result = await reclaimPort(NaN)
    expect(result.free).toBe(false)
    expect(result.message).toContain('Invalid port')
  })
})
