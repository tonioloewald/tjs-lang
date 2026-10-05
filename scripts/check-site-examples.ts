#!/usr/bin/env bun
/**
 * Does every live example on the doc site RUN and SHOW something? (Virta #1833 — the bar for
 * retiring the old playground.)
 *
 *   bun run preview:site                      # in one terminal (serves :8797)
 *   bun scripts/check-site-examples.ts        # in another
 *   bun scripts/check-site-examples.ts --base https://tjs.tosijs.net --only hello-world
 *
 * Drives a HEADLESS Chrome over the DevTools protocol, one full page load per page. Headless,
 * because a visible browser window that is not in front is throttled: its timers stall and its
 * examples never finish, so an in-page loop measures the window manager, not the site.
 *
 * For each page it waits until every <tosi-example> shows output or test results (or a timeout),
 * then reports, per example: what it showed, and anything that looks like a failure. It also
 * collects uncaught exceptions and console errors per page. Exits 1 if any example is EMPTY,
 * reports an error, or a page threw.
 *
 * Pages are found from the built output (`.site-preview/` by default): every directory whose
 * index.html contains a fenced code block.
 */
import { spawn } from 'bun'
import { mkdtempSync, readdirSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const argv = process.argv.slice(2)
const opt = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : dflt
}
const BASE = opt('base', 'http://localhost:8797').replace(/\/$/, '')
const SITE_DIR = opt('dir', join(import.meta.dir, '..', '.site-preview'))
const ONLY = opt('only', '')
const TIMEOUT_MS = Number(opt('timeout', '20000'))
const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Example output that means the example FAILED, not that it ran. */
const FAILURE =
  /\b(Error|TypeError|ReferenceError|SyntaxError)\b|is not defined|is not a function|Cannot read|✗|✘|\bFAIL(ED)?\b|\d+ failed/

function pagesFromBuild(): string[] {
  if (ONLY) return ONLY.split(',')
  if (!existsSync(SITE_DIR)) {
    console.error(
      `✖ ${SITE_DIR} not found — run \`bun run preview:site\` first`
    )
    process.exit(1)
  }
  return readdirSync(SITE_DIR).filter((d) => {
    const f = join(SITE_DIR, d, 'index.html')
    return (
      existsSync(f) && /class="language-[a-z]+/.test(readFileSync(f, 'utf8'))
    )
  })
}

// ── a minimal CDP client ────────────────────────────────────────────────────
class Cdp {
  private id = 0
  private pending = new Map<number, (r: any) => void>()
  private listeners: ((m: any) => void)[] = []
  constructor(private ws: WebSocket) {
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data))
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m)
        this.pending.delete(m.id)
      } else for (const l of this.listeners) l(m)
    }
  }
  static async open(url: string) {
    const ws = new WebSocket(url)
    await new Promise((r, j) => {
      ws.onopen = r
      ws.onerror = j
    })
    return new Cdp(ws)
  }
  send(method: string, params: any = {}): Promise<any> {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((r) => this.pending.set(id, r))
  }
  on(l: (m: any) => void) {
    this.listeners.push(l)
  }
  async eval(expression: string) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return r.result?.result?.value
  }
  close() {
    this.ws.close()
  }
}

const SNAPSHOT = `(() => [...document.querySelectorAll('tosi-example')].map(e => ({
  // Text, or a rendered DOM (a canvas has no text): either is output a reader sees.
  preview: (e.querySelector('.preview')?.innerText || '').trim() || ([...(e.querySelector('.preview')?.children || [])].filter(c => c.tagName !== 'STYLE' && c.tagName !== 'PRE').map(c => '<' + c.tagName.toLowerCase() + '>').join('')),
  tests: (e.querySelector('[part=testResults]')?.innerText || '').trim(),
  console: (e.querySelector('.example-console .console-lines')?.innerText || '').trim(),
  inline: [...e.querySelectorAll('.tjs-test-summary, .test-fail')].map(x => x.textContent.trim()).join(' · '),
})))()`

