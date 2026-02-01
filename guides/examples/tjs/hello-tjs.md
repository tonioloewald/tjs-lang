<!--{"section":"tjs","type":"example","group":"basics","order":1}-->

# Hello TJS

Simple typed greeting function with docs and tests

```tjs
/*#
The classic first function in any language.

Demonstrates:
- Type annotations via examples (\`name: 'World'\`)
- Return type example (\`-> 'Hello, World'\`) - tests the signature!
- Inline tests with \`test\` blocks
- Markdown documentation via \`/*#\` comments
*/
test 'greet says hello' {
  expect(greet('TJS')).toBe('Hello, TJS!')
}

function greet(name: 'World') -> 'Hello, World!' {
  return \`Hello, \${name}!\
```
