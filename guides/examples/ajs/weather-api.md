<!--{"section":"ajs","type":"example","group":"api","order":7}-->

# Weather API

Fetch weather data (no API key needed)

```javascript
function getWeather({ lat = 37.7749, lon = -122.4194 }) {
  let url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&current_weather=true'
  let response = httpFetch({ url, cache: 1800 })
  let weather = response.current_weather
  return { weather }
}
```
