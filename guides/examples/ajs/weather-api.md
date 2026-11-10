<!--{"section": "ajs", "type": "example", "group": "api", "order": 7, "parent": "ajs-api.md"}-->
<!-- TODO review -->

# Weather API

An agent that reaches out to the world: it calls a public API and returns the part of the answer
that matters. This one asks Open-Meteo, which needs no API key, for the current weather in San
Francisco.

Four words recur below. An **agent** is the AJS program. The **host** is the program that runs it
in an `AgentVM` and decides what it may touch. An **atom** is a built-in operation the VM provides,
such as `httpFetch`. A **capability** is a piece of IO the host hands the run (a `fetch`, a
store, a model); with none, the agent cannot reach anything outside the VM. **Fuel** is the
agent's budget of work. [Embedding the AJS VM](/ajs-host/) covers all of them in detail.

```ajs:inline
function getWeather({ lat = 37.7749, lon = -122.4194 }) {
  let url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current_weather=true'
  let response = httpFetch({ url })
  let weather = response.current_weather
  return { weather }
}
```

Running it returns something like this (your numbers will differ):

```text
{ weather: { time: '2026-11-06T18:15', interval: 900, temperature: 14.3,
             windspeed: 2.4, winddirection: 101, is_day: 1, weathercode: 3 } }
```

`weathercode` is a WMO weather code (3 means overcast), and `interval` is how many seconds the
reading covers. The agent wraps the reading in an object because an agent's entry function must
return an object: `return 14.3` ends the run with `Agent must return an object, got number`.
Naming the field (`{ weather }`) also tells the caller what it got.

To get London instead, call the agent with `{ lat: 51.5, lon: -0.12 }` as its arguments. In your
own host they are the second argument of `vm.run` (see the host code at the end of this page).

## What to notice

- **The network is a capability, not a global.** There is no `fetch` in AJS. The `httpFetch` atom
  can reach only what the host allows. This page allows three domains (`api.github.com`,
  `itunes.apple.com` and `api.open-meteo.com`) so its examples work. That list belongs to this
  page, not to the VM: **in your own host, nothing is allowed until you say so.**
- **The atom takes named inputs.** `httpFetch({ url })` is shorthand for `httpFetch({ url: url })`;
  `httpFetch(url)` (refused) does not get past the transpiler.
- **The response arrives as data.** The agent gets the response body, never a live `Response`,
  and never the status code or the headers. A JSON body (by its `Content-Type`) is parsed into
  plain objects and arrays; any other body arrives as a string. (A redirect is the one exception:
  it is not followed, and comes back as `{ redirect: true, status, location }`.)
- **A fetch costs more fuel than arithmetic.** `httpFetch` costs 5 fuel; each expression node
  costs 0.01, so this run uses between 6 and 7. A run gets 1000 fuel unless the host passes
  `fuel` to `vm.run` (this page gives each example 10,000), so a loop of fetches runs out like any
  other loop. Fuel counts work, not waiting: the time a request spends on the network is bounded
  by the atom's own timeout (30 seconds) and by the run's `timeoutMs` option, which defaults to
  at least a minute.

## A variation

A three-day forecast. The URL is long, so it is easier to read as a template literal; AJS
accepts both a template and `+` concatenation, as long as the pieces are strings or numbers.

```ajs:inline
function forecast({ lat = 37.7749, lon = -122.4194 }) {
  let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`
  let response = httpFetch({ url })
  let daily = response.daily
  return {
    days: daily.time,
    highs: daily.temperature_2m_max,
    lows: daily.temperature_2m_min,
  }
}
```

Open-Meteo returns each daily field as a parallel array, so the agent passes the three arrays
through as they are. The result looks like this:

```text
{ days: ['2026-11-06', '2026-11-07', '2026-11-08'],
  highs: [20.5, 19.5, 20], lows: [10, 10.8, 13.3] }
```

## The gotchas

**An HTTP error status is not an error.** The built-in client returns whatever body the server
sent, 400 or not, and the agent never sees the status code. Open-Meteo answers a bad request
with `{ error: true, reason: '…' }` and no weather, so check the body before you use it. The
default latitude here is deliberately out of range, to trigger that answer:

```ajs:inline
function getWeatherChecked({ lat = 999, lon = 0 }) {
  let url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current_weather=true'
  let response = httpFetch({ url })
  if (typeof response === 'string' || response.error) {
    return { error: response.reason ?? response }
  }
  return { weather: response.current_weather }
}
```

This returns `{ error: 'Latitude must be in range of -90 to 90°. Given: 999.0.' }`. Without the
check the agent would return `{ weather: undefined }` and nothing would say why. The
`typeof response === 'string'` test catches an error page that is not JSON (an HTML 502 from a
proxy, say), which arrives as a string with no `error` field. A host that wants agents to see
status codes supplies its own `fetch` capability and returns them as part of the data.

**A domain the host did not allow is an error you can catch.** Errors caused by the outside
world (a blocked domain, a failed request, a timeout) can be caught with `try`/`catch`. Errors
that mean the agent itself is wrong, such as calling an atom with input it does not accept, end
the run and cannot be caught; so does running out of fuel or time.
[Catchable failures and run-ending refusals](/ajs-host/#catchable-failures-and-run-ending-refusals)
explains the split.

```ajs:inline
function tryElsewhere() {
  try {
    httpFetch({ url: 'https://example.com/' })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e }
  }
}
```

On this page that returns
`{ ok: false, error: 'Fetch blocked: domain not in allowlist. Allowed: api.github.com, itunes.apple.com, api.open-meteo.com' }`.
Unlike JavaScript, `e` is the message string itself, not an `Error` object, so use `e`, not
`e.message` (which is `undefined`).

Without the `try`, `vm.run` does not throw. It resolves with `error` set to an `AgentError` whose
`message` is that same text (and `op` is `httpFetch`), and `result` holds the same error.

**In your own host, nothing is allowed until you say so.** Pass the allowlist in the `context`
run option:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(source, { atoms: vm.atoms }) // source: the getWeather agent above

const run = await vm.run(ast, { lat: 51.5, lon: -0.12 }, {
  context: { allowedFetchDomains: ['api.open-meteo.com'] },
})
if (run.error) console.log(run.error.message)
else console.log(run.result.weather.temperature)
```

With no allowlist and no `fetch` capability, every URL is refused
(`Fetch blocked: no allowedFetchDomains configured`). The built-in client is meant for
demonstrations; a real deployment supplies its own `fetch` capability,
`capabilities: { fetch: async (url, init) => body }`, which receives the admitted request and
returns the response body as plain data. The [fetch policy](/ajs-host/#fetch-policy) section of
the host chapter covers the allowlist's syntax, methods, headers and redirects;
[Writing a safe fetch capability](/ajs-capabilities/#writing-a-safe-fetch-capability) and
[Safe Eval](/safe-eval/#nothing-reaches-out-unless-you-allow-it) each have a complete, tested
one.
