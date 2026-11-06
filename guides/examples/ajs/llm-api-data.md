<!--{"section": "ajs", "type": "example", "group": "featured", "order": 13, "requiresApi": true, "parent": "ajs-featured.md"}-->
<!-- TODO review -->

# LLM + API Data

The shape of a real agent: fetch facts from an API, let a model reason over them, and return a
structured answer. Here the facts are iTunes search results and the question is which of them are
cover versions. It needs an LLM, so on this site it prints a message instead of running; run it
locally with the host (the JavaScript program that runs the VM) shown below.

```ajs:inline
function findCovers({ song = 'Yesterday', artist = 'Beatles' }) {
  // Search iTunes for the song
  let term = encodeURIComponent(song + ' ' + artist)
  let url = `https://itunes.apple.com/search?term=${term}&limit=25&media=music`
  // iTunes serves JSON as `text/javascript`, so ask for JSON explicitly.
  let response = httpFetch({ url, responseType: 'json' })
  let results = response.results || []

  // Nothing found (or the body was not read as JSON): say so, and skip the model.
  if (results.length == 0) {
    return { originalArtist: artist, song, covers: [], note: 'no search results' }
  }

  // One line per track: all the model needs to see
  let tracks = results.map(
    (x) => `"${x.trackName}" by ${x.artistName} (${x.collectionName || 'single'})`
  )
  let trackList = tracks.join('\n')

  // The shape the answer must come back in, written as an example
  let schema = Schema.response('cover_versions', {
    covers: [{ track: '', artist: '', album: '' }],
  })

  let prompt = `Search results for "${song}" by ${artist}:\n\n${trackList}\n\nList cover versions (tracks NOT by ${artist}).`

  let reply = llmPredict({ prompt, options: { responseFormat: schema } })
  let parsed = JSON.parse(reply)
  if (!Array.isArray(parsed.covers)) {
    return { originalArtist: artist, song, covers: [], note: 'the model did not list covers' }
  }
  return { originalArtist: artist, song, covers: parsed.covers }
}
```

`httpFetch`, `llmPredict` and `Schema` need no import: they are built into AJS. `httpFetch` and
`llmPredict` are atoms, the VM's operations, and an atom takes its inputs by name in a single
object (`httpFetch({ url })`, never `httpFetch(url)`).

## What to notice

- **The agent does the boring part itself.** Fetching, trimming 25 results to one line each, and
  joining them is plain code: cheap, deterministic, and paid for in fuel, the VM's budget for
  work (see below). The model is asked only the question that needs judgment.
- **It checks for data before it asks.** If the search found nothing, the agent returns at once
  and no model call is made. Without that check the model would be asked about an empty list,
  and it would answer anyway (see the gotcha below).
- **The model sees text, the program gets data.** The prompt is a string the agent built. The
  answer comes back in a declared shape: `Schema.response(name, example)` turns an example
  object into an OpenAI-style `response_format` (a strict JSON Schema), the host hands it to the
  model server, and `JSON.parse` turns the reply into an object the agent (and whoever receives
  its result) can use without reading prose.
- **`llmPredict` returns a string**, even with a response format. That is why the agent parses
  it. If the reply is not JSON at all, `JSON.parse` fails and the run ends with that error. If it
  is JSON without a `covers` list, the `Array.isArray` check returns an empty answer with a note
  rather than `covers: undefined`.
- **Two grants, and nothing else.** The `llm` capability, and network access limited to the
  domains in `allowedFetchDomains`. The agent cannot reach anything the host did not grant.

## Running it locally

The host supplies an `llm` capability: an object whose `predict(prompt, options)` returns the
model's reply as a string. This one talks to any OpenAI-compatible server (LM Studio's default
port here); [LLM Chat](/llm-chat/) explains it and a fuller version.

The network is not passed as a capability. `httpFetch` uses the VM's built-in fetch client,
which fetches only from the domains in `context.allowedFetchDomains`. Without that list (or a
`fetch` capability of the host's own, which then replaces the built-in client) every request is
refused: `Fetch blocked: no allowedFetchDomains configured`.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const llm = {
  async predict(prompt, options = {}) {
    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-model',
        messages: [{ role: 'user', content: prompt }],
        response_format: options.responseFormat,
      }),
    })
    if (!res.ok) throw new Error(`model server answered ${res.status}`)
    const data = await res.json()
    return data.choices[0].message.content ?? ''
  },
}

const { ast } = transpile(source) // source: the agent above, as a string
const run = await new AgentVM().run(
  ast,
  { song: 'Yesterday', artist: 'Beatles' },
  {
    fuel: 1000,
    capabilities: { llm },
    context: { allowedFetchDomains: ['itunes.apple.com'] },
    quotas: { llmPredict: 1 },
  }
)
console.log(run.result ?? run.error?.message)
console.log(run.fuelUsed) // about 123
```

