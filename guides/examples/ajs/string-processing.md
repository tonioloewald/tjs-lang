<!--{"section":"ajs","type":"example","group":"basics","order":4}-->

# String Processing

Work with text

```javascript
function processText({ text = 'Hello World' }) {
  let upper = text.toUpperCase()
  let lower = text.toLowerCase()
  let words = text.split(' ')
  let wordCount = words.length
  return { upper, lower, words, wordCount }
}
```
