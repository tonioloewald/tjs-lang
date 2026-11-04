<!--{"section": "ajs", "type": "example", "group": "api", "order": 8, "parent": "ajs-api.md"}-->

# iTunes Search

Search Apple iTunes catalog

<!-- TODO review -->
A search agent: take a query, ask a catalog, and return a short, clean list instead of the raw
response. Trimming like this is most of the job when the result is headed for a model's prompt,
where every field costs tokens.

```ajs:inline
function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(query) +
    '&limit=' +
    limit +
    '&media=music'
  // iTunes serves JSON as `text/javascript`, so ask for JSON explicitly.
  let response = httpFetch({ url, responseType: 'json' })
  let tracks = response.results.map((x) => ({
    artist: x.artistName,
    track: x.trackName,
    album: x.collectionName,
  }))
  return { tracks }
}
```

<!-- TODO review -->
## What to notice

- **`responseType: 'json'`.** `httpFetch` parses the body as JSON when the server says it is
  JSON. iTunes labels its JSON `text/javascript`, so without the hint the agent would get a
  string, and `response.results` would be `undefined`.
- **`encodeURIComponent(query)`.** A query is user text, and user text contains spaces, `&` and
  `#`. Encode it, or `rock & roll` becomes a search for `rock`.
- **`map` with an arrow that returns an object.** The parentheses in `(x) => ({ … })` are needed
  for the same reason as in JavaScript.

<!-- TODO review -->
## A variation

Albums instead of tracks, with the year cut from the release date:

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
    year: x.releaseDate.slice(0, 4),
  }))
  return { count: response.resultCount, albums }
}
```

<!-- TODO review -->
## The gotcha

If the request fails, `response.results` is `undefined`, and `undefined.map(…)` is an error
(`map: items is not an array`, naming the atom's input, not your variable), which ends the run unless you catch it. Reading the missing
field is safe; calling a method on it is not. When the API is not yours, check before you map:
`let results = response.results ?? []`.