async function main() {
  const pages = pagesFromBuild()
  const profile = mkdtempSync(join(tmpdir(), 'tjs-site-check-'))
  const chrome = spawn(
    [
      CHROME,
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--window-size=1400,1000',
      'about:blank',
    ],
    { stdout: 'ignore', stderr: 'ignore' }
  )
  try {
    // Chrome creates the file before it writes the port into it.
    const portFile = join(profile, 'DevToolsActivePort')
    let port = ''
    for (let i = 0; i < 100 && !/^\d+$/.test(port); i++) {
      await Bun.sleep(100)
      if (existsSync(portFile))
        port = readFileSync(portFile, 'utf8').split('\n')[0]
    }
    if (!/^\d+$/.test(port)) throw new Error('headless Chrome did not start')
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()
    const page = targets.find((t: any) => t.type === 'page')
    const cdp = await Cdp.open(page.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    let pageErrors: string[] = []
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown')
        pageErrors.push(
          m.params.exceptionDetails?.exception?.description?.split('\n')[0] ??
            m.params.exceptionDetails?.text
        )
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        pageErrors.push(
          'console.error: ' +
            m.params.args
              .map((a: any) => a.value ?? a.description ?? '')
              .join(' ')
              .split('\n')[0]
        )
    })

    let examples = 0
    const problems: string[] = []
    for (const slug of pages) {
      pageErrors = []
      await cdp.send('Page.navigate', { url: `${BASE}/${slug}/` })
      const t0 = Date.now()
      let snap: any[] = []
      while (Date.now() - t0 < TIMEOUT_MS) {
        await Bun.sleep(300)
        snap = (await cdp.eval(SNAPSHOT)) ?? []
        const settled = snap.every((e) => e.preview || e.tests)
        // An example whose output is its console never settles here; after a few seconds,
        // go and open its code panel (below) rather than waiting out the timeout.
        if (Date.now() - t0 > 2000 && settled) break
        if (Date.now() - t0 > 4000) break
      }
      // Since tosijs-ui 1.16.4 what an example LOGS goes to a Console tab in its code panel, not
      // the preview. For an example that showed nothing, open the panel and read the console.
      if (snap.some((e) => !e.preview && !e.tests)) {
        await cdp.eval(
          `[...document.querySelectorAll('tosi-example')].forEach(e => { if (!e.querySelector('.preview')?.innerText.trim() && !e.querySelector('[part=testResults]')?.innerText.trim()) e.querySelector('button[title="view/edit code"]')?.click() })`
        )
        const t1 = Date.now()
        while (Date.now() - t1 < TIMEOUT_MS) {
          await Bun.sleep(300)
          snap = (await cdp.eval(SNAPSHOT)) ?? []
          if (snap.every((e) => e.preview || e.tests || e.console || e.inline))
            break
        }
      }
      // An example whose only output is its `test` blocks shows nothing until a reader ticks
      // "run tests". Tick it, so the check covers the tests too.
      if (snap.some((e) => !e.preview && !e.tests && !e.console && !e.inline)) {
        await cdp.eval(
          `[...document.querySelectorAll('tosi-example')].forEach(e => { const box = e.querySelector('[part=testsCheckbox]'); if (box && !box.checked) box.click() })`
        )
        const t2 = Date.now()
        while (Date.now() - t2 < 8000) {
          await Bun.sleep(300)
          snap = (await cdp.eval(SNAPSHOT)) ?? []
          if (snap.every((e) => e.preview || e.tests || e.console || e.inline))
            break
        }
      }
      examples += snap.length
      if (argv.includes('--eval')) console.log(await cdp.eval(opt('eval', '')))
      if (argv.includes('--test-props'))
        console.log(
          await cdp.eval(
            `JSON.stringify([...document.querySelectorAll('tosi-example')].map(e => ({ checked: e.querySelector('[part=testsCheckbox]')?.checked, testResults: e.testResults, hidden: e.querySelector('[part=testResults]')?.hidden, display: getComputedStyle(e.querySelector('[part=testResults]')).display, html: e.querySelector('[part=testResults]')?.textContent.slice(0, 300) })))`
          )
        )
      if (argv.includes('--open-dump')) {
        await cdp.eval(
          `[...document.querySelectorAll('tosi-example button[title="view/edit code"]')].forEach(b => b.click())`
        )
        await Bun.sleep(2500)
        console.log(
          await cdp.eval(
            `(() => { const walk = (e, d) => d > 9 ? [] : [...(e.shadowRoot ? e.shadowRoot.children : []), ...e.children].flatMap(c => ['  '.repeat(d) + c.tagName.toLowerCase() + (typeof c.className == 'string' && c.className ? '.' + c.className.split(' ').join('.') : '') + (c.getAttribute('part') ? '[' + c.getAttribute('part') + ']' : '') + (c.getAttribute('title') ? '{' + c.getAttribute('title') + '}' : '') + (c.children.length ? '' : ' «' + (c.textContent || '').trim().slice(0, 80) + '»'), ...walk(c, d + 1)]); return [...document.querySelectorAll('tosi-example [part=codeEditors]')].map(e => walk(e, 0).filter(l => !/^\\s*(path|g|svg|style|span\\.cm|div\\.cm-line)/.test(l)).join('\\n')).join('\\n----\\n') })()`
          )
        )
      }
      if (argv.includes('--buttons'))
        console.log(
          await cdp.eval(
            `JSON.stringify([...document.querySelectorAll('tosi-example tosi-pocket-bar')].map(b => [...b.querySelectorAll('button, label'), ...(b.shadowRoot ? b.shadowRoot.querySelectorAll('button') : [])].map(x => ({ tag: x.tagName, title: x.title, aria: x.getAttribute('aria-label'), part: x.getAttribute('part'), cls: x.className }))))`
          )
        )
      if (argv.includes('--dump'))
        console.log(
          await cdp.eval(
            `(() => { const walk = (e, d) => d > 7 ? [] : [...(e.shadowRoot ? e.shadowRoot.children : []), ...e.children].flatMap(c => ['  '.repeat(d) + c.tagName.toLowerCase() + (typeof c.className == 'string' && c.className ? '.' + c.className.split(' ').join('.') : '') + (c.getAttribute('part') ? '[' + c.getAttribute('part') + ']' : '') + (c.children.length ? '' : ' «' + (c.textContent || '').trim().slice(0, 80) + '»'), ...walk(c, d + 1)]); return [...document.querySelectorAll('tosi-example')].map(e => walk(e, 0).join('\\n')).join('\\n----\\n') })()`
          )
        )
      const lines: string[] = []
      snap.forEach((e, i) => {
        const shown = [e.preview, e.tests, e.console, e.inline]
          .filter(Boolean)
          .join(' ⏐ ')
        const flat = shown.replace(/\s+/g, ' ').slice(0, 160)
        if (!shown) {
          lines.push(`  #${i} EMPTY`)
          problems.push(`${slug}#${i}: empty`)
        } else if (FAILURE.test(shown)) {
          lines.push(`  #${i} FAIL? ${flat}`)
          problems.push(`${slug}#${i}: ${flat}`)
        } else lines.push(`  #${i} ok   ${flat}`)
      })
      for (const err of new Set(pageErrors)) {
        lines.push(`  ! ${err}`)
        problems.push(`${slug}: ${err}`)
      }
      if (snap.length || pageErrors.length)
        console.log(
          `${slug} (${snap.length} examples, ${
            Date.now() - t0
          }ms)\n${lines.join('\n')}`
        )
    }
    cdp.close()
    console.log(
      `\n${pages.length} pages, ${examples} examples, ${problems.length} problems`
    )
    for (const p of problems) console.log(`  ✖ ${p}`)
    process.exitCode = problems.length ? 1 : 0
  } finally {
    chrome.kill()
    await chrome.exited
    rmSync(profile, { recursive: true, force: true })
  }
}

await main()
