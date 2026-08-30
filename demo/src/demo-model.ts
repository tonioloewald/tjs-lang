/**
 * The hosted demo model — client half.
 *
 * There is no API key in this file, and there must never be one. The key lives in the
 * `demoPredict` Cloud Function and is read from Secret Manager at call time; anything shipped
 * to the browser is public, and minification is not a control.
 *
 * The daily cap is likewise enforced in the function, inside a transaction. What lives here
 * is only what the UI needs to be pleasant: whether to offer the option at all, and how many
 * calls are left after the last one.
 */
import { httpsCallable, getFunctions } from 'firebase/functions'
import { getApp } from 'firebase/app'
import { getAuthInstance } from './firebase-auth'

export interface DemoPredictResult {
  text: string
  remaining: number
  model: string
}

/** Calls left today, as of the last response. `null` until we have asked once. */
let lastRemaining: number | null = null

export function demoCallsRemaining(): number | null {
  return lastRemaining
}

/**
 * Can this visitor use the demo model?
 *
 * Sign-in only — the quota is NOT checked here. A client-side quota check would be both
 * bypassable and wrong: it cannot see other tabs or other devices, and the function is the
 * only thing that knows the real count.
 */
export async function canUseDemoModel(): Promise<boolean> {
  const auth = getAuthInstance()
  return !!auth?.currentUser
}

export async function callDemoModel(prompt: string): Promise<string> {
  const auth = getAuthInstance()
  if (!auth?.currentUser) {
    throw new Error(
      'Sign in to use the demo model — it runs on our API key, so usage is capped per account.'
    )
  }

  const fn = httpsCallable<{ prompt: string }, DemoPredictResult>(
    getFunctions(getApp()),
    'demoPredict'
  )

  try {
    const { data } = await fn({ prompt })
    lastRemaining = data.remaining
    return data.text
  } catch (e: any) {
    // Callable errors arrive with a `code`; surface the function's own message, which says
    // which limit was hit and when it resets. Replacing it with a generic string is how a
    // 400 gets misread as a server being down — see docs/postmortem-ts-emitter.md §6.
    if (e?.code === 'functions/resource-exhausted') {
      lastRemaining = 0
    }
    throw new Error(e?.message || 'The demo model is unavailable right now.')
  }
}
