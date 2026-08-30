function __ub(v){try{if(v instanceof String)return String.prototype.valueOf.call(v);if(v instanceof Number)return Number.prototype.valueOf.call(v);if(v instanceof Boolean)return Boolean.prototype.valueOf.call(v)}catch{return v}return v};
const __ac=Object.create(null);function __proj(v){if(v===null||v===undefined||typeof v!=='object')return v;let k;try{k=v.constructor&&v.constructor.name}catch{return v}let f=k&&Object.prototype.hasOwnProperty.call(__ac,k)?__ac[k]:null;if(typeof f!=='function'){try{f=v.asCompared}catch{return v}}if(typeof f!=='function')return v;let p;try{p=f.call(v)}catch{return v}const t=typeof p;return p===null||p===undefined||t==='number'||t==='string'||t==='boolean'?p:v};
function TypeOf(v){return v===null?'null':typeof v};
function toBool(v){v=__proj(v);try{if(v instanceof Boolean)return Boolean(Boolean.prototype.valueOf.call(v));if(v instanceof Number)return Boolean(Number.prototype.valueOf.call(v));if(v instanceof String)return Boolean(String.prototype.valueOf.call(v))}catch(e){}return Boolean(v)};
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {TypeOf,toBool};
const __tjsToBool = __tjs.toBool; __tjs.toBool = function(v){ return __tjsToBool(__proj(v)) };
/*#
# Demo LLM — our key, their sign-in, a daily cap

The playground used to need the visitor to paste their own API key, or to be running LM Studio
locally. Both are a wall in front of "click run and see what TJS does", and keeping the local
path healthy has cost far more engineering time than a few thousand Flash Lite calls ever
will.

So the demo calls a cheap hosted model on OUR key. Three things make that safe to do:

1. **The key never leaves the server.** It is a Firebase secret, read inside the function. A
   key shipped to the browser is a key you have given away — the bundle is public, and
   "obfuscated" is not a control.
2. **Sign-in is required**, so usage attaches to an identity and an abuser can be cut off.
3. **The cap is enforced HERE, in a transaction.** A client-side limit is a suggestion; a
   read-then-write limit is a race that hands out extra calls under concurrency, which is
   exactly when you least want it to.

## The cap has two levels, deliberately

Per user per day, and a GLOBAL daily ceiling. Per-user alone is unbounded spend: it costs
nothing to create accounts, so `100 × unlimited users` is not a budget. The global cap is what
makes the worst case a number you can look at rather than a surprise on a card.

Both are conservative and meant to be raised once there is evidence about real usage. Neither
is a security boundary on its own — set a billing alert too.
*/

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

/*#
## Configuration

Kept together and named so they can be changed without reading the logic.
*/

/**
 * The key, read from Secret Manager at call time. Never bundled, never logged.
 *
 * NAME IS EXACT and must match the secret in the project — a mismatch fails the deploy with
 * `Secret … does not exist`, which is at least loud. Spelled `GEMINIA_…` deliberately,
 * because that is the secret that exists; it reads like a typo for `GEMINI_…` and is worth
 * a second look before this ships, but guessing the "corrected" name would break the deploy.
 */
const GEMINI_API_KEY = defineSecret('GEMINIA_API_SECRET')

/** Cheapest useful model. The demo runs short prompts; nothing here needs a large model. */
const MODEL = 'gemini-2.0-flash-lite'

/** Calls per signed-in user per UTC day. */
const DAILY_PER_USER = 100

/**
 * Calls across ALL users per UTC day.
 *
 * Accounts are free to create, so the per-user cap bounds one person and nothing else. This
 * is the number that bounds the bill.
 */
const DAILY_GLOBAL = 5000

/** Refuse a prompt longer than this outright — a demo does not need an essay. */
const MAX_PROMPT_CHARS = 8000

/**
 * UTC so the reset is the same instant for everyone, and testable without a timezone.
 *
 * `unsafe` because TJS rightly refuses bare `new Date()` — mutable and timezone-dependent.
 * Neither objection applies here: the instance is created, read once for its ISO date, and
 * dropped, and `toISOString` is UTC by definition. `now` is passed in rather than read, so
 * this stays a pure function of its argument and is testable without freezing a clock.
 */
function utcDay(now) {
  return        new Date(now).toISOString().slice(0, 10)
}
utcDay.__tjs = {
  "params": {
    "now": {
      "type": {
        "kind": "any"
      },
      "required": false
    }
  },
  "unsafe": true,
  "source": "demo-llm.tjs:74"
}

