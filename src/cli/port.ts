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
 * So: listeners only, positively identified as a JS runtime, terminated politely first —
 * and **refusing by default**. Reclaiming a port is a destructive act on something the user
 * did not ask us to touch; the default is to explain and stop, with `--force` to proceed.
 * The old behaviour was the reverse, undocumented, with no way to opt out.
 */
import { $ } from 'bun'

/** Runtimes our own servers can be running under. Anything else is not ours to kill. */
const OURS = /^(bun|node|deno)$/

export interface PortHolder {
  pid: number
  command: string
  /** True when the process is a JS runtime, i.e. plausibly a previous run of ours. */
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
    try {
      command = (await $`ps -p ${pid} -o comm=`.quiet()).text().trim()
    } catch {
      continue // exited between lsof and ps
    }
    const base = command.split('/').pop() ?? command
    holders.push({ pid, command: base, ours: OURS.test(base) })
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
 * @param force reclaim a port held by a JS runtime. Without it, an occupied port is
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
    console.log(`Stopping ${command} (pid ${pid}) on port ${port}…`)
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
