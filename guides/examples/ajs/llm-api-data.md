<!--{"section": "ajs", "type": "example", "group": "featured", "order": 13, "requiresApi": true, "parent": "ajs-featured.md"}-->

# LLM + API Data

LLM analyzes API data (requires llm capability)

<!-- TODO review -->
The shape of a real agent: fetch facts from an API, let a model reason over them, and return a
structured answer. Here the facts are iTunes search results and the question is which of them are
cover versions. It needs an LLM, so on this site it prints a message instead of running; run it
locally with the host from [LLM Chat](/llm-chat/).

```ajs:inline
function findCovers({ song = 'Yesterday', artist = 'Beatles' }) {
  // Search iTunes for the song
  let query = song + ' ' + artist
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(query) +
    '&limit=25&media=music'
  // iTunes serves JSON as `text/javascript`, so ask for JSON explicitly.
  let response = httpFetch({ url, responseType: 'json' })

  // Format results for LLM analysis
  let results = response.results || []
  let tracks = results.map(
    (x) =>
      '"' + x.trackName + '" by ' + x.artistName + ' (' + x.collectionName + ')'
  )
  let trackList = tracks.join('\n')

  // Schema.response from example - much cleaner!
  let schema = Schema.response('cover_versions', {
    covers: [{ track: '', artist: '', album: '' }],
  })

  let prompt =
    'Search results for "' +
    song +
    '" by ' +
    artist +
    ':\n\n' +
    trackList +
    '\n\nList cover versions (tracks NOT by ' +
    artist +
    ').'

  let llmResponse = llmPredict({ prompt, options: { responseFormat: schema } })
  let parsed = JSON.parse(llmResponse)
  return { originalArtist: artist, song, covers: parsed.covers }
}
```

<!-- TODO review -->
## What to notice

- **The agent does the boring part itself.** Fetching, trimming 25 results to one line each, and
  joining them is plain code: cheap, deterministic, and metered. The model is asked only the
  question that needs judgment.
- **The model sees text, the program gets data.** The prompt is a string the agent built; the
  answer comes back in a declared shape (`Schema.response`) and is parsed into an object the
  host can use without reading prose.
- **Two capabilities.** `fetch` (here limited to the domains the host allows) and `llm`. The
  agent cannot reach anything else.

<!-- TODO review -->
## A variation

Before you pay for a model call, check that there is something to ask about:

```javascript
function findCoversCheaply({ song = 'Yesterday', artist = 'Beatles' }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(song) +
    '&limit=25&media=music'
  let response = httpFetch({ url, responseType: 'json' })
  let results = response.results || []
  let others = results.filter((x) => !x.artistName.includes(artist))
  if (others.length == 0) {
    return { song, covers: [], note: 'no other artists found; model not asked' }
  }
  let lines = others.map((x) => x.trackName + ' by ' + x.artistName)
  let prompt =
    'Which of these are covers of "' + song + '" by ' + artist + '?\n' + lines.join('\n')
  let answer = llmPredict({ prompt })
  return { song, candidates: others.length, answer }
}
```

The filter alone answers the easy cases. The model call (100 units of fuel, and whatever it
costs you) happens only when it can add something.

<!-- TODO review -->
## The gotcha

Earlier versions of this example fetched without `responseType: 'json'`. iTunes labels its JSON
`text/javascript`, so the response arrived as a string, `response.results || []` was always
empty, and the model was asked to find covers in an empty list. It answered anyway. Models fill
gaps, so check that the data is really there before you trust what was said about it.