/*#
## Quota

One transaction, two counters. Returns the user's remaining allowance so the UI can show it
before the visitor runs out rather than after.

Exported for tests: the counting is the part worth testing, and it should be testable without
a network or a model.
*/
export async function claimQuota(db, uid, now, limits = {}) {
  const perUser = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(DAILY_PER_USER))(limits.perUser)
  const global = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(DAILY_GLOBAL))(limits.global)
  const day = utcDay(now)
  const userRef = db.collection('users').doc(uid).collection('usage').doc(`demo-${day}`)
  const globalRef = db.collection('demoUsage').doc(day)

  return db.runTransaction(async (tx) => {

    const userSnap = await tx.get(userRef)
    const globalSnap = await tx.get(globalRef)
    const used = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(((__tjs__t)=>__tjs.toBool(__tjs__t)?(userSnap.data().count):__tjs__t)(userSnap.exists))
    const globalUsed = ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(0))(((__tjs__t)=>__tjs.toBool(__tjs__t)?(globalSnap.data().count):__tjs__t)(globalSnap.exists))

    if (__tjs.toBool(used >= perUser)) {
      return { ok: false, reason: 'per-user', used, remaining: 0 }
    }
    if (__tjs.toBool(globalUsed >= global)) {

      return { ok: false, reason: 'global', used, remaining: perUser - used }
    }

    tx.set(
      userRef,
      { count: FieldValue.increment(1), day, updated: FieldValue.serverTimestamp() },
      { merge: true }
    )
    tx.set(globalRef, { count: FieldValue.increment(1) }, { merge: true })
    return { ok: true, used: used + 1, remaining: perUser - used - 1 }
  })
}
claimQuota.__tjs = {
  "params": {
    "db": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "uid": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "now": {
      "type": {
        "kind": "any"
      },
      "required": false
    },
    "limits": {
      "type": {
        "kind": "object",
        "shape": {}
      },
      "required": false,
      "default": {}
    }
  },
  "unsafe": true,
  "source": "demo-llm.tjs:87"
}

/*#
## The callable

`demoPredict({ prompt })` -> `{ text, remaining }`.

Errors are the standard callable codes so the client can tell them apart:
`unauthenticated` (sign in), `resource-exhausted` (cap reached), `invalid-argument` (bad
prompt), `internal` (upstream trouble).
*/
export const demoPredict = onCall(
  { secrets: [GEMINI_API_KEY], cors: true },
  async (request) => {
    if (__tjs.toBool(!__tjs.toBool(request.auth))) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to use the demo model. This keeps usage attributable and the cap enforceable.'
      )
    }
    const uid = request.auth.uid
    const prompt = ((__tjs__t)=>__tjs.toBool(__tjs__t)?(request.data.prompt):__tjs__t)(request.data)

    if (__tjs.toBool(((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(TypeOf(prompt) !== 'string'))(!__tjs.toBool(prompt)))) {
      throw new HttpsError('invalid-argument', 'prompt must be a non-empty string')
    }
    if (__tjs.toBool(prompt.length > MAX_PROMPT_CHARS)) {
      throw new HttpsError(
        'invalid-argument',
        `prompt is ${prompt.length} characters; the demo model accepts up to ${MAX_PROMPT_CHARS}`
      )
    }

    const db = getFirestore()

    const quota = await claimQuota(db, uid, Date.now())

    if (__tjs.toBool(!__tjs.toBool(quota.ok))) {
      throw new HttpsError(
        'resource-exhausted',
        __tjs.toBool(quota.reason === 'per-user')?(`Daily limit reached (${DAILY_PER_USER} calls). It resets at 00:00 UTC. Add your own API key in settings to keep going.`):('The demo model has hit its daily limit across all users. Try again tomorrow, or add your own API key in settings.')
      )
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY.value(),
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      }
    )

    if (__tjs.toBool(!__tjs.toBool(res.ok))) {

      const detail = await res.text().catch(() => '')
      console.error('demoPredict upstream error', res.status, detail.slice(0, 500))
      throw new HttpsError(
        'internal',
        `The demo model returned ${res.status}. ${detail.slice(0, 200)}`
      )
    }

    const data = await res.json()
    const text =
      ((__tjs__t)=>__tjs.toBool(__tjs__t)?__tjs__t:(''))(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.candidates[0].content.parts[0].text):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.candidates[0].content.parts[0]):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.candidates[0].content.parts):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.candidates[0].content):__tjs__t)(((__tjs__t)=>__tjs.toBool(__tjs__t)?(data.candidates[0]):__tjs__t)(data.candidates))))))

    return { text, remaining: quota.remaining, model: MODEL }
  }
)
