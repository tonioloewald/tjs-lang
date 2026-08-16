/**
 * Reclaiming a TCP port from a previous run of OUR server — and nothing else.
 *
 * Both dev servers opened with this:
 *
 *     const pids = (await $`lsof -ti:${port}`.quiet()).text().trim().split('\n')
 *     for (const pid of pids) await $`kill -9 ${pid}`.quiet()
 *
 * Three things are wrong with it, and they compound.
 *
 * **`lsof -ti:PORT` is not "who is listening on PORT".** Without `-sTCP:LISTEN` it matches
 * every socket touching that port in either direction, so an ordinary CLIENT connection
 * counts. Verified: Chrome's NetworkService helper, which had a tab open on the playground,
 * was matched FIRST and SIGKILLed. The tool announced this as "Killing existing process on
 * port 8699".
 *
 * **Nothing checked whose process it was.** A PID is not an identity. `tjs-playground
 * --port 3000` — and `--port` was unvalidated — would kill a consumer's unrelated dev
 * server with the same cheerful message.
 *
 * **`kill -9` skips the process's own cleanup.** SIGKILL is uncatchable: no flush, no
 * socket close, no temp-file removal. It is the last resort, not the opening move.
 *
 * So: listeners only, positively identified as one of OUR servers, terminated politely
 * first — and **refusing by default**. Reclaiming a port is a destructive act on something
 * the user did not ask us to touch; the default is to explain and stop, with `--force` to
 * proceed. The old behaviour was the reverse, undocumented, with no way to opt out.
 *
 * ## "Ours" means our command line, not "a JS runtime"
 *
 * The first version of this file defined ours as `/^(bun|node|deno)$/` — the process's
 * executable NAME. That is not an identity, it is an ecosystem: a consumer's Vite server,
 * their Next dev server, any `node server.js` all match it. `tjs-playground` is a published
 * bin, so `tjs-playground --port 3000 --force` would SIGTERM→SIGKILL a stranger's dev
 * server and report it as reclaiming its own. Reproduced live in review against a plain
 * `node` server, which was reported `ours: true` and terminated.
 *
 * So identity is the COMMAND LINE, matched against the entry points we actually ship
 * (`OUR_SERVERS` below). This is what the sibling implementation in `haltija` already did
 * — three independent copies of this logic exist across the sibling repos and this one had
 * regressed the check that matters most (see `UPSTREAM.md`).
 *
 * A name check is not merely weaker, it is wrong in the one direction that costs something:
 * over-matching kills a stranger's process, under-matching prints "choose another port".
 */
import { $ } from 'bun'
import { join } from 'node:path'

/**
 * Command-line markers for servers this package starts.
 *
 * Matched against the full argv of the listening process. Deliberately specific: a false
 * positive here is a SIGKILL delivered to somebody else's work, while a false negative is
 * a message telling the user to pick another port.
 */
export const OUR_SERVERS = /tjs-playground|cli\/playground|bin\/dev\.ts/

/**
 * The package root this process was loaded from — `src/cli/port.ts` → up two.
 *
 * Used to ANCHOR the match below. Without it `OUR_SERVERS` is a bare substring test against
 * the holder's full argv, and `bin/dev.ts` is about the least distinctive path in web
 * tooling. Reproduced: a listener at a stranger's `bin/dev.ts` under /tmp was identified
 * `ours: true`, SIGTERMed, and announced as our own server — which also falsifies the
 * shipped `--help` ("A port held by anything that is not one of our servers is never
 * touched, with or without --force").
 */
const OUR_ROOT = join(import.meta.dir, '..', '..')

/**
 * Is this command line one of OUR servers, started from THIS installation?
 *
 * Two ways to qualify, and both are deliberately narrow:
 *
 * 1. `tjs-playground` — our published bin NAME. Distinctive enough to stand alone, and it
 *    is what a global/npx install shows in argv, where no repo path appears at all.
 * 2. A generic entry path (`bin/dev.ts`, `cli/playground`) **only when the argv also
 *    references this package root**. Those names belong to half the tooling in existence;
 *    on their own they identify an ecosystem, not an instance — the same mistake as
 *    matching the executable name, one level further in.
 *
 * Deleting the `bin/dev.ts` alternative is NOT the fix: `bin/dev.ts` itself calls
 * `reclaimPort(…, { force: true })`, so the dev server must still be able to reclaim from a
 * previous run of itself.
 */
export function isOurServer(args: string): boolean {
  // No `/` inside a character class here, deliberately: an unescaped one ends the regex
  // literal, and the resulting parse error surfaced 145 lines away as "unterminated
  // template literal" — a literal ending early, in the file about not being fooled by
  // literals. `\S*` covers any leading path and needs no class at all.
  if (/(^|\s)\S*tjs-playground(\s|$)/.test(args)) return true
  return OUR_SERVERS.test(args) && args.includes(OUR_ROOT)
}