**Fuel** is the VM's budget for work. Every operation costs some, and when the budget is used up
the run stops with an error. `run.fuelUsed` reports what was spent: a little over 120 units
here, 100 for the model call, 5 for the fetch, and the rest for building the prompt. The budget
of 1000 leaves room for a longer result list without letting a runaway agent go on for long.

**`quotas`** caps how many times an atom may run. Fuel counts the VM's work, so it cannot say "at
most one model call", and model calls are what cost money. With `quotas: { llmPredict: 1 }` a
second call would fail with `Quota exceeded for 'llmPredict': 1 call allowed`.

## A variation

This version searches for the song alone, drops tracks by the original artist in code, and asks
the model only if anything is left:

```ajs:inline
function findCoversCheaply({ song = 'Yesterday', artist = 'Beatles' }) {
  let term = encodeURIComponent(song)
  let url = `https://itunes.apple.com/search?term=${term}&limit=25&media=music`
  let response = httpFetch({ url, responseType: 'json' })
  let results = response.results || []
  let others = results.filter((x) => !x.artistName.includes(artist))
  if (others.length == 0) {
    return { song, covers: [], note: 'no other artists found; model not asked' }
  }
  let lines = others.map((x) => `${x.trackName} by ${x.artistName}`)
  let schema = Schema.response('cover_versions', {
    covers: [{ track: '', artist: '' }],
  })
  let prompt = `Which of these are covers of "${song}" by ${artist}?\n${lines.join('\n')}`
  let reply = llmPredict({ prompt, options: { responseFormat: schema } })
  let parsed = JSON.parse(reply)
  if (!Array.isArray(parsed.covers)) {
    return { song, covers: [], note: 'the model did not list covers' }
  }
  return { song, covers: parsed.covers }
}
```

When nobody else recorded the title, the filter answers on its own: the model is never asked
and the run costs about 8 units of fuel instead of 123. For a popular title that rarely happens.
A search for "Yesterday" returns 22 tracks by other artists, so the model is asked anyway. Note
too that `includes` is case-sensitive and literal: it removes "The Beatles" but keeps "Paul
McCartney", and the search also returns unrelated songs with the same title. Telling those apart
is the judgment left to the model.

## The gotcha: forget `responseType` and the model answers anyway

Remove `responseType: 'json'` from the fetch and nothing fails. iTunes labels its JSON
`text/javascript`, so the built-in client returns the body as a string. A string has no
`.results` property, so `response.results` is `undefined`, `response.results || []` is an empty
list, and without the `results.length == 0` check the prompt the model receives is:

```text
Search results for "Yesterday" by Beatles:



List cover versions (tracks NOT by Beatles).
```

The model is asked to find covers in an empty list, and it answers anyway. Models fill gaps.
That is why the agent checks that the data is really there before it asks: with the check, the
same mistake returns `{ covers: [], note: 'no search results' }` and costs no model call.
