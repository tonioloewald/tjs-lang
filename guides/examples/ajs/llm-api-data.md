<!--{"section":"ajs","type":"example","group":"featured","order":13,"requiresApi":true}-->

# LLM + API Data

LLM analyzes API data (requires llm capability)

```javascript
function findCovers({ song = 'Yesterday', artist = 'Beatles' }) {
  // Search iTunes for the song
  let query = song + ' ' + artist
  let url =
    'https://itunes.apple.com/search?term=' + query + '&limit=25&media=music'
  let response = httpFetch({ url, cache: 3600 })

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