export interface PortHolder {
  pid: number
  command: string
  /** Full argv, which is what identity is decided on. */
  args: string
  /** True when the command line matches one of OUR server entry points. */
  ours: boolean
}

/** Processes LISTENING on `port` (never mere clients), with their command names. */
export async function portListeners(port: number): Promise<PortHolder[]> {
  let pids: string[]
  try {
    // `-sTCP:LISTEN` is the whole point: without it a browser tab connected to the port
    // is indistinguishable from the server serving it.
    const out = await $`lsof -tiTCP:${port} -sTCP:LISTEN`.quiet()
    pids = out.text().trim().split('\n').filter(Boolean)
  } catch {
    return [] // lsof exits non-zero when nothing matches
  }

  const holders: PortHolder[] = []
  for (const raw of pids) {
    const pid = Number(raw)
    if (!Number.isInteger(pid) || pid <= 1) continue
    let command: string
    let args: string
    try {
      command = (await $`ps -p ${pid} -o comm=`.quiet()).text().trim()
      // The full argv, because the executable name cannot distinguish our server from
      // anyone else's. `ps -o args=` is the portable spelling on macOS and Linux alike.
      args = (await $`ps -p ${pid} -o args=`.quiet()).text().trim()
    } catch {
      continue // exited between lsof and ps
    }
    const base = command.split('/').pop() ?? command
    holders.push({ pid, command: base, args, ours: isOurServer(args) })
  }
  return holders
}

/** A port number that could plausibly be ours to bind. */
export function validPort(port: unknown): port is number {
  return (
    Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536
  )
}

export interface ReclaimResult {
  free: boolean
  /** Human-readable reason when `free` is false — print it and exit. */
  message?: string
}

/**
 * Make `port` available, or explain why we won't.
 *
 * @param force reclaim a port held by one of OUR servers (see `OUR_SERVERS` — identity is
 *   the command line, not the executable name). Without it, an occupied port is
 *   reported and left alone — the caller should exit rather than fight over it.
 */
export async function reclaimPort(
  port: number,
  { force = false, label = 'server' }: { force?: boolean; label?: string } = {}
): Promise<ReclaimResult> {
  if (!validPort(port)) {
    return { free: false, message: `Invalid port: ${String(port)}` }
  }

  const holders = await portListeners(port)
  if (holders.length === 0) return { free: true }

  // Never signal ourselves. `portListeners` deliberately reports the calling process when
  // it is genuinely listening — that is honest, and a test pins it — but a reclaim that
  // signals its own pid is a self-inflicted SIGKILL, and no --force can mean that.
  const self = holders.find((h) => h.pid === process.pid)
  if (self) {
    return {
      free: false,
      message: `Port ${port} is held by this very process (pid ${self.pid}).`,
    }
  }

  const foreign = holders.filter((h) => !h.ours)
  if (foreign.length > 0) {
    // Never, under any flag. `--force` means "reclaim MY stale server", not "kill whatever
    // is in the way" — the user cannot consent to killing a process they don't know about.
    return {
      free: false,
      message:
        `Port ${port} is held by ${foreign
          .map((h) => `${h.command} (pid ${h.pid})`)
          .join(', ')}, which is not a ${label} of ours.\n` +
        `Refusing to touch it. Choose another port with --port.`,
    }
  }

  if (!force) {
    return {
      free: false,
      message:
        `Port ${port} is already in use by ${holders
          .map((h) => `${h.command} (pid ${h.pid})`)
          .join(', ')}.\n` +
        `Re-run with --force to stop it, or pick another port with --port.`,
    }
  }

  for (const { pid, command } of holders) {
    // stderr, not stdout. This is a receipt for a destructive act, and stdout belongs to
    // whatever the CLI is actually producing — a `tjs ... | jq` pipeline should not have
    // "Stopping bun (pid 1234)…" spliced into its JSON. Every other message this module
    // emits is already a returned string the caller prints; this one fires mid-loop, so
    // it is the one place the channel had to be chosen deliberately.
    console.error(`Stopping ${command} (pid ${pid}) on port ${port}…`)
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      continue // already gone
    }
    // Grace before force. A server that handles SIGTERM gets to close its sockets; one
    // that ignores it still loses the port, just not before it had the chance.
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      try {
        process.kill(pid, 0) // signal 0 = existence check
      } catch {
        break // exited cleanly
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    try {
      process.kill(pid, 0)
      process.kill(pid, 'SIGKILL')
    } catch {
      // gone, which is the good case
    }
  }

  const still = await portListeners(port)
  return still.length === 0
    ? { free: true }
    : { free: false, message: `Port ${port} is still held after SIGKILL.` }
}
