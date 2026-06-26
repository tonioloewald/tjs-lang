/**
 * Introspection bridge — the runtime-truth half of the autocomplete plan.
 *
 * Chrome-console style: run the user's code in a hidden, disposable sandbox
 * iframe and keep a live `eval` handle into its module scope. Member completion
 * (`todoApp.items.` → the real array's members; `elements.` → tosijs's
 * proxy-generated creators) then comes from the ACTUAL values, not a static
 * model. The sandbox reuses the playground's run pipeline (transpile →
 * rewriteImports → buildIframeDoc → SW-served URL) so imports resolve the same
 * way the preview does.
 *
 * Lifecycle: `refresh(source)` rebuilds the sandbox (debounced by the caller, on
 * statement boundaries) and caches the last good one — if the source doesn't
 * transpile, the previous sandbox stays queryable. `members(path)` asks the
 * sandbox to introspect a value, with a short timeout so the editor never hangs.
 */
import { tjs } from '../../src/lang'
import { rewriteImports, registerIframeContent } from './imports'
import { buildIframeDoc } from './playground-shared'
import type { IntrospectMember } from '../../editors/introspect-value'

export class IntrospectionBridge {
  private iframe: HTMLIFrameElement
  private ready = false
  private lastSource: string | null = null
  private pending = new Map<number, (members: IntrospectMember[]) => void>()
  private nextId = 1
  private readonly onMessage: (e: MessageEvent) => void

  constructor() {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('tabindex', '-1')
    // Off-screen and inert, but still a real DOM so tosijs `elements` work.
    iframe.style.cssText =
      'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:0;visibility:hidden;pointer-events:none;'
    document.body.appendChild(iframe)
    this.iframe = iframe

    this.onMessage = (e: MessageEvent) => {
      const d = e.data
      if (!d || e.source !== iframe.contentWindow) return
      if (d.type === 'tjs-bridge-ready') {
        this.ready = true
      } else if (d.type === 'tjs-introspect-result') {
        const resolve = this.pending.get(d.id)
        if (resolve) {
          this.pending.delete(d.id)
          resolve(Array.isArray(d.members) ? d.members : [])
        }
      }
    }
    window.addEventListener('message', this.onMessage)
  }

  /**
   * Rebuild the sandbox from the current source. No-op if unchanged or if the
   * source doesn't transpile (keeps the last good sandbox). Caller should
   * debounce this to statement boundaries.
   */
  async refresh(source: string): Promise<void> {
    if (source === this.lastSource) return

    let code: string
    try {
      const result = tjs(source)
      code = result.code
    } catch {
      return // not transpilable yet — keep the last good sandbox
    }
    this.lastSource = source

    const rewritten = rewriteImports(code)
    const importStatements: string[] = []
    const body = rewritten.replace(
      /^import\s+(?:.*?from\s+)?['"][^'"]+['"];?\s*$/gm,
      (match) => {
        importStatements.push(match)
        return ''
      }
    )

    const doc = buildIframeDoc({
      cssContent: '',
      htmlContent: '',
      importMapScript: '',
      jsCode: body,
      importStatements,
      introspectionBridge: true,
    })

    this.ready = false
    // Reject in-flight queries against the old sandbox.
    for (const resolve of this.pending.values()) resolve([])
    this.pending.clear()

    const sessionId = `tjs-introspect-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
    const registered = await registerIframeContent(sessionId, doc)
    if (registered) {
      this.iframe.src = `/iframe/${sessionId}`
    } else {
      const blob = new Blob([doc], { type: 'text/html' })
      this.iframe.src = URL.createObjectURL(blob)
    }
  }

  /**
   * Introspect a dotted path in the live sandbox scope. Resolves to the value's
   * real members, or `undefined` if the sandbox isn't ready / times out (so the
   * caller can fall back to static completions).
   */
  members(
    path: string,
    timeoutMs = 500
  ): Promise<IntrospectMember[] | undefined> {
    const win = this.iframe.contentWindow
    if (!this.ready || !win) return Promise.resolve(undefined)

    const id = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(undefined)
      }, timeoutMs)
      this.pending.set(id, (members) => {
        clearTimeout(timer)
        resolve(members)
      })
      win.postMessage({ type: 'tjs-introspect', id, path }, '*')
    })
  }

  dispose(): void {
    window.removeEventListener('message', this.onMessage)
    this.iframe.remove()
    this.pending.clear()
  }
}
