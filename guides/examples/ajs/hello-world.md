<!--{"section":"ajs","type":"example","group":"basics","order":0}-->

# Hello World

Simple greeting with template

```javascript
function greet({ name = 'World' }) {
  let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
  return { message }
}
```
