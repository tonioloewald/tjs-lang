<!--{"section": "ajs", "type": "example", "group": "api", "order": 8, "parent": "ajs-api.md"}-->

# iTunes Search

Search Apple iTunes catalog

```ajs:inline
function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    query +
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
