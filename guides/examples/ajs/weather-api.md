<!--{"section": "ajs", "type": "example", "group": "api", "order": 7, "parent": "ajs-api.md"}-->

# Weather API

Fetch weather data (no API key needed)

<!-- TODO review -->
An agent that reaches out to the world: it calls a public API and returns the part of the answer
that matters. This one asks Open-Meteo for the current weather in San Francisco.

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

<!-- TODO review -->
## What to notice

- **The network is a capability, not a global.** There is no `fetch` in AJS. `httpFetch` is an
  atom, and it works only because the host allowed it: this page lets examples reach three
  domains (`api.open-meteo.com`, `itunes.apple.com` and `api.github.com`) and nothing else.
- **The response arrives as data.** A JSON response is parsed for you, and what the agent holds
  is a copy: plain objects and arrays, never a live `Response`.
- **A fetch costs more fuel than arithmetic** (5 units, plus the expressions around it). The
  agent's budget pays for its IO too, so a loop of fetches runs out like any other loop.

<!-- TODO review -->
## A variation

A three-day forecast, built with a template literal instead of concatenation:

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

<!-- TODO review -->
## The gotchas

- **A domain the host did not allow is an error**: `Fetch blocked: domain not in allowlist`. It
  is a failure of the world, not a bug, so `try`/`catch` can handle it.
- **An HTTP error status is not an error.** The built-in client returns whatever body the server
  sent, 404 or not. Check the body (`response.current_weather` is `undefined` if the request was
  wrong) before you use it.
- **In your own host**, give the run an allowlist (`context: { allowedFetchDomains: [...] }`) or
  your own `fetch` capability. With neither, every URL is refused. See [Safe Eval](/safe-eval/)
  for a complete, tested capability.
