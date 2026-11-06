<!--{"section": "ajs", "type": "example", "group": "api", "order": 8, "parent": "ajs-api.md"}-->
<!-- TODO review -->

# iTunes Search

A search agent: it takes a query, asks the public iTunes Search API, and returns a short, clean
list instead of the raw response. Trimming like this is most of the job when the result is
headed for a model's prompt, where every field costs tokens.

The agent talks to the network through `httpFetch({ url, responseType })`, AJS's HTTP call. It
is an atom, not a global: it works only for domains the host allows, and it returns the
response body, parsed. The run's arguments arrive as one object; a field the caller leaves out
takes the default written in the signature, so this agent run with no arguments searches for
`'Beatles'`.

```ajs:inline
function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(query) +
    '&limit=' +
    limit +
    '&media=music'
  // iTunes labels its JSON `text/javascript`
  let response = httpFetch({ url, responseType: 'json' })
  let tracks = response.results.map((x) => ({
    artist: x.artistName,
    track: x.trackName,
    album: x.collectionName,
  }))
  return { tracks }
}
```

Each record iTunes sends back has 31 fields. Here is part of one:

```text
{ wrapperType: 'track', kind: 'song', artistId: 136975, collectionId: 1441133100,
  trackId: 1441133277, artistName: 'The Beatles',
  collectionName: 'The Beatles 1967-1970 (The Blue Album)', trackName: 'Hey Jude',
  artistViewUrl: 'https://music.apple.com/us/artist/the-beatles/136975?uo=4',
  previewUrl: 'https://audio-ssl.itunes.apple.com/…', artworkUrl100: 'https://…',
  collectionPrice: 19.99, trackPrice: 1.29, releaseDate: '1968-08-26T12:00:00Z',
  trackTimeMillis: 431333, country: 'USA', currency: 'USD', primaryGenreName: 'Rock', … }
```

The agent keeps three of them (the catalog changes, so your list may differ):

```text
{ tracks: [
    { artist: 'The Beatles', track: 'Hey Jude',
      album: 'The Beatles 1967-1970 (The Blue Album)' },
    … four more
] }
```

This version trusts the response to have a `results` array. When it does not, the run fails;
[The gotcha](#the-gotcha) below shows how, and the fix.

## What to notice

- **`responseType: 'json'`.** Without it, `response` is a string and `response.results` is
  `undefined`. `httpFetch` parses the body on its own only when the server's `Content-Type`
  contains `application/json`, and iTunes sends `text/javascript`.
- **The caller's text is encoded.** A query is user text, and user text contains spaces, `&`
  and `#`: unencoded, `rock & roll` becomes a search for `rock`. `limit` needs no encoding
  because it is always a number: a default's value is also its type, so a run with
  `{ limit: '5&x=y' }` is refused before the agent starts (`Input validation failed: args do
  not match expected schema`). `encodeURIComponent` takes only strings, so encoding the number
  would fail anyway.
- **`map` with an arrow that returns an object.** The parentheses in `(x) => ({ … })` are needed
  for the same reason as in JavaScript: without them the braces are a function body.
- **The domain is allowed by the host.** The host gives each run a list of the domains
  `httpFetch` may reach, and the agent cannot reach any other URL. This doc site's runner allows
  three: `itunes.apple.com`, `api.open-meteo.com` and `api.github.com`. In your own host the
  list is empty until you set it (see [Running it from a host](#running-it-from-a-host)).

## A variation

Albums instead of tracks, with the year cut from the release date. iTunes writes `releaseDate`
as an ISO timestamp such as `'1959-08-17T07:00:00Z'`, so its first four characters are the year:

```ajs:inline
function searchAlbums({ artist = 'Miles Davis', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(artist) +
    '&entity=album&limit=' +
    limit
  let response = httpFetch({ url, responseType: 'json' })
  let albums = response.results.map((x) => ({
    album: x.collectionName,
    year: x.releaseDate ? x.releaseDate.slice(0, 4) : null,
  }))
  return { count: albums.length, albums }
}
```

The `releaseDate` check is the same lesson as the gotcha below, one level down: reading a
missing field gives `undefined`, but calling `.slice` on `undefined` ends the run, and nothing
promises that every record has the field.

## The gotcha

`httpFetch` returns the response body, not the status. When iTunes rejects a request, it
answers with HTTP 400 and a JSON body of a different shape, `{ errorMessage, queryParameters }`,
with no `results`. The built-in client hands you that body as if nothing were wrong, and the
agent never sees the 400. (A host that supplies its own `fetch` capability decides what an agent
gets back, and can include the status; see
[Capabilities and Custom Atoms](/ajs-capabilities/#writing-a-safe-fetch-capability).)

Reading the missing field is safe in AJS (`response.results` is `undefined`), but calling a
method on it is not. `undefined.map(…)` fails with

```text
map: items is not an array
```

In AJS the VM implements `map` itself, and its error calls the array `items`, so the message
does not say which `map` failed. The failure ends the run unless you catch it: the host gets back a
run whose `error` is set. A `try`/`catch` around the call catches it, and in
`catch (err)` the `err` is the message string itself, not an object with a `.message`
([Error Handling](/ajs-error-handling/) has the details).

When the API is not yours, check the shape before you map. This version takes the entity as an
argument; pass `{ entity: 'bogus' }` as the run's arguments to see the error branch:

```ajs:inline
function searchMusicSafely({ query = 'Beatles', entity = 'song', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(query) +
    '&entity=' +
    encodeURIComponent(entity) +
    '&limit=' +
    limit
  let response = httpFetch({ url, responseType: 'json' })
  if (response.errorMessage) {
    return { tracks: [], error: response.errorMessage }
  }
  // neither field: still an empty list, not a failed run
  let results = response.results ?? []
  let tracks = results.map((x) => ({
    artist: x.artistName,
    track: x.trackName,
    album: x.collectionName,
  }))
  return { tracks }
}
```

With the defaults it returns the tracks. With `entity: 'bogus'` it returns
`{ tracks: [], error: 'Invalid value(s) for key(s): [resultEntity]' }`. The `?? []` covers a
third case: a body with neither `errorMessage` nor `results` (an empty object, say) gives an
empty list rather than the `map` failure. The caller, or the model reading the result, gets a
clear answer either way instead of a failed run.

## Running it from a host

On this page the doc site is the host. In your own application you transpile the agent and run
it, giving the run its fetch allowlist in `context`:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(source, { atoms: vm.atoms }) // source: the agent above

const run = await vm.run(
  ast,
  { query: 'Miles Davis', limit: 3 },
  { fuel: 1000, context: { allowedFetchDomains: ['itunes.apple.com'] } }
)
// run.result → { tracks: [{ artist: 'Miles Davis', track: 'So What', album: 'Kind of Blue' }, …] }
// run.error  → set when the run failed (an AgentError with a message)
```

With no `allowedFetchDomains` and no `fetch` capability of your own, every URL is refused. The
[Weather API](/weather-api/) example shows that refusal, and
[Fetch policy](/ajs-host/#fetch-policy) covers the allowlist's syntax, methods, headers and
redirects.
