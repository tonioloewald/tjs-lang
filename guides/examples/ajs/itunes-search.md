<!--{"section":"ajs","type":"example","group":"api","order":8}-->

# iTunes Search

Search Apple iTunes catalog

```ajs
function searchMusic({ query = 'Beatles', limit = 5 }) {
  let url =
    'https://itunes.apple.com/search?term=' +
    query +
    '&limit=' +
    limit +
    '&media=music'
  let response = httpFetch({ url, cache: 3600 })
  let tracks = response.results.map((x) => ({
    artist: x.artistName,
    track: x.trackName,
    album: x.collectionName,
  }))
  return { tracks }
}
```
